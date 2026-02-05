import type { AgentTool, ToolResult } from "../types";
import { getTimelineTools } from "./timeline-tools";
import { getPlaybackTools } from "./playback-tools";
import { getQueryTools } from "./query-tools";
import { getMediaTools } from "./media-tools";
import { getSceneTools } from "./scene-tools";
import { getAssetTools } from "./asset-tools";
import { getProjectTools } from "./project-tools";
import { getVisionTools } from "./vision-tools";
import { listWorkflows, resolveWorkflowFromParams } from "../workflows";

function buildExecutableToolMap(): Map<string, AgentTool> {
	const toolMap = new Map<string, AgentTool>();
	const tools = [
		...getTimelineTools(),
		...getPlaybackTools(),
		...getQueryTools(),
		...getMediaTools(),
		...getSceneTools(),
		...getAssetTools(),
		...getProjectTools(),
		...getVisionTools(),
	];

	for (const tool of tools) {
		toolMap.set(tool.name, tool);
	}

	return toolMap;
}

const workflowReservedTools = new Set(["run_workflow", "list_workflows"]);

export const listWorkflowsTool: AgentTool = {
	name: "list_workflows",
	description:
		"列出可复用的预置工作流（名称、描述、步骤）。List available predefined workflows.",
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	execute: async (): Promise<ToolResult> => {
		const workflows = listWorkflows();
		if (workflows.length === 0) {
			return {
				success: true,
				message: "当前没有可用工作流 (No workflows available)",
				data: { workflows: [] },
			};
		}

		const lines = workflows.map(
			(workflow) =>
				`- ${workflow.name}: ${workflow.description} (${workflow.steps.length} steps)`,
		);

		return {
			success: true,
			message: `可用工作流:\n${lines.join("\n")}`,
			data: {
				workflows: workflows.map((workflow) => ({
					name: workflow.name,
					description: workflow.description,
					steps: workflow.steps.map((step) => ({
						id: step.id,
						toolName: step.toolName,
						summary: step.summary,
						arguments: step.arguments,
					})),
				})),
			},
		};
	},
};

export const runWorkflowTool: AgentTool = {
	name: "run_workflow",
	description:
		"执行预置工作流。Execute a predefined workflow by name. " +
		"支持 stepOverrides 覆盖某一步参数。",
	parameters: {
		type: "object",
		properties: {
			workflowName: {
				type: "string",
				description: "工作流名称，例如 auto-caption-cleanup (Workflow name)",
			},
			stepOverrides: {
				type: "array",
				description:
					"步骤参数覆盖数组：[{ stepId 或 index, arguments }] (Optional step overrides)",
			},
		},
		required: ["workflowName"],
	},
	execute: async (params): Promise<ToolResult> => {
		const resolved = resolveWorkflowFromParams(params);
		if (!resolved.ok) {
			return {
				success: false,
				message: resolved.message,
				data: { errorCode: "INVALID_WORKFLOW_REQUEST" },
			};
		}

		const executableTools = buildExecutableToolMap();
		const stepResults: Array<{
			stepId: string;
			toolName: string;
			result: ToolResult;
		}> = [];

		for (const step of resolved.resolved.steps) {
			if (workflowReservedTools.has(step.toolName)) {
				return {
					success: false,
					message:
						`工作流步骤 ${step.id} 包含保留工具 ${step.toolName}，` +
						"不支持嵌套工作流执行",
					data: { errorCode: "WORKFLOW_NESTING_NOT_ALLOWED", stepId: step.id },
				};
			}

			const targetTool = executableTools.get(step.toolName);
			if (!targetTool) {
				return {
					success: false,
					message:
						`工作流步骤 ${step.id} 对应工具不存在: ${step.toolName} ` +
						"(Tool not found)",
					data: {
						errorCode: "WORKFLOW_TOOL_NOT_FOUND",
						stepId: step.id,
						toolName: step.toolName,
					},
				};
			}

			const result = await targetTool.execute(step.arguments);
			stepResults.push({
				stepId: step.id,
				toolName: step.toolName,
				result,
			});

			if (!result.success) {
				return {
					success: false,
					message:
						`工作流执行失败，停止在步骤 ${step.id} (${step.toolName})：` +
						result.message,
					data: {
						errorCode: "WORKFLOW_STEP_FAILED",
						workflowName: resolved.resolved.workflow.name,
						stepResults,
					},
				};
			}
		}

		return {
			success: true,
			message:
				`工作流 ${resolved.resolved.workflow.name} 执行完成，` +
				`共 ${stepResults.length} 步`,
			data: {
				workflowName: resolved.resolved.workflow.name,
				stepResults,
			},
		};
	},
};

export function getWorkflowTools(): AgentTool[] {
	return [listWorkflowsTool, runWorkflowTool];
}
