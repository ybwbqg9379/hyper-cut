import { WORKFLOWS } from "./definitions";
import type {
	ResolvedWorkflow,
	Workflow,
	WorkflowStep,
	WorkflowStepOverride,
} from "./types";

function cloneWorkflow(workflow: Workflow): Workflow {
	return {
		...workflow,
		steps: workflow.steps.map((step) => ({
			...step,
			arguments: { ...step.arguments },
		})),
	};
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function normalizeWorkflowName(value: string): string {
	return value.trim().toLowerCase();
}

function parseWorkflowName(params: Record<string, unknown>): string | null {
	if (isNonEmptyString(params.workflowName)) {
		return params.workflowName.trim();
	}
	if (isNonEmptyString(params.name)) {
		return params.name.trim();
	}
	return null;
}

function parseOverrides(
	value: unknown,
):
	| { ok: true; overrides: WorkflowStepOverride[] }
	| { ok: false; message: string } {
	if (value === undefined) {
		return { ok: true, overrides: [] };
	}
	if (!Array.isArray(value)) {
		return {
			ok: false,
			message: "stepOverrides 必须是数组 (stepOverrides must be an array)",
		};
	}

	const overrides: WorkflowStepOverride[] = [];
	for (let index = 0; index < value.length; index += 1) {
		const candidate = value[index];
		if (!isObjectRecord(candidate)) {
			return {
				ok: false,
				message: `stepOverrides[${index}] 必须是对象 (must be an object)`,
			};
		}

		const hasStepId = isNonEmptyString(candidate.stepId);
		const hasIndex =
			typeof candidate.index === "number" &&
			Number.isFinite(candidate.index) &&
			candidate.index >= 0;
		if (!hasStepId && !hasIndex) {
			return {
				ok: false,
				message:
					`stepOverrides[${index}] 必须提供 stepId 或 index ` +
					"(stepId or index is required)",
			};
		}

		if (!isObjectRecord(candidate.arguments)) {
			return {
				ok: false,
				message:
					`stepOverrides[${index}].arguments 必须是对象 ` +
					"(arguments must be an object)",
			};
		}

		overrides.push({
			...(hasStepId ? { stepId: String(candidate.stepId).trim() } : {}),
			...(hasIndex ? { index: Math.floor(Number(candidate.index)) } : {}),
			arguments: candidate.arguments as Record<string, unknown>,
		});
	}

	return { ok: true, overrides };
}

function applyStepOverrides({
	steps,
	overrides,
}: {
	steps: WorkflowStep[];
	overrides: WorkflowStepOverride[];
}): { ok: true; steps: WorkflowStep[] } | { ok: false; message: string } {
	if (overrides.length === 0) {
		return { ok: true, steps };
	}

	const nextSteps = steps.map((step) => ({
		...step,
		arguments: { ...step.arguments },
	}));

	for (const override of overrides) {
		const targetIndex =
			override.stepId !== undefined
				? nextSteps.findIndex((step) => step.id === override.stepId)
				: (override.index ?? -1);

		if (targetIndex < 0 || targetIndex >= nextSteps.length) {
			return {
				ok: false,
				message: `找不到要覆盖的工作流步骤 (${override.stepId ?? override.index})`,
			};
		}

		nextSteps[targetIndex] = {
			...nextSteps[targetIndex],
			arguments: {
				...nextSteps[targetIndex].arguments,
				...override.arguments,
			},
		};
	}

	return { ok: true, steps: nextSteps };
}

export function listWorkflows(): Workflow[] {
	return WORKFLOWS.map((workflow) => cloneWorkflow(workflow));
}

export function getWorkflowByName(name: string): Workflow | null {
	const normalized = normalizeWorkflowName(name);
	const workflow =
		WORKFLOWS.find(
			(candidate) => normalizeWorkflowName(candidate.name) === normalized,
		) ?? null;
	return workflow ? cloneWorkflow(workflow) : null;
}

export function resolveWorkflowFromParams(
	params: Record<string, unknown>,
): { ok: true; resolved: ResolvedWorkflow } | { ok: false; message: string } {
	const workflowName = parseWorkflowName(params);
	if (!workflowName) {
		return {
			ok: false,
			message:
				"缺少 workflowName 参数 (Missing workflowName). " +
				"例如: run_workflow({ workflowName: 'auto-caption-cleanup' })",
		};
	}

	const workflow = getWorkflowByName(workflowName);
	if (!workflow) {
		return {
			ok: false,
			message: `未找到工作流: ${workflowName} (Workflow not found)`,
		};
	}

	const parsedOverrides = parseOverrides(params.stepOverrides);
	if (!parsedOverrides.ok) {
		return parsedOverrides;
	}

	const applied = applyStepOverrides({
		steps: workflow.steps,
		overrides: parsedOverrides.overrides,
	});
	if (!applied.ok) {
		return applied;
	}

	return {
		ok: true,
		resolved: {
			workflow,
			steps: applied.steps,
		},
	};
}
