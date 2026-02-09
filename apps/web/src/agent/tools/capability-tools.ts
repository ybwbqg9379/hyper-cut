import {
	getCapabilityRegistry,
	listCapabilities,
	type CapabilityRisk,
	type CapabilitySource,
} from "../capabilities";
import type { AgentTool, ToolResult } from "../types";

function toCapabilitySource(value: unknown): CapabilitySource | undefined {
	if (value === "action" || value === "manager" || value === "tool") {
		return value;
	}
	return undefined;
}

function toCapabilityRisk(value: unknown): CapabilityRisk | undefined {
	if (value === "safe" || value === "caution" || value === "destructive") {
		return value;
	}
	return undefined;
}

export const listCapabilitiesTool: AgentTool = {
	name: "list_capabilities",
	description:
		"列出 Agent 能力注册表，支持按来源和风险过滤。List agent capabilities by source and risk.",
	parameters: {
		type: "object",
		properties: {
			source: {
				type: "string",
				enum: ["action", "manager", "tool"],
				description: "能力来源过滤 (Capability source filter)",
			},
			risk: {
				type: "string",
				enum: ["safe", "caution", "destructive"],
				description: "风险级别过滤 (Capability risk filter)",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		const source =
			params.source === undefined
				? undefined
				: toCapabilitySource(params.source);
		if (params.source !== undefined && !source) {
			return {
				success: false,
				message: "source 参数无效 (Invalid source filter)",
				data: { errorCode: "INVALID_SOURCE_FILTER" },
			};
		}

		const risk =
			params.risk === undefined ? undefined : toCapabilityRisk(params.risk);
		if (params.risk !== undefined && !risk) {
			return {
				success: false,
				message: "risk 参数无效 (Invalid risk filter)",
				data: { errorCode: "INVALID_RISK_FILTER" },
			};
		}

		const registry = getCapabilityRegistry();
		const capabilities = listCapabilities({ source, risk });

		return {
			success: true,
			message: `已返回 ${capabilities.length} 条能力定义 (Returned ${capabilities.length} capabilities)`,
			data: {
				filters: { source, risk },
				total: capabilities.length,
				summary: {
					all: registry.capabilities.length,
					action: registry.bySource.action.length,
					manager: registry.bySource.manager.length,
					tool: registry.bySource.tool.length,
				},
				capabilities,
			},
		};
	},
};

export function getCapabilityTools(): AgentTool[] {
	return [listCapabilitiesTool];
}
