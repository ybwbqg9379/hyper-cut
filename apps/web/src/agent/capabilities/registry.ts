import type { AgentTool } from "../types";
import { collectActionCapabilities } from "./collect-from-actions";
import { collectManagerCapabilities } from "./collect-from-managers";
import {
	AGENT_NATIVE_CAPABILITIES,
	getToolCapabilityIds,
} from "./tool-bindings";
import type {
	CapabilityDefinition,
	CapabilityRegistry,
	CapabilityRisk,
	CapabilitySource,
} from "./types";

let cachedRegistry: CapabilityRegistry | null = null;

function buildRegistry(): CapabilityRegistry {
	const capabilities = [
		...collectActionCapabilities(),
		...collectManagerCapabilities(),
		...AGENT_NATIVE_CAPABILITIES,
	];

	const byId: Record<string, CapabilityDefinition> = {};
	const bySource: Record<CapabilitySource, CapabilityDefinition[]> = {
		action: [],
		manager: [],
		tool: [],
	};

	for (const capability of capabilities) {
		if (byId[capability.id]) {
			// Keep the first definition as canonical to avoid silent overrides.
			continue;
		}
		byId[capability.id] = capability;
		bySource[capability.source].push(capability);
	}

	const sortedCapabilities = Object.values(byId).sort((a, b) =>
		a.id.localeCompare(b.id),
	);

	return {
		capabilities: sortedCapabilities,
		byId,
		bySource,
	};
}

export function getCapabilityRegistry(): CapabilityRegistry {
	if (!cachedRegistry) {
		cachedRegistry = buildRegistry();
	}
	return cachedRegistry;
}

export function resetCapabilityRegistryForTests(): void {
	cachedRegistry = null;
}

export function listCapabilities({
	source,
	risk,
}: {
	source?: CapabilitySource;
	risk?: CapabilityRisk;
} = {}): CapabilityDefinition[] {
	const { capabilities } = getCapabilityRegistry();
	return capabilities.filter((capability) => {
		if (source && capability.source !== source) return false;
		if (risk && capability.risk !== risk) return false;
		return true;
	});
}

export function bindCapabilitiesToTools(tools: AgentTool[]): AgentTool[] {
	return tools.map((tool) => {
		const capabilityIds = getToolCapabilityIds(tool.name);
		if (capabilityIds.length === 0) {
			return tool;
		}
		return {
			...tool,
			capabilityId: capabilityIds[0],
			capabilityIds,
		};
	});
}

export function getToolBindingCoverage({ tools }: { tools: AgentTool[] }): {
	totalTools: number;
	boundTools: number;
	coverageRatio: number;
} {
	const totalTools = tools.length;
	const boundTools = tools.filter(
		(tool) => getToolCapabilityIds(tool.name).length > 0,
	).length;

	return {
		totalTools,
		boundTools,
		coverageRatio: totalTools === 0 ? 1 : boundTools / totalTools,
	};
}
