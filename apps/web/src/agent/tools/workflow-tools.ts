import type { AgentTool, ToolExecutionContext, ToolResult } from "../types";
import { getTimelineTools } from "./timeline-tools";
import { getPlaybackTools } from "./playback-tools";
import { getQueryTools } from "./query-tools";
import { getMediaTools } from "./media-tools";
import { getSceneTools } from "./scene-tools";
import { getAssetTools } from "./asset-tools";
import { getProjectTools } from "./project-tools";
import { getVisionTools } from "./vision-tools";
import { getHighlightTools } from "./highlight-tools";
import { getFillerTools } from "./filler-tools";
import { getTranscriptEditTools } from "./transcript-edit-tools";
import { getContentTools } from "./content-tools";
import { listWorkflows, resolveWorkflowFromParams } from "../workflows";
import { toBooleanOrDefault, toNonEmptyString } from "../utils/values";
import { EXECUTION_CANCELLED_ERROR_CODE } from "../utils/cancellation";

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
		...getHighlightTools(),
		...getFillerTools(),
		...getTranscriptEditTools(),
		...getContentTools(),
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
				`- ${workflow.name} [${workflow.scenario}]: ${workflow.description} (${workflow.steps.length} steps)`,
		);

		return {
			success: true,
			message: `可用工作流:\n${lines.join("\n")}`,
			data: {
				workflows: workflows.map((workflow) => ({
					name: workflow.name,
					description: workflow.description,
					scenario: workflow.scenario,
					templateDescription: workflow.templateDescription,
					tags: workflow.tags,
					steps: workflow.steps.map((step) => ({
						id: step.id,
						toolName: step.toolName,
						summary: step.summary,
						arguments: step.arguments,
						argumentSchema: step.argumentSchema,
						requiresConfirmation: step.requiresConfirmation === true,
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
		"支持 stepOverrides 覆盖某一步参数，默认在 requiresConfirmation 步骤前暂停。",
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
			confirmRequiredSteps: {
				type: "boolean",
				description:
					"是否确认并执行 requiresConfirmation 步骤，默认 false (Execute confirmation-required steps)",
			},
			startFromStepId: {
				type: "string",
				description:
					"从指定步骤开始执行，用于暂停后的恢复 (Resume workflow from a specific step id)",
			},
			enableQualityLoop: {
				type: "boolean",
				description:
					"是否启用工作流质量评估与自动二次迭代（默认按 workflow 策略）",
			},
			qualityMaxIterations: {
				type: "number",
				description: "质量不达标时最多迭代次数（包含首轮，默认 2，范围 1-4）",
			},
			qualityTargetDuration: {
				type: "number",
				description: "质量评估目标时长（秒），可覆盖工作流默认值",
			},
			qualityDurationTolerance: {
				type: "number",
				description: "目标时长容差比例（0.05~0.5）",
			},
		},
		required: ["workflowName"],
	},
	execute: async (
		params,
		context?: ToolExecutionContext,
	): Promise<ToolResult> => {
		const resolved = resolveWorkflowFromParams(params);
		if (!resolved.ok) {
			return {
				success: false,
				message: resolved.message,
				data: { errorCode: "INVALID_WORKFLOW_REQUEST" },
			};
		}

		const confirmRequiredSteps = toBooleanOrDefault(
			params.confirmRequiredSteps,
			false,
		);
		const startFromStepId = toNonEmptyString(params.startFromStepId);
		const executableTools = buildExecutableToolMap();
		const steps = resolved.resolved.steps;
		const startIndex = startFromStepId
			? steps.findIndex((step) => step.id === startFromStepId)
			: 0;
		if (startFromStepId && startIndex < 0) {
			return {
				success: false,
				message: `startFromStepId 无效: ${startFromStepId}`,
				data: { errorCode: "INVALID_START_STEP_ID", startFromStepId },
			};
		}

		const stepResults: Array<{
			stepId: string;
			toolName: string;
			result: Pick<ToolResult, "success" | "message">;
		}> = [];
		const executableSteps = steps.slice(startIndex);

		for (const [index, step] of executableSteps.entries()) {
			if (context?.signal?.aborted) {
				return {
					success: false,
					message: "工作流执行已取消 (Workflow execution cancelled)",
					data: {
						errorCode: EXECUTION_CANCELLED_ERROR_CODE,
						workflowName: resolved.resolved.workflow.name,
						stepResults,
					},
				};
			}

			context?.reportProgress?.({
				message:
					`执行步骤 ${index + 1}/${executableSteps.length}: ${step.toolName}` +
					(step.summary ? ` - ${step.summary}` : ""),
				data: {
					stepId: step.id,
					toolName: step.toolName,
					stepIndex: index + 1,
					totalSteps: executableSteps.length,
					summary: step.summary,
				},
			});

			if (workflowReservedTools.has(step.toolName)) {
				return {
					success: false,
					message:
						`工作流步骤 ${step.id} 包含保留工具 ${step.toolName}，` +
						"不支持嵌套工作流执行",
					data: { errorCode: "WORKFLOW_NESTING_NOT_ALLOWED", stepId: step.id },
				};
			}

			if (step.requiresConfirmation && !confirmRequiredSteps) {
				const resumeStepOverrides = executableSteps
					.slice(index)
					.map((resumeStep) => ({
						stepId: resumeStep.id,
						arguments: { ...resumeStep.arguments },
					}));
				return {
					success: true,
					message:
						`工作流已暂停在步骤 ${step.id} (${step.toolName}) 前，` +
						"请确认后继续执行",
					data: {
						errorCode: "WORKFLOW_CONFIRMATION_REQUIRED",
						status: "awaiting_confirmation",
						workflowName: resolved.resolved.workflow.name,
						stepResults,
						nextStep: {
							id: step.id,
							toolName: step.toolName,
							summary: step.summary,
							arguments: step.arguments,
						},
						resumeHint: {
							workflowName: resolved.resolved.workflow.name,
							startFromStepId: step.id,
							confirmRequiredSteps: true,
							stepOverrides: resumeStepOverrides,
						},
					},
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

			const result = await targetTool.execute(step.arguments, context);
			stepResults.push({
				stepId: step.id,
				toolName: step.toolName,
				result: {
					success: result.success,
					message: result.message,
				},
			});
			context?.reportProgress?.({
				message:
					`步骤 ${index + 1}/${executableSteps.length} ` +
					(result.success ? "完成" : "失败") +
					`: ${step.toolName}`,
				data: {
					stepId: step.id,
					toolName: step.toolName,
					stepIndex: index + 1,
					totalSteps: executableSteps.length,
					success: result.success,
					resultMessage: result.message,
				},
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
