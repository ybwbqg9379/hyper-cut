import { describe, expect, it } from "vitest";
import { buildCaptionChunks } from "./caption";
import type {
	TranscriptionSegment,
	TranscriptionWord,
} from "@/types/transcription";

function getCaptionEnd({
	startTime,
	duration,
}: {
	startTime: number;
	duration: number;
}): number {
	return startTime + duration;
}

describe("buildCaptionChunks", () => {
	it("uses word timestamps to keep caption timeline monotonic and bounded", () => {
		const segments: TranscriptionSegment[] = [
			{ text: "hello world this is test", start: 0, end: 3.2 },
			{ text: "second segment for timeline", start: 3.2, end: 6.4 },
		];
		const words: TranscriptionWord[] = [
			{ text: "hello", start: 0, end: 0.45 },
			{ text: "world", start: 0.45, end: 0.95 },
			{ text: "this", start: 0.95, end: 1.35 },
			{ text: "is", start: 1.35, end: 1.6 },
			{ text: "test", start: 1.6, end: 2.2 },
			{ text: "second", start: 3.2, end: 3.8 },
			{ text: "segment", start: 3.8, end: 4.3 },
			{ text: "for", start: 4.3, end: 4.6 },
			{ text: "timeline", start: 4.6, end: 5.3 },
		];

		const captions = buildCaptionChunks({
			segments,
			words,
			wordsPerChunk: 2,
			minDuration: 0.2,
			language: "en",
		});

		expect(captions.length).toBeGreaterThan(0);
		let lastEnd = 0;
		for (const caption of captions) {
			expect(caption.startTime).toBeGreaterThanOrEqual(lastEnd);
			expect(caption.duration).toBeGreaterThan(0);
			lastEnd = getCaptionEnd(caption);
		}
		expect(lastEnd).toBeLessThanOrEqual(6.4);
	});

	it("uses larger default chunk size for zh captions to avoid over-fragmentation", () => {
		const sourceText = "这是一个用于测试的中文字幕对齐案例";
		const chars = Array.from(sourceText);
		const segment: TranscriptionSegment = {
			text: sourceText,
			start: 0,
			end: 6,
		};
		const words: TranscriptionWord[] = chars.map((char, index) => ({
			text: char,
			start: index * (6 / chars.length),
			end: (index + 1) * (6 / chars.length),
		}));

		const captions = buildCaptionChunks({
			segments: [segment],
			words,
			language: "zh",
			minDuration: 0.2,
		});

		expect(captions.length).toBeGreaterThan(0);
		expect(captions.length).toBeLessThan(chars.length / 2);
		expect(captions.every((caption) => !caption.text.includes(" "))).toBe(true);
	});

	it("does not extend caption timeline beyond transcription bounds in segment fallback mode", () => {
		const segments: TranscriptionSegment[] = [
			{ text: "short", start: 0, end: 0.5 },
			{ text: "still short", start: 0.5, end: 1.1 },
			{ text: "another one", start: 1.1, end: 1.8 },
		];

		const captions = buildCaptionChunks({
			segments,
			wordsPerChunk: 2,
			minDuration: 0.9,
			language: "en",
		});

		expect(captions.length).toBeGreaterThan(0);
		const finalEnd = getCaptionEnd(captions[captions.length - 1]);
		expect(finalEnd).toBeLessThanOrEqual(1.8);
	});

	it("keeps latin word spacing when tokens include leading punctuation", () => {
		const segments: TranscriptionSegment[] = [
			{
				text: "most (speaking in for convenient way.",
				start: 0,
				end: 2.8,
			},
		];
		const words: TranscriptionWord[] = [
			{ text: "most", start: 0, end: 0.3 },
			{ text: "(speaking", start: 0.3, end: 0.8 },
			{ text: "in", start: 0.8, end: 1.0 },
			{ text: "for", start: 1.0, end: 1.2 },
			{ text: "convenient", start: 1.2, end: 1.8 },
			{ text: "way", start: 1.8, end: 2.2 },
			{ text: ".", start: 2.2, end: 2.3 },
		];

		const captions = buildCaptionChunks({
			segments,
			words,
			wordsPerChunk: 10,
			minDuration: 0.2,
			language: "en",
		});

		expect(captions.length).toBe(1);
		expect(captions[0]?.text).toBe("most (speaking in for convenient way.");
		expect(captions[0]?.text.includes("speakingin")).toBe(false);
	});
});
