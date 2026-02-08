/**
 * useTranscriptEditing — manages filler-word detection state
 * and provides callbacks for detecting/removing fillers from the transcript.
 *
 * Purely wraps FillerDetectorService + timeline-edit-ops for React consumption.
 */

import { useCallback, useState } from "react";
import { useEditor } from "@/hooks/use-editor";
import { FillerDetectorService } from "@/agent/services/filler-detector";
import {
	buildTranscriptContext,
	type BuildTranscriptContextOptions,
} from "@/agent/services/transcript-context-builder";
import { FILLER_CUT_MARGIN_SECONDS } from "@/agent/constants/filler";
import {
	splitTracksAtTimes,
	deleteElementsFullyInRange,
	rippleCompressTracks,
	type TimeRange,
} from "@/agent/tools/timeline-edit-ops";
import type { TimelineTrack } from "@/types/timeline";

export interface FillerHighlight {
	text: string;
	startTime: number;
	endTime: number;
	confidence: number;
	category: "filler" | "hesitation" | "repetition";
}

interface UseTranscriptEditingResult {
	fillers: FillerHighlight[];
	isDetecting: boolean;
	detectFillers: () => void;
	removeFillerAtRange: (start: number, end: number) => void;
	removeAllFillers: () => void;
	clearFillers: () => void;
	isFillerWord: (startTime: number, endTime: number) => FillerHighlight | undefined;
}

const service = new FillerDetectorService();

function mergeOverlapping(ranges: TimeRange[]): TimeRange[] {
	if (ranges.length <= 1) return ranges;
	const sorted = [...ranges].sort((a, b) => a.start - b.start);
	const merged: TimeRange[] = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		const prev = merged[merged.length - 1];
		const curr = sorted[i];
		if (curr.start <= prev.end) {
			prev.end = Math.max(prev.end, curr.end);
		} else {
			merged.push(curr);
		}
	}
	return merged;
}

function runDetection(
	editor: ReturnType<typeof useEditor>,
	options?: BuildTranscriptContextOptions,
): FillerHighlight[] {
	const context = buildTranscriptContext(editor, options);
	if (!context) return [];
	const result = service.detectFillerWords(context);
	return result.matches.map((m) => ({
		text: m.text,
		startTime: m.startTime,
		endTime: m.endTime,
		confidence: m.confidence,
		category: m.category,
	}));
}

export function useTranscriptEditing(): UseTranscriptEditingResult {
	const editor = useEditor();
	const [fillers, setFillers] = useState<FillerHighlight[]>([]);
	const [isDetecting, setIsDetecting] = useState(false);

	const detectFillers = useCallback(() => {
		setIsDetecting(true);
		try {
			setFillers(runDetection(editor));
		} finally {
			setIsDetecting(false);
		}
	}, [editor]);

	const applyRemoval = useCallback(
		(rangesToCut: TimeRange[]) => {
			if (rangesToCut.length === 0) return;
			const merged = mergeOverlapping(rangesToCut);
			const previousSelection = editor.selection.getSelectedElements();
			let tracks = editor.timeline.getTracks() as TimelineTrack[];

			const splitTimes = merged.flatMap((r) => [r.start, r.end]);
			const { tracks: splitTracks } = splitTracksAtTimes({ tracks, splitTimes });
			tracks = splitTracks;

			for (const range of merged) {
				const { tracks: dt } = deleteElementsFullyInRange({ tracks, range });
				tracks = dt;
			}

			const { tracks: compressed } = rippleCompressTracks({
				tracks,
				deleteRanges: merged,
			});
			tracks = compressed;

			editor.timeline.replaceTracks({ tracks, selection: previousSelection });

			// Re-detect using captions only — whisper data is stale after ripple edits
			setFillers(runDetection(editor, { skipWhisper: true }));
		},
		[editor],
	);

	const removeFillerAtRange = useCallback(
		(start: number, end: number) => {
			const margin = FILLER_CUT_MARGIN_SECONDS;
			applyRemoval([{ start: Math.max(0, start - margin), end: end + margin }]);
		},
		[applyRemoval],
	);

	const removeAllFillers = useCallback(() => {
		const ranges: TimeRange[] = fillers.map((f) => ({
			start: Math.max(0, f.startTime - FILLER_CUT_MARGIN_SECONDS),
			end: f.endTime + FILLER_CUT_MARGIN_SECONDS,
		}));
		applyRemoval(ranges);
	}, [fillers, applyRemoval]);

	const clearFillers = useCallback(() => setFillers([]), []);

	const isFillerWord = useCallback(
		(startTime: number, endTime: number): FillerHighlight | undefined => {
			const TOLERANCE = 0.05;
			return fillers.find(
				(f) =>
					Math.abs(f.startTime - startTime) < TOLERANCE &&
					Math.abs(f.endTime - endTime) < TOLERANCE,
			);
		},
		[fillers],
	);

	return {
		fillers,
		isDetecting,
		detectFillers,
		removeFillerAtRange,
		removeAllFillers,
		clearFillers,
		isFillerWord,
	};
}
