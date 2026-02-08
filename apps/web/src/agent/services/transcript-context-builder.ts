/**
 * Shared transcript context builder.
 *
 * Extracts TranscriptContext from EditorCore + transcriptionService,
 * used by both agent tools (non-React) and React hooks.
 */

import type { EditorCore } from "@/core";
import type { TranscriptContext } from "../tools/highlight-types";
import type { TextElement } from "@/types/timeline";
import { isCaptionTextElement } from "@/lib/transcription/caption-metadata";
import { transcriptionService } from "@/services/transcription/service";

export interface BuildTranscriptContextOptions {
	/** Skip whisper data and force captions-only mode (useful after timeline edits). */
	skipWhisper?: boolean;
}

export function buildTranscriptContext(
	editor: EditorCore,
	options?: BuildTranscriptContextOptions,
): TranscriptContext | null {
	const tracks = editor.timeline.getTracks();
	const timelineDuration = editor.timeline.getTotalDuration();

	// Try whisper words from the transcription service (skip if caller says stale)
	let whisperWords: TranscriptContext["words"] = [];
	if (!options?.skipWhisper) {
		const lastResult = transcriptionService.getLastResult();
		whisperWords = (lastResult?.words ?? [])
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
	}

	// Build segments from caption text elements only (not decorative text)
	const segments: TranscriptContext["segments"] = [];
	for (const track of tracks) {
		if (track.type !== "text") continue;
		for (const element of track.elements) {
			if (isCaptionTextElement(element as TextElement)) {
				segments.push({
					startTime: element.startTime,
					endTime: element.startTime + element.duration,
					text: String((element as TextElement).content ?? ""),
				});
			}
		}
	}

	// Sort segments and whisper words by startTime for correct duration/repetition
	segments.sort((a, b) => a.startTime - b.startTime);
	if (whisperWords.length > 0) {
		whisperWords.sort((a, b) => a.startTime - b.startTime);
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
