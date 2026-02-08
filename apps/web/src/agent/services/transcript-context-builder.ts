/**
 * Shared transcript context builder.
 *
 * Extracts TranscriptContext from EditorCore + transcriptionService,
 * used by both agent tools (non-React) and React hooks.
 */

import type { EditorCore } from "@/core";
import type { TranscriptContext } from "../tools/highlight-types";
import { transcriptionService } from "@/services/transcription/service";

export function buildTranscriptContext(
	editor: EditorCore,
): TranscriptContext | null {
	const tracks = editor.timeline.getTracks();
	const timelineDuration = editor.timeline.getTotalDuration();

	// Try whisper words from the transcription service
	const lastResult = transcriptionService.getLastResult();
	const whisperWords = (lastResult?.words ?? [])
		.filter(
			(w) =>
				Number.isFinite(w.start) &&
				Number.isFinite(w.end) &&
				typeof w.text === "string" &&
				w.text.trim().length > 0 &&
				w.start <= timelineDuration + 0.5,
		)
		.map((w) => ({
			startTime: Math.max(0, w.start),
			endTime: Math.max(w.start, w.end),
			text: w.text.trim(),
		}));

	// Build segments from text track elements
	const segments: TranscriptContext["segments"] = [];
	for (const track of tracks) {
		if (track.type !== "text") continue;
		for (const element of track.elements) {
			if ("content" in element) {
				segments.push({
					startTime: element.startTime,
					endTime: element.startTime + element.duration,
					text: String((element as { content?: unknown }).content ?? ""),
				});
			}
		}
	}

	// Fall back to estimated words from segment text
	const words: TranscriptContext["words"] =
		whisperWords.length > 0
			? whisperWords
			: segments.flatMap((seg) => {
					const tokens = seg.text.split(/\s+/).filter(Boolean);
					if (tokens.length === 0) return [];
					const dur = seg.endTime - seg.startTime;
					const step = dur / tokens.length;
					return tokens.map((t, i) => ({
						startTime: seg.startTime + i * step,
						endTime: seg.startTime + (i + 1) * step,
						text: t,
					}));
				});

	if (words.length === 0) return null;

	return {
		segments,
		words,
		source: whisperWords.length > 0 ? "whisper" : "captions",
	};
}
