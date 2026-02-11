import type {
	TranscriptionSegment,
	CaptionChunk,
	TranscriptionWord,
} from "@/types/transcription";
import {
	DEFAULT_WORDS_PER_CAPTION,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/constants/transcription-constants";

const CJK_CHAR_REGEX = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
const PUNCTUATION_TOKEN_REGEX = /^[.,!?;:，。！？；：、…]+$/;
const LATIN_WORD_REGEX = /^[a-z0-9]+(?:['’-][a-z0-9]+)*$/i;

function clampFinite(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}

function hasCjkChars(text: string): boolean {
	return CJK_CHAR_REGEX.test(text);
}

function isPunctuationToken(text: string): boolean {
	return PUNCTUATION_TOKEN_REGEX.test(text.trim());
}

function shouldInsertSpaceBetween({
	prev,
	next,
}: {
	prev: string;
	next: string;
}): boolean {
	if (!prev || !next) return false;
	const prevTrimmed = prev.trim();
	const nextTrimmed = next.trim();
	if (!prevTrimmed || !nextTrimmed) return false;

	if (isPunctuationToken(nextTrimmed) || isPunctuationToken(prevTrimmed)) {
		return false;
	}

	const prevLatinCandidate = prevTrimmed
		.replace(/^[^a-z0-9]+/i, "")
		.replace(/[^a-z0-9]+$/i, "");
	const nextLatinCandidate = nextTrimmed
		.replace(/^[^a-z0-9]+/i, "")
		.replace(/[^a-z0-9]+$/i, "");
	const prevIsLatinWord = LATIN_WORD_REGEX.test(prevLatinCandidate);
	const nextIsLatinWord = LATIN_WORD_REGEX.test(nextLatinCandidate);
	return prevIsLatinWord && nextIsLatinWord;
}

function joinCaptionTokens(tokens: string[]): string {
	let text = "";
	let previousToken = "";
	for (const rawToken of tokens) {
		const token = rawToken.trim();
		if (!token) continue;
		if (!text) {
			text = token;
			previousToken = token;
			continue;
		}
		text += shouldInsertSpaceBetween({ prev: previousToken, next: token })
			? ` ${token}`
			: token;
		previousToken = token;
	}
	return text.trim();
}

function tokenizeCaptionText(text: string): string[] {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return [];
	const whitespaceTokens = normalized.split(" ").filter(Boolean);
	if (whitespaceTokens.length > 1) {
		return whitespaceTokens;
	}
	if (hasCjkChars(normalized)) {
		return Array.from(normalized).filter((token) => token.trim().length > 0);
	}
	return whitespaceTokens;
}

function normalizeSegments(
	segments: TranscriptionSegment[],
): TranscriptionSegment[] {
	return segments
		.map((segment) => ({
			text: segment.text.replace(/\s+/g, " ").trim(),
			start: Number.isFinite(segment.start) ? Math.max(0, segment.start) : 0,
			end: Number.isFinite(segment.end) ? Math.max(0, segment.end) : 0,
		}))
		.filter((segment) => segment.text.length > 0 && segment.end > segment.start)
		.sort((left, right) => left.start - right.start);
}

function normalizeWords(
	words: TranscriptionWord[] | undefined,
): TranscriptionWord[] {
	if (!Array.isArray(words) || words.length === 0) {
		return [];
	}
	return words
		.map((word) => ({
			text: word.text.replace(/\s+/g, " ").trim(),
			start: Number.isFinite(word.start) ? Math.max(0, word.start) : 0,
			end: Number.isFinite(word.end) ? Math.max(0, word.end) : 0,
		}))
		.filter((word) => word.text.length > 0 && word.end > word.start)
		.sort((left, right) => left.start - right.start);
}

function resolveWordsPerChunk({
	wordsPerChunk,
	language,
	segments,
	words,
}: {
	wordsPerChunk: number | undefined;
	language?: string;
	segments: TranscriptionSegment[];
	words: TranscriptionWord[];
}): number {
	if (Number.isFinite(wordsPerChunk) && (wordsPerChunk as number) > 0) {
		return Math.floor(wordsPerChunk as number);
	}

	const languageHint =
		typeof language === "string" ? language.toLowerCase() : "";
	const hasCjkLanguageHint =
		languageHint.startsWith("zh") ||
		languageHint.startsWith("ja") ||
		languageHint.startsWith("ko");

	if (hasCjkLanguageHint) {
		return 12;
	}

	const sampleText = [
		...segments.slice(0, 4).map((segment) => segment.text),
		...words.slice(0, 20).map((word) => word.text),
	].join("");
	if (hasCjkChars(sampleText)) {
		return 12;
	}

	return DEFAULT_WORDS_PER_CAPTION;
}

function buildFromWords({
	segments,
	words,
	chunkSize,
	minDuration,
}: {
	segments: TranscriptionSegment[];
	words: TranscriptionWord[];
	chunkSize: number;
	minDuration: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	let globalWordCursor = 0;
	let lastCaptionEnd = 0;

	for (const segment of segments) {
		const segmentWords: TranscriptionWord[] = [];
		while (globalWordCursor < words.length) {
			const currentWord = words[globalWordCursor];
			if (currentWord.end <= segment.start) {
				globalWordCursor += 1;
				continue;
			}
			if (currentWord.start >= segment.end) {
				break;
			}
			segmentWords.push(currentWord);
			globalWordCursor += 1;
		}

		if (segmentWords.length === 0) {
			continue;
		}

		for (
			let segmentWordIndex = 0;
			segmentWordIndex < segmentWords.length;
			segmentWordIndex += chunkSize
		) {
			let endIndexExclusive = Math.min(
				segmentWordIndex + chunkSize,
				segmentWords.length,
			);
			while (
				endIndexExclusive < segmentWords.length &&
				isPunctuationToken(segmentWords[endIndexExclusive].text)
			) {
				endIndexExclusive += 1;
			}

			const chunkWords = segmentWords.slice(
				segmentWordIndex,
				endIndexExclusive,
			);
			const text = joinCaptionTokens(chunkWords.map((word) => word.text));
			if (!text) {
				continue;
			}

			const firstWord = chunkWords[0];
			const lastWord = chunkWords[chunkWords.length - 1];
			if (!firstWord || !lastWord) {
				continue;
			}

			const nextWordStart =
				endIndexExclusive < segmentWords.length
					? segmentWords[endIndexExclusive]?.start
					: undefined;
			const upperBound = clampFinite(
				Math.min(segment.end, nextWordStart ?? segment.end),
				segment.start,
				segment.end,
			);
			const startTime = clampFinite(
				Math.max(firstWord.start, segment.start, lastCaptionEnd),
				segment.start,
				segment.end,
			);
			if (startTime >= segment.end) {
				continue;
			}

			let endTime = clampFinite(
				Math.max(lastWord.end, startTime + 0.05),
				startTime + 0.05,
				segment.end,
			);

			if (endTime - startTime < minDuration && upperBound > endTime) {
				endTime = clampFinite(
					startTime + minDuration,
					startTime + 0.05,
					upperBound,
				);
			}

			if (endTime <= startTime) {
				continue;
			}

			captions.push({
				text,
				startTime,
				duration: endTime - startTime,
			});
			lastCaptionEnd = endTime;
		}
	}

	return captions;
}

function buildFromSegments({
	segments,
	chunkSize,
	minDuration,
}: {
	segments: TranscriptionSegment[];
	chunkSize: number;
	minDuration: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	let lastCaptionEnd = 0;

	for (const segment of segments) {
		const tokens = tokenizeCaptionText(segment.text);
		if (tokens.length === 0) continue;

		const segmentDuration = Math.max(0.05, segment.end - segment.start);
		const effectiveChunkSize = Math.max(1, chunkSize);

		for (
			let tokenIndex = 0;
			tokenIndex < tokens.length;
			tokenIndex += effectiveChunkSize
		) {
			const chunkTokens = tokens.slice(
				tokenIndex,
				tokenIndex + effectiveChunkSize,
			);
			const text = joinCaptionTokens(chunkTokens);
			if (!text) continue;

			const ratioStart = tokenIndex / tokens.length;
			const ratioEnd = Math.min(
				1,
				(tokenIndex + chunkTokens.length) / tokens.length,
			);
			const estimatedStart = segment.start + segmentDuration * ratioStart;
			const estimatedEnd = segment.start + segmentDuration * ratioEnd;

			const startTime = clampFinite(
				Math.max(estimatedStart, lastCaptionEnd, segment.start),
				segment.start,
				segment.end,
			);
			if (startTime >= segment.end) {
				continue;
			}

			const endTime = clampFinite(
				Math.max(estimatedEnd, startTime + minDuration),
				startTime + 0.05,
				segment.end,
			);
			if (endTime <= startTime) {
				continue;
			}

			captions.push({
				text,
				startTime,
				duration: endTime - startTime,
			});
			lastCaptionEnd = endTime;
		}
	}

	return captions;
}

export function buildCaptionChunks({
	segments,
	words,
	wordsPerChunk,
	minDuration = MIN_CAPTION_DURATION_SECONDS,
	language,
}: {
	segments: TranscriptionSegment[];
	words?: TranscriptionWord[];
	wordsPerChunk?: number;
	minDuration?: number;
	language?: string;
}): CaptionChunk[] {
	const normalizedSegments = normalizeSegments(segments);
	if (normalizedSegments.length === 0) {
		return [];
	}

	const normalizedWords = normalizeWords(words);
	const resolvedChunkSize = Math.max(
		1,
		resolveWordsPerChunk({
			wordsPerChunk,
			language,
			segments: normalizedSegments,
			words: normalizedWords,
		}),
	);
	const resolvedMinDuration = Math.max(0.05, minDuration);

	if (normalizedWords.length > 0) {
		return buildFromWords({
			segments: normalizedSegments,
			words: normalizedWords,
			chunkSize: resolvedChunkSize,
			minDuration: resolvedMinDuration,
		});
	}

	return buildFromSegments({
		segments: normalizedSegments,
		chunkSize: resolvedChunkSize,
		minDuration: resolvedMinDuration,
	});
}
