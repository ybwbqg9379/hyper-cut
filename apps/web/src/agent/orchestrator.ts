import type {
	AgentTool,
	AgentResponse,
	AgentExecutionEvent,
	AgentExecutionPlan,
	AgentPlanStep,
	LLMProvider,
	Message,
	ToolDefinition,
	ToolResult,
	ToolCall,
	AgentOrchestratorOptions,
	WorkflowNextStep,
	WorkflowResumeHint,
} from "./types";
import { createRoutedProvider } from "./providers";
import {
	EXECUTION_CANCELLED_ERROR_CODE,
	buildExecutionCancelledResult,
	isCancellationError,
} from "./utils/cancellation";
import { resolveWorkflowFromParams } from "./workflows";
import {
	buildDagFromPlanSteps,
	getReadyDagNodes,
	getTopologicalOrder,
	type DagNodeState,
} from "./planner/dag";
import {
	extractToolErrorCode,
	resolveRecoveryPolicyDecision,
} from "./recovery/policies";
import {
	qualityEvaluatorService,
	type QualityReport,
} from "./services/quality-evaluator";

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
const WORKFLOW_CONFIRMATION_REQUIRED_ERROR_CODE =
	"WORKFLOW_CONFIRMATION_REQUIRED";
const TOOL_EXECUTION_TIMEOUT_ERROR_CODE = "TOOL_EXECUTION_TIMEOUT";
const QUALITY_TARGET_NOT_MET_ERROR_CODE = "QUALITY_TARGET_NOT_MET";
const DEFAULT_WORKFLOW_QUALITY_MAX_ITERATIONS = 2;
const DEFAULT_WORKFLOW_QUALITY_DURATION_TOLERANCE = 0.2;
const QUALITY_LOOP_ENABLED_WORKFLOWS = new Set([
	"long-to-short",
	"quick-social-clip",
	"podcast-to-clips",
	"talking-head-polish",
]);
const WORKFLOW_TARGET_DURATION_HINTS: Record<string, number> = {
	"long-to-short": 60,
	"quick-social-clip": 60,
	"podcast-to-clips": 45,
};

interface PendingPlanState {
	plan: AgentExecutionPlan;
	toolCalls: PlannedToolCall[];
}

interface PlannedToolCall extends ToolCall {
	operation?: "read" | "write";
	dependsOn?: string[];
	resourceLocks?: string[];
}

interface WorkflowPauseInfo {
	workflowName?: string;
	nextStep?: WorkflowNextStep;
	resumeHint?: WorkflowResumeHint;
}

interface ExecutedToolsAnalysis {
	hasAwaitingConfirmation: boolean;
	hasToolFailure: boolean;
	pauseInfo: WorkflowPauseInfo | null;
}

interface ToolExecutionMeta {
	requestId: string;
	mode: "chat" | "workflow" | "plan_confirmation";
	toolCallId: string;
	planStepId?: string;
	stepIndex?: number;
	totalSteps?: number;
	signal?: AbortSignal;
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
		for (const [key, nextValue] of entries.slice(
			0,
			MAX_TOOL_DATA_OBJECT_KEYS,
		)) {
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
			compacted._truncatedKeyCount = entries.length - MAX_TOOL_DATA_OBJECT_KEYS;
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
		"qualityReport",
		"qualityLoop",
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

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return undefined;
	}
	return value;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function compactGenerateHighlightPlanData(data: unknown): unknown {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return compactUnknown(data);
	}

	const record = data as Record<string, unknown>;
	const planRecord =
		record.plan &&
		typeof record.plan === "object" &&
		!Array.isArray(record.plan)
			? (record.plan as Record<string, unknown>)
			: null;
	if (!planRecord) {
		return compactUnknown(data);
	}

	const segmentsRaw = Array.isArray(planRecord.segments)
		? planRecord.segments
		: [];
	const compactedSegments = segmentsRaw.slice(0, 120).map((segment) => {
		if (!segment || typeof segment !== "object" || Array.isArray(segment)) {
			return compactUnknown(segment);
		}

		const segmentRecord = segment as Record<string, unknown>;
		const chunkRecord =
			segmentRecord.chunk &&
			typeof segmentRecord.chunk === "object" &&
			!Array.isArray(segmentRecord.chunk)
				? (segmentRecord.chunk as Record<string, unknown>)
				: null;

		return {
			startTime: toFiniteNumber(chunkRecord?.startTime),
			endTime: toFiniteNumber(chunkRecord?.endTime),
			combinedScore: toFiniteNumber(segmentRecord.combinedScore),
			reason:
				typeof segmentRecord.reason === "string"
					? compactString(segmentRecord.reason)
					: undefined,
		};
	});

	const compacted: Record<string, unknown> = {
		plan: {
			targetDuration: toFiniteNumber(planRecord.targetDuration),
			actualDuration: toFiniteNumber(planRecord.actualDuration),
			totalSegments: toFiniteNumber(planRecord.totalSegments),
			coveragePercent: toFiniteNumber(planRecord.coveragePercent),
			segments: compactedSegments,
		},
	};
	if (segmentsRaw.length > 120) {
		compacted.plan = {
			...(compacted.plan as Record<string, unknown>),
			segmentsTruncated: segmentsRaw.length - 120,
		};
	}
	if (typeof record.timelineFingerprint === "string") {
		compacted.timelineFingerprint = record.timelineFingerprint;
	}
	if (typeof record.cachedAt === "string") {
		compacted.cachedAt = record.cachedAt;
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

function asObjectRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function toOptionalPositiveNumber(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return undefined;
	}
	return value;
}

function toOptionalPositiveInt(value: unknown): number | undefined {
	const numeric = toOptionalPositiveNumber(value);
	if (numeric === undefined) return undefined;
	return Math.floor(numeric);
}

function asWorkflowStepOverrides(value: unknown):
	| Array<{
			stepId?: string;
			index?: number;
			arguments: Record<string, unknown>;
	  }>
	| undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const overrides: Array<{
		stepId?: string;
		index?: number;
		arguments: Record<string, unknown>;
	}> = [];

	for (const item of value) {
		const record = asObjectRecord(item);
		if (!record) {
			continue;
		}

		const argumentsRecord = asObjectRecord(record.arguments);
		if (!argumentsRecord) {
			continue;
		}

		const override: {
			stepId?: string;
			index?: number;
			arguments: Record<string, unknown>;
		} = {
			arguments: argumentsRecord,
		};
		if (typeof record.stepId === "string" && record.stepId.trim().length > 0) {
			override.stepId = record.stepId.trim();
		}
		if (typeof record.index === "number" && Number.isFinite(record.index)) {
			override.index = Math.floor(record.index);
		}
		if (override.stepId === undefined && override.index === undefined) {
			continue;
		}

		overrides.push(override);
	}

	return overrides.length > 0 ? overrides : undefined;
}

function asWorkflowResumeHint(value: unknown): WorkflowResumeHint | undefined {
	const record = asObjectRecord(value);
	if (!record) return undefined;
	if (
		typeof record.workflowName !== "string" ||
		typeof record.startFromStepId !== "string" ||
		typeof record.confirmRequiredSteps !== "boolean"
	) {
		return undefined;
	}
	const stepOverrides = asWorkflowStepOverrides(record.stepOverrides);

	return {
		workflowName: record.workflowName,
		startFromStepId: record.startFromStepId,
		confirmRequiredSteps: record.confirmRequiredSteps,
		...(stepOverrides ? { stepOverrides } : {}),
	};
}

function asWorkflowNextStep(value: unknown): WorkflowNextStep | undefined {
	const record = asObjectRecord(value);
	if (!record) return undefined;
	if (typeof record.id !== "string" || typeof record.toolName !== "string") {
		return undefined;
	}

	const nextStep: WorkflowNextStep = {
		id: record.id,
		toolName: record.toolName,
	};

	if (typeof record.summary === "string") {
		nextStep.summary = record.summary;
	}
	if (asObjectRecord(record.arguments)) {
		nextStep.arguments = record.arguments as Record<string, unknown>;
	}

	return nextStep;
}

function extractWorkflowPauseInfo(data: unknown): WorkflowPauseInfo | null {
	const record = asObjectRecord(data);
	if (!record) return null;

	const status = record.status;
	const errorCode = record.errorCode;
	const isAwaiting =
		status === "awaiting_confirmation" ||
		errorCode === WORKFLOW_CONFIRMATION_REQUIRED_ERROR_CODE;
	if (!isAwaiting) return null;

	return {
		workflowName:
			typeof record.workflowName === "string" ? record.workflowName : undefined,
		nextStep: asWorkflowNextStep(record.nextStep),
		resumeHint: asWorkflowResumeHint(record.resumeHint),
	};
}

function compactToolResultForClient(
	toolName: string,
	result: ToolResult,
): ToolResult {
	const compacted: ToolResult = {
		success: result.success,
		message: result.message,
	};

	if (result.data === undefined) {
		return compacted;
	}

	if (toolName === "run_workflow") {
		compacted.data = compactRunWorkflowData(result.data);
		return compacted;
	}

	if (toolName === "generate_highlight_plan") {
		compacted.data = compactGenerateHighlightPlanData(result.data);
	}

	return compacted;
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
	private onExecutionEvent?: (event: AgentExecutionEvent) => void;
	private pendingPlanState: PendingPlanState | null = null;
	private planSequence = 0;
	private requestSequence = 0;
	private isExecutingPlan = false;
	private activeExecutionAbortController: AbortController | null = null;
	private activeExecutionRequestId: string | null = null;

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
		this.onExecutionEvent = options.onExecutionEvent;
		this.provider = createRoutedProvider({
			taskType: "planning",
			config,
		});
		for (const tool of tools) {
			this.registerTool(tool);
		}
	}

	private createRequestId(prefix: "chat" | "workflow" | "confirm"): string {
		this.requestSequence += 1;
		return `${prefix}-${Date.now()}-${this.requestSequence}`;
	}

	private emitExecutionEvent(
		event: Omit<AgentExecutionEvent, "timestamp">,
	): void {
		this.onExecutionEvent?.({
			...event,
			timestamp: new Date().toISOString(),
		});
	}

	private beginExecution(requestId: string): AbortSignal {
		this.activeExecutionAbortController = new AbortController();
		this.activeExecutionRequestId = requestId;
		return this.activeExecutionAbortController.signal;
	}

	private clearExecution(requestId: string): void {
		if (this.activeExecutionRequestId !== requestId) {
			return;
		}
		this.activeExecutionAbortController = null;
		this.activeExecutionRequestId = null;
	}

	private isToolResultCancelled(result: ToolResult): boolean {
		if (
			!result.data ||
			typeof result.data !== "object" ||
			Array.isArray(result.data)
		) {
			return false;
		}
		return (
			(result.data as Record<string, unknown>).errorCode ===
			EXECUTION_CANCELLED_ERROR_CODE
		);
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

	private buildToolHistoryContent(
		toolCall: ToolCall,
		result: ToolResult,
	): string {
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
			result: compactToolResultForClient(tool.name, tool.result),
		}));
	}

	private analyzeExecutedTools(
		executedTools: Array<{ name: string; result: ToolResult }>,
	): ExecutedToolsAnalysis {
		let hasAwaitingConfirmation = false;
		let hasToolFailure = false;
		let pauseInfo: WorkflowPauseInfo | null = null;

		for (const tool of executedTools) {
			const currentPauseInfo = extractWorkflowPauseInfo(tool.result.data);
			if (currentPauseInfo) {
				hasAwaitingConfirmation = true;
				if (!pauseInfo) {
					pauseInfo = currentPauseInfo;
				}
				continue;
			}
			if (!tool.result.success) {
				hasToolFailure = true;
			}
		}

		return {
			hasAwaitingConfirmation,
			hasToolFailure,
			pauseInfo,
		};
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
		toolCalls: PlannedToolCall[],
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

		const draftSteps: AgentPlanStep[] = normalizedCalls.map((toolCall) => ({
			id: toolCall.id,
			toolName: toolCall.name,
			arguments: toolCall.arguments,
			summary: this.buildPlanSummary(toolCall),
			operation: toolCall.operation,
			dependsOn: toolCall.dependsOn,
			resourceLocks: toolCall.resourceLocks,
		}));
		const dag = buildDagFromPlanSteps(draftSteps);
		const steps: AgentPlanStep[] = dag.nodes
			.sort((a, b) => a.index - b.index)
			.map((node) => ({
				...node.step,
				operation: node.operation,
				dependsOn: node.dependsOn,
				resourceLocks: node.resourceLocks,
			}));
		const callById = Object.fromEntries(
			normalizedCalls.map((toolCall) => [toolCall.id, toolCall]),
		);
		const normalizedCallsWithDag: PlannedToolCall[] = steps.map((step) => ({
			...callById[step.id],
			id: step.id,
			name: step.toolName,
			arguments: step.arguments,
			operation: step.operation,
			dependsOn: step.dependsOn,
			resourceLocks: step.resourceLocks,
		}));

		return {
			plan: {
				id: `plan-${Date.now()}-${this.planSequence}`,
				originalUserMessage: userMessage,
				createdAt: new Date().toISOString(),
				steps,
			},
			toolCalls: normalizedCallsWithDag,
		};
	}

	private expandToolCallsForPlanning(toolCalls: ToolCall[]): PlannedToolCall[] {
		const expandedToolCalls: PlannedToolCall[] = [];

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
					operation: step.operation,
					dependsOn: step.dependsOn,
					resourceLocks: step.resourceLocks,
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

	private buildPendingPlanBlockedResponse(requestId: string): AgentResponse {
		return {
			message: "当前有待确认的计划，请先确认执行或取消后再发起新请求。",
			success: false,
			status: "planned",
			requiresConfirmation: true,
			plan: this.pendingPlanState?.plan,
			requestId,
		};
	}

	private completeRequest({
		requestId,
		mode,
		response,
	}: {
		requestId: string;
		mode: "chat" | "workflow" | "plan_confirmation";
		response: AgentResponse;
	}): AgentResponse {
		const status =
			response.status ?? (response.success ? "completed" : "error");
		const finalizedResponse: AgentResponse = {
			...response,
			status,
			requestId,
		};
		this.emitExecutionEvent({
			type: "request_completed",
			requestId,
			mode,
			status,
			message: finalizedResponse.message,
		});
		this.clearExecution(requestId);
		return finalizedResponse;
	}

	private buildFinalResponse({
		requestId,
		response,
		executedTools,
	}: {
		requestId: string;
		response: {
			content: string | null;
			finishReason: "stop" | "tool_calls" | "error";
		};
		executedTools: Array<{ name: string; result: ToolResult }>;
	}): AgentResponse {
		const responseMessage =
			response.content ?? this.buildToolSummary(executedTools);
		const { hasAwaitingConfirmation, hasToolFailure, pauseInfo } =
			this.analyzeExecutedTools(executedTools);
		const isSuccess =
			response.finishReason !== "error" &&
			!hasToolFailure &&
			!hasAwaitingConfirmation;
		const status = hasToolFailure
			? "error"
			: hasAwaitingConfirmation
				? "awaiting_confirmation"
				: "completed";
		const fallbackMessage =
			status === "awaiting_confirmation"
				? "工作流已暂停，等待确认后继续执行。"
				: isSuccess
					? "操作完成"
					: "处理失败，请重试 (Request failed, please try again)";

		return {
			message: responseMessage || fallbackMessage,
			toolCalls: this.toClientToolCalls(executedTools),
			success: isSuccess,
			status,
			requiresConfirmation: status === "awaiting_confirmation",
			requestId,
			nextStep: pauseInfo?.nextStep,
			resumeHint: pauseInfo?.resumeHint,
		};
	}

	private async executeToolCall(
		toolCall: ToolCall,
		meta: ToolExecutionMeta,
	): Promise<ToolResult> {
		const resolvedToolName =
			TOOL_NAME_ALIASES.get(toolCall.name) ?? toolCall.name;
		const tool = this.tools.get(resolvedToolName);
		if (meta.signal?.aborted) {
			return buildExecutionCancelledResult({ toolName: resolvedToolName });
		}

		if (!tool) {
			return {
				success: false,
				message: `未找到工具: ${toolCall.name} (Tool not found)`,
				data: { errorCode: "TOOL_NOT_FOUND", toolName: toolCall.name },
			};
		}

		const toolAbortController = new AbortController();
		const handleParentAbort = () => {
			toolAbortController.abort();
		};
		if (meta.signal) {
			if (meta.signal.aborted) {
				toolAbortController.abort();
			} else {
				meta.signal.addEventListener("abort", handleParentAbort, {
					once: true,
				});
			}
		}

		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		try {
			const toolPromise = tool.execute(toolCall.arguments, {
				requestId: meta.requestId,
				mode: meta.mode,
				toolName: resolvedToolName,
				toolCallId: meta.toolCallId,
				signal: toolAbortController.signal,
				reportProgress: (progress) => {
					this.emitExecutionEvent({
						type: "tool_progress",
						requestId: meta.requestId,
						mode: meta.mode,
						status: "running",
						toolName: resolvedToolName,
						toolCallId: meta.toolCallId,
						planStepId: meta.planStepId,
						stepIndex: meta.stepIndex,
						totalSteps: meta.totalSteps,
						dagState: "running",
						message: progress.message,
						progress: {
							message: progress.message,
							data: progress.data,
						},
					});
				},
			});
			if (!this.toolTimeoutMs) {
				return await toolPromise;
			}

			const timeoutPromise = new Promise<ToolResult>((_, reject) => {
				timeoutId = setTimeout(() => {
					toolAbortController.abort();
					reject(new Error("Tool execution timeout"));
				}, this.toolTimeoutMs);
			});
			return await Promise.race([toolPromise, timeoutPromise]);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === "Tool execution timeout"
			) {
				return {
					success: false,
					message: "工具执行超时 (Tool execution timeout)",
					data: {
						errorCode: TOOL_EXECUTION_TIMEOUT_ERROR_CODE,
						toolName: resolvedToolName,
					},
				};
			}
			if (isCancellationError(error)) {
				return buildExecutionCancelledResult({ toolName: resolvedToolName });
			}
			return {
				success: false,
				message: `工具执行失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "TOOL_EXECUTION_FAILED", toolName: toolCall.name },
			};
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			if (meta.signal) {
				meta.signal.removeEventListener("abort", handleParentAbort);
			}
		}
	}

	private async delayWithSignal(
		delayMs: number,
		signal?: AbortSignal,
	): Promise<boolean> {
		if (delayMs <= 0) {
			return true;
		}
		if (signal?.aborted) {
			return false;
		}

		return await new Promise<boolean>((resolve) => {
			const timeoutId = setTimeout(() => {
				if (signal) {
					signal.removeEventListener("abort", onAbort);
				}
				resolve(true);
			}, delayMs);
			const onAbort = () => {
				clearTimeout(timeoutId);
				resolve(false);
			};
			if (signal) {
				signal.addEventListener("abort", onAbort, { once: true });
			}
		});
	}

	private isAwaitingWorkflowConfirmation(result: ToolResult): boolean {
		const record = asObjectRecord(result.data);
		if (!record) return false;
		return (
			record.status === "awaiting_confirmation" ||
			record.errorCode === WORKFLOW_CONFIRMATION_REQUIRED_ERROR_CODE
		);
	}

	private toWorkflowQualityResult({
		toolResult,
		reports,
		passed,
		iteration,
		maxIterations,
	}: {
		toolResult: ToolResult;
		reports: QualityReport[];
		passed: boolean;
		iteration: number;
		maxIterations: number;
	}): ToolResult {
		const latestReport = reports[reports.length - 1];
		const dataRecord = asObjectRecord(toolResult.data) ?? {};
		const data: Record<string, unknown> = {
			...dataRecord,
			qualityReport: latestReport,
			qualityLoop: {
				passed,
				iteration,
				maxIterations,
				reports,
			},
		};
		if (!passed) {
			data.errorCode = QUALITY_TARGET_NOT_MET_ERROR_CODE;
		}
		const qualitySummary = latestReport
			? `质量评分 ${latestReport.overallScore.toFixed(2)} (${passed ? "达标" : "未达标"})`
			: "质量评分不可用";

		return {
			success: passed ? toolResult.success : false,
			message: `${toolResult.message}\n${qualitySummary}`,
			data,
		};
	}

	private async applyWorkflowQualityLoop({
		toolCall,
		initialResult,
		meta,
	}: {
		toolCall: PlannedToolCall;
		initialResult: ToolResult;
		meta: ToolExecutionMeta;
	}): Promise<ToolResult> {
		if (toolCall.name !== "run_workflow") {
			return initialResult;
		}
		if (this.isAwaitingWorkflowConfirmation(initialResult)) {
			return initialResult;
		}

		const args = asObjectRecord(toolCall.arguments);
		const workflowName =
			typeof args?.workflowName === "string" ? args.workflowName.trim() : "";
		if (!workflowName) {
			return initialResult;
		}

		const explicitEnable =
			typeof args?.enableQualityLoop === "boolean"
				? args.enableQualityLoop
				: undefined;
		const explicitMaxIterations = toOptionalPositiveInt(
			args?.qualityMaxIterations,
		);
		const shouldEnable =
			explicitEnable ??
			(explicitMaxIterations !== undefined
				? true
				: QUALITY_LOOP_ENABLED_WORKFLOWS.has(workflowName));
		if (!shouldEnable) {
			return initialResult;
		}

		const maxIterations = Math.min(
			Math.max(
				explicitMaxIterations ?? DEFAULT_WORKFLOW_QUALITY_MAX_ITERATIONS,
				1,
			),
			4,
		);
		const targetDurationSeconds =
			toOptionalPositiveNumber(args?.qualityTargetDuration) ??
			WORKFLOW_TARGET_DURATION_HINTS[workflowName];
		const durationToleranceRatio = clamp(
			toOptionalPositiveNumber(args?.qualityDurationTolerance) ??
				DEFAULT_WORKFLOW_QUALITY_DURATION_TOLERANCE,
			0.05,
			0.5,
		);

		let currentResult = initialResult;
		const reports: QualityReport[] = [];

		for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
			const report = qualityEvaluatorService.evaluate({
				targetDurationSeconds,
				durationToleranceRatio,
			});
			reports.push(report);
			this.emitExecutionEvent({
				type: "tool_progress",
				requestId: meta.requestId,
				mode: meta.mode,
				status: report.passed ? "running" : "error",
				toolName: toolCall.name,
				toolCallId: meta.toolCallId,
				planStepId: meta.planStepId,
				stepIndex: meta.stepIndex,
				totalSteps: meta.totalSteps,
				dagState: report.passed ? "running" : "failed",
				message:
					`工作流质量评估 ${iteration}/${maxIterations}: ` +
					`score=${report.overallScore.toFixed(2)} ` +
					(report.passed ? "达标" : "未达标"),
				progress: {
					message: "workflow_quality_evaluated",
					data: report,
				},
			});

			if (report.passed) {
				return this.toWorkflowQualityResult({
					toolResult: currentResult,
					reports,
					passed: true,
					iteration,
					maxIterations,
				});
			}

			if (iteration >= maxIterations) {
				return this.toWorkflowQualityResult({
					toolResult: currentResult,
					reports,
					passed: false,
					iteration,
					maxIterations,
				});
			}

			this.emitExecutionEvent({
				type: "tool_progress",
				requestId: meta.requestId,
				mode: meta.mode,
				status: "running",
				toolName: toolCall.name,
				toolCallId: meta.toolCallId,
				planStepId: meta.planStepId,
				stepIndex: meta.stepIndex,
				totalSteps: meta.totalSteps,
				dagState: "running",
				message: `质量未达标，开始自动二次迭代 ${iteration + 1}/${maxIterations}`,
				progress: {
					message: "workflow_quality_iteration_retry",
					data: {
						iteration: iteration + 1,
						maxIterations,
						workflowName,
					},
				},
			});

			const retryCallId = `${toolCall.id}:quality-${iteration + 1}`;
			const retryResult = await this.executeToolCallWithRecovery(
				{
					...toolCall,
					id: retryCallId,
					arguments: {
						...(toolCall.arguments ?? {}),
						confirmRequiredSteps: true,
					},
				},
				{
					...meta,
					toolCallId: retryCallId,
				},
				{ skipQualityLoop: true },
			);

			if (this.isToolResultCancelled(retryResult)) {
				return retryResult;
			}
			if (
				!retryResult.success ||
				this.isAwaitingWorkflowConfirmation(retryResult)
			) {
				return this.toWorkflowQualityResult({
					toolResult: retryResult,
					reports,
					passed: false,
					iteration,
					maxIterations,
				});
			}
			currentResult = retryResult;
		}

		return currentResult;
	}

	private async executeToolCallWithRecovery(
		toolCall: PlannedToolCall,
		meta: ToolExecutionMeta,
		options?: { skipQualityLoop?: boolean },
	): Promise<ToolResult> {
		let retryCount = 0;
		let currentToolCall: PlannedToolCall = toolCall;
		while (true) {
			const result = await this.executeToolCall(currentToolCall, meta);
			if (this.isToolResultCancelled(result)) {
				return result;
			}
			if (result.success) {
				if (!options?.skipQualityLoop) {
					return await this.applyWorkflowQualityLoop({
						toolCall: currentToolCall,
						initialResult: result,
						meta,
					});
				}
				return result;
			}

			const errorCode = extractToolErrorCode(result.data);
			if (!errorCode) {
				return result;
			}

			const decision = resolveRecoveryPolicyDecision({
				toolCall: {
					id: currentToolCall.id,
					name: currentToolCall.name,
					arguments: currentToolCall.arguments ?? {},
				},
				errorCode,
				retryCount,
			});
			if (!decision) {
				if (retryCount > 0) {
					this.emitExecutionEvent({
						type: "recovery_exhausted",
						requestId: meta.requestId,
						mode: meta.mode,
						status: "error",
						toolName: currentToolCall.name,
						toolCallId: meta.toolCallId,
						planStepId: meta.planStepId,
						stepIndex: meta.stepIndex,
						totalSteps: meta.totalSteps,
						dagState: "failed",
						message: `恢复策略重试已耗尽（${errorCode}）`,
						recovery: {
							policyId: "none",
							errorCode,
							attempt: retryCount,
							maxRetries: retryCount,
							toolName: currentToolCall.name,
						},
					});
				}
				return result;
			}

			const attempt = retryCount + 1;
			this.emitExecutionEvent({
				type: "recovery_started",
				requestId: meta.requestId,
				mode: meta.mode,
				status: "running",
				toolName: currentToolCall.name,
				toolCallId: meta.toolCallId,
				planStepId: meta.planStepId,
				stepIndex: meta.stepIndex,
				totalSteps: meta.totalSteps,
				dagState: "running",
				message: `检测到 ${errorCode}，启动恢复策略 ${decision.policyId}（第 ${attempt}/${decision.maxRetries} 次）`,
				recovery: {
					policyId: decision.policyId,
					errorCode,
					attempt,
					maxRetries: decision.maxRetries,
					toolName: currentToolCall.name,
				},
			});

			if (decision.delayMs > 0) {
				this.emitExecutionEvent({
					type: "recovery_retrying",
					requestId: meta.requestId,
					mode: meta.mode,
					status: "running",
					toolName: currentToolCall.name,
					toolCallId: meta.toolCallId,
					planStepId: meta.planStepId,
					stepIndex: meta.stepIndex,
					totalSteps: meta.totalSteps,
					dagState: "running",
					message: `等待 ${decision.delayMs}ms 后重试 ${currentToolCall.name}`,
					recovery: {
						policyId: decision.policyId,
						errorCode,
						attempt,
						maxRetries: decision.maxRetries,
						toolName: currentToolCall.name,
					},
				});
				const waited = await this.delayWithSignal(
					decision.delayMs,
					meta.signal,
				);
				if (!waited) {
					return buildExecutionCancelledResult({
						toolName: currentToolCall.name,
					});
				}
			}

			for (let index = 0; index < decision.prerequisiteCalls.length; index++) {
				if (meta.signal?.aborted) {
					return buildExecutionCancelledResult({
						toolName: currentToolCall.name,
					});
				}
				const prerequisiteCall = decision.prerequisiteCalls[index];
				const prerequisiteToolCallId = `${meta.toolCallId}:recovery:${attempt}:${index + 1}`;
				this.emitExecutionEvent({
					type: "recovery_prerequisite_started",
					requestId: meta.requestId,
					mode: meta.mode,
					status: "running",
					toolName: currentToolCall.name,
					toolCallId: meta.toolCallId,
					planStepId: meta.planStepId,
					stepIndex: meta.stepIndex,
					totalSteps: meta.totalSteps,
					dagState: "running",
					message: `恢复步骤：执行 ${prerequisiteCall.name}`,
					recovery: {
						policyId: decision.policyId,
						errorCode,
						attempt,
						maxRetries: decision.maxRetries,
						toolName: currentToolCall.name,
						prerequisiteToolName: prerequisiteCall.name,
					},
				});
				const prerequisiteResult = await this.executeToolCall(
					{
						...prerequisiteCall,
						id: prerequisiteToolCallId,
					},
					{
						...meta,
						toolCallId: prerequisiteToolCallId,
					},
				);

				this.emitExecutionEvent({
					type: "recovery_prerequisite_completed",
					requestId: meta.requestId,
					mode: meta.mode,
					status: prerequisiteResult.success ? "running" : "error",
					toolName: currentToolCall.name,
					toolCallId: meta.toolCallId,
					planStepId: meta.planStepId,
					stepIndex: meta.stepIndex,
					totalSteps: meta.totalSteps,
					dagState: prerequisiteResult.success ? "running" : "failed",
					message: `恢复步骤 ${prerequisiteCall.name}${prerequisiteResult.success ? " 成功" : " 失败"}`,
					result: {
						success: prerequisiteResult.success,
						message: prerequisiteResult.message,
					},
					recovery: {
						policyId: decision.policyId,
						errorCode,
						attempt,
						maxRetries: decision.maxRetries,
						toolName: currentToolCall.name,
						prerequisiteToolName: prerequisiteCall.name,
					},
				});
				this.appendHistory({
					role: "tool",
					content: this.buildToolHistoryContent(
						{
							id: prerequisiteToolCallId,
							name: prerequisiteCall.name,
							arguments: prerequisiteCall.arguments,
						},
						prerequisiteResult,
					),
					toolCallId: prerequisiteToolCallId,
					name: prerequisiteCall.name,
				});

				if (!prerequisiteResult.success) {
					return {
						success: false,
						message: `自动恢复失败：${prerequisiteCall.name} 执行失败 (${prerequisiteResult.message})`,
						data: {
							errorCode: "RECOVERY_PREREQUISITE_FAILED",
							policyId: decision.policyId,
							originalErrorCode: errorCode,
							prerequisiteTool: prerequisiteCall.name,
						},
					};
				}
			}

			retryCount = attempt;
			currentToolCall = {
				...currentToolCall,
				name: decision.retryCall.name,
				arguments: decision.retryCall.arguments,
			};
			this.emitExecutionEvent({
				type: "recovery_retrying",
				requestId: meta.requestId,
				mode: meta.mode,
				status: "running",
				toolName: currentToolCall.name,
				toolCallId: meta.toolCallId,
				planStepId: meta.planStepId,
				stepIndex: meta.stepIndex,
				totalSteps: meta.totalSteps,
				dagState: "running",
				message: `恢复完成，重试 ${currentToolCall.name}（第 ${retryCount}/${decision.maxRetries} 次）`,
				recovery: {
					policyId: decision.policyId,
					errorCode,
					attempt: retryCount,
					maxRetries: decision.maxRetries,
					toolName: currentToolCall.name,
				},
			});
		}
	}

	private async executeToolCallsAsDag({
		requestId,
		mode,
		toolCalls,
		signal,
	}: {
		requestId: string;
		mode: "chat" | "workflow" | "plan_confirmation";
		toolCalls: PlannedToolCall[];
		signal?: AbortSignal;
	}): Promise<{
		executedTools: Array<{ name: string; result: ToolResult }>;
		hasPause: boolean;
		cancelled: boolean;
	}> {
		if (toolCalls.length === 0) {
			return { executedTools: [], hasPause: false, cancelled: false };
		}

		const planSteps: AgentPlanStep[] = toolCalls.map((toolCall) => ({
			id: toolCall.id,
			toolName: toolCall.name,
			arguments: toolCall.arguments ?? {},
			summary: `Execute ${toolCall.name}`,
			operation: toolCall.operation,
			dependsOn: toolCall.dependsOn,
			resourceLocks: toolCall.resourceLocks,
		}));
		const dag = buildDagFromPlanSteps(planSteps);
		getTopologicalOrder(dag);

		const toolByStepId = new Map<string, PlannedToolCall>(
			toolCalls.map((toolCall, index) => [
				toolCall.id?.trim() ? toolCall.id : `step-${index + 1}`,
				{
					...toolCall,
					id: toolCall.id?.trim() ? toolCall.id : `step-${index + 1}`,
				},
			]),
		);
		const states: Record<string, DagNodeState> = Object.fromEntries(
			dag.nodes.map((node) => [node.id, "pending"]),
		);
		const runningLocks = new Set<string>();
		const running = new Map<
			string,
			Promise<{
				nodeId: string;
				toolCall: PlannedToolCall;
				result: ToolResult;
			}>
		>();
		const executedTools: Array<{ name: string; result: ToolResult }> = [];
		let hasPause = false;
		let cancelled = false;

		while (true) {
			if (!hasPause && !cancelled) {
				const readyNodes = getReadyDagNodes({
					dag,
					states,
					runningLocks,
				}).sort((a, b) => a.index - b.index);

				for (const node of readyNodes) {
					const toolCall = toolByStepId.get(node.id);
					if (!toolCall) {
						throw new Error(`Missing tool call for DAG node ${node.id}`);
					}

					states[node.id] = "running";
					for (const lock of node.resourceLocks) {
						runningLocks.add(lock);
					}

					this.emitExecutionEvent({
						type: "tool_started",
						requestId,
						mode,
						status: "running",
						toolName: toolCall.name,
						toolCallId: toolCall.id,
						planStepId: node.id,
						stepIndex: node.index + 1,
						totalSteps: dag.nodes.length,
						dagState: "running",
					});

					const promise = this.executeToolCallWithRecovery(toolCall, {
						requestId,
						mode,
						toolCallId: toolCall.id,
						planStepId: node.id,
						stepIndex: node.index + 1,
						totalSteps: dag.nodes.length,
						signal,
					}).then((result) => ({ nodeId: node.id, toolCall, result }));

					running.set(node.id, promise);
				}
			}

			if (running.size === 0) {
				const pendingLeft = dag.nodes.some(
					(node) =>
						states[node.id] === "pending" || states[node.id] === "ready",
				);
				if (pendingLeft && !hasPause && !cancelled) {
					throw new Error("DAG scheduling deadlock detected");
				}
				break;
			}

			const settled = await Promise.race(running.values());
			running.delete(settled.nodeId);
			for (const lock of dag.byId[settled.nodeId].resourceLocks) {
				runningLocks.delete(lock);
			}

			const pauseInfo = extractWorkflowPauseInfo(settled.result.data);
			if (pauseInfo) {
				hasPause = true;
			}
			if (this.isToolResultCancelled(settled.result)) {
				cancelled = true;
			}

			states[settled.nodeId] = settled.result.success ? "completed" : "failed";
			executedTools.push({
				name: settled.toolCall.name,
				result: settled.result,
			});
			this.emitExecutionEvent({
				type: "tool_completed",
				requestId,
				mode,
				status: pauseInfo
					? "awaiting_confirmation"
					: settled.result.success
						? "running"
						: "error",
				toolName: settled.toolCall.name,
				toolCallId: settled.toolCall.id,
				planStepId: settled.nodeId,
				stepIndex: dag.byId[settled.nodeId].index + 1,
				totalSteps: dag.nodes.length,
				dagState: settled.result.success ? "completed" : "failed",
				result: {
					success: settled.result.success,
					message: settled.result.message,
				},
			});
			this.appendHistory({
				role: "tool",
				content: this.buildToolHistoryContent(settled.toolCall, settled.result),
				toolCallId: settled.toolCall.id,
				name: settled.toolCall.name,
			});
		}

		return { executedTools, hasPause, cancelled };
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
		const requestId = this.createRequestId("chat");
		if (this.planningEnabled && this.isExecutingPlan) {
			return {
				message: "计划正在执行中，请稍候。",
				success: false,
				status: "error",
				requestId,
			};
		}

		if (this.planningEnabled && this.pendingPlanState) {
			return this.buildPendingPlanBlockedResponse(requestId);
		}
		const executionSignal = this.beginExecution(requestId);

		this.emitExecutionEvent({
			type: "request_started",
			requestId,
			mode: "chat",
			status: "running",
			message: userMessage,
		});

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
				return this.completeRequest({
					requestId,
					mode: "chat",
					response: {
						message: `LLM provider (${this.provider.name}) is not available. Please ensure LM Studio is running.`,
						success: false,
						status: "error",
					},
				});
			}

			const executedTools: Array<{ name: string; result: ToolResult }> = [];
			let response = await this.provider.chat(
				{
					messages: this.buildMessages(),
					tools: this.getToolDefinitions(),
				},
				{ signal: executionSignal },
			);

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
				return this.completeRequest({
					requestId,
					mode: "chat",
					response: this.buildFinalResponse({
						requestId,
						response,
						executedTools,
					}),
				});
			}

			if (this.planningEnabled) {
				const planToolCalls = this.expandToolCallsForPlanning(
					response.toolCalls,
				);
				const pendingPlan = this.buildExecutionPlan(userMessage, planToolCalls);
				this.pendingPlanState = pendingPlan;
				this.emitExecutionEvent({
					type: "plan_created",
					requestId,
					mode: "chat",
					status: "planned",
					plan: pendingPlan.plan,
				});
				return this.completeRequest({
					requestId,
					mode: "chat",
					response: {
						message: this.formatPlanMessage(pendingPlan.plan),
						success: true,
						status: "planned",
						requiresConfirmation: true,
						plan: pendingPlan.plan,
					},
				});
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
					return this.completeRequest({
						requestId,
						mode: "chat",
						response: {
							message: "工具调用次数已达上限，请重试 (Tool call limit reached)",
							toolCalls: this.toClientToolCalls(executedTools),
							success: false,
							status: "error",
						},
					});
				}

				const dagExecution = await this.executeToolCallsAsDag({
					requestId,
					mode: "chat",
					toolCalls: response.toolCalls,
					signal: executionSignal,
				});
				executedTools.push(...dagExecution.executedTools);
				if (dagExecution.cancelled) {
					return this.completeRequest({
						requestId,
						mode: "chat",
						response: {
							message: "执行已取消 (Execution cancelled)",
							toolCalls: this.toClientToolCalls(executedTools),
							success: false,
							status: "cancelled",
						},
					});
				}

				if (dagExecution.hasPause) {
					return this.completeRequest({
						requestId,
						mode: "chat",
						response: this.buildFinalResponse({
							requestId,
							response: {
								content: "工作流已暂停，等待确认后继续执行。",
								finishReason: "stop",
							},
							executedTools,
						}),
					});
				}

				toolIterations += 1;
				response = await this.provider.chat(
					{
						messages: this.buildMessages(),
						tools: this.getToolDefinitions(),
					},
					{ signal: executionSignal },
				);

				this.appendHistory({
					role: "assistant",
					content:
						response.toolCalls.length > 0 ? null : (response.content ?? null),
					toolCalls:
						response.toolCalls.length > 0 ? response.toolCalls : undefined,
				});

				if (response.toolCalls.length === 0) {
					return this.completeRequest({
						requestId,
						mode: "chat",
						response: this.buildFinalResponse({
							requestId,
							response,
							executedTools,
						}),
					});
				}
			}
		} catch (error) {
			this.conversationHistory = this.conversationHistory.slice(
				0,
				historyLengthBefore,
			);
			if (isCancellationError(error)) {
				return this.completeRequest({
					requestId,
					mode: "chat",
					response: {
						message: "执行已取消 (Execution cancelled)",
						success: false,
						status: "cancelled",
					},
				});
			}
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred";
			return this.completeRequest({
				requestId,
				mode: "chat",
				response: {
					message: `Error processing request: ${errorMessage}`,
					success: false,
					status: "error",
				},
			});
		}
	}

	async runWorkflow({
		workflowName,
		stepOverrides,
		startFromStepId,
		confirmRequiredSteps,
		enableQualityLoop,
		qualityMaxIterations,
		qualityTargetDuration,
		qualityDurationTolerance,
	}: {
		workflowName: string;
		stepOverrides?: Array<{
			stepId?: string;
			index?: number;
			arguments: Record<string, unknown>;
		}>;
		startFromStepId?: string;
		confirmRequiredSteps?: boolean;
		enableQualityLoop?: boolean;
		qualityMaxIterations?: number;
		qualityTargetDuration?: number;
		qualityDurationTolerance?: number;
	}): Promise<AgentResponse> {
		const requestId = this.createRequestId("workflow");
		if (this.planningEnabled && this.isExecutingPlan) {
			return {
				message: "计划正在执行中，请稍候。",
				success: false,
				status: "error",
				requestId,
			};
		}

		if (this.planningEnabled && this.pendingPlanState) {
			return this.buildPendingPlanBlockedResponse(requestId);
		}

		const normalizedName = workflowName.trim();
		if (!normalizedName) {
			return {
				message: "workflowName 不能为空",
				success: false,
				status: "error",
				requestId,
			};
		}
		const executionSignal = this.beginExecution(requestId);
		this.emitExecutionEvent({
			type: "request_started",
			requestId,
			mode: "workflow",
			status: "running",
			message: normalizedName,
		});

		const argumentsPayload: Record<string, unknown> = {
			workflowName: normalizedName,
		};
		if (stepOverrides && stepOverrides.length > 0) {
			argumentsPayload.stepOverrides = stepOverrides;
		}
		if (startFromStepId && startFromStepId.trim().length > 0) {
			argumentsPayload.startFromStepId = startFromStepId.trim();
		}
		if (confirmRequiredSteps !== undefined) {
			argumentsPayload.confirmRequiredSteps = confirmRequiredSteps;
		}
		if (enableQualityLoop !== undefined) {
			argumentsPayload.enableQualityLoop = enableQualityLoop;
		}
		if (
			typeof qualityMaxIterations === "number" &&
			Number.isFinite(qualityMaxIterations)
		) {
			argumentsPayload.qualityMaxIterations = qualityMaxIterations;
		}
		if (
			typeof qualityTargetDuration === "number" &&
			Number.isFinite(qualityTargetDuration)
		) {
			argumentsPayload.qualityTargetDuration = qualityTargetDuration;
		}
		if (
			typeof qualityDurationTolerance === "number" &&
			Number.isFinite(qualityDurationTolerance)
		) {
			argumentsPayload.qualityDurationTolerance = qualityDurationTolerance;
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

			this.emitExecutionEvent({
				type: "plan_created",
				requestId,
				mode: "workflow",
				status: "planned",
				plan: pendingPlan.plan,
			});
			return this.completeRequest({
				requestId,
				mode: "workflow",
				response: {
					message: planMessage,
					success: true,
					status: "planned",
					requiresConfirmation: true,
					plan: pendingPlan.plan,
				},
			});
		}

		this.emitExecutionEvent({
			type: "tool_started",
			requestId,
			mode: "workflow",
			status: "running",
			toolName: workflowCall.name,
			toolCallId: workflowCall.id,
			stepIndex: 1,
			totalSteps: 1,
		});
		const toolResult = await this.executeToolCallWithRecovery(workflowCall, {
			requestId,
			mode: "workflow",
			toolCallId: workflowCall.id,
			stepIndex: 1,
			totalSteps: 1,
			signal: executionSignal,
		});
		if (this.isToolResultCancelled(toolResult)) {
			return this.completeRequest({
				requestId,
				mode: "workflow",
				response: {
					message: "执行已取消 (Execution cancelled)",
					toolCalls: [
						{
							name: workflowCall.name,
							result: compactToolResultForClient(workflowCall.name, toolResult),
						},
					],
					success: false,
					status: "cancelled",
				},
			});
		}
		const pauseInfo = extractWorkflowPauseInfo(toolResult.data);
		this.emitExecutionEvent({
			type: "tool_completed",
			requestId,
			mode: "workflow",
			status: pauseInfo
				? "awaiting_confirmation"
				: toolResult.success
					? "running"
					: "error",
			toolName: workflowCall.name,
			toolCallId: workflowCall.id,
			stepIndex: 1,
			totalSteps: 1,
			result: {
				success: toolResult.success,
				message: toolResult.message,
			},
		});
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
		const status = pauseInfo
			? "awaiting_confirmation"
			: toolResult.success
				? "completed"
				: "error";

		return this.completeRequest({
			requestId,
			mode: "workflow",
			response: {
				message: toolResult.message,
				toolCalls: [
					{
						name: workflowCall.name,
						result: compactToolResultForClient(workflowCall.name, toolResult),
					},
				],
				success: toolResult.success && !pauseInfo,
				status,
				requiresConfirmation: status === "awaiting_confirmation",
				nextStep: pauseInfo?.nextStep,
				resumeHint: pauseInfo?.resumeHint,
			},
		});
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

	cancelActiveExecution(): AgentResponse {
		if (
			!this.activeExecutionAbortController ||
			!this.activeExecutionRequestId
		) {
			return {
				message: "当前没有正在执行的请求。",
				success: false,
				status: "error",
			};
		}

		this.activeExecutionAbortController.abort();
		return {
			message: "已发送取消请求，请等待当前步骤中断。",
			success: true,
			status: "cancelled",
			requestId: this.activeExecutionRequestId,
		};
	}

	async confirmPendingPlan(): Promise<AgentResponse> {
		const requestId = this.createRequestId("confirm");
		if (this.isExecutingPlan) {
			return {
				message: "计划正在执行中，请勿重复确认。",
				success: false,
				status: "error",
				requestId,
			};
		}

		if (!this.pendingPlanState) {
			return {
				message: "当前没有待确认的计划。",
				success: false,
				status: "error",
				requestId,
			};
		}
		const executionSignal = this.beginExecution(requestId);
		this.emitExecutionEvent({
			type: "request_started",
			requestId,
			mode: "plan_confirmation",
			status: "running",
			message: this.pendingPlanState.plan.id,
		});

		const pendingPlan = this.pendingPlanState;
		this.pendingPlanState = null;
		this.isExecutingPlan = true;

		try {
			this.appendHistory({
				role: "user",
				content: "[确认执行计划]",
			});

			const dagExecution = await this.executeToolCallsAsDag({
				requestId,
				mode: "plan_confirmation",
				toolCalls: pendingPlan.toolCalls,
				signal: executionSignal,
			});
			const executedTools = dagExecution.executedTools;
			if (dagExecution.cancelled) {
				return this.completeRequest({
					requestId,
					mode: "plan_confirmation",
					response: {
						message: "执行已取消 (Execution cancelled)",
						toolCalls: this.toClientToolCalls(executedTools),
						success: false,
						status: "cancelled",
					},
				});
			}

			const { hasAwaitingConfirmation, hasToolFailure, pauseInfo } =
				this.analyzeExecutedTools(executedTools);
			const message = hasToolFailure
				? `计划执行完成，但有步骤失败：\n${this.buildToolSummary(executedTools)}`
				: hasAwaitingConfirmation
					? `计划执行已暂停，等待确认后继续：\n${this.buildToolSummary(executedTools)}`
					: `计划执行完成：\n${this.buildToolSummary(executedTools)}`;

			this.appendHistory({
				role: "assistant",
				content: message,
			});

			const status = hasToolFailure
				? "error"
				: hasAwaitingConfirmation
					? "awaiting_confirmation"
					: "completed";
			return this.completeRequest({
				requestId,
				mode: "plan_confirmation",
				response: {
					message,
					toolCalls: this.toClientToolCalls(executedTools),
					success: !hasToolFailure && !hasAwaitingConfirmation,
					status,
					requiresConfirmation: status === "awaiting_confirmation",
					nextStep: pauseInfo?.nextStep,
					resumeHint: pauseInfo?.resumeHint,
				},
			});
		} catch (error) {
			return this.completeRequest({
				requestId,
				mode: "plan_confirmation",
				response: {
					message: `计划执行失败: ${error instanceof Error ? error.message : "Unknown error"}`,
					success: false,
					status: "error",
				},
			});
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
		this.activeExecutionAbortController = null;
		this.activeExecutionRequestId = null;
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
