export type WorkflowScenario =
	| "general"
	| "podcast"
	| "talking-head"
	| "course";

export interface WorkflowStepArgumentSchema {
	key: string;
	type: "string" | "number" | "boolean" | "array" | "object";
	description: string;
	defaultValue: unknown;
	min?: number;
	max?: number;
	enum?: Array<string | number | boolean>;
}

export interface WorkflowQualityConfig {
	enabled?: boolean;
	maxIterations?: number;
	targetDurationSeconds?: number;
	durationToleranceRatio?: number;
}

export interface WorkflowStep {
	id: string;
	toolName: string;
	arguments: Record<string, unknown>;
	argumentSchema?: WorkflowStepArgumentSchema[];
	summary?: string;
	requiresConfirmation?: boolean;
	optional?: boolean;
	operation?: "read" | "write";
	dependsOn?: string[];
	resourceLocks?: string[];
}

export interface Workflow {
	name: string;
	description: string;
	scenario: WorkflowScenario;
	templateDescription?: string;
	tags?: string[];
	quality?: WorkflowQualityConfig;
	steps: WorkflowStep[];
}

export interface WorkflowStepOverride {
	stepId?: string;
	index?: number;
	arguments: Record<string, unknown>;
}

export interface ResolvedWorkflow {
	workflow: Workflow;
	steps: WorkflowStep[];
}
