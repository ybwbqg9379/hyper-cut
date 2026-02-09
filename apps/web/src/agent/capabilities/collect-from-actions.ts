import {
	ACTIONS,
	type TActionCategory,
	type TActionDefinition,
} from "@/lib/actions/definitions";
import type {
	CapabilityDefinition,
	CapabilityDomain,
	CapabilityParameter,
	CapabilityRisk,
} from "./types";

function toDomain(category: TActionCategory): CapabilityDomain {
	return category;
}

function toRisk({
	actionName,
	category,
}: {
	actionName: string;
	category: TActionCategory;
}): CapabilityRisk {
	if (
		actionName.includes("delete") ||
		actionName.includes("remove") ||
		actionName.includes("clear")
	) {
		return "destructive";
	}

	if (
		category === "editing" ||
		category === "timeline" ||
		category === "history"
	) {
		return "caution";
	}

	return "safe";
}

function toParameters(definition: TActionDefinition): CapabilityParameter[] {
	const args = definition.args ?? {};
	return Object.entries(args).map(([name, type]) => ({
		name,
		type: typeof type === "string" ? type : "unknown",
		required: true,
	}));
}

function toPreconditions(actionName: string): string[] {
	if (
		actionName.includes("selected") ||
		actionName === "split" ||
		actionName === "split-left" ||
		actionName === "split-right"
	) {
		return ["timeline_has_selection_or_playhead"];
	}

	if (
		actionName.includes("playback") ||
		actionName.includes("seek") ||
		actionName.includes("jump") ||
		actionName === "goto-start" ||
		actionName === "goto-end"
	) {
		return ["timeline_loaded"];
	}

	return [];
}

export function collectActionCapabilities(): CapabilityDefinition[] {
	return Object.entries(ACTIONS).map(([actionName, definition]) => ({
		id: `action.${actionName}`,
		name: actionName,
		description: definition.description,
		source: "action",
		sourceRef: "@/lib/actions/definitions.ts",
		domain: toDomain(definition.category),
		risk: toRisk({ actionName, category: definition.category }),
		parameters: toParameters(definition),
		preconditions: toPreconditions(actionName),
	}));
}
