import type { AgentResponse, WorkflowStep } from "@/agent";

export type WorkflowFieldKind = "string" | "number" | "boolean" | "json";
export type WorkflowScenarioFilter =
	| "all"
	| "general"
	| "podcast"
	| "talking-head"
	| "course";

export interface WorkflowStepFieldConfig {
	key: string;
	defaultValue: unknown;
	kind: WorkflowFieldKind;
	description?: string;
	min?: number;
	max?: number;
	enum?: Array<string | number | boolean>;
}

export interface WorkflowFieldDraft {
	kind: WorkflowFieldKind;
	value: string;
}

export type WorkflowStepDrafts = Record<
	string,
	Record<string, WorkflowFieldDraft>
>;

export interface HighlightPlanPreviewPayload {
	segments: Array<{
		startTime: number;
		endTime: number;
		score?: number;
		reason?: string;
	}>;
	targetDuration?: number;
	actualDuration?: number;
}

export interface OperationDiffPayload {
	affectedElements: {
		added: string[];
		removed: string[];
		moved: string[];
	};
	duration: {
		beforeSeconds: number;
		afterSeconds: number;
		deltaSeconds: number;
	};
}

function detectWorkflowFieldKind(value: unknown): WorkflowFieldKind {
	if (typeof value === "number") return "number";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "string") return "string";
	return "json";
}

function serializeWorkflowFieldValue(
	value: unknown,
	kind: WorkflowFieldKind,
): string {
	if (kind === "json") {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return "null";
		}
	}
	return String(value);
}

function workflowFieldKindFromSchemaType(
	type: "string" | "number" | "boolean" | "array" | "object",
): WorkflowFieldKind {
	if (type === "number") return "number";
	if (type === "boolean") return "boolean";
	if (type === "string") return "string";
	return "json";
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return undefined;
	}
	return value;
}

function asOperationDiffPayload(data: unknown): OperationDiffPayload | null {
	const record = asObjectRecord(data);
	if (!record) return null;
	const affected = asObjectRecord(record.affectedElements);
	const duration = asObjectRecord(record.duration);
	if (!affected || !duration) return null;
	const beforeSeconds = toFiniteNumber(duration.beforeSeconds);
	const afterSeconds = toFiniteNumber(duration.afterSeconds);
	const deltaSeconds = toFiniteNumber(duration.deltaSeconds);
	if (
		beforeSeconds === undefined ||
		afterSeconds === undefined ||
		deltaSeconds === undefined
	) {
		return null;
	}

	return {
		affectedElements: {
			added: Array.isArray(affected.added)
				? affected.added.filter((v): v is string => typeof v === "string")
				: [],
			removed: Array.isArray(affected.removed)
				? affected.removed.filter((v): v is string => typeof v === "string")
				: [],
			moved: Array.isArray(affected.moved)
				? affected.moved.filter((v): v is string => typeof v === "string")
				: [],
		},
		duration: {
			beforeSeconds,
			afterSeconds,
			deltaSeconds,
		},
	};
}

export function buildWorkflowArgumentsDraft(
	argumentsValue: Record<string, unknown> | undefined,
): Record<string, WorkflowFieldDraft> {
	const nextDraft: Record<string, WorkflowFieldDraft> = {};
	for (const [key, value] of Object.entries(argumentsValue ?? {})) {
		const kind = detectWorkflowFieldKind(value);
		nextDraft[key] = {
			kind,
			value: serializeWorkflowFieldValue(value, kind),
		};
	}
	return nextDraft;
}

export function parseWorkflowFieldValue(
	draft: WorkflowFieldDraft,
): { ok: true; value: unknown } | { ok: false; message: string } {
	if (draft.kind === "string") {
		return { ok: true, value: draft.value };
	}

	if (draft.kind === "number") {
		if (draft.value.trim().length === 0) {
			return { ok: false, message: "数字不能为空" };
		}
		const parsed = Number(draft.value);
		if (!Number.isFinite(parsed)) {
			return { ok: false, message: "请输入有效数字" };
		}
		return { ok: true, value: parsed };
	}

	if (draft.kind === "boolean") {
		if (draft.value !== "true" && draft.value !== "false") {
			return { ok: false, message: "布尔值必须为 true 或 false" };
		}
		return { ok: true, value: draft.value === "true" };
	}

	try {
		return { ok: true, value: JSON.parse(draft.value) };
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : "JSON 解析失败",
		};
	}
}

export function areWorkflowValuesEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	try {
		return JSON.stringify(left) === JSON.stringify(right);
	} catch {
		return false;
	}
}

export function formatWorkflowValueForHint(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function formatWorkflowScenarioLabel(
	scenario: WorkflowScenarioFilter,
): string {
	if (scenario === "all") return "全部场景";
	if (scenario === "podcast") return "播客";
	if (scenario === "talking-head") return "口播人像";
	if (scenario === "course") return "课程";
	return "通用";
}

export function buildWorkflowStepFieldConfigs(
	step: WorkflowStep,
): WorkflowStepFieldConfig[] {
	if (step.argumentSchema && step.argumentSchema.length > 0) {
		return step.argumentSchema.map((schema) => ({
			key: schema.key,
			defaultValue: schema.defaultValue,
			kind: workflowFieldKindFromSchemaType(schema.type),
			description: schema.description,
			min: schema.min,
			max: schema.max,
			enum: schema.enum,
		}));
	}
	return Object.entries(step.arguments ?? {}).map(([key, defaultValue]) => ({
		key,
		defaultValue,
		kind: detectWorkflowFieldKind(defaultValue),
	}));
}

export function buildWorkflowStepDefaultArguments(
	step: WorkflowStep,
): Record<string, unknown> {
	const defaults: Record<string, unknown> = { ...(step.arguments ?? {}) };
	for (const field of buildWorkflowStepFieldConfigs(step)) {
		if (defaults[field.key] === undefined) {
			defaults[field.key] = field.defaultValue;
		}
	}
	return defaults;
}

export function validateWorkflowFieldValue({
	field,
	value,
}: {
	field: WorkflowStepFieldConfig;
	value: unknown;
}): string | null {
	if (
		field.kind === "number" &&
		typeof value === "number" &&
		Number.isFinite(value)
	) {
		if (field.min !== undefined && value < field.min) {
			return `应不小于 ${field.min}`;
		}
		if (field.max !== undefined && value > field.max) {
			return `应不大于 ${field.max}`;
		}
	}
	if (
		field.enum &&
		field.enum.length > 0 &&
		!field.enum.some((candidate) => candidate === value)
	) {
		return `应为 ${field.enum.join(", ")} 之一`;
	}
	return null;
}

export function extractHighlightPlanPreviewFromToolCalls(
	toolCalls: AgentResponse["toolCalls"] | undefined,
): HighlightPlanPreviewPayload | null {
	if (!toolCalls || toolCalls.length === 0) return null;

	for (const toolCall of toolCalls) {
		if (toolCall.name !== "generate_highlight_plan") continue;
		if (!toolCall.result.success) continue;
		const dataRecord = asObjectRecord(toolCall.result.data);
		const planRecord = asObjectRecord(dataRecord?.plan);
		if (!planRecord) continue;
		const segmentsRaw = Array.isArray(planRecord.segments)
			? planRecord.segments
			: [];
		const segments = segmentsRaw
			.map((segment) => {
				const segmentRecord = asObjectRecord(segment);
				if (!segmentRecord) return null;
				const startTime = toFiniteNumber(segmentRecord.startTime);
				const endTime = toFiniteNumber(segmentRecord.endTime);
				if (
					startTime === undefined ||
					endTime === undefined ||
					endTime <= startTime
				) {
					return null;
				}
				return {
					startTime,
					endTime,
					score: toFiniteNumber(segmentRecord.combinedScore),
					reason:
						typeof segmentRecord.reason === "string"
							? segmentRecord.reason
							: undefined,
				};
			})
			.filter((segment) => segment !== null);

		if (segments.length === 0) continue;
		return {
			segments,
			targetDuration: toFiniteNumber(planRecord.targetDuration),
			actualDuration: toFiniteNumber(planRecord.actualDuration),
		};
	}

	return null;
}

export function extractOperationDiffFromToolCalls(
	toolCalls: AgentResponse["toolCalls"] | undefined,
): { toolName: string; diff: OperationDiffPayload } | null {
	if (!toolCalls || toolCalls.length === 0) return null;

	for (const toolCall of toolCalls) {
		if (!toolCall.result.success) continue;
		const dataRecord = asObjectRecord(toolCall.result.data);
		const diff = asOperationDiffPayload(dataRecord?.diff);
		if (!diff) continue;
		return {
			toolName: toolCall.name,
			diff,
		};
	}

	return null;
}

export function hasSuccessfulToolCall({
	toolCalls,
	toolName,
}: {
	toolCalls: AgentResponse["toolCalls"] | undefined;
	toolName: string;
}): boolean {
	return Boolean(
		toolCalls?.some(
			(toolCall) => toolCall.name === toolName && toolCall.result.success,
		),
	);
}
