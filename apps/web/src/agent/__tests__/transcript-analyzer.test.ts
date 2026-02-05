import { describe, expect, it } from "vitest";
import { TranscriptAnalyzerService } from "../services/transcript-analyzer";
import type { TranscriptContext } from "../tools/highlight-types";

const service = new TranscriptAnalyzerService();

describe("TranscriptAnalyzerService", () => {
	it("should split transcript into bounded chunks", () => {
		const context: TranscriptContext = {
			source: "whisper",
			segments: [
				{
					startTime: 0,
					endTime: 22,
					text: "第一句很重要。第二句也很关键。第三句给出结论。",
				},
			],
			words: [],
		};

		const chunks = service.segmentTranscript(context, {
			minSeconds: 6,
			maxSeconds: 12,
		});

		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks[0]?.index).toBe(0);
		for (const chunk of chunks) {
			expect(chunk.endTime).toBeGreaterThan(chunk.startTime);
			expect(chunk.text.length).toBeGreaterThan(0);
			expect(chunk.wordCount).toBeGreaterThanOrEqual(0);
		}
	});

	it("should merge very short chunks when needed", () => {
		const context: TranscriptContext = {
			source: "captions",
			segments: [
				{ startTime: 0, endTime: 1.5, text: "短句。" },
				{
					startTime: 1.5,
					endTime: 12,
					text: "这是一个较长的说明段落，包含更多信息。",
				},
			],
			words: [],
		};

		const chunks = service.segmentTranscript(context, {
			minSeconds: 4,
			maxSeconds: 20,
		});

		expect(chunks.length).toBe(1);
		expect(chunks[0]?.startTime).toBe(0);
		expect(chunks[0]?.endTime).toBe(12);
	});

	it("should compute rule scores within [0,1]", () => {
		const chunk = {
			index: 0,
			startTime: 0,
			endTime: 8,
			text: "This is important! You must never miss this key point.",
			wordCount: 12,
		};

		const scores = service.computeRuleScores(chunk, [
			{ startTime: 0, endTime: 0.5, text: "This" },
			{ startTime: 0.5, endTime: 1, text: "is" },
			{ startTime: 1, endTime: 1.5, text: "important" },
			{ startTime: 2, endTime: 2.4, text: "must" },
			{ startTime: 2.4, endTime: 2.8, text: "never" },
			{ startTime: 3, endTime: 3.4, text: "key" },
			{ startTime: 3.4, endTime: 3.8, text: "point" },
		]);

		expect(scores.speakingRate).toBeGreaterThanOrEqual(0);
		expect(scores.speakingRate).toBeLessThanOrEqual(1);
		expect(scores.contentDensity).toBeGreaterThanOrEqual(0);
		expect(scores.contentDensity).toBeLessThanOrEqual(1);
		expect(scores.engagementMarkers).toBeGreaterThanOrEqual(0);
		expect(scores.engagementMarkers).toBeLessThanOrEqual(1);
		expect(scores.silenceRatio).toBeGreaterThanOrEqual(0);
		expect(scores.silenceRatio).toBeLessThanOrEqual(1);
	});
});
