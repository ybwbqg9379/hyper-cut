import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorCore } from "@/core";
import type { TextElement, TextTrack, TimelineTrack } from "@/types/timeline";
import { transcriptionService } from "@/services/transcription/service";
import { buildTranscriptDocument } from "../transcript-document";

function makeCaptionElement({
	id,
	startTime,
	duration,
	content,
}: {
	id: string;
	startTime: number;
	duration: number;
	content: string;
}): TextElement {
	return {
		id,
		name: `Caption ${id}`,
		type: "text",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		content,
		fontSize: 32,
		fontFamily: "sans-serif",
		color: "#fff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		transform: {
			scale: 1,
			position: { x: 0, y: 0 },
			rotate: 0,
		},
		opacity: 1,
	};
}

function makeEditor(
	tracks: TimelineTrack[],
	totalDuration: number,
): EditorCore {
	return {
		timeline: {
			getTracks: () => tracks,
			getTotalDuration: () => totalDuration,
		},
	} as unknown as EditorCore;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("buildTranscriptDocument", () => {
	it("优先使用 whisper 词级时间戳并映射到字幕段", () => {
		const track: TextTrack = {
			id: "text-track-1",
			name: "Captions",
			type: "text",
			hidden: false,
			elements: [
				makeCaptionElement({
					id: "caption-1",
					startTime: 0,
					duration: 1,
					content: "hello world",
				}),
				makeCaptionElement({
					id: "caption-2",
					startTime: 1,
					duration: 1,
					content: "next part",
				}),
			],
		};
		vi.spyOn(transcriptionService, "getLastResult").mockReturnValue({
			text: "hello world next",
			segments: [],
			words: [
				{ text: "hello", start: 0.1, end: 0.4 },
				{ text: "world", start: 0.45, end: 0.8 },
				{ text: "next", start: 1.1, end: 1.5 },
			],
			language: "en",
		});

		const document = buildTranscriptDocument(makeEditor([track], 2));
		expect(document).not.toBeNull();
		expect(document?.source).toBe("whisper");
		expect(document?.words.map((word) => word.text)).toEqual([
			"hello",
			"world",
			"next",
		]);
		expect(
			document?.words.every((word) => word.timingSource === "whisper"),
		).toBe(true);
		expect(document?.words[0]?.captionElementId).toBe("caption-1");
		expect(document?.words[2]?.captionElementId).toBe("caption-2");
		expect(document?.segments[0]?.wordRange).toEqual([0, 1]);
		expect(document?.segments[1]?.wordRange).toEqual([2, 2]);
		expect(document?.fingerprint.startsWith("tdoc-")).toBe(true);
	});

	it("无 whisper 时回退为字幕比例估算", () => {
		const track: TextTrack = {
			id: "text-track-1",
			name: "Captions",
			type: "text",
			hidden: false,
			elements: [
				makeCaptionElement({
					id: "caption-1",
					startTime: 5,
					duration: 2,
					content: "alpha beta",
				}),
			],
		};
		vi.spyOn(transcriptionService, "getLastResult").mockReturnValue(null);

		const document = buildTranscriptDocument(makeEditor([track], 7));
		expect(document).not.toBeNull();
		expect(document?.source).toBe("captions");
		expect(document?.words).toHaveLength(2);
		expect(document?.words[0]?.timingSource).toBe("estimated");
		expect(document?.words[0]?.startTime).toBe(5);
		expect(document?.words[1]?.endTime).toBe(7);
	});

	it("skipWhisper=true 时强制使用 captions 模式", () => {
		const track: TextTrack = {
			id: "text-track-1",
			name: "Captions",
			type: "text",
			hidden: false,
			elements: [
				makeCaptionElement({
					id: "caption-1",
					startTime: 0,
					duration: 3,
					content: "one two three",
				}),
			],
		};
		vi.spyOn(transcriptionService, "getLastResult").mockReturnValue({
			text: "one",
			segments: [],
			words: [{ text: "one", start: 0, end: 0.6 }],
			language: "en",
		});

		const document = buildTranscriptDocument(makeEditor([track], 3), {
			skipWhisper: true,
		});

		expect(document?.source).toBe("captions");
		expect(document?.words).toHaveLength(3);
		expect(
			document?.words.every((word) => word.timingSource === "estimated"),
		).toBe(true);
	});
});
