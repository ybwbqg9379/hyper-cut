import type {
	AgentTool,
	AgentResponse,
	AgentExecutionPlan,
	AgentPlanStep,
	LLMProvider,
	Message,
	ToolDefinition,
	ToolResult,
	ToolCall,
	AgentOrchestratorOptions,
} from "./types";
import { createProvider, getConfiguredProviderType } from "./providers";

/**
 * System prompt for the video editing agent
 */
const SYSTEM_PROMPT = `You are an AI assistant for HyperCut video editor. You help users edit videos by understanding their natural language commands and executing the appropriate editing tools.

Available capabilities:
- Timeline editing: split clips, delete selections, move/trim/resize elements, track management
- Text: generate captions, update text styles, insert text
- Transform: update element position/scale/rotation/opacity
- Audio cleanup: remove silence segments
- Playback control: play, pause, seek to specific times, volume/mute
- Selection control: select/clear specific elements
- Project: update/save project settings, export the project to video, get project info
- Assets: add/remove media assets, paste at specific time
- Query information: get timeline info, current position, selected elements

When the user asks you to do something:
1. Understand their intent
2. Call the appropriate tool(s) with correct parameters
3. Confirm what you did in a concise response

Always be helpful and explain what actions you're taking.`;

const MAX_HISTORY_MESSAGES = 30;
const DEFAULT_MAX_TOOL_ITERATIONS = 4;
const DEFAULT_TOOL_TIMEOUT_MS = 60000;
const DEFAULT_PLANNING_ENABLED = false;

interface PendingPlanState {
	plan: AgentExecutionPlan;
	toolCalls: ToolCall[];
}

/**
 * AgentOrchestrator
 * Core orchestration layer that connects user input → LLM → Tools → EditorCore
 */
export class AgentOrchestrator {
	private provider: LLMProvider;
	private tools: Map<string, AgentTool> = new Map();
	private conversationHistory: Message[] = [];
	private systemPrompt: string;
	private maxHistoryMessages: number;
	private maxToolIterations: number;
	private toolTimeoutMs: number;
	private debug: boolean;
	private planningEnabled: boolean;
	private pendingPlanState: PendingPlanState | null = null;
	private planSequence = 0;

	constructor(tools: AgentTool[] = [], options: AgentOrchestratorOptions = {}) {
		const config = options.config;
		this.systemPrompt =
			options.systemPrompt ?? config?.systemPrompt ?? SYSTEM_PROMPT;
		this.maxHistoryMessages =
			options.maxHistoryMessages && options.maxHistoryMessages > 0
				? options.maxHistoryMessages
				: MAX_HISTORY_MESSAGES;
		this.maxToolIterations =
			options.maxToolIterations && options.maxToolIterations > 0
				? options.maxToolIterations
				: DEFAULT_MAX_TOOL_ITERATIONS;
		this.toolTimeoutMs =
			options.toolTimeoutMs && options.toolTimeoutMs > 0
				? options.toolTimeoutMs
				: DEFAULT_TOOL_TIMEOUT_MS;
		this.debug = options.debug ?? false;
		this.planningEnabled = options.planningEnabled ?? DEFAULT_PLANNING_ENABLED;
		this.provider = createProvider(getConfiguredProviderType(config), config);
		for (const tool of tools) {
			this.registerTool(tool);
		}
	}

	/**
	 * Register a tool that can be called by the agent
	 */
	registerTool(tool: AgentTool): void {
		this.tools.set(tool.name, tool);
	}

	private appendHistory(message: Message): void {
		this.conversationHistory.push(message);
		if (this.conversationHistory.length > this.maxHistoryMessages) {
			this.conversationHistory.splice(
				0,
				this.conversationHistory.length - this.maxHistoryMessages,
			);
		}
	}

	private buildMessages(): Message[] {
		return [
			{ role: "system", content: this.systemPrompt },
			...this.conversationHistory,
		];
	}

	private buildToolSummary(
		executedTools: Array<{ name: string; result: ToolResult }>,
	): string {
		return executedTools
			.map((tool) => `${tool.name}: ${tool.result.message}`)
			.join("\n");
	}

	private buildPlanSummary(toolCall: ToolCall): string {
		const tool = this.tools.get(toolCall.name);
		const knownArgs = Object.keys(toolCall.arguments ?? {});
		const argText =
			knownArgs.length > 0 ? `参数: ${knownArgs.join(", ")}` : "无参数";
		const toolDescription = tool?.description
			? tool.description.split(/[.。]/)[0]
			: "执行工具操作";
		return `${toolDescription}（${argText}）`;
	}

	private buildExecutionPlan(
		userMessage: string,
		toolCalls: ToolCall[],
	): PendingPlanState {
		this.planSequence += 1;
		const normalizedCalls = toolCalls.map((toolCall, index) => {
			const normalizedId = toolCall.id?.trim()
				? toolCall.id.trim()
				: `step-${this.planSequence}-${index + 1}`;
			return {
				...toolCall,
				id: normalizedId,
				arguments: toolCall.arguments ?? {},
			};
		});

		const steps: AgentPlanStep[] = normalizedCalls.map((toolCall) => ({
			id: toolCall.id,
			toolName: toolCall.name,
			arguments: toolCall.arguments,
			summary: this.buildPlanSummary(toolCall),
		}));

		return {
			plan: {
				id: `plan-${Date.now()}-${this.planSequence}`,
				originalUserMessage: userMessage,
				createdAt: new Date().toISOString(),
				steps,
			},
			toolCalls: normalizedCalls,
		};
	}

	private formatPlanMessage(plan: AgentExecutionPlan, prefix?: string): string {
		const intro = prefix ?? "我已生成执行计划，请确认后再执行：";
		const stepLines = plan.steps.map(
			(step, index) => `${index + 1}. ${step.toolName} - ${step.summary}`,
		);
		return [intro, ...stepLines].join("\n");
	}

	private buildFinalResponse({
		response,
		executedTools,
	}: {
		response: {
			content: string | null;
			finishReason: "stop" | "tool_calls" | "error";
		};
		executedTools: Array<{ name: string; result: ToolResult }>;
	}): AgentResponse {
		const responseMessage =
			response.content ?? this.buildToolSummary(executedTools);
		const hasToolFailure = executedTools.some((tool) => !tool.result.success);
		const isSuccess = response.finishReason !== "error" && !hasToolFailure;
		const fallbackMessage = isSuccess
			? "操作完成"
			: "处理失败，请重试 (Request failed, please try again)";

		return {
			message: responseMessage || fallbackMessage,
			toolCalls: executedTools.length > 0 ? executedTools : undefined,
			success: isSuccess,
			status: isSuccess ? "completed" : "error",
		};
	}

	private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
		const tool = this.tools.get(toolCall.name);
		if (!tool) {
			return {
				success: false,
				message: `未找到工具: ${toolCall.name} (Tool not found)`,
				data: { errorCode: "TOOL_NOT_FOUND", toolName: toolCall.name },
			};
		}

		try {
			const toolPromise = tool.execute(toolCall.arguments);
			if (!this.toolTimeoutMs) {
				return await toolPromise;
			}

			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			const timeoutPromise = new Promise<ToolResult>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(new Error("Tool execution timeout"));
				}, this.toolTimeoutMs);
			});

			try {
				return await Promise.race([toolPromise, timeoutPromise]);
			} finally {
				if (timeoutId) clearTimeout(timeoutId);
			}
		} catch (error) {
			return {
				success: false,
				message: `工具执行失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "TOOL_EXECUTION_FAILED", toolName: toolCall.name },
			};
		}
	}

	/**
	 * Get all registered tools as definitions for the LLM
	 */
	private getToolDefinitions(): ToolDefinition[] {
		return Array.from(this.tools.values()).map((tool) => ({
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		}));
	}

	/**
	 * Process a user message and return the agent's response
	 */
	async process(userMessage: string): Promise<AgentResponse> {
		if (this.planningEnabled && this.pendingPlanState) {
			return {
				message: "当前有待确认的计划，请先确认执行或取消后再发起新请求。",
				success: false,
				status: "planned",
				requiresConfirmation: true,
				plan: this.pendingPlanState.plan,
			};
		}

		const historyLengthBefore = this.conversationHistory.length;
		// Add user message to history
		this.appendHistory({
			role: "user",
			content: userMessage,
		});

		try {
			// Check if provider is available
			const isAvailable = await this.provider.isAvailable();
			if (!isAvailable) {
				this.conversationHistory = this.conversationHistory.slice(
					0,
					historyLengthBefore,
				);
				return {
					message: `LLM provider (${this.provider.name}) is not available. Please ensure LM Studio is running.`,
					success: false,
				};
			}

			const executedTools: Array<{ name: string; result: ToolResult }> = [];
			let response = await this.provider.chat({
				messages: this.buildMessages(),
				tools: this.getToolDefinitions(),
			});

			if (this.debug) {
				const toolNames = response.toolCalls.map((toolCall) => toolCall.name);
				console.debug("[Agent] Initial response", {
					toolCalls: toolNames,
					finishReason: response.finishReason,
					planningEnabled: this.planningEnabled,
				});
			}

			this.appendHistory({
				role: "assistant",
				content:
					response.toolCalls.length > 0 ? null : (response.content ?? null),
				toolCalls:
					response.toolCalls.length > 0 ? response.toolCalls : undefined,
			});

			if (response.toolCalls.length === 0) {
				return this.buildFinalResponse({ response, executedTools });
			}

			if (this.planningEnabled) {
				const pendingPlan = this.buildExecutionPlan(
					userMessage,
					response.toolCalls,
				);
				this.pendingPlanState = pendingPlan;
				return {
					message: this.formatPlanMessage(pendingPlan.plan),
					success: true,
					status: "planned",
					requiresConfirmation: true,
					plan: pendingPlan.plan,
				};
			}

			let toolIterations = 0;
			while (true) {
				if (this.debug) {
					const toolNames = response.toolCalls.map((toolCall) => toolCall.name);
					console.debug("[Agent] Iteration", {
						iteration: toolIterations,
						toolCalls: toolNames,
						finishReason: response.finishReason,
					});
				}

				if (toolIterations >= this.maxToolIterations) {
					return {
						message: "工具调用次数已达上限，请重试 (Tool call limit reached)",
						toolCalls: executedTools.length > 0 ? executedTools : undefined,
						success: false,
						status: "error",
					};
				}

				for (const toolCall of response.toolCalls) {
					const result = await this.executeToolCall(toolCall);
					executedTools.push({ name: toolCall.name, result });

					this.appendHistory({
						role: "tool",
						content: JSON.stringify(result),
						toolCallId: toolCall.id,
						name: toolCall.name,
					});
				}

				toolIterations += 1;
				response = await this.provider.chat({
					messages: this.buildMessages(),
					tools: this.getToolDefinitions(),
				});

				this.appendHistory({
					role: "assistant",
					content:
						response.toolCalls.length > 0 ? null : (response.content ?? null),
					toolCalls:
						response.toolCalls.length > 0 ? response.toolCalls : undefined,
				});

				if (response.toolCalls.length === 0) {
					return this.buildFinalResponse({ response, executedTools });
				}
			}
		} catch (error) {
			this.conversationHistory = this.conversationHistory.slice(
				0,
				historyLengthBefore,
			);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred";
			return {
				message: `Error processing request: ${errorMessage}`,
				success: false,
				status: "error",
			};
		}
	}

	getPendingPlan(): AgentExecutionPlan | null {
		return this.pendingPlanState?.plan ?? null;
	}

	updatePendingPlanStep({
		stepId,
		arguments: nextArguments,
	}: {
		stepId: string;
		arguments: Record<string, unknown>;
	}): AgentResponse {
		if (!this.pendingPlanState) {
			return {
				message: "当前没有待确认的计划。",
				success: false,
				status: "error",
			};
		}

		const stepExists = this.pendingPlanState.toolCalls.some(
			(toolCall) => toolCall.id === stepId,
		);
		if (!stepExists) {
			return {
				message: `未找到步骤: ${stepId}`,
				success: false,
				status: "error",
			};
		}

		this.pendingPlanState.toolCalls = this.pendingPlanState.toolCalls.map(
			(toolCall) =>
				toolCall.id === stepId
					? { ...toolCall, arguments: nextArguments }
					: toolCall,
		);

		this.pendingPlanState.plan.steps = this.pendingPlanState.plan.steps.map(
			(step) =>
				step.id === stepId
					? {
							...step,
							arguments: nextArguments,
							summary: this.buildPlanSummary({
								id: step.id,
								name: step.toolName,
								arguments: nextArguments,
							}),
						}
					: step,
		);

		return {
			message: this.formatPlanMessage(
				this.pendingPlanState.plan,
				`已更新步骤 ${stepId}，请确认执行计划：`,
			),
			success: true,
			status: "planned",
			requiresConfirmation: true,
			plan: this.pendingPlanState.plan,
		};
	}

	removePendingPlanStep(stepId: string): AgentResponse {
		if (!this.pendingPlanState) {
			return {
				message: "当前没有待确认的计划。",
				success: false,
				status: "error",
			};
		}

		const nextToolCalls = this.pendingPlanState.toolCalls.filter(
			(toolCall) => toolCall.id !== stepId,
		);
		if (nextToolCalls.length === this.pendingPlanState.toolCalls.length) {
			return {
				message: `未找到步骤: ${stepId}`,
				success: false,
				status: "error",
			};
		}

		this.pendingPlanState.toolCalls = nextToolCalls;
		this.pendingPlanState.plan.steps = this.pendingPlanState.plan.steps.filter(
			(step) => step.id !== stepId,
		);

		if (this.pendingPlanState.plan.steps.length === 0) {
			this.pendingPlanState = null;
			return {
				message: "计划已清空并取消。",
				success: true,
				status: "cancelled",
			};
		}

		return {
			message: this.formatPlanMessage(
				this.pendingPlanState.plan,
				`已移除步骤 ${stepId}，请确认执行剩余计划：`,
			),
			success: true,
			status: "planned",
			requiresConfirmation: true,
			plan: this.pendingPlanState.plan,
		};
	}

	cancelPendingPlan(): AgentResponse {
		if (!this.pendingPlanState) {
			return {
				message: "当前没有待确认的计划。",
				success: false,
				status: "error",
			};
		}

		this.pendingPlanState = null;
		this.appendHistory({
			role: "assistant",
			content: "已取消执行计划。",
		});
		return {
			message: "已取消执行计划。",
			success: true,
			status: "cancelled",
		};
	}

	async confirmPendingPlan(): Promise<AgentResponse> {
		if (!this.pendingPlanState) {
			return {
				message: "当前没有待确认的计划。",
				success: false,
				status: "error",
			};
		}

		const pendingPlan = this.pendingPlanState;
		this.pendingPlanState = null;

		this.appendHistory({
			role: "user",
			content: "[确认执行计划]",
		});

		const executedTools: Array<{ name: string; result: ToolResult }> = [];
		for (const toolCall of pendingPlan.toolCalls) {
			const result = await this.executeToolCall(toolCall);
			executedTools.push({ name: toolCall.name, result });
			this.appendHistory({
				role: "tool",
				content: JSON.stringify(result),
				toolCallId: toolCall.id,
				name: toolCall.name,
			});
		}

		const hasToolFailure = executedTools.some((tool) => !tool.result.success);
		const message = hasToolFailure
			? `计划执行完成，但有步骤失败：\n${this.buildToolSummary(executedTools)}`
			: `计划执行完成：\n${this.buildToolSummary(executedTools)}`;

		this.appendHistory({
			role: "assistant",
			content: message,
		});

		return {
			message,
			toolCalls: executedTools,
			success: !hasToolFailure,
			status: hasToolFailure ? "error" : "completed",
		};
	}

	/**
	 * Clear conversation history
	 */
	clearHistory(): void {
		this.conversationHistory = [];
		this.pendingPlanState = null;
	}

	/**
	 * Check if the LLM provider is available
	 */
	async checkProviderStatus(): Promise<{
		available: boolean;
		provider: string;
	}> {
		const available = await this.provider.isAvailable();
		return { available, provider: this.provider.name };
	}
}
