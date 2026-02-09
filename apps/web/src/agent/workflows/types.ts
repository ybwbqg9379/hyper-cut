export interface WorkflowStep {
	id: string;
	toolName: string;
	arguments: Record<string, unknown>;
	summary?: string;
	requiresConfirmation?: boolean;
	operation?: "read" | "write";
	dependsOn?: string[];
	resourceLocks?: string[];
}

export interface Workflow {
	name: string;
	description: string;
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
