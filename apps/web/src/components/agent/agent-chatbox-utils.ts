import type { AgentResponse, WorkflowStep } from "@/agent";
import type { AgentLocale } from "./agent-locale";

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

export interface TranscriptSuggestionPayload {
	id: string;
	startWordIndex: number;
	endWordIndex: number;
	reason: string;
	accepted: boolean;
	estimatedDurationSeconds?: number;
	source?: "llm" | "rule" | "filler";
}

export interface LayoutConfirmationPayload {
	arguments: Record<string, unknown>;
	confidence?: number;
	minConfidence?: number;
}

export interface LayoutCandidateRetryPayload {
	arguments: Record<string, unknown>;
	rank: number;
	elementId: string;
	trackId: string;
	elementName?: string;
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
	options?: {
		locale?: AgentLocale;
	},
): { ok: true; value: unknown } | { ok: false; message: string } {
	const locale = options?.locale ?? "zh";

	if (draft.kind === "string") {
		return { ok: true, value: draft.value };
	}

	if (draft.kind === "number") {
		if (draft.value.trim().length === 0) {
			return {
				ok: false,
				message: locale === "zh" ? "数字不能为空" : "Number is required",
			};
		}
		const parsed = Number(draft.value);
		if (!Number.isFinite(parsed)) {
			return {
				ok: false,
				message:
					locale === "zh" ? "请输入有效数字" : "Please enter a valid number",
			};
		}
		return { ok: true, value: parsed };
	}

	if (draft.kind === "boolean") {
		if (draft.value !== "true" && draft.value !== "false") {
			return {
				ok: false,
				message:
					locale === "zh"
						? "布尔值必须为 true 或 false"
						: "Boolean must be true or false",
			};
		}
		return { ok: true, value: draft.value === "true" };
	}

	try {
		return { ok: true, value: JSON.parse(draft.value) };
	} catch (error) {
		return {
			ok: false,
			message:
				error instanceof Error
					? error.message
					: locale === "zh"
						? "JSON 解析失败"
						: "Failed to parse JSON",
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
	locale: AgentLocale = "zh",
): string {
	if (locale === "zh") {
		if (scenario === "all") return "全部场景";
		if (scenario === "podcast") return "播客";
		if (scenario === "talking-head") return "口播人像";
		if (scenario === "course") return "课程";
		return "通用";
	}

	if (scenario === "all") return "All Scenarios";
	if (scenario === "podcast") return "Podcast";
	if (scenario === "talking-head") return "Talking Head";
	if (scenario === "course") return "Course";
	return "General";
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
	locale = "zh",
}: {
	field: WorkflowStepFieldConfig;
	value: unknown;
	locale?: AgentLocale;
}): string | null {
	if (
		field.kind === "number" &&
		typeof value === "number" &&
		Number.isFinite(value)
	) {
		if (field.min !== undefined && value < field.min) {
			return locale === "zh"
				? `应不小于 ${field.min}`
				: `Must be greater than or equal to ${field.min}`;
		}
		if (field.max !== undefined && value > field.max) {
			return locale === "zh"
				? `应不大于 ${field.max}`
				: `Must be less than or equal to ${field.max}`;
		}
	}
	if (
		field.enum &&
		field.enum.length > 0 &&
		!field.enum.some((candidate) => candidate === value)
	) {
		return locale === "zh"
			? `应为 ${field.enum.join(", ")} 之一`
			: `Must be one of ${field.enum.join(", ")}`;
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

export function extractTranscriptSuggestionsFromToolCalls(
	toolCalls: AgentResponse["toolCalls"] | undefined,
): TranscriptSuggestionPayload[] | null {
	if (!toolCalls || toolCalls.length === 0) return null;

	for (const toolCall of toolCalls) {
		if (!toolCall.result.success) continue;
		if (
			toolCall.name !== "suggest_transcript_cuts" &&
			toolCall.name !== "transcript_smart_trim"
		) {
			continue;
		}
		const dataRecord = asObjectRecord(toolCall.result.data);
		if (dataRecord?.dryRun === false) {
			continue;
		}
		const suggestionsRaw = Array.isArray(dataRecord?.suggestions)
			? dataRecord.suggestions
			: null;
		if (!suggestionsRaw || suggestionsRaw.length === 0) continue;

		const suggestions = suggestionsRaw
			.map((item) => {
				const record = asObjectRecord(item);
				if (!record) return null;
				const id = typeof record.id === "string" ? record.id : null;
				const startWordIndex = Number(record.startWordIndex);
				const endWordIndex = Number(record.endWordIndex);
				const reason = typeof record.reason === "string" ? record.reason : "";
				const accepted =
					typeof record.accepted === "boolean" ? record.accepted : true;
				if (
					!id ||
					!Number.isInteger(startWordIndex) ||
					!Number.isInteger(endWordIndex) ||
					endWordIndex < startWordIndex ||
					reason.trim().length === 0
				) {
					return null;
				}
				const source =
					record.source === "llm" ||
					record.source === "rule" ||
					record.source === "filler"
						? record.source
						: undefined;
				const estimatedDurationSeconds = toFiniteNumber(
					record.estimatedDurationSeconds,
				);
				return {
					id,
					startWordIndex,
					endWordIndex,
					reason,
					accepted,
					...(estimatedDurationSeconds !== undefined
						? { estimatedDurationSeconds }
						: {}),
					...(source ? { source } : {}),
				} satisfies TranscriptSuggestionPayload;
			})
			.filter((item): item is TranscriptSuggestionPayload => item !== null);

		if (suggestions.length > 0) {
			return suggestions;
		}
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

export function extractLayoutConfirmationFromToolCalls(
	toolCalls: AgentResponse["toolCalls"] | undefined,
): LayoutConfirmationPayload | null {
	if (!toolCalls || toolCalls.length === 0) return null;

	for (const toolCall of toolCalls) {
		if (toolCall.name !== "apply_layout_suggestion") continue;
		const dataRecord = asObjectRecord(toolCall.result.data);
		if (!dataRecord) continue;
		if (
			dataRecord.stateCode !== "REQUIRES_CONFIRMATION" ||
			dataRecord.confirmationReason !== "LOW_CONFIDENCE"
		) {
			continue;
		}

		const suggestionRecord = asObjectRecord(dataRecord.suggestion);
		const plannedArgsRecord = asObjectRecord(
			dataRecord.plannedPositionElementArgs,
		);
		if (!suggestionRecord || !plannedArgsRecord) continue;

		const minConfidence = toFiniteNumber(dataRecord.minConfidence);
		const confidence = toFiniteNumber(suggestionRecord.confidence);

		const argumentsPayload: Record<string, unknown> = {
			...plannedArgsRecord,
			suggestion: suggestionRecord,
			confirmLowConfidence: true,
		};
		if (minConfidence !== undefined) {
			argumentsPayload.minConfidence = minConfidence;
		}

		return {
			arguments: argumentsPayload,
			...(confidence !== undefined ? { confidence } : {}),
			...(minConfidence !== undefined ? { minConfidence } : {}),
		};
	}

	return null;
}

export function extractLayoutCandidateRetryFromToolCalls(
	toolCalls: AgentResponse["toolCalls"] | undefined,
): LayoutCandidateRetryPayload | null {
	if (!toolCalls || toolCalls.length === 0) return null;

	for (const toolCall of toolCalls) {
		if (toolCall.name !== "apply_layout_suggestion") continue;
		const dataRecord = asObjectRecord(toolCall.result.data);
		if (!dataRecord || dataRecord.errorCode !== "AUTO_TARGET_NOT_FOUND") {
			continue;
		}

		const suggestionRecord = asObjectRecord(dataRecord.suggestion);
		const candidateElements = Array.isArray(dataRecord.candidateElements)
			? dataRecord.candidateElements
			: [];
		if (!suggestionRecord || candidateElements.length === 0) continue;

		const candidateRecord = asObjectRecord(candidateElements[0]);
		if (!candidateRecord) continue;
		if (
			typeof candidateRecord.elementId !== "string" ||
			typeof candidateRecord.trackId !== "string"
		) {
			continue;
		}

		const rank = Number(candidateRecord.rank);
		const argumentsPayload: Record<string, unknown> = {
			elementId: candidateRecord.elementId,
			trackId: candidateRecord.trackId,
			suggestion: suggestionRecord,
			confirmLowConfidence: true,
		};
		if (typeof dataRecord.target === "string") {
			argumentsPayload.target = dataRecord.target;
		}

		return {
			arguments: argumentsPayload,
			rank: Number.isInteger(rank) && rank > 0 ? rank : 1,
			elementId: candidateRecord.elementId,
			trackId: candidateRecord.trackId,
			...(typeof candidateRecord.elementName === "string"
				? { elementName: candidateRecord.elementName }
				: {}),
		};
	}

	return null;
}

export function extractAllLayoutCandidatesFromToolCalls(
	toolCalls: AgentResponse["toolCalls"] | undefined,
): LayoutCandidateRetryPayload[] {
	if (!toolCalls || toolCalls.length === 0) return [];

	for (const toolCall of toolCalls) {
		if (toolCall.name !== "apply_layout_suggestion") continue;
		const dataRecord = asObjectRecord(toolCall.result.data);
		if (!dataRecord || dataRecord.errorCode !== "AUTO_TARGET_NOT_FOUND") {
			continue;
		}

		const suggestionRecord = asObjectRecord(dataRecord.suggestion);
		const candidateElements = Array.isArray(dataRecord.candidateElements)
			? dataRecord.candidateElements
			: [];
		if (!suggestionRecord || candidateElements.length === 0) continue;

		const results: LayoutCandidateRetryPayload[] = [];
		for (const raw of candidateElements) {
			const candidateRecord = asObjectRecord(raw);
			if (!candidateRecord) continue;
			if (
				typeof candidateRecord.elementId !== "string" ||
				typeof candidateRecord.trackId !== "string"
			) {
				continue;
			}

			const rank = Number(candidateRecord.rank);
			const argumentsPayload: Record<string, unknown> = {
				elementId: candidateRecord.elementId,
				trackId: candidateRecord.trackId,
				suggestion: suggestionRecord,
				confirmLowConfidence: true,
			};
			if (typeof dataRecord.target === "string") {
				argumentsPayload.target = dataRecord.target;
			}

			results.push({
				arguments: argumentsPayload,
				rank: Number.isInteger(rank) && rank > 0 ? rank : results.length + 1,
				elementId: candidateRecord.elementId,
				trackId: candidateRecord.trackId,
				...(typeof candidateRecord.elementName === "string"
					? { elementName: candidateRecord.elementName }
					: {}),
			});
		}

		if (results.length > 0) return results;
	}

	return [];
}
