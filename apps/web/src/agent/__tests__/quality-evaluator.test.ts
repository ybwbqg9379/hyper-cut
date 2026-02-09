import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTotalDuration, buildTranscriptContext } = vi.hoisted(() => ({
	getTotalDuration: vi.fn(),
	buildTranscriptContext: vi.fn(),
}));

vi.mock("@/core", () => ({
	EditorCore: {
		getInstance: vi.fn(() => ({
			timeline: {
				getTotalDuration,
			},
		})),
	},
}));

vi.mock("../services/transcript-context-builder", () => ({
	buildTranscriptContext,
}));

import { qualityEvaluatorService } from "../services/quality-evaluator";

describe("quality evaluator", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should pass when metrics meet thresholds", () => {
		getTotalDuration.mockReturnValue(100);
		buildTranscriptContext.mockReturnValue({
			source: "captions",
			segments: [
				{ startTime: 0, endTime: 90, text: "a" },
				{ startTime: 92, endTime: 98, text: "b" },
			],
			words: [
				{ startTime: 0, endTime: 40, text: "hello" },
				{ startTime: 42, endTime: 90, text: "world" },
			],
		});

		const report = qualityEvaluatorService.evaluate({
			targetDurationSeconds: 95,
			durationToleranceRatio: 0.2,
		});

		expect(report.passed).toBe(true);
		expect(report.overallScore).toBeGreaterThan(0.7);
		expect(report.metrics.subtitleCoverage.passed).toBe(true);
	});

	it("should fail when transcript is missing", () => {
		getTotalDuration.mockReturnValue(120);
		buildTranscriptContext.mockReturnValue(null);

		const report = qualityEvaluatorService.evaluate();

		expect(report.passed).toBe(false);
		expect(report.metrics.semanticCompleteness.value).toBe(0);
		expect(report.metrics.silenceRate.value).toBe(1);
		expect(report.reasons.length).toBeGreaterThan(0);
	});

	it("should fail duration compliance when far from target", () => {
		getTotalDuration.mockReturnValue(180);
		buildTranscriptContext.mockReturnValue({
			source: "captions",
			segments: [{ startTime: 0, endTime: 150, text: "x" }],
			words: [{ startTime: 0, endTime: 150, text: "x" }],
		});

		const report = qualityEvaluatorService.evaluate({
			targetDurationSeconds: 60,
			durationToleranceRatio: 0.15,
		});

		expect(report.metrics.durationCompliance.passed).toBe(false);
		expect(report.passed).toBe(false);
		expect(report.reasons.join(" ")).toContain("时长未达标");
	});
});
