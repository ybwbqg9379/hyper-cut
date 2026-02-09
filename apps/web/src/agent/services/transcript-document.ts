import type { EditorCore } from "@/core";
import type { TextElement } from "@/types/timeline";
import type { TranscriptionWord } from "@/types/transcription";
import { isCaptionTextElement } from "@/lib/transcription/caption-metadata";
import { transcriptionService } from "@/services/transcription/service";

export interface TranscriptDocumentWord {
	index: number;
	text: string;
	startTime: number;
	endTime: number;
	captionElementId: string;
	captionTrackId: string;
	timingSource: "whisper" | "estimated";
}

export interface TranscriptDocumentSegment {
	captionElementId: string;
	captionTrackId: string;
	startTime: number;
	endTime: number;
	content: string;
	wordRange: [startIndex: number, endIndex: number];
}

export interface TranscriptDocument {
	words: TranscriptDocumentWord[];
	segments: TranscriptDocumentSegment[];
	segmentById: Map<string, TranscriptDocumentSegment>;
	source: "whisper" | "captions";
	fingerprint: string;
}

interface CaptionSegmentSeed {
	captionElementId: string;
	captionTrackId: string;
	startTime: number;
	endTime: number;
	content: string;
}

interface NormalizedWhisperWord {
	text: string;
	startTime: number;
	endTime: number;
}

const TIME_EPSILON = 1e-6;

function splitCaptionTextToTokens(text: string): string[] {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return [];
	return normalized.split(" ").filter(Boolean);
}

function estimateWordsForSegment(
	segment: CaptionSegmentSeed,
): NormalizedWhisperWord[] {
	const tokens = splitCaptionTextToTokens(segment.content);
	if (tokens.length === 0) {
		return [];
	}
	if (tokens.length === 1) {
		return [
			{
				text: tokens[0],
				startTime: segment.startTime,
				endTime: segment.endTime,
			},
		];
	}

	const duration = Math.max(0, segment.endTime - segment.startTime);
	const tokenDuration = duration > 0 ? duration / tokens.length : 0;

	return tokens.map((token, index) => {
		const tokenStart = segment.startTime + tokenDuration * index;
		const tokenEnd =
			index === tokens.length - 1
				? segment.endTime
				: segment.startTime + tokenDuration * (index + 1);
		return {
			text: token,
			startTime: tokenStart,
			endTime: Math.max(tokenStart, tokenEnd),
		};
	});
}

function normalizeWhisperWords({
	words,
	timelineDuration,
}: {
	words: TranscriptionWord[];
	timelineDuration: number;
}): NormalizedWhisperWord[] {
	return words
		.filter(
			(word) =>
				Number.isFinite(word.start) &&
				Number.isFinite(word.end) &&
				typeof word.text === "string" &&
				word.text.trim().length > 0,
		)
		.filter((word) => word.start <= timelineDuration + 0.5)
		.map((word) => ({
			text: word.text.trim(),
			startTime: Math.max(0, word.start),
			endTime: Math.max(word.start, word.end),
		}))
		.sort((left, right) => left.startTime - right.startTime);
}

function overlapSeconds(
	left: { startTime: number; endTime: number },
	right: { startTime: number; endTime: number },
): number {
	const start = Math.max(left.startTime, right.startTime);
	const end = Math.min(left.endTime, right.endTime);
	return Math.max(0, end - start);
}

function buildHash(input: string): string {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash +=
			(hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
	}
	return `tdoc-${(hash >>> 0).toString(16)}`;
}

function buildFingerprint(segments: CaptionSegmentSeed[]): string {
	const base = segments
		.map(
			(segment) =>
				`${segment.captionTrackId}:${segment.captionElementId}:${segment.startTime.toFixed(
					3,
				)}:${segment.endTime.toFixed(3)}`,
		)
		.join("|");
	return buildHash(base);
}

function collectCaptionSegments(editor: EditorCore): CaptionSegmentSeed[] {
	const tracks = editor.timeline.getTracks();
	const segments: CaptionSegmentSeed[] = [];

	for (const track of tracks) {
		if (track.type !== "text") continue;
		for (const element of track.elements) {
			if (!isCaptionTextElement(element as TextElement)) continue;
			segments.push({
				captionElementId: element.id,
				captionTrackId: track.id,
				startTime: element.startTime,
				endTime: element.startTime + element.duration,
				content: String((element as TextElement).content ?? ""),
			});
		}
	}

	return segments.sort((left, right) => left.startTime - right.startTime);
}

function assignWhisperWordsToSegments({
	segments,
	whisperWords,
}: {
	segments: CaptionSegmentSeed[];
	whisperWords: NormalizedWhisperWord[];
}): Map<string, NormalizedWhisperWord[]> {
	const bySegmentId = new Map<string, NormalizedWhisperWord[]>();
	for (const segment of segments) {
		bySegmentId.set(segment.captionElementId, []);
	}

	for (const word of whisperWords) {
		let bestSegmentId: string | null = null;
		let bestOverlap = 0;

		for (const segment of segments) {
			const overlap = overlapSeconds(word, segment);
			if (overlap <= TIME_EPSILON) continue;
			if (overlap > bestOverlap + TIME_EPSILON) {
				bestOverlap = overlap;
				bestSegmentId = segment.captionElementId;
			}
		}

		if (!bestSegmentId) continue;
		const bucket = bySegmentId.get(bestSegmentId);
		if (!bucket) continue;
		bucket.push(word);
	}

	for (const [segmentId, bucket] of bySegmentId.entries()) {
		bySegmentId.set(
			segmentId,
			bucket.sort((left, right) => left.startTime - right.startTime),
		);
	}

	return bySegmentId;
}

export function buildTranscriptDocument(
	editor: EditorCore,
	options?: { skipWhisper?: boolean },
): TranscriptDocument | null {
	const segmentsSeed = collectCaptionSegments(editor);
	if (segmentsSeed.length === 0) {
		return null;
	}

	const timelineDuration = editor.timeline.getTotalDuration();
	const whisperWords = options?.skipWhisper
		? []
		: normalizeWhisperWords({
				words: transcriptionService.getLastResult()?.words ?? [],
				timelineDuration,
			});

	const assignedWhisperWords =
		whisperWords.length > 0
			? assignWhisperWordsToSegments({
					segments: segmentsSeed,
					whisperWords,
				})
			: new Map<string, NormalizedWhisperWord[]>();

	const words: TranscriptDocumentWord[] = [];
	const segments: TranscriptDocumentSegment[] = [];
	const segmentById = new Map<string, TranscriptDocumentSegment>();
	let whisperWordCount = 0;

	for (const segmentSeed of segmentsSeed) {
		const startIndex = words.length;
		const segmentWhisperWords =
			assignedWhisperWords.get(segmentSeed.captionElementId) ?? [];
		const segmentWords =
			segmentWhisperWords.length > 0
				? segmentWhisperWords
				: estimateWordsForSegment(segmentSeed);
		const timingSource: TranscriptDocumentWord["timingSource"] =
			segmentWhisperWords.length > 0 ? "whisper" : "estimated";

		for (const word of segmentWords) {
			if (timingSource === "whisper") {
				whisperWordCount += 1;
			}
			words.push({
				index: words.length,
				text: word.text,
				startTime: word.startTime,
				endTime: Math.max(word.startTime, word.endTime),
				captionElementId: segmentSeed.captionElementId,
				captionTrackId: segmentSeed.captionTrackId,
				timingSource,
			});
		}

		const endIndex = words.length - 1;
		const segment: TranscriptDocumentSegment = {
			captionElementId: segmentSeed.captionElementId,
			captionTrackId: segmentSeed.captionTrackId,
			startTime: segmentSeed.startTime,
			endTime: segmentSeed.endTime,
			content: segmentSeed.content,
			wordRange: [startIndex, endIndex],
		};
		segments.push(segment);
		segmentById.set(segment.captionElementId, segment);
	}

	return {
		words,
		segments,
		segmentById,
		source: whisperWordCount > 0 ? "whisper" : "captions",
		fingerprint: buildFingerprint(segmentsSeed),
	};
}
