export type CapabilitySource = "action" | "manager" | "tool";

export type CapabilityRisk = "safe" | "caution" | "destructive";

export type CapabilityDomain =
	| "playback"
	| "navigation"
	| "editing"
	| "selection"
	| "history"
	| "timeline"
	| "controls"
	| "agent"
	| "scene"
	| "project"
	| "media"
	| "renderer"
	| "workflow"
	| "transcription"
	| "vision"
	| "highlight"
	| "audio";

export interface CapabilityParameter {
	name: string;
	type: string;
	required: boolean;
	description?: string;
}

export interface CapabilityDefinition {
	id: string;
	name: string;
	description: string;
	source: CapabilitySource;
	sourceRef: string;
	domain: CapabilityDomain;
	risk: CapabilityRisk;
	parameters: CapabilityParameter[];
	preconditions: string[];
}

export interface CapabilityRegistry {
	capabilities: CapabilityDefinition[];
	byId: Record<string, CapabilityDefinition>;
	bySource: Record<CapabilitySource, CapabilityDefinition[]>;
}
