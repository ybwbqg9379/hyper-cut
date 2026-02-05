import { describe, expect, it, vi } from "vitest";
import { HighlightScorerService } from "../services/highlight-scorer";
import type { ScoredSegment, TranscriptChunk } from "../tools/highlight-types";
import type { LMStudioProvider } from "../providers/lm-studio-provider";

function createMockProvider({
	content,
}: {
	content: string;
}): LMStudioProvider {
	return {
		name: "lm-studio",
		chat: vi.fn(async () => ({
			content,
			toolCalls: [],
			finishReason: "stop",
		})),
		isAvailable: vi.fn(async () => true),
	} as unknown as LMStudioProvider;
}

describe("HighlightScorerService", () => {
	const service = new HighlightScorerService();

	it("should parse semantic scores from LLM output", async () => {
		const chunks: TranscriptChunk[] = [
			{
				index: 0,
				startTime: 0,
				endTime: 10,
				text: "第一段",
				wordCount: 20,
			},
			{
				index: 1,
				startTime: 10,
				endTime: 20,
				text: "第二段",
				wordCount: 18,
			},
		];

		const provider = createMockProvider({
			content:
				'[{"index":0,"importance":8,"emotionalIntensity":7,"hookPotential":9,"standalone":6},{"index":1,"importance":7,"emotionalIntensity":6,"hookPotential":7,"standalone":8}]',
		});

		const map = await service.scoreWithLLM(chunks, provider);

		expect(map.size).toBe(2);
		expect(map.get(0)?.hookPotential).toBe(9);
		expect(map.get(1)?.standalone).toBe(8);
	});

	it("should parse visual scores for candidates with thumbnail", async () => {
		const provider = createMockProvider({
			content: '{"frameQuality":0.75,"visualInterest":0.8}',
		});

		const candidates: ScoredSegment[] = [
			{
				chunk: {
					index: 3,
					startTime: 30,
					endTime: 40,
					text: "candidate",
					wordCount: 12,
				},
				ruleScores: {
					speakingRate: 0.8,
					contentDensity: 0.9,
					engagementMarkers: 0.7,
					silenceRatio: 0.6,
				},
				semanticScores: null,
				visualScores: null,
				combinedScore: 70,
				rank: 1,
				thumbnailDataUrl: "data:image/jpeg;base64,mock",
			},
		];

		const visualMap = await service.scoreWithVision(candidates, 10, provider);
		expect(visualMap.get(3)?.hasValidFrame).toBe(true);
		expect(visualMap.get(3)?.frameQuality).toBe(0.75);
	});

	it("should mark invalid visual responses as no valid frame", async () => {
		const provider = createMockProvider({
			content: "invalid json",
		});

		const candidates: ScoredSegment[] = [
			{
				chunk: {
					index: 4,
					startTime: 40,
					endTime: 50,
					text: "candidate-2",
					wordCount: 10,
				},
				ruleScores: {
					speakingRate: 0.7,
					contentDensity: 0.8,
					engagementMarkers: 0.6,
					silenceRatio: 0.5,
				},
				semanticScores: null,
				visualScores: null,
				combinedScore: 65,
				rank: 2,
				thumbnailDataUrl: "data:image/jpeg;base64,mock",
			},
		];

		const visualMap = await service.scoreWithVision(candidates, 10, provider);
		expect(visualMap.get(4)?.hasValidFrame).toBe(false);
		expect(visualMap.get(4)?.frameQuality).toBe(0);
		expect(visualMap.get(4)?.visualInterest).toBe(0);
	});

	it("should compute fallback combined score when semantic and visual are missing", () => {
		const score = service.computeCombinedScore(
			{
				speakingRate: 0.8,
				contentDensity: 0.6,
				engagementMarkers: 0.4,
				silenceRatio: 0.7,
			},
			null,
			null,
			{ rule: 1, semantic: 0, visual: 0 },
		);

		expect(score).toBeGreaterThan(0);
		expect(score).toBeLessThanOrEqual(100);
	});

	it("should use fixed 0.7/0.3 fallback for visual-only scoring", () => {
		const score = service.computeCombinedScore(
			{
				speakingRate: 1,
				contentDensity: 1,
				engagementMarkers: 1,
				silenceRatio: 1,
			},
			null,
			{
				frameQuality: 1,
				visualInterest: 0,
				hasValidFrame: true,
			},
		);

		expect(score).toBe(85);
	});
});
