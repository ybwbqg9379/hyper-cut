import type { ToolCall } from "../types";

export interface RecoveryPolicyContext {
	toolCall: ToolCall;
	errorCode: string;
	retryCount: number;
}

export interface RecoveryPolicyDecision {
	policyId:
		| "transcript-bootstrap"
		| "provider-backoff"
		| "highlight-score-refresh"
		| "highlight-plan-rebuild";
	errorCode: string;
	reason: string;
	maxRetries: number;
	delayMs: number;
	prerequisiteCalls: ToolCall[];
	retryCall: ToolCall;
}

const TRANSCRIPT_BOOTSTRAP_TOOLS = new Set([
	"detect_filler_words",
	"remove_filler_words",
	"score_highlights",
]);

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function toOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function buildRetryCall(toolCall: ToolCall): ToolCall {
	return {
		id: toolCall.id,
		name: toolCall.name,
		arguments: { ...(toolCall.arguments ?? {}) },
	};
}

function buildGenerateCaptionsCall(): ToolCall {
	return {
		id: "recovery-generate-captions",
		name: "generate_captions",
		arguments: {
			source: "timeline",
		},
	};
}

function buildScoreHighlightsCall({
	videoAssetId,
}: {
	videoAssetId?: string;
}): ToolCall {
	const args: Record<string, unknown> = {};
	if (videoAssetId) {
		args.videoAssetId = videoAssetId;
	}
	return {
		id: "recovery-score-highlights",
		name: "score_highlights",
		arguments: args,
	};
}

function buildGenerateHighlightPlanCall({
	targetDuration,
	tolerance,
	includeHook,
}: {
	targetDuration?: number;
	tolerance?: number;
	includeHook?: boolean;
}): ToolCall {
	const args: Record<string, unknown> = {};
	if (typeof targetDuration === "number" && Number.isFinite(targetDuration)) {
		args.targetDuration = targetDuration;
	}
	if (typeof tolerance === "number" && Number.isFinite(tolerance)) {
		args.tolerance = tolerance;
	}
	if (typeof includeHook === "boolean") {
		args.includeHook = includeHook;
	}
	return {
		id: "recovery-generate-highlight-plan",
		name: "generate_highlight_plan",
		arguments: args,
	};
}

function getVideoAssetId(toolCall: ToolCall): string | undefined {
	const args = toRecord(toolCall.arguments);
	if (!args) {
		return undefined;
	}
	return toOptionalString(args.videoAssetId);
}

function computeProviderBackoffDelayMs(retryCount: number): number {
	const baseDelayMs = 400;
	const maxDelayMs = 2500;
	return Math.min(maxDelayMs, baseDelayMs * 2 ** retryCount);
}

export function resolveRecoveryPolicyDecision(
	context: RecoveryPolicyContext,
): RecoveryPolicyDecision | null {
	const { toolCall, errorCode, retryCount } = context;

	if (errorCode === "NO_TRANSCRIPT") {
		if (!TRANSCRIPT_BOOTSTRAP_TOOLS.has(toolCall.name) || retryCount >= 1) {
			return null;
		}
		return {
			policyId: "transcript-bootstrap",
			errorCode,
			reason: "缺少转录，先自动生成字幕再重试",
			maxRetries: 1,
			delayMs: 0,
			prerequisiteCalls: [buildGenerateCaptionsCall()],
			retryCall: buildRetryCall(toolCall),
		};
	}

	if (errorCode === "PROVIDER_UNAVAILABLE") {
		if (retryCount >= 2) {
			return null;
		}
		return {
			policyId: "provider-backoff",
			errorCode,
			reason: "模型服务暂不可用，执行指数退避重试",
			maxRetries: 2,
			delayMs: computeProviderBackoffDelayMs(retryCount),
			prerequisiteCalls: [],
			retryCall: buildRetryCall(toolCall),
		};
	}

	if (
		errorCode === "HIGHLIGHT_CACHE_STALE" ||
		errorCode === "HIGHLIGHT_CACHE_MISSING"
	) {
		if (
			(toolCall.name !== "validate_highlights_visual" &&
				toolCall.name !== "generate_highlight_plan") ||
			retryCount >= 1
		) {
			return null;
		}
		return {
			policyId: "highlight-score-refresh",
			errorCode,
			reason: "高光评分缓存失效，先刷新 score_highlights 再重试",
			maxRetries: 1,
			delayMs: 0,
			prerequisiteCalls: [
				buildScoreHighlightsCall({
					videoAssetId: getVideoAssetId(toolCall),
				}),
			],
			retryCall: buildRetryCall(toolCall),
		};
	}

	if (
		errorCode === "HIGHLIGHT_PLAN_STALE" ||
		errorCode === "HIGHLIGHT_PLAN_MISSING"
	) {
		if (toolCall.name !== "apply_highlight_cut" || retryCount >= 1) {
			return null;
		}
		const args = toRecord(toolCall.arguments);
		const targetDuration =
			typeof args?.targetDuration === "number" &&
			Number.isFinite(args.targetDuration)
				? args.targetDuration
				: undefined;
		const tolerance =
			typeof args?.tolerance === "number" && Number.isFinite(args.tolerance)
				? args.tolerance
				: undefined;
		const includeHook =
			typeof args?.includeHook === "boolean" ? args.includeHook : undefined;
		return {
			policyId: "highlight-plan-rebuild",
			errorCode,
			reason: "高光计划失效，重建评分与计划后重试 apply_highlight_cut",
			maxRetries: 1,
			delayMs: 0,
			prerequisiteCalls: [
				buildScoreHighlightsCall({
					videoAssetId: getVideoAssetId(toolCall),
				}),
				buildGenerateHighlightPlanCall({
					targetDuration,
					tolerance,
					includeHook,
				}),
			],
			retryCall: buildRetryCall(toolCall),
		};
	}

	return null;
}

export function extractToolErrorCode(data: unknown): string | null {
	const record = toRecord(data);
	if (!record) {
		return null;
	}
	return toOptionalString(record.errorCode) ?? null;
}
