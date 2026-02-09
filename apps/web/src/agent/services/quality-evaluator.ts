import { EditorCore } from "@/core";
import { buildTranscriptContext } from "./transcript-context-builder";

export interface QualityEvaluatorOptions {
	targetDurationSeconds?: number;
	durationToleranceRatio?: number;
	minSemanticCompleteness?: number;
	maxSilenceRate?: number;
	minSubtitleCoverage?: number;
	minDurationCompliance?: number;
}

export interface QualityMetric {
	value: number;
	score: number;
	passed: boolean;
	threshold: number;
}

export interface QualityReport {
	passed: boolean;
	overallScore: number;
	timelineDurationSeconds: number;
	targetDurationSeconds?: number;
	metrics: {
		semanticCompleteness: QualityMetric;
		silenceRate: QualityMetric;
		subtitleCoverage: QualityMetric;
		durationCompliance: QualityMetric;
	};
	reasons: string[];
	evaluatedAt: string;
}

const DEFAULT_DURATION_TOLERANCE_RATIO = 0.2;
const DEFAULT_MIN_SEMANTIC_COMPLETENESS = 0.65;
const DEFAULT_MAX_SILENCE_RATE = 0.45;
const DEFAULT_MIN_SUBTITLE_COVERAGE = 0.55;
const DEFAULT_MIN_DURATION_COMPLIANCE = 0.7;

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
	return Number(value.toFixed(4));
}

function sumMergedCoverage(
	intervals: Array<{ startTime: number; endTime: number }>,
	durationSeconds: number,
): number {
	if (intervals.length === 0 || durationSeconds <= 0) {
		return 0;
	}
	const normalized = intervals
		.map((item) => ({
			start: Math.max(0, Math.min(durationSeconds, item.startTime)),
			end: Math.max(0, Math.min(durationSeconds, item.endTime)),
		}))
		.filter((item) => item.end > item.start)
		.sort((left, right) => left.start - right.start);
	if (normalized.length === 0) {
		return 0;
	}

	const merged: Array<{ start: number; end: number }> = [];
	for (const interval of normalized) {
		const last = merged[merged.length - 1];
		if (!last || interval.start > last.end) {
			merged.push(interval);
			continue;
		}
		last.end = Math.max(last.end, interval.end);
	}
	return merged.reduce((total, item) => total + (item.end - item.start), 0);
}

export class QualityEvaluatorService {
	evaluate(options: QualityEvaluatorOptions = {}): QualityReport {
		const editor = EditorCore.getInstance();
		const timelineDurationSeconds = Math.max(
			editor.timeline.getTotalDuration(),
			0,
		);
		const normalizedDuration = Math.max(timelineDurationSeconds, 0.0001);
		const transcriptContext = buildTranscriptContext(editor);

		const speechCoverageSeconds = transcriptContext
			? sumMergedCoverage(transcriptContext.words, normalizedDuration)
			: 0;
		const subtitleCoverageSeconds = transcriptContext
			? sumMergedCoverage(transcriptContext.segments, normalizedDuration)
			: 0;

		const speechCoverage = clamp01(speechCoverageSeconds / normalizedDuration);
		const subtitleCoverage = clamp01(
			subtitleCoverageSeconds / normalizedDuration,
		);
		const silenceRate = clamp01(1 - speechCoverage);
		const semanticCompleteness = clamp01(
			speechCoverage * 0.7 + subtitleCoverage * 0.3,
		);

		const targetDurationSeconds =
			typeof options.targetDurationSeconds === "number" &&
			Number.isFinite(options.targetDurationSeconds) &&
			options.targetDurationSeconds > 0
				? options.targetDurationSeconds
				: undefined;
		const durationToleranceRatio = clamp01(
			typeof options.durationToleranceRatio === "number" &&
				Number.isFinite(options.durationToleranceRatio)
				? options.durationToleranceRatio
				: DEFAULT_DURATION_TOLERANCE_RATIO,
		);
		const durationCompliance =
			targetDurationSeconds === undefined
				? 1
				: clamp01(
						1 -
							Math.abs(timelineDurationSeconds - targetDurationSeconds) /
								targetDurationSeconds,
					);

		const minSemanticCompleteness = clamp01(
			options.minSemanticCompleteness ?? DEFAULT_MIN_SEMANTIC_COMPLETENESS,
		);
		const maxSilenceRate = clamp01(
			options.maxSilenceRate ?? DEFAULT_MAX_SILENCE_RATE,
		);
		const minSubtitleCoverage = clamp01(
			options.minSubtitleCoverage ?? DEFAULT_MIN_SUBTITLE_COVERAGE,
		);
		const minDurationCompliance = clamp01(
			options.minDurationCompliance ?? DEFAULT_MIN_DURATION_COMPLIANCE,
		);
		const durationDeltaRatio =
			targetDurationSeconds === undefined || targetDurationSeconds === 0
				? 0
				: Math.abs(timelineDurationSeconds - targetDurationSeconds) /
					targetDurationSeconds;

		const semanticPassed = semanticCompleteness >= minSemanticCompleteness;
		const silencePassed = silenceRate <= maxSilenceRate;
		const subtitlePassed = subtitleCoverage >= minSubtitleCoverage;
		const durationPassed =
			targetDurationSeconds === undefined
				? true
				: durationCompliance >= minDurationCompliance &&
					durationDeltaRatio <= durationToleranceRatio;

		const overallScore = clamp01(
			semanticCompleteness * 0.35 +
				(1 - silenceRate) * 0.2 +
				subtitleCoverage * 0.25 +
				durationCompliance * 0.2,
		);
		const passed =
			semanticPassed && silencePassed && subtitlePassed && durationPassed;

		const reasons: string[] = [];
		if (!semanticPassed) {
			reasons.push(
				`语义完整性偏低 (${semanticCompleteness.toFixed(2)} < ${minSemanticCompleteness.toFixed(2)})`,
			);
		}
		if (!silencePassed) {
			reasons.push(
				`静音率偏高 (${silenceRate.toFixed(2)} > ${maxSilenceRate.toFixed(2)})`,
			);
		}
		if (!subtitlePassed) {
			reasons.push(
				`字幕覆盖率偏低 (${subtitleCoverage.toFixed(2)} < ${minSubtitleCoverage.toFixed(2)})`,
			);
		}
		if (!durationPassed && targetDurationSeconds !== undefined) {
			reasons.push(
				`时长未达标 (${timelineDurationSeconds.toFixed(2)}s vs target ${targetDurationSeconds.toFixed(2)}s, tolerance ${(durationToleranceRatio * 100).toFixed(0)}%)`,
			);
		}

		return {
			passed,
			overallScore: round4(overallScore),
			timelineDurationSeconds: round4(timelineDurationSeconds),
			...(targetDurationSeconds !== undefined ? { targetDurationSeconds } : {}),
			metrics: {
				semanticCompleteness: {
					value: round4(semanticCompleteness),
					score: round4(semanticCompleteness),
					passed: semanticPassed,
					threshold: round4(minSemanticCompleteness),
				},
				silenceRate: {
					value: round4(silenceRate),
					score: round4(1 - silenceRate),
					passed: silencePassed,
					threshold: round4(maxSilenceRate),
				},
				subtitleCoverage: {
					value: round4(subtitleCoverage),
					score: round4(subtitleCoverage),
					passed: subtitlePassed,
					threshold: round4(minSubtitleCoverage),
				},
				durationCompliance: {
					value: round4(durationCompliance),
					score: round4(durationCompliance),
					passed: durationPassed,
					threshold: round4(minDurationCompliance),
				},
			},
			reasons,
			evaluatedAt: new Date().toISOString(),
		};
	}
}

export const qualityEvaluatorService = new QualityEvaluatorService();
