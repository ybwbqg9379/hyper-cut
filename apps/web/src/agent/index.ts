/**
 * Agent Module
 * Agentic Video Editing system for HyperCut
 */

// Core types
export type {
	Message,
	ContentPart,
	MessageContent,
	ToolDefinition,
	ToolCall,
	ChatParams,
	ChatResponse,
	LLMProvider,
	ToolResult,
	AgentTool,
	AgentResponse,
	AgentExecutionPlan,
	AgentPlanStep,
	ProviderType,
	AgentConfig,
	LMStudioConfig,
	AgentOrchestratorOptions,
} from "./types";

// Orchestrator
export { AgentOrchestrator } from "./orchestrator";

// Providers
export {
	createProvider,
	getConfiguredProviderType,
} from "./providers";
export { LMStudioProvider } from "./providers/lm-studio-provider";
export { GeminiProvider } from "./providers/gemini-provider";

// Tools
export { getAllTools, getToolsSummary } from "./tools";
export { getTimelineTools } from "./tools/timeline-tools";
export { getPlaybackTools } from "./tools/playback-tools";
export { getQueryTools } from "./tools/query-tools";
export { getProjectTools } from "./tools/project-tools";
export { getVisionTools } from "./tools/vision-tools";
export { getWorkflowTools } from "./tools/workflow-tools";

// Workflows
export {
	listWorkflows,
	getWorkflowByName,
	resolveWorkflowFromParams,
} from "./workflows";
export type {
	Workflow,
	WorkflowStep,
	WorkflowStepOverride,
} from "./workflows/types";
