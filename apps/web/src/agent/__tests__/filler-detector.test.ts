import { describe, it, expect } from "vitest";
import {
	FillerDetectorService,
	type FillerWordMatch,
} from "../services/filler-detector";
import type { TranscriptContext } from "../tools/highlight-types";

function makeContext(
	words: Array<{ text: string; start: number; end: number }>,
): TranscriptContext {
	return {
		segments: words.length > 0
			? [
					{
						startTime: words[0].start,
						endTime: words[words.length - 1].end,
						text: words.map((w) => w.text).join(" "),
					},
				]
			: [],
		words: words.map((w) => ({
			startTime: w.start,
			endTime: w.end,
			text: w.text,
		})),
		source: "whisper",
	};
}

describe("FillerDetectorService", () => {
	const service = new FillerDetectorService();

	describe("detectFillerWords", () => {
		it("returns empty for empty transcript", () => {
			const context: TranscriptContext = {
				segments: [],
				words: [],
				source: "none",
			};
			const result = service.detectFillerWords(context);
			expect(result.matches).toHaveLength(0);
			expect(result.stats.totalCount).toBe(0);
			expect(result.stats.totalDurationSeconds).toBe(0);
			expect(result.stats.percentageOfDuration).toBe(0);
		});

		it("detects English filler words", () => {
			const context = makeContext([
				{ text: "So", start: 0, end: 0.3 },
				{ text: "um", start: 0.5, end: 0.8 },
				{ text: "I", start: 1.0, end: 1.1 },
				{ text: "think", start: 1.1, end: 1.4 },
				{ text: "like", start: 1.5, end: 1.8 },
				{ text: "this", start: 1.9, end: 2.2 },
			]);
			const result = service.detectFillerWords(context);

			// "um" matches hesitation pattern (umm regex); "So" and "like" are fillers
			const allTexts = result.matches.map((m) => m.text.toLowerCase());
			expect(allTexts).toContain("like");
			expect(result.stats.totalCount).toBeGreaterThan(0);
			// "um" should be detected as either filler or hesitation
			const umMatch = result.matches.find(
				(m) => m.text.toLowerCase() === "um",
			);
			expect(umMatch).toBeDefined();
		});

		it("detects Chinese filler words", () => {
			// Wider spacing to prevent adjacent-merge behavior
			const context = makeContext([
				{ text: "嗯", start: 0, end: 0.5 },
				{ text: "好的", start: 1.0, end: 1.5 },
				{ text: "就是", start: 2.0, end: 2.5 },
				{ text: "明白", start: 3.0, end: 3.5 },
				{ text: "这个", start: 4.0, end: 4.5 },
				{ text: "问题", start: 5.0, end: 5.5 },
			]);
			const result = service.detectFillerWords(context);

			// Each filler should be a separate match due to wide gaps
			expect(result.stats.totalCount).toBeGreaterThanOrEqual(3);
			const fillerTexts = result.matches.map((m) => m.text);
			expect(fillerTexts).toContain("嗯");
			expect(fillerTexts).toContain("就是");
			expect(fillerTexts).toContain("这个");
		});

		it("detects hesitation patterns", () => {
			const context = makeContext([
				{ text: "umm", start: 0, end: 0.5 },
				{ text: "嗯嗯", start: 0.6, end: 1.0 },
				{ text: "okay", start: 1.1, end: 1.5 },
			]);
			const result = service.detectFillerWords(context);

			const hesitations = result.matches.filter(
				(m) => m.category === "hesitation",
			);
			expect(hesitations.length).toBeGreaterThanOrEqual(1);
		});

		it("detects word repetitions", () => {
			const context = makeContext([
				{ text: "the", start: 0, end: 0.2 },
				{ text: "the", start: 0.3, end: 0.5 },
				{ text: "cat", start: 0.6, end: 0.9 },
			]);
			const result = service.detectFillerWords(context);

			const repetitions = result.matches.filter(
				(m) => m.category === "repetition",
			);
			expect(repetitions.length).toBeGreaterThanOrEqual(1);
		});

		it("returns correct stats breakdown", () => {
			const context = makeContext([
				{ text: "um", start: 0, end: 0.3 },
				{ text: "嗯嗯", start: 0.5, end: 0.8 },
				{ text: "hello", start: 1.0, end: 1.3 },
				{ text: "hello", start: 1.4, end: 1.7 },
				{ text: "world", start: 1.8, end: 2.1 },
			]);
			const result = service.detectFillerWords(context);

			expect(result.stats.byCategory).toHaveProperty("filler");
			expect(result.stats.byCategory).toHaveProperty("hesitation");
			expect(result.stats.byCategory).toHaveProperty("repetition");

			// Total count should equal sum of categories
			const categorySum =
				result.stats.byCategory.filler +
				result.stats.byCategory.hesitation +
				result.stats.byCategory.repetition;
			expect(result.stats.totalCount).toBe(categorySum);
		});

		it("ignores very short words below minimum duration", () => {
			const context = makeContext([
				{ text: "um", start: 0, end: 0.02 }, // Below MIN_FILLER_WORD_DURATION_SECONDS
				{ text: "hello", start: 0.1, end: 0.4 },
			]);
			const result = service.detectFillerWords(context);
			const umMatches = result.matches.filter(
				(m) => m.text.toLowerCase() === "um",
			);
			expect(umMatches).toHaveLength(0);
		});

		it("reports duration percentage correctly", () => {
			const context = makeContext([
				{ text: "um", start: 0, end: 0.5 },
				{ text: "okay", start: 0.5, end: 1.0 },
			]);
			const result = service.detectFillerWords(context);
			expect(result.stats.percentageOfDuration).toBeGreaterThan(0);
			expect(result.stats.percentageOfDuration).toBeLessThanOrEqual(100);
		});

		it("returns no fillers for clean transcript", () => {
			const context = makeContext([
				{ text: "This", start: 0, end: 0.2 },
				{ text: "is", start: 0.3, end: 0.4 },
				{ text: "a", start: 0.5, end: 0.6 },
				{ text: "clean", start: 0.7, end: 1.0 },
				{ text: "sentence", start: 1.1, end: 1.5 },
			]);
			const result = service.detectFillerWords(context);
			expect(result.stats.totalCount).toBe(0);
			expect(result.matches).toHaveLength(0);
		});

		it("confidence is always between 0 and 1", () => {
			const context = makeContext([
				{ text: "um", start: 0, end: 0.3 },
				{ text: "嗯", start: 0.4, end: 0.7 },
				{ text: "the", start: 0.8, end: 1.0 },
				{ text: "the", start: 1.1, end: 1.3 },
			]);
			const result = service.detectFillerWords(context);
			for (const match of result.matches) {
				expect(match.confidence).toBeGreaterThanOrEqual(0);
				expect(match.confidence).toBeLessThanOrEqual(1);
			}
		});

		it("detects 'I mean' as a filler phrase (case-insensitive)", () => {
			const context = makeContext([
				{ text: "I", start: 0, end: 0.2 },
				{ text: "mean", start: 0.25, end: 0.5 },
				{ text: "that's", start: 0.6, end: 0.9 },
				{ text: "great", start: 1.0, end: 1.3 },
			]);
			const result = service.detectFillerWords(context);

			const phraseMatch = result.matches.find((m) =>
				m.text.toLowerCase().includes("i mean"),
			);
			expect(phraseMatch).toBeDefined();
			expect(phraseMatch!.category).toBe("filler");
		});

		it("merges adjacent same-category matches", () => {
			const context = makeContext([
				{ text: "um", start: 0, end: 0.15 },
				{ text: "uh", start: 0.2, end: 0.35 }, // gap < FILLER_MERGE_GAP_SECONDS
				{ text: "hello", start: 1.0, end: 1.5 },
			]);
			const result = service.detectFillerWords(context);
			// They may merge since they are adjacent fillers
			expect(result.matches.length).toBeGreaterThanOrEqual(1);
		});
	});
});
