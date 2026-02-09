import { describe, it, expect } from "vitest";
import {
	resolveRecoveryPolicyDecision,
	extractToolErrorCode,
} from "../recovery/policies";

describe("recovery policies", () => {
	it("should bootstrap transcript recovery for NO_TRANSCRIPT", () => {
		const decision = resolveRecoveryPolicyDecision({
			toolCall: {
				id: "call-1",
				name: "remove_filler_words",
				arguments: { dryRun: false },
			},
			errorCode: "NO_TRANSCRIPT",
			retryCount: 0,
		});

		expect(decision).not.toBeNull();
		expect(decision?.policyId).toBe("transcript-bootstrap");
		expect(decision?.maxRetries).toBe(1);
		expect(decision?.prerequisiteCalls).toHaveLength(1);
		expect(decision?.prerequisiteCalls[0]).toMatchObject({
			name: "generate_captions",
			arguments: { source: "timeline" },
		});
	});

	it("should stop transcript recovery after max retry", () => {
		const decision = resolveRecoveryPolicyDecision({
			toolCall: {
				id: "call-1",
				name: "remove_filler_words",
				arguments: {},
			},
			errorCode: "NO_TRANSCRIPT",
			retryCount: 1,
		});

		expect(decision).toBeNull();
	});

	it("should return provider backoff strategy", () => {
		const first = resolveRecoveryPolicyDecision({
			toolCall: {
				id: "call-1",
				name: "analyze_frames",
				arguments: { maxFrames: 8 },
			},
			errorCode: "PROVIDER_UNAVAILABLE",
			retryCount: 0,
		});
		const second = resolveRecoveryPolicyDecision({
			toolCall: {
				id: "call-1",
				name: "analyze_frames",
				arguments: { maxFrames: 8 },
			},
			errorCode: "PROVIDER_UNAVAILABLE",
			retryCount: 1,
		});
		const exhausted = resolveRecoveryPolicyDecision({
			toolCall: {
				id: "call-1",
				name: "analyze_frames",
				arguments: { maxFrames: 8 },
			},
			errorCode: "PROVIDER_UNAVAILABLE",
			retryCount: 2,
		});

		expect(first?.policyId).toBe("provider-backoff");
		expect(first?.delayMs).toBeGreaterThan(0);
		expect(second?.delayMs).toBeGreaterThan(first?.delayMs ?? 0);
		expect(exhausted).toBeNull();
	});

	it("should recover highlight cache stale by refreshing score", () => {
		const decision = resolveRecoveryPolicyDecision({
			toolCall: {
				id: "call-1",
				name: "validate_highlights_visual",
				arguments: { videoAssetId: "asset-1", topN: 5 },
			},
			errorCode: "HIGHLIGHT_CACHE_STALE",
			retryCount: 0,
		});

		expect(decision?.policyId).toBe("highlight-score-refresh");
		expect(decision?.prerequisiteCalls).toHaveLength(1);
		expect(decision?.prerequisiteCalls[0]).toMatchObject({
			name: "score_highlights",
			arguments: { videoAssetId: "asset-1" },
		});
	});

	it("should recover highlight plan missing by rebuilding score and plan", () => {
		const decision = resolveRecoveryPolicyDecision({
			toolCall: {
				id: "call-2",
				name: "apply_highlight_cut",
				arguments: { targetDuration: 50, tolerance: 0.2, includeHook: false },
			},
			errorCode: "HIGHLIGHT_PLAN_MISSING",
			retryCount: 0,
		});

		expect(decision?.policyId).toBe("highlight-plan-rebuild");
		expect(decision?.prerequisiteCalls).toHaveLength(2);
		expect(decision?.prerequisiteCalls[0]?.name).toBe("score_highlights");
		expect(decision?.prerequisiteCalls[1]).toMatchObject({
			name: "generate_highlight_plan",
			arguments: { targetDuration: 50, tolerance: 0.2, includeHook: false },
		});
	});

	it("should extract tool errorCode from result data", () => {
		expect(extractToolErrorCode({ errorCode: "NO_TRANSCRIPT" })).toBe(
			"NO_TRANSCRIPT",
		);
		expect(extractToolErrorCode({ errorCode: "   " })).toBeNull();
		expect(extractToolErrorCode(null)).toBeNull();
	});
});
