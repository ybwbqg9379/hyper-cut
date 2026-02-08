/**
 * Agent Module Types
 * Core type definitions for the Agentic Video Editing system
 */

// ============================================================================
// LLM Provider Types
// ============================================================================

export interface Message {
	role: "system" | "user" | "assistant" | "tool";
	content: MessageContent;
	toolCallId?: string;
	name?: string;
	toolCalls?: ToolCall[];
}

export interface TextContentPart {
	type: "text";
	text: string;
}

export interface ImageUrlContentPart {
	type: "image_url";
	image_url: {
		url: string;
	};
}

export type ContentPart = TextContentPart | ImageUrlContentPart;
export type MessageContent = string | ContentPart[] | null;

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	};
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export interface ChatParams {
	messages: Message[];
	tools: ToolDefinition[];
	temperature?: number;
}

export interface ProviderChatOptions {
	signal?: AbortSignal;
}

export interface ChatResponse {
	content: string | null;
	toolCalls: ToolCall[];
	finishReason: "stop" | "tool_calls" | "error";
}

export interface LLMProvider {
	name: string;
	chat(
		params: ChatParams,
		options?: ProviderChatOptions,
	): Promise<ChatResponse>;
	isAvailable(): Promise<boolean>;
}

// ============================================================================
// Agent Tool Types
// ============================================================================

export interface ToolResult {
	success: boolean;
	message: string;
	data?: unknown;
}

export interface ToolExecutionProgress {
	message: string;
	data?: unknown;
}

export interface ToolExecutionContext {
	requestId?: string;
	mode?: "chat" | "workflow" | "plan_confirmation";
	toolName?: string;
	toolCallId?: string;
	signal?: AbortSignal;
	reportProgress?: (progress: ToolExecutionProgress) => void;
}

export interface WorkflowResumeHint {
	workflowName: string;
	startFromStepId: string;
	confirmRequiredSteps: boolean;
	stepOverrides?: Array<{
		stepId?: string;
		index?: number;
		arguments: Record<string, unknown>;
	}>;
}

export interface WorkflowNextStep {
	id: string;
	toolName: string;
	summary?: string;
	arguments?: Record<string, unknown>;
}

export interface AgentTool {
	name: string;
	description: string;
	parameters: ToolDefinition["parameters"];
	execute: (
		params: Record<string, unknown>,
		context?: ToolExecutionContext,
	) => Promise<ToolResult>;
}

// ============================================================================
// Agent Response Types
// ============================================================================

export interface AgentPlanStep {
	id: string;
	toolName: string;
	arguments: Record<string, unknown>;
	summary: string;
}

export interface AgentExecutionPlan {
	id: string;
	originalUserMessage: string;
	createdAt: string;
	steps: AgentPlanStep[];
}

export interface AgentResponse {
	message: string;
	toolCalls?: Array<{
		name: string;
		result: ToolResult;
	}>;
	success: boolean;
	status?:
		| "completed"
		| "planned"
		| "running"
		| "awaiting_confirmation"
		| "cancelled"
		| "error";
	requiresConfirmation?: boolean;
	plan?: AgentExecutionPlan;
	requestId?: string;
	nextStep?: WorkflowNextStep;
	resumeHint?: WorkflowResumeHint;
}

// ============================================================================
// Configuration Types
// ============================================================================

export type ProviderType = "lm-studio" | "gemini";

export interface LMStudioConfig {
	url?: string;
	model?: string;
	timeoutMs?: number;
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	topK?: number;
	repeatPenalty?: number;
	stop?: string[];
}

export interface AgentConfig {
	provider: ProviderType;
	lmStudio?: LMStudioConfig;
	/** @deprecated Use lmStudio.url instead */
	lmStudioUrl?: string;
	/** @deprecated Use lmStudio.model instead */
	lmStudioModel?: string;
	/** @deprecated Use lmStudio.timeoutMs instead */
	lmStudioTimeoutMs?: number;
	geminiApiKey?: string;
	systemPrompt?: string;
}

export interface AgentOrchestratorOptions {
	systemPrompt?: string;
	maxHistoryMessages?: number;
	maxToolIterations?: number;
	toolTimeoutMs?: number;
	debug?: boolean;
	planningEnabled?: boolean;
	config?: Partial<AgentConfig>;
	onExecutionEvent?: (event: AgentExecutionEvent) => void;
}

export interface AgentExecutionEvent {
	type:
		| "request_started"
		| "tool_started"
		| "tool_progress"
		| "tool_completed"
		| "plan_created"
		| "request_completed";
	requestId: string;
	mode: "chat" | "workflow" | "plan_confirmation";
	toolName?: string;
	toolCallId?: string;
	stepIndex?: number;
	totalSteps?: number;
	status?:
		| "completed"
		| "planned"
		| "running"
		| "awaiting_confirmation"
		| "cancelled"
		| "error";
	message?: string;
	progress?: {
		message: string;
		data?: unknown;
	};
	result?: {
		success: boolean;
		message: string;
	};
	plan?: AgentExecutionPlan;
	timestamp: string;
}
