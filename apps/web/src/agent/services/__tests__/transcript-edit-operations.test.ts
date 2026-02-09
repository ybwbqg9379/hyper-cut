import { describe, expect, it, vi } from "vitest";
import type { EditorCore } from "@/core";
import { ReplaceTracksCommand } from "@/lib/commands/timeline/track/replace-tracks";
import type { TimelineTrack, VideoElement, VideoTrack } from "@/types/timeline";
import type { TranscriptDocumentWord } from "../transcript-document";
import {
	applyTranscriptWordDeletion,
	computeDeleteRangesFromWords,
	computeTracksAfterWordDeletion,
} from "../transcript-edit-operations";

function makeVideoElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): VideoElement {
	return {
		id,
		name: `video-${id}`,
		type: "video",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		mediaId: `media-${id}`,
		muted: false,
		hidden: false,
		transform: {
			scale: 1,
			position: { x: 0, y: 0 },
			rotate: 0,
		},
		opacity: 1,
	};
}

function makeWord({
	index,
	startTime,
	endTime,
}: {
	index: number;
	startTime: number;
	endTime: number;
}): TranscriptDocumentWord {
	return {
		index,
		text: `w-${index}`,
		startTime,
		endTime,
		captionElementId: "caption-1",
		captionTrackId: "text-track-1",
		timingSource: "whisper",
	};
}

describe("transcript-edit-operations", () => {
	it("computeDeleteRangesFromWords 会按时间合并相邻区间", () => {
		const ranges = computeDeleteRangesFromWords(
			[
				makeWord({ index: 0, startTime: 1.0, endTime: 1.2 }),
				makeWord({ index: 1, startTime: 1.18, endTime: 1.4 }),
				makeWord({ index: 2, startTime: 3.0, endTime: 3.2 }),
			],
			0.02,
		);

		expect(ranges).toHaveLength(2);
		expect(ranges[0]).toEqual({
			start: 0.98,
			end: 1.42,
		});
		expect(ranges[1]).toEqual({
			start: 2.98,
			end: 3.22,
		});
	});

	it("computeTracksAfterWordDeletion 可删除区间并执行 ripple 压缩", () => {
		const track: VideoTrack = {
			id: "track-1",
			name: "Main",
			type: "video",
			isMain: true,
			muted: false,
			hidden: false,
			elements: [
				makeVideoElement({ id: "e1", startTime: 0, duration: 2 }),
				makeVideoElement({ id: "e2", startTime: 2, duration: 2 }),
				makeVideoElement({ id: "e3", startTime: 4, duration: 2 }),
			],
		};
		const result = computeTracksAfterWordDeletion({
			tracks: [track],
			wordsToDelete: [makeWord({ index: 0, startTime: 2, endTime: 4 })],
			margin: 0,
		});

		expect(result.deleteRanges).toEqual([{ start: 2, end: 4 }]);
		expect(result.tracks[0]?.elements.map((element) => element.id)).toEqual([
			"e1",
			"e3",
		]);
		expect(result.tracks[0]?.elements[1]?.startTime).toBe(2);
		expect(result.diff.duration.deltaSeconds).toBe(-2);
		expect(result.diff.affectedElements.removed).toContain("track-1:e2");
		expect(result.diff.affectedElements.moved).toContain("track-1:e3");
	});

	it("applyTranscriptWordDeletion 会通过 ReplaceTracksCommand 提交", () => {
		const track: VideoTrack = {
			id: "track-1",
			name: "Main",
			type: "video",
			isMain: true,
			muted: false,
			hidden: false,
			elements: [
				makeVideoElement({ id: "e1", startTime: 0, duration: 2 }),
				makeVideoElement({ id: "e2", startTime: 2, duration: 2 }),
			],
		};
		const execute = vi.fn();
		const editor = {
			timeline: {
				getTracks: () => [track] as TimelineTrack[],
			},
			command: {
				execute,
			},
		} as unknown as EditorCore;

		const result = applyTranscriptWordDeletion({
			editor,
			wordsToDelete: [makeWord({ index: 0, startTime: 2, endTime: 4 })],
			margin: 0,
		});

		expect(result.success).toBe(true);
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute.mock.calls[0]?.[0]?.command).toBeInstanceOf(
			ReplaceTracksCommand,
		);
	});
});
