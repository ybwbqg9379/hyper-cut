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
	AgentExecutionEvent,
	AgentPlanStep,
	WorkflowNextStep,
	WorkflowResumeHint,
	ProviderType,
	ProviderPrivacyMode,
	AgentConfig,
	LMStudioConfig,
	AgentOrchestratorOptions,
} from "./types";

// Orchestrator
export { AgentOrchestrator } from "./orchestrator";

// Providers
export {
	createProvider,
	createRoutedProvider,
	getConfiguredProviderType,
	resolveProviderRoute,
	resolveProviderPrivacyMode,
} from "./providers";
export type { ProviderTaskType } from "./providers";
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
export { getHighlightTools } from "./tools/highlight-tools";
export { getTranscriptEditTools } from "./tools/transcript-edit-tools";
export { getCapabilityTools } from "./tools/capability-tools";
export { getContentTools } from "./tools/content-tools";

// Capabilities
export type {
	CapabilityDefinition,
	CapabilityDomain,
	CapabilityParameter,
	CapabilityRegistry,
	CapabilityRisk,
	CapabilitySource,
} from "./capabilities";
export {
	getCapabilityRegistry,
	listCapabilities,
	getToolBindingCoverage,
} from "./capabilities";

// Workflows
export {
	listWorkflows,
	getWorkflowByName,
	resolveWorkflowFromParams,
} from "./workflows";
export type {
	Workflow,
	WorkflowScenario,
	WorkflowStep,
	WorkflowStepArgumentSchema,
	WorkflowStepOverride,
} from "./workflows/types";
