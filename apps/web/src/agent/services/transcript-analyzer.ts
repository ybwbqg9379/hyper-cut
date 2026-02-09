import type {
	TranscriptChunk,
	TranscriptContext,
	TranscriptWord,
	RuleScores,
} from "../tools/highlight-types";
import { clamp } from "../utils/math";
import {
	DEFAULT_HIGHLIGHT_SEGMENT_MAX_SECONDS,
	DEFAULT_HIGHLIGHT_SEGMENT_MIN_SECONDS,
} from "../constants/highlight";
import { EN_FILLER_WORDS, ZH_FILLER_WORDS } from "../constants/filler";

const MIN_SEGMENT_SECONDS = 2;

const EN_ENGAGEMENT_WORDS = [
	"amazing",
	"important",
	"key",
	"secret",
	"mistake",
	"problem",
	"solution",
	"must",
	"never",
	"always",
];

const ZH_ENGAGEMENT_WORDS = [
	"重要",
	"关键",
	"秘密",
	"错误",
	"必须",
	"一定",
	"绝对",
	"太棒了",
	"注意",
	"千万",
];

function splitWords(text: string): string[] {
	return text
		.trim()
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);
}

function sanitizeText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function splitSentences(text: string): string[] {
	const cleaned = sanitizeText(text);
	if (!cleaned) return [];

	const matched = cleaned.match(/[^。！？.!?]+[。！？.!?]*/g);
	if (!matched || matched.length === 0) {
		return [cleaned];
	}

	const sentences = matched
		.map((sentence) => sanitizeText(sentence))
		.filter(Boolean);

	return sentences.length > 0 ? sentences : [cleaned];
}

function normalizeRange({
	minSeconds,
	maxSeconds,
}: {
	minSeconds?: number;
	maxSeconds?: number;
}): { minSeconds: number; maxSeconds: number } {
	const min =
		typeof minSeconds === "number" && Number.isFinite(minSeconds)
			? clamp(minSeconds, MIN_SEGMENT_SECONDS, 120)
			: DEFAULT_HIGHLIGHT_SEGMENT_MIN_SECONDS;
	const max =
		typeof maxSeconds === "number" && Number.isFinite(maxSeconds)
			? clamp(maxSeconds, min + 1, 180)
			: DEFAULT_HIGHLIGHT_SEGMENT_MAX_SECONDS;

	return { minSeconds: min, maxSeconds: max };
}

interface MutableChunk {
	startTime: number;
	endTime: number;
	text: string;
}

function splitChunkByMaxDuration({
	chunk,
	maxSeconds,
}: {
	chunk: MutableChunk;
	maxSeconds: number;
}): MutableChunk[] {
	const duration = Math.max(0, chunk.endTime - chunk.startTime);
	if (duration <= maxSeconds) {
		return [chunk];
	}

	const words = splitWords(chunk.text);
	if (words.length === 0) {
		return [chunk];
	}

	const parts = Math.max(1, Math.ceil(duration / maxSeconds));
	const wordsPerPart = Math.max(1, Math.ceil(words.length / parts));

	const result: MutableChunk[] = [];
	let cursor = chunk.startTime;
	let consumedWords = 0;

	for (let partIndex = 0; partIndex < parts; partIndex += 1) {
		const wordSlice = words.slice(
			partIndex * wordsPerPart,
			(partIndex + 1) * wordsPerPart,
		);
		if (wordSlice.length === 0) continue;

		consumedWords += wordSlice.length;
		const ratio = consumedWords / words.length;
		const nextTime =
			partIndex === parts - 1
				? chunk.endTime
				: chunk.startTime + duration * clamp(ratio, 0, 1);

		result.push({
			startTime: cursor,
			endTime: Math.max(cursor, nextTime),
			text: wordSlice.join(" "),
		});

		cursor = Math.max(cursor, nextTime);
	}

	return result.length > 0 ? result : [chunk];
}

function normalizeToChunks(
	context: TranscriptContext,
	options: { minSeconds: number; maxSeconds: number },
): TranscriptChunk[] {
	const rawSegments = [...context.segments]
		.map((segment) => ({
			startTime: segment.startTime,
			endTime: segment.endTime,
			text: sanitizeText(segment.text),
		}))
		.filter(
			(segment) =>
				segment.text.length > 0 &&
				Number.isFinite(segment.startTime) &&
				Number.isFinite(segment.endTime) &&
				segment.endTime > segment.startTime,
		)
		.sort((a, b) => a.startTime - b.startTime);

	const sentenceChunks: MutableChunk[] = [];
	for (const segment of rawSegments) {
		const duration = segment.endTime - segment.startTime;
		const sentences = splitSentences(segment.text);
		if (sentences.length <= 1) {
			sentenceChunks.push(segment);
			continue;
		}

		const totalLength = sentences.reduce(
			(sum, sentence) => sum + sentence.length,
			0,
		);
		let cursor = segment.startTime;

		for (let i = 0; i < sentences.length; i += 1) {
			const sentence = sentences[i];
			const ratio =
				totalLength > 0 ? sentence.length / totalLength : 1 / sentences.length;
			const nextTime =
				i === sentences.length - 1
					? segment.endTime
					: cursor + duration * clamp(ratio, 0, 1);

			sentenceChunks.push({
				startTime: cursor,
				endTime: Math.max(cursor, nextTime),
				text: sentence,
			});
			cursor = Math.max(cursor, nextTime);
		}
	}

	const mergedChunks: MutableChunk[] = [];
	let i = 0;
	while (i < sentenceChunks.length) {
		let current = sentenceChunks[i];
		const currentDuration = current.endTime - current.startTime;

		if (currentDuration < options.minSeconds && i + 1 < sentenceChunks.length) {
			const next = sentenceChunks[i + 1];
			current = {
				startTime: current.startTime,
				endTime: next.endTime,
				text: sanitizeText(`${current.text} ${next.text}`),
			};
			i += 1;
		}

		mergedChunks.push(current);
		i += 1;
	}

	const splitLongChunks = mergedChunks.flatMap((chunk) =>
		splitChunkByMaxDuration({ chunk, maxSeconds: options.maxSeconds }),
	);

	return splitLongChunks
		.filter((chunk) => chunk.endTime > chunk.startTime)
		.map((chunk, index) => {
			const text = sanitizeText(chunk.text);
			const wordCount = splitWords(text).length;
			return {
				index,
				startTime: chunk.startTime,
				endTime: chunk.endTime,
				text,
				wordCount,
			} satisfies TranscriptChunk;
		});
}

function normalizeSpeakingRate(wordsPerSecond: number): number {
	return clamp((wordsPerSecond - 0.8) / (3.2 - 0.8), 0, 1);
}

function normalizeSilenceScore({
	chunk,
	words,
}: {
	chunk: TranscriptChunk;
	words: TranscriptWord[];
}): number {
	const duration = Math.max(0.001, chunk.endTime - chunk.startTime);
	if (words.length === 0) {
		return 0;
	}

	let voicedDuration = 0;
	for (const word of words) {
		const overlapStart = Math.max(chunk.startTime, word.startTime);
		const overlapEnd = Math.min(chunk.endTime, word.endTime);
		if (overlapEnd > overlapStart) {
			voicedDuration += overlapEnd - overlapStart;
		}
	}

	return clamp(voicedDuration / duration, 0, 1);
}

function computeContentDensity(tokens: string[]): number {
	if (tokens.length === 0) return 0;

	const nonFillerCount = tokens.filter((token) => {
		const normalized = token.toLowerCase().replace(/[^a-z]/gi, "");
		if (normalized.length > 0 && EN_FILLER_WORDS.has(normalized)) {
			return false;
		}
		for (const filler of ZH_FILLER_WORDS) {
			if (token.includes(filler)) {
				return false;
			}
		}
		return true;
	}).length;

	return clamp(nonFillerCount / tokens.length, 0, 1);
}

function computeEngagementMarkers(text: string): number {
	const lower = text.toLowerCase();
	const punctuationHits = (text.match(/[!?！？]/g) ?? []).length;

	let keywordHits = 0;
	for (const keyword of EN_ENGAGEMENT_WORDS) {
		if (lower.includes(keyword)) keywordHits += 1;
	}
	for (const keyword of ZH_ENGAGEMENT_WORDS) {
		if (text.includes(keyword)) keywordHits += 1;
	}

	return clamp((punctuationHits + keywordHits) / 4, 0, 1);
}

export class TranscriptAnalyzerService {
	segmentTranscript(
		context: TranscriptContext,
		{
			minSeconds,
			maxSeconds,
		}: {
			minSeconds?: number;
			maxSeconds?: number;
		} = {},
	): TranscriptChunk[] {
		const normalizedRange = normalizeRange({ minSeconds, maxSeconds });
		return normalizeToChunks(context, normalizedRange);
	}

	computeRuleScores(
		chunk: TranscriptChunk,
		words: TranscriptWord[],
	): RuleScores {
		const wordsInChunk = words.filter(
			(word) =>
				word.endTime > chunk.startTime && word.startTime < chunk.endTime,
		);
		const duration = Math.max(0.001, chunk.endTime - chunk.startTime);
		const tokens = splitWords(chunk.text);
		const wordCount = chunk.wordCount > 0 ? chunk.wordCount : tokens.length;
		const speakingRate = normalizeSpeakingRate(wordCount / duration);

		return {
			speakingRate,
			contentDensity: computeContentDensity(tokens),
			engagementMarkers: computeEngagementMarkers(chunk.text),
			silenceRatio: normalizeSilenceScore({ chunk, words: wordsInChunk }),
		};
	}
}

export const transcriptAnalyzerService = new TranscriptAnalyzerService();
