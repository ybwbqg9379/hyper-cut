import type { EditorCore } from "@/core";
import { ReplaceTracksCommand } from "@/lib/commands/timeline/track/replace-tracks";
import type { TimelineTrack } from "@/types/timeline";
import {
	buildTimelineOperationDiff,
	deleteElementsFullyInRange,
	rippleCompressTracks,
	splitTracksAtTimes,
	type TimeRange,
	type TimelineOperationDiff,
} from "../tools/timeline-edit-ops";
import type { TranscriptDocumentWord } from "./transcript-document";

const DEFAULT_DELETE_MARGIN_SECONDS = 0.02;
const MERGE_EPSILON_SECONDS = 1e-6;

export interface TranscriptCutSuggestion {
	id: string;
	startWordIndex: number;
	endWordIndex: number;
	reason: string;
	accepted: boolean;
	estimatedDurationSeconds?: number;
	source?: "llm" | "rule" | "filler";
}

function roundTime(value: number): number {
	return Number(value.toFixed(6));
}

function mergeRanges(ranges: TimeRange[]): TimeRange[] {
	if (ranges.length <= 1) return ranges;
	const sorted = [...ranges].sort((left, right) => left.start - right.start);
	const merged: TimeRange[] = [{ ...sorted[0] }];

	for (const range of sorted.slice(1)) {
		const last = merged[merged.length - 1];
		if (range.start <= last.end + MERGE_EPSILON_SECONDS) {
			last.end = Math.max(last.end, range.end);
			continue;
		}
		merged.push({ ...range });
	}

	return merged;
}

export function computeDeleteRangesFromWords(
	words: TranscriptDocumentWord[],
	margin = DEFAULT_DELETE_MARGIN_SECONDS,
): TimeRange[] {
	if (words.length === 0) return [];
	const safeMargin =
		typeof margin === "number" && Number.isFinite(margin) && margin >= 0
			? margin
			: DEFAULT_DELETE_MARGIN_SECONDS;
	const ranges = words
		.filter(
			(word) =>
				Number.isFinite(word.startTime) &&
				Number.isFinite(word.endTime) &&
				word.endTime > word.startTime,
		)
		.map((word) => ({
			start: roundTime(Math.max(0, word.startTime - safeMargin)),
			end: roundTime(Math.max(word.startTime, word.endTime + safeMargin)),
		}))
		.filter((range) => range.end > range.start);

	return mergeRanges(ranges);
}

export function computeTracksAfterWordDeletion({
	tracks,
	wordsToDelete,
	margin = DEFAULT_DELETE_MARGIN_SECONDS,
}: {
	tracks: TimelineTrack[];
	wordsToDelete: TranscriptDocumentWord[];
	margin?: number;
}): {
	tracks: TimelineTrack[];
	deleteRanges: TimeRange[];
	diff: TimelineOperationDiff;
} {
	const deleteRanges = computeDeleteRangesFromWords(wordsToDelete, margin);
	if (deleteRanges.length === 0) {
		return {
			tracks,
			deleteRanges,
			diff: buildTimelineOperationDiff({
				beforeTracks: tracks,
				afterTracks: tracks,
				deleteRanges,
			}),
		};
	}

	const splitTimes = [
		...new Set(deleteRanges.flatMap((range) => [range.start, range.end])),
	]
		.filter((time) => Number.isFinite(time))
		.sort((left, right) => left - right);

	const splitResult = splitTracksAtTimes({ tracks, splitTimes });
	let workingTracks = splitResult.tracks;

	for (const range of deleteRanges) {
		const deleted = deleteElementsFullyInRange({
			tracks: workingTracks,
			range,
		});
		workingTracks = deleted.tracks;
	}

	const compressed = rippleCompressTracks({
		tracks: workingTracks,
		deleteRanges,
	});
	const nextTracks = compressed.tracks;

	return {
		tracks: nextTracks,
		deleteRanges,
		diff: buildTimelineOperationDiff({
			beforeTracks: tracks,
			afterTracks: nextTracks,
			deleteRanges,
		}),
	};
}

export function applyTranscriptWordDeletion({
	editor,
	wordsToDelete,
	margin = DEFAULT_DELETE_MARGIN_SECONDS,
}: {
	editor: EditorCore;
	wordsToDelete: TranscriptDocumentWord[];
	margin?: number;
}): { success: boolean; diff: TimelineOperationDiff } {
	const beforeTracks = editor.timeline.getTracks() as TimelineTrack[];
	const result = computeTracksAfterWordDeletion({
		tracks: beforeTracks,
		wordsToDelete,
		margin,
	});

	if (result.deleteRanges.length === 0) {
		return {
			success: false,
			diff: result.diff,
		};
	}

	editor.command.execute({
		command: new ReplaceTracksCommand(result.tracks, { selection: null }),
	});

	return {
		success: true,
		diff: result.diff,
	};
}
