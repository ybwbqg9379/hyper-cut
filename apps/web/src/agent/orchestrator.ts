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
import { resolveWorkflowFromParams } from "./workflows";

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
- Sticker/SFX: search and add stickers or sound effects, update sticker color
- Query information: get timeline info, current position, selected elements
- Vision understanding: detect scenes, analyze frames, suggest edit points
- Workflow automation: run predefined workflows for multi-step edits

When the user asks you to do something:
1. Understand their intent
2. Call the appropriate tool(s) with correct parameters
3. Confirm what you did in a concise response

Always be helpful and explain what actions you're taking.`;

const MAX_HISTORY_MESSAGES = 30;
const DEFAULT_MAX_TOOL_ITERATIONS = 4;
const DEFAULT_TOOL_TIMEOUT_MS = 60000;
const DEFAULT_PLANNING_ENABLED = false;
const MAX_TOOL_HISTORY_CONTENT_LENGTH = 4000;
const MAX_TOOL_DATA_DEPTH = 3;
const MAX_TOOL_DATA_ARRAY_PREVIEW = 5;
const MAX_TOOL_DATA_OBJECT_KEYS = 20;
const MAX_TOOL_DATA_STRING_LENGTH = 240;

const TOOL_DATA_DROP_KEYS = new Set([
	"thumbnailDataUrl",
	"imageDataUrl",
	"base64",
	"audioData",
]);
const TOOL_DATA_SUMMARY_KEYS = new Set([
	"segments",
	"topSegments",
	"stepResults",
	"tracks",
	"elements",
	"words",
	"plan",
	"deleteRanges",
	"splitTimes",
]);
const TOOL_NAME_ALIASES = new Map<string, string>([
	["visual_validation", "validate_highlights_visual"],
	["visual-validation", "validate_highlights_visual"],
]);

interface PendingPlanState {
	plan: AgentExecutionPlan;
	toolCalls: ToolCall[];
}

function compactString(value: string): string {
	if (value.length <= MAX_TOOL_DATA_STRING_LENGTH) {
		return value;
	}
	return `${value.slice(0, MAX_TOOL_DATA_STRING_LENGTH)}...(truncated, ${value.length} chars)`;
}

function compactUnknown(value: unknown, depth = 0): unknown {
	if (
		value === null ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (typeof value === "string") {
		return compactString(value);
	}

	if (Array.isArray(value)) {
		if (depth >= MAX_TOOL_DATA_DEPTH) {
			return { type: "array", total: value.length };
		}
		const preview = value
			.slice(0, MAX_TOOL_DATA_ARRAY_PREVIEW)
			.map((item) => compactUnknown(item, depth + 1));
		if (value.length > MAX_TOOL_DATA_ARRAY_PREVIEW) {
			return { preview, total: value.length };
		}
		return preview;
	}

	if (typeof value === "object") {
		if (depth >= MAX_TOOL_DATA_DEPTH) {
			return "[object]";
		}

		const record = value as Record<string, unknown>;
		const entries = Object.entries(record);
		const compacted: Record<string, unknown> = {};
		for (const [key, nextValue] of entries.slice(0, MAX_TOOL_DATA_OBJECT_KEYS)) {
			if (TOOL_DATA_DROP_KEYS.has(key)) {
				continue;
			}
			if (TOOL_DATA_SUMMARY_KEYS.has(key)) {
				compacted[`${key}Summary`] = compactUnknown(nextValue, depth + 1);
				continue;
			}
			compacted[key] = compactUnknown(nextValue, depth + 1);
		}

		if (entries.length > MAX_TOOL_DATA_OBJECT_KEYS) {
			compacted._truncatedKeyCount =
				entries.length - MAX_TOOL_DATA_OBJECT_KEYS;
		}

		return compacted;
	}

	return String(value);
}

function compactRunWorkflowData(data: unknown): unknown {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return compactUnknown(data);
	}

	const record = data as Record<string, unknown>;
	const compacted: Record<string, unknown> = {};
	for (const key of [
		"errorCode",
		"status",
		"workflowName",
		"nextStep",
		"resumeHint",
		"startFromStepId",
	]) {
		if (record[key] !== undefined) {
			compacted[key] = compactUnknown(record[key]);
		}
	}

	if (Array.isArray(record.stepResults)) {
		const stepResults = record.stepResults;
		compacted.stepResults = stepResults.slice(0, 10).map((item) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) {
				return compactUnknown(item);
			}
			const stepRecord = item as Record<string, unknown>;
			const result = stepRecord.result;
			const normalizedResult =
				result && typeof result === "object" && !Array.isArray(result)
					? (result as Record<string, unknown>)
					: null;

			return {
				stepId:
					typeof stepRecord.stepId === "string" ? stepRecord.stepId : undefined,
				toolName:
					typeof stepRecord.toolName === "string"
						? stepRecord.toolName
						: undefined,
				success:
					normalizedResult && typeof normalizedResult.success === "boolean"
						? normalizedResult.success
						: undefined,
				message:
					normalizedResult && typeof normalizedResult.message === "string"
						? compactString(normalizedResult.message)
						: undefined,
			};
		});

		if (stepResults.length > 10) {
			compacted.stepResultsTruncated = stepResults.length - 10;
		}
	}

	return compacted;
}

function compactToolDataForHistory(toolName: string, data: unknown): unknown {
	if (data === undefined) return undefined;
	if (toolName === "run_workflow") {
		return compactRunWorkflowData(data);
	}
	return compactUnknown(data);
}

function serializeToolResultForHistory(
	toolName: string,
	result: ToolResult,
): string {
	const payload: Record<string, unknown> = {
		success: result.success,
		message: compactString(result.message),
	};
	const compactedData = compactToolDataForHistory(toolName, result.data);
	if (compactedData !== undefined) {
		payload.data = compactedData;
	}

	const serialized = JSON.stringify(payload);
	if (serialized.length <= MAX_TOOL_HISTORY_CONTENT_LENGTH) {
		return serialized;
	}

	return JSON.stringify({
		success: result.success,
		message: compactString(result.message),
		dataSummary: "tool data omitted due to size",
	});
}

function compactToolResultForClient(result: ToolResult): ToolResult {
	return {
		success: result.success,
		message: result.message,
	};
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
	private isExecutingPlan = false;

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

	private buildToolHistoryContent(toolCall: ToolCall, result: ToolResult): string {
		return serializeToolResultForHistory(toolCall.name, result);
	}

	private toClientToolCalls(
		executedTools: Array<{ name: string; result: ToolResult }>,
	): Array<{ name: string; result: ToolResult }> | undefined {
		if (executedTools.length === 0) {
			return undefined;
		}
		return executedTools.map((tool) => ({
			name: tool.name,
			result: compactToolResultForClient(tool.result),
		}));
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

	private expandToolCallsForPlanning(toolCalls: ToolCall[]): ToolCall[] {
		const expandedToolCalls: ToolCall[] = [];

		for (const toolCall of toolCalls) {
			if (toolCall.name !== "run_workflow") {
				expandedToolCalls.push(toolCall);
				continue;
			}

			const resolvedWorkflow = resolveWorkflowFromParams(
				toolCall.arguments ?? {},
			);
			if (
				!resolvedWorkflow.ok ||
				resolvedWorkflow.resolved.steps.length === 0
			) {
				expandedToolCalls.push(toolCall);
				continue;
			}

			for (const [index, step] of resolvedWorkflow.resolved.steps.entries()) {
				expandedToolCalls.push({
					id: `${toolCall.id || "workflow"}-step-${index + 1}`,
					name: step.toolName,
					arguments: step.arguments,
				});
			}
		}

		return expandedToolCalls;
	}

	private formatPlanMessage(plan: AgentExecutionPlan, prefix?: string): string {
		const intro = prefix ?? "我已生成执行计划，请确认后再执行：";
		const stepLines = plan.steps.map(
			(step, index) => `${index + 1}. ${step.toolName} - ${step.summary}`,
		);
		return [intro, ...stepLines].join("\n");
	}

	private buildPendingPlanBlockedResponse(): AgentResponse {
		return {
			message: "当前有待确认的计划，请先确认执行或取消后再发起新请求。",
			success: false,
			status: "planned",
			requiresConfirmation: true,
			plan: this.pendingPlanState?.plan,
		};
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
			toolCalls: this.toClientToolCalls(executedTools),
			success: isSuccess,
			status: isSuccess ? "completed" : "error",
		};
	}

	private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
		const resolvedToolName =
			TOOL_NAME_ALIASES.get(toolCall.name) ?? toolCall.name;
		const tool = this.tools.get(resolvedToolName);
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
		if (this.planningEnabled && this.isExecutingPlan) {
			return {
				message: "计划正在执行中，请稍候。",
				success: false,
				status: "error",
			};
		}

		if (this.planningEnabled && this.pendingPlanState) {
			return this.buildPendingPlanBlockedResponse();
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
				const planToolCalls = this.expandToolCallsForPlanning(
					response.toolCalls,
				);
				const pendingPlan = this.buildExecutionPlan(userMessage, planToolCalls);
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
						toolCalls: this.toClientToolCalls(executedTools),
						success: false,
						status: "error",
					};
				}

				for (const toolCall of response.toolCalls) {
					const result = await this.executeToolCall(toolCall);
					executedTools.push({ name: toolCall.name, result });

					this.appendHistory({
						role: "tool",
						content: this.buildToolHistoryContent(toolCall, result),
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

	async runWorkflow({
		workflowName,
		stepOverrides,
	}: {
		workflowName: string;
		stepOverrides?: Array<{
			stepId?: string;
			index?: number;
			arguments: Record<string, unknown>;
		}>;
	}): Promise<AgentResponse> {
		if (this.planningEnabled && this.isExecutingPlan) {
			return {
				message: "计划正在执行中，请稍候。",
				success: false,
				status: "error",
			};
		}

		if (this.planningEnabled && this.pendingPlanState) {
			return this.buildPendingPlanBlockedResponse();
		}

		const normalizedName = workflowName.trim();
		if (!normalizedName) {
			return {
				message: "workflowName 不能为空",
				success: false,
				status: "error",
			};
		}

		const argumentsPayload: Record<string, unknown> = {
			workflowName: normalizedName,
		};
		if (stepOverrides && stepOverrides.length > 0) {
			argumentsPayload.stepOverrides = stepOverrides;
		}

		this.appendHistory({
			role: "user",
			content: `[运行工作流] ${normalizedName}`,
		});

		const workflowCall: ToolCall = {
			id: `workflow-${Date.now()}`,
			name: "run_workflow",
			arguments: argumentsPayload,
		};

		if (this.planningEnabled) {
			const planToolCalls = this.expandToolCallsForPlanning([workflowCall]);
			const pendingPlan = this.buildExecutionPlan(
				`[运行工作流] ${normalizedName}`,
				planToolCalls,
			);
			this.pendingPlanState = pendingPlan;

			const planMessage = this.formatPlanMessage(
				pendingPlan.plan,
				`已根据工作流 ${normalizedName} 生成执行计划，请确认后执行：`,
			);
			this.appendHistory({
				role: "assistant",
				content: planMessage,
			});

			return {
				message: planMessage,
				success: true,
				status: "planned",
				requiresConfirmation: true,
				plan: pendingPlan.plan,
			};
		}

		const toolResult = await this.executeToolCall(workflowCall);
		this.appendHistory({
			role: "tool",
			content: this.buildToolHistoryContent(workflowCall, toolResult),
			toolCallId: workflowCall.id,
			name: workflowCall.name,
		});
		this.appendHistory({
			role: "assistant",
			content: toolResult.message,
		});

		return {
			message: toolResult.message,
			toolCalls: [
				{
					name: workflowCall.name,
					result: compactToolResultForClient(toolResult),
				},
			],
			success: toolResult.success,
			status: toolResult.success ? "completed" : "error",
		};
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
		if (this.isExecutingPlan) {
			return {
				message: "计划正在执行中，暂时无法修改步骤。",
				success: false,
				status: "error",
			};
		}

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

		const targetToolCall = this.pendingPlanState.toolCalls.find(
			(toolCall) => toolCall.id === stepId,
		);
		if (!targetToolCall) {
			return {
				message: `未找到步骤: ${stepId}`,
				success: false,
				status: "error",
			};
		}

		const targetTool = this.tools.get(targetToolCall.name);
		const requiredFields = targetTool?.parameters.required ?? [];
		for (const requiredField of requiredFields) {
			const value = nextArguments[requiredField];
			const missing =
				value === undefined ||
				value === null ||
				(typeof value === "string" && value.trim().length === 0);
			if (missing) {
				return {
					message: `步骤 ${stepId} 缺少必填参数: ${requiredField}`,
					success: false,
					status: "error",
				};
			}
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
		if (this.isExecutingPlan) {
			return {
				message: "计划正在执行中，暂时无法移除步骤。",
				success: false,
				status: "error",
			};
		}

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
		if (this.isExecutingPlan) {
			return {
				message: "计划正在执行中，无法取消。",
				success: false,
				status: "error",
			};
		}

		if (!this.pendingPlanState) {
			return {
				message: "当前没有待确认的计划。",
				success: false,
				status: "error",
			};
		}

		this.pendingPlanState = null;
		this.appendHistory({
			role: "user",
			content: "[取消执行计划]",
		});
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
		if (this.isExecutingPlan) {
			return {
				message: "计划正在执行中，请勿重复确认。",
				success: false,
				status: "error",
			};
		}

		if (!this.pendingPlanState) {
			return {
				message: "当前没有待确认的计划。",
				success: false,
				status: "error",
			};
		}

		const pendingPlan = this.pendingPlanState;
		this.pendingPlanState = null;
		this.isExecutingPlan = true;

		try {
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
					content: this.buildToolHistoryContent(toolCall, result),
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
				toolCalls: this.toClientToolCalls(executedTools),
				success: !hasToolFailure,
				status: hasToolFailure ? "error" : "completed",
			};
		} catch (error) {
			return {
				message: `计划执行失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				success: false,
				status: "error",
			};
		} finally {
			this.isExecutingPlan = false;
		}
	}

	/**
	 * Clear conversation history
	 */
	clearHistory(): void {
		if (this.isExecutingPlan) {
			return;
		}
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
