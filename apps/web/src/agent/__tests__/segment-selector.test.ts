import { describe, expect, it } from "vitest";
import { SegmentSelectorService } from "../services/segment-selector";
import type { ScoredSegment } from "../tools/highlight-types";

const service = new SegmentSelectorService();

function buildSegment({
	index,
	start,
	end,
	score,
	hook,
}: {
	index: number;
	start: number;
	end: number;
	score: number;
	hook?: number;
}): ScoredSegment {
	return {
		chunk: {
			index,
			startTime: start,
			endTime: end,
			text: `segment-${index}`,
			wordCount: 20,
		},
		ruleScores: {
			speakingRate: 0.7,
			contentDensity: 0.8,
			engagementMarkers: 0.6,
			silenceRatio: 0.7,
		},
		semanticScores:
			hook !== undefined
				? {
						importance: 8,
						emotionalIntensity: 7,
						hookPotential: hook,
						standalone: 7,
					}
				: null,
		visualScores: null,
		combinedScore: score,
		rank: index + 1,
	};
}

describe("SegmentSelectorService", () => {
	it("should select non-overlapping segments close to target duration", () => {
		const segments = [
			buildSegment({ index: 0, start: 0, end: 15, score: 95, hook: 8 }),
			buildSegment({ index: 1, start: 14, end: 28, score: 90, hook: 7 }),
			buildSegment({ index: 2, start: 30, end: 45, score: 88, hook: 6 }),
			buildSegment({ index: 3, start: 50, end: 62, score: 80, hook: 5 }),
		];

		const plan = service.selectSegments(segments, 30, 0.2);

		expect(plan.segments.length).toBeGreaterThan(0);
		expect(plan.actualDuration).toBeGreaterThan(0);

		for (let i = 1; i < plan.segments.length; i += 1) {
			const previous = plan.segments[i - 1];
			const current = plan.segments[i];
			expect(previous).toBeDefined();
			expect(current).toBeDefined();
			expect(previous?.chunk.endTime).toBeLessThanOrEqual(
				current?.chunk.startTime ?? 0,
			);
		}
	});

	it("should keep hook segment when includeHook is enabled", () => {
		const segments = [
			buildSegment({ index: 0, start: 0, end: 10, score: 70, hook: 4 }),
			buildSegment({ index: 1, start: 12, end: 22, score: 69, hook: 3 }),
			buildSegment({ index: 2, start: 24, end: 34, score: 68, hook: 10 }),
		];

		const plan = service.selectSegments(segments, 20, 0.2, {
			includeHook: true,
		});

		const hasBestHook = plan.segments.some(
			(segment) => segment.chunk.index === 2,
		);
		expect(hasBestHook).toBe(true);
	});
});
