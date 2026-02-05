import type { LMStudioProvider } from "../providers/lm-studio-provider";
import type {
	ScoredSegment,
	RuleScores,
	SemanticScores,
	VisualScores,
	ScoringWeights,
	TranscriptChunk,
	LLMScoringResult,
} from "../tools/highlight-types";
import { clamp } from "../utils/math";
import { mapWithConcurrency } from "../utils/concurrency";
import {
	DEFAULT_HIGHLIGHT_BLOCK_SECONDS,
	DEFAULT_HIGHLIGHT_MAX_BLOCK_SPAN_SECONDS,
	DEFAULT_HIGHLIGHT_MODEL_TEMPERATURE,
	DEFAULT_HIGHLIGHT_VISION_CONCURRENCY,
} from "../constants/highlight";

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
	rule: 0.4,
	semantic: 0.4,
	visual: 0.2,
};

function cleanJsonMarkdown(content: string): string {
	const trimmed = content.trim();
	if (!trimmed.startsWith("```")) {
		return trimmed;
	}

	return trimmed
		.replace(/^```(?:json)?/i, "")
		.replace(/```$/i, "")
		.trim();
}

function safeParseJson(content: string): unknown {
	const cleaned = cleanJsonMarkdown(content);
	if (!cleaned) return null;

	try {
		return JSON.parse(cleaned);
	} catch {
		const objectMatch = cleaned.match(/\[[\s\S]*\]/);
		if (objectMatch) {
			try {
				return JSON.parse(objectMatch[0]);
			} catch {
				return null;
			}
		}
		return null;
	}
}

function average(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeRuleScore(ruleScores: RuleScores): number {
	return average([
		clamp(ruleScores.speakingRate, 0, 1),
		clamp(ruleScores.contentDensity, 0, 1),
		clamp(ruleScores.engagementMarkers, 0, 1),
		clamp(ruleScores.silenceRatio, 0, 1),
	]);
}

function normalizeSemanticScore(semanticScores: SemanticScores): number {
	return (
		average([
			clamp(semanticScores.importance, 1, 10),
			clamp(semanticScores.emotionalIntensity, 1, 10),
			clamp(semanticScores.hookPotential, 1, 10),
			clamp(semanticScores.standalone, 1, 10),
		]) / 10
	);
}

function normalizeVisualScore(visualScores: VisualScores): number {
	if (!visualScores.hasValidFrame) {
		return 0;
	}

	return average([
		clamp(visualScores.frameQuality, 0, 1),
		clamp(visualScores.visualInterest, 0, 1),
	]);
}

interface LLMBlock {
	chunks: TranscriptChunk[];
}

function buildBlocks(chunks: TranscriptChunk[]): LLMBlock[] {
	const sorted = [...chunks].sort((a, b) => a.startTime - b.startTime);
	const blocks: LLMBlock[] = [];

	let current: TranscriptChunk[] = [];
	let currentSpanStart = 0;
	let currentSpeechSeconds = 0;

	for (const chunk of sorted) {
		const chunkDuration = Math.max(0, chunk.endTime - chunk.startTime);
		if (current.length === 0) {
			current = [chunk];
			currentSpanStart = chunk.startTime;
			currentSpeechSeconds = chunkDuration;
			continue;
		}

		const span = chunk.endTime - currentSpanStart;
		const nextSpeechSeconds = currentSpeechSeconds + chunkDuration;
		if (
			current.length > 0 &&
			(nextSpeechSeconds > DEFAULT_HIGHLIGHT_BLOCK_SECONDS ||
				span > DEFAULT_HIGHLIGHT_MAX_BLOCK_SPAN_SECONDS)
		) {
			blocks.push({ chunks: current });
			current = [chunk];
			currentSpanStart = chunk.startTime;
			currentSpeechSeconds = chunkDuration;
			continue;
		}

		current.push(chunk);
		currentSpeechSeconds = nextSpeechSeconds;
	}

	if (current.length > 0) {
		blocks.push({ chunks: current });
	}

	return blocks;
}

function formatTime(seconds: number): string {
	const total = Math.max(0, seconds);
	const minutes = Math.floor(total / 60);
	const remainSeconds = Math.floor(total % 60);
	return `${minutes.toString().padStart(2, "0")}:${remainSeconds
		.toString()
		.padStart(2, "0")}`;
}

function buildSemanticPrompt(chunks: TranscriptChunk[]): string {
	const body = chunks
		.map((chunk) => {
			const text =
				chunk.text.length > 320 ? `${chunk.text.slice(0, 320)}...` : chunk.text;
			return `[${chunk.index}] (${formatTime(chunk.startTime)}-${formatTime(chunk.endTime)}) ${text}`;
		})
		.join("\n");

	return [
		"你是一位专业短视频剪辑师。以下是一段长视频的转录文本片段。",
		"请为每个编号段落评分(1-10 整数):",
		"- importance: 信息含量和重要程度",
		"- emotionalIntensity: 语气的情绪强度(兴奋/激动/感动/紧张)",
		"- hookPotential: 如果作为短视频前3秒，能否吸引观众继续看",
		"- standalone: 脱离上下文后是否仍可理解",
		"",
		body,
		"",
		"仅返回 JSON 数组，格式:",
		'[{"index":1,"importance":8,"emotionalIntensity":6,"hookPotential":9,"standalone":7}]',
	].join("\n");
}

interface ParsedSemanticScore {
	index: number;
	scores: SemanticScores;
}

function parseSemanticScores(content: string): ParsedSemanticScore[] | null {
	const parsed = safeParseJson(content);
	const arrayValue = Array.isArray(parsed)
		? parsed
		: parsed &&
				typeof parsed === "object" &&
				Array.isArray((parsed as { scores?: unknown }).scores)
			? (parsed as { scores: unknown[] }).scores
			: null;

	if (!arrayValue) return null;

	const scores: ParsedSemanticScore[] = [];
	for (const item of arrayValue) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const index = Number(record.index);

		const importance = Number(record.importance);
		const emotionalIntensity = Number(record.emotionalIntensity);
		const hookPotential = Number(record.hookPotential);
		const standalone = Number(record.standalone);

		if (
			!Number.isInteger(index) ||
			!Number.isFinite(importance) ||
			!Number.isFinite(emotionalIntensity) ||
			!Number.isFinite(hookPotential) ||
			!Number.isFinite(standalone)
		) {
			continue;
		}

		scores.push({
			index,
			scores: {
				importance: clamp(Math.round(importance), 1, 10),
				emotionalIntensity: clamp(Math.round(emotionalIntensity), 1, 10),
				hookPotential: clamp(Math.round(hookPotential), 1, 10),
				standalone: clamp(Math.round(standalone), 1, 10),
			},
		});
	}

	return scores.length > 0 ? scores : null;
}

function buildVisualPrompt(): string {
	return [
		"你是一位视频画面质量评估专家。",
		"请评估这帧画面作为短视频片段的视觉吸引力。",
		"评分标准:",
		"- frameQuality: 画面清晰度、构图、光线 (0.0-1.0)",
		"- visualInterest: 视觉吸引力，人物表情/动作/场景变化 (0.0-1.0)",
		'仅返回 JSON: {"frameQuality": 0.8, "visualInterest": 0.7}',
	].join("\n");
}

function parseVisualScores(content: string): VisualScores | null {
	const parsed = safeParseJson(content);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}

	const record = parsed as Record<string, unknown>;
	const frameQuality = Number(record.frameQuality);
	const visualInterest = Number(record.visualInterest);

	if (!Number.isFinite(frameQuality) || !Number.isFinite(visualInterest)) {
		return null;
	}

	return {
		frameQuality: clamp(frameQuality, 0, 1),
		visualInterest: clamp(visualInterest, 0, 1),
		hasValidFrame: true,
	};
}

export class HighlightScorerService {
	async scoreWithLLM(
		chunks: TranscriptChunk[],
		provider: LMStudioProvider,
	): Promise<LLMScoringResult> {
		const result = new Map<number, SemanticScores>();
		const diagnostics = {
			totalBlocks: 0,
			failedBlocks: 0,
			failedSamples: [] as string[],
			allFailed: false,
		};
		if (chunks.length === 0) {
			return { scores: result, diagnostics };
		}

		const blocks = buildBlocks(chunks);
		diagnostics.totalBlocks = blocks.length;
		for (const block of blocks) {
			const prompt = buildSemanticPrompt(block.chunks);
			try {
				const response = await provider.chat({
					messages: [
						{
							role: "system",
							content: "你是短视频剪辑助手。只输出 JSON，不要输出多余解释。",
						},
						{
							role: "user",
							content: prompt,
						},
					],
					tools: [],
					temperature: DEFAULT_HIGHLIGHT_MODEL_TEMPERATURE,
				});

				const content =
					typeof response.content === "string" ? response.content : "";
				const parsedScores = parseSemanticScores(content);
				if (!parsedScores || parsedScores.length === 0) {
					diagnostics.failedBlocks += 1;
					if (diagnostics.failedSamples.length < 3) {
						diagnostics.failedSamples.push("Empty or invalid JSON response");
					}
					continue;
				}

				for (const item of parsedScores) {
					result.set(item.index, item.scores);
				}
			} catch (error) {
				// ignore block-level failure and continue scoring remaining blocks
				diagnostics.failedBlocks += 1;
				if (diagnostics.failedSamples.length < 3) {
					diagnostics.failedSamples.push(
						error instanceof Error ? error.message : "Unknown error",
					);
				}
			}
		}

		diagnostics.allFailed =
			diagnostics.totalBlocks > 0 &&
			diagnostics.failedBlocks >= diagnostics.totalBlocks;
		return { scores: result, diagnostics };
	}

	async scoreWithVision(
		candidates: ScoredSegment[],
		maxCandidates: number,
		provider: LMStudioProvider,
	): Promise<Map<number, VisualScores>> {
		const result = new Map<number, VisualScores>();
		if (candidates.length === 0 || maxCandidates <= 0) {
			return result;
		}

		const targets = [...candidates]
			.sort((a, b) => b.combinedScore - a.combinedScore)
			.slice(0, maxCandidates);

		const prompt = buildVisualPrompt();
		const evaluated = await mapWithConcurrency({
			items: targets,
			limit: DEFAULT_HIGHLIGHT_VISION_CONCURRENCY,
			worker: async (candidate) => {
				if (!candidate.thumbnailDataUrl) {
					return {
						index: candidate.chunk.index,
						visual: {
							frameQuality: 0,
							visualInterest: 0,
							hasValidFrame: false,
						} satisfies VisualScores,
					};
				}

				try {
					const response = await provider.chat({
						messages: [
							{
								role: "system",
								content: "你是视频画面评估助手。只输出 JSON。",
							},
							{
								role: "user",
								content: [
									{ type: "text", text: prompt },
									{
										type: "image_url",
										image_url: {
											url: candidate.thumbnailDataUrl,
										},
									},
								],
							},
						],
						tools: [],
						temperature: DEFAULT_HIGHLIGHT_MODEL_TEMPERATURE,
					});

					const content =
						typeof response.content === "string" ? response.content : "";
					const visual = parseVisualScores(content);
					return {
						index: candidate.chunk.index,
						visual: visual ?? {
							frameQuality: 0,
							visualInterest: 0,
							hasValidFrame: false,
						},
					};
				} catch {
					return {
						index: candidate.chunk.index,
						visual: {
							frameQuality: 0,
							visualInterest: 0,
							hasValidFrame: false,
						} satisfies VisualScores,
					};
				}
			},
		});

		for (const item of evaluated) {
			result.set(item.index, item.visual);
		}

		return result;
	}

	computeCombinedScore(
		ruleScores: RuleScores,
		semanticScores: SemanticScores | null,
		visualScores: VisualScores | null,
		weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
	): number {
		const ruleNormalized = normalizeRuleScore(ruleScores);
		const semanticNormalized = semanticScores
			? normalizeSemanticScore(semanticScores)
			: null;
		const visualNormalized = visualScores
			? normalizeVisualScore(visualScores)
			: null;

		const normalizedWeights = {
			rule: weights.rule,
			semantic: semanticNormalized !== null ? weights.semantic : 0,
			visual: visualNormalized !== null ? weights.visual : 0,
		};

		const totalWeight =
			normalizedWeights.rule +
			normalizedWeights.semantic +
			normalizedWeights.visual;
		if (totalWeight <= 0) {
			return Number((clamp(ruleNormalized, 0, 1) * 100).toFixed(2));
		}

		const score =
			(ruleNormalized * normalizedWeights.rule +
				(semanticNormalized ?? 0) * normalizedWeights.semantic +
				(visualNormalized ?? 0) * normalizedWeights.visual) /
			totalWeight;

		return Number((clamp(score, 0, 1) * 100).toFixed(2));
	}
}

export const highlightScorerService = new HighlightScorerService();
