/**
 * FillerDetectorService
 *
 * Detects filler words, hesitations, and repeated words from a transcript context.
 * Pure functional service — no side effects, easy to unit-test.
 */

import type {
	TranscriptContext,
	TranscriptWord,
} from "../tools/highlight-types";
import {
	EN_FILLER_WORDS,
	EN_FILLER_PHRASES,
	ZH_FILLER_WORDS,
	MIN_FILLER_WORD_DURATION_SECONDS,
	FILLER_MERGE_GAP_SECONDS,
} from "../constants/filler";

// ── Types ────────────────────────────────────────────────────────────────────

export type FillerCategory = "filler" | "hesitation" | "repetition";

export interface FillerWordMatch {
	/** The detected word or phrase. */
	text: string;
	/** Start time in seconds (timeline-relative). */
	startTime: number;
	/** End time in seconds (timeline-relative). */
	endTime: number;
	/** Detection confidence 0..1 */
	confidence: number;
	/** Classification of the filler. */
	category: FillerCategory;
}

export interface FillerDetectionResult {
	/** All detected filler-word matches, sorted by startTime. */
	matches: FillerWordMatch[];
	/** Summary statistics. */
	stats: {
		totalCount: number;
		totalDurationSeconds: number;
		/** Percentage of total transcript duration occupied by fillers. */
		percentageOfDuration: number;
		/** Breakdown by category. */
		byCategory: Record<FillerCategory, number>;
	};
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeEnglish(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z\s]/gi, "")
		.trim();
}

function isEnglishFiller(text: string): boolean {
	return EN_FILLER_WORDS.has(normalizeEnglish(text));
}

function isEnglishFillerPhrase(a: string, b: string): boolean {
	const phrase = `${normalizeEnglish(a)} ${normalizeEnglish(b)}`;
	return EN_FILLER_PHRASES.has(phrase);
}

function isChineseFiller(text: string): boolean {
	const trimmed = text.trim();
	// Exact match only — avoids false positives from substring matching
	// (e.g. "这个人" should NOT match "这个")
	for (const filler of ZH_FILLER_WORDS) {
		if (trimmed === filler) return true;
	}
	return false;
}

function isHesitationPattern(text: string): boolean {
	const trimmed = text.trim().toLowerCase();
	// "uh...", "umm", "嗯嗯", elongated sounds
	if (/^(u+h+|u+m+|e+h+|a+h+|o+h+)$/i.test(trimmed)) return true;
	// Chinese elongated hesitations: "嗯嗯", "啊啊"
	if (/^(嗯{2,}|啊{2,}|呃{1,})$/.test(trimmed)) return true;
	return false;
}

function isRepetition(
	current: TranscriptWord,
	previous: TranscriptWord | null,
): boolean {
	if (!previous) return false;
	const currentText = current.text.trim().toLowerCase();
	const previousText = previous.text.trim().toLowerCase();
	if (currentText.length === 0 || previousText.length === 0) return false;
	// Exact repeated word: "the the", "我 我"
	return currentText === previousText;
}

function computeConfidence(
	word: TranscriptWord,
	category: FillerCategory,
): number {
	const duration = word.endTime - word.startTime;
	// Short fillers have slightly lower confidence
	const durationFactor = Math.min(1, duration / 0.5);
	switch (category) {
		case "filler":
			return 0.85 + 0.15 * durationFactor;
		case "hesitation":
			return 0.9 + 0.1 * durationFactor;
		case "repetition":
			return 0.7 + 0.2 * durationFactor;
		default:
			return 0.5;
	}
}

function totalTranscriptDuration(context: TranscriptContext): number {
	if (context.words.length === 0 && context.segments.length === 0) return 0;
	if (context.segments.length > 0) {
		const first = context.segments[0];
		const last = context.segments[context.segments.length - 1];
		return Math.max(0, last.endTime - first.startTime);
	}
	const first = context.words[0];
	const last = context.words[context.words.length - 1];
	return Math.max(0, last.endTime - first.startTime);
}

function mergeAdjacentMatches(
	matches: FillerWordMatch[],
	gapSeconds: number,
): FillerWordMatch[] {
	if (matches.length <= 1) return matches;
	const merged: FillerWordMatch[] = [matches[0]];
	for (let i = 1; i < matches.length; i++) {
		const prev = merged[merged.length - 1];
		const curr = matches[i];
		if (
			curr.startTime - prev.endTime <= gapSeconds &&
			curr.category === prev.category
		) {
			// Merge
			merged[merged.length - 1] = {
				text: `${prev.text} ${curr.text}`,
				startTime: prev.startTime,
				endTime: curr.endTime,
				confidence: Math.min(prev.confidence, curr.confidence),
				category: prev.category,
			};
		} else {
			merged.push(curr);
		}
	}
	return merged;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class FillerDetectorService {
	/**
	 * Detect filler words, hesitations, and repetitions from a transcript context.
	 */
	detectFillerWords(context: TranscriptContext): FillerDetectionResult {
		const words = context.words;
		if (words.length === 0) {
			return {
				matches: [],
				stats: {
					totalCount: 0,
					totalDurationSeconds: 0,
					percentageOfDuration: 0,
					byCategory: { filler: 0, hesitation: 0, repetition: 0 },
				},
			};
		}

		const rawMatches: FillerWordMatch[] = [];
		let previousWord: TranscriptWord | null = null;
		// Track indices consumed by bigram phrase matches to skip them
		const phraseConsumedIndices = new Set<number>();

		// Pass 1: detect bigram filler phrases (e.g. "you know", "I mean")
		for (let i = 0; i < words.length - 1; i++) {
			const a = words[i];
			const b = words[i + 1];
			const aDur = a.endTime - a.startTime;
			const bDur = b.endTime - b.startTime;
			if (
				aDur < MIN_FILLER_WORD_DURATION_SECONDS &&
				bDur < MIN_FILLER_WORD_DURATION_SECONDS
			)
				continue;
			if (isEnglishFillerPhrase(a.text, b.text)) {
				const combined: TranscriptWord = {
					startTime: a.startTime,
					endTime: b.endTime,
					text: `${a.text} ${b.text}`,
				};
				rawMatches.push({
					text: combined.text,
					startTime: combined.startTime,
					endTime: combined.endTime,
					confidence: computeConfidence(combined, "filler"),
					category: "filler",
				});
				phraseConsumedIndices.add(i);
				phraseConsumedIndices.add(i + 1);
			}
		}

		// Pass 2: detect single-word fillers, hesitations, repetitions
		for (let i = 0; i < words.length; i++) {
			if (phraseConsumedIndices.has(i)) {
				previousWord = words[i];
				continue;
			}
			const word = words[i];
			const duration = word.endTime - word.startTime;
			if (duration < MIN_FILLER_WORD_DURATION_SECONDS) {
				previousWord = word;
				continue;
			}

			let category: FillerCategory | null = null;

			if (isHesitationPattern(word.text)) {
				category = "hesitation";
			} else if (isEnglishFiller(word.text) || isChineseFiller(word.text)) {
				category = "filler";
			} else if (isRepetition(word, previousWord)) {
				category = "repetition";
			}

			if (category) {
				rawMatches.push({
					text: word.text,
					startTime: word.startTime,
					endTime: word.endTime,
					confidence: computeConfidence(word, category),
					category,
				});
			}

			previousWord = word;
		}

		// Sort by startTime and merge adjacent same-category matches
		rawMatches.sort((a, b) => a.startTime - b.startTime);
		const matches = mergeAdjacentMatches(rawMatches, FILLER_MERGE_GAP_SECONDS);

		// Compute stats
		const totalDuration = totalTranscriptDuration(context);
		const fillerDuration = matches.reduce(
			(sum, match) => sum + (match.endTime - match.startTime),
			0,
		);
		const byCategory: Record<FillerCategory, number> = {
			filler: 0,
			hesitation: 0,
			repetition: 0,
		};
		for (const match of matches) {
			byCategory[match.category] += 1;
		}

		return {
			matches,
			stats: {
				totalCount: matches.length,
				totalDurationSeconds: Number(fillerDuration.toFixed(3)),
				percentageOfDuration:
					totalDuration > 0
						? Number(((fillerDuration / totalDuration) * 100).toFixed(1))
						: 0,
				byCategory,
			},
		};
	}
}

export const fillerDetectorService = new FillerDetectorService();
