import { EditorCore } from "@/core";
import { transcriptionService } from "@/services/transcription/service";
import type { AgentTool, ToolResult } from "../types";
import { createRoutedProvider } from "../providers";
import { transcriptAnalyzerService } from "../services/transcript-analyzer";
import { highlightScorerService } from "../services/highlight-scorer";
import { fillerDetectorService } from "../services/filler-detector";
import type { TranscriptContext } from "./highlight-types";
import {
	buildTranscriptDocument,
	type TranscriptDocument,
	type TranscriptDocumentWord,
} from "../services/transcript-document";
import {
	applyTranscriptWordDeletion,
	computeTracksAfterWordDeletion,
	type TranscriptCutSuggestion,
} from "../services/transcript-edit-operations";
import { executeMutationWithUndoGuard } from "./execution-policy";

type SuggestGoal =
	| "tighten"
	| "remove-tangents"
	| "remove-repetition"
	| "custom";
type SmartTrimStrategy = "score-based" | "filler-first" | "balanced";

interface ParsedSuggestionPayload {
	startWordIndex: number;
	endWordIndex: number;
	reason: string;
}

interface SuggestedCandidate {
	startWordIndex: number;
	endWordIndex: number;
	reason: string;
	estimatedDurationSeconds: number;
	source: "llm" | "rule" | "filler";
	rankScore: number;
}

const DEFAULT_SUGGESTION_COUNT = 10;
const DEFAULT_SMART_TRIM_TARGET_SECONDS = 60;
const DEFAULT_MAX_WORD_DELETION_RATIO = 1;
const MIN_WORD_DELETION_RATIO = 0.1;
const MAX_WORD_DELETION_RATIO = 1;

let staleWhisperRef: object | null = null;

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function safeParseJson(content: string): unknown {
	const trimmed = content.trim();
	if (!trimmed) return null;
	const cleaned = trimmed.startsWith("```")
		? trimmed
				.replace(/^```(?:json)?/i, "")
				.replace(/```$/i, "")
				.trim()
		: trimmed;
	try {
		return JSON.parse(cleaned);
	} catch {
		const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/);
		if (!jsonArrayMatch) return null;
		try {
			return JSON.parse(jsonArrayMatch[0]);
		} catch {
			return null;
		}
	}
}

function createSuggestionId({
	startWordIndex,
	endWordIndex,
	offset,
}: {
	startWordIndex: number;
	endWordIndex: number;
	offset: number;
}): string {
	return `ts-${startWordIndex}-${endWordIndex}-${offset}`;
}

function calculateEstimatedDuration({
	words,
	startWordIndex,
	endWordIndex,
}: {
	words: TranscriptDocumentWord[];
	startWordIndex: number;
	endWordIndex: number;
}): number {
	const startWord = words[startWordIndex];
	const endWord = words[endWordIndex];
	if (!startWord || !endWord) return 0;
	return Math.max(0, endWord.endTime - startWord.startTime);
}

function mapChunkToWordRange({
	words,
	startTime,
	endTime,
}: {
	words: TranscriptDocumentWord[];
	startTime: number;
	endTime: number;
}): { startWordIndex: number; endWordIndex: number } | null {
	let startWordIndex = -1;
	let endWordIndex = -1;

	for (const word of words) {
		if (word.endTime <= startTime || word.startTime >= endTime) {
			continue;
		}
		if (startWordIndex < 0) {
			startWordIndex = word.index;
		}
		endWordIndex = word.index;
	}

	if (startWordIndex >= 0 && endWordIndex >= startWordIndex) {
		return { startWordIndex, endWordIndex };
	}

	let nearestIndex = -1;
	let nearestDistance = Number.POSITIVE_INFINITY;
	const midpoint = (startTime + endTime) / 2;
	for (const word of words) {
		const center = (word.startTime + word.endTime) / 2;
		const distance = Math.abs(center - midpoint);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestIndex = word.index;
		}
	}
	if (nearestIndex < 0) return null;
	return {
		startWordIndex: nearestIndex,
		endWordIndex: nearestIndex,
	};
}

function normalizeSuggestionGoal(value: unknown): SuggestGoal {
	if (
		value === "tighten" ||
		value === "remove-tangents" ||
		value === "remove-repetition" ||
		value === "custom"
	) {
		return value;
	}
	return "tighten";
}

function normalizeSmartTrimStrategy(value: unknown): SmartTrimStrategy {
	if (
		value === "score-based" ||
		value === "filler-first" ||
		value === "balanced"
	) {
		return value;
	}
	return "balanced";
}

function normalizeSuggestionPayload(
	items: unknown,
	wordsLength: number,
): ParsedSuggestionPayload[] {
	if (!Array.isArray(items)) return [];
	return items
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const record = item as Record<string, unknown>;
			const startWordIndex = Number(record.startWordIndex);
			const endWordIndex = Number(record.endWordIndex);
			const reason = typeof record.reason === "string" ? record.reason : "";
			if (
				!Number.isInteger(startWordIndex) ||
				!Number.isInteger(endWordIndex) ||
				startWordIndex < 0 ||
				endWordIndex < startWordIndex ||
				startWordIndex >= wordsLength
			) {
				return null;
			}
			return {
				startWordIndex,
				endWordIndex: Math.min(wordsLength - 1, endWordIndex),
				reason: reason.trim() || "建议删除低价值片段",
			};
		})
		.filter((item): item is ParsedSuggestionPayload => item !== null);
}

function buildTranscriptContextFromDocument(
	document: TranscriptDocument,
): TranscriptContext {
	return {
		segments: document.segments.map((segment) => ({
			startTime: segment.startTime,
			endTime: segment.endTime,
			text: segment.content,
		})),
		words: document.words.map((word) => ({
			startTime: word.startTime,
			endTime: word.endTime,
			text: word.text,
		})),
		source: document.source,
	};
}

function dedupeAndNormalizeSuggestions({
	candidates,
	words,
	maxSuggestions,
}: {
	candidates: SuggestedCandidate[];
	words: TranscriptDocumentWord[];
	maxSuggestions: number;
}): TranscriptCutSuggestion[] {
	const sorted = [...candidates].sort(
		(left, right) => right.rankScore - left.rankScore,
	);
	const ranges: Array<{ start: number; end: number }> = [];
	const suggestions: TranscriptCutSuggestion[] = [];

	for (const candidate of sorted) {
		if (suggestions.length >= maxSuggestions) break;
		if (candidate.endWordIndex < candidate.startWordIndex) continue;
		if (candidate.startWordIndex >= words.length) continue;
		const startWordIndex = Math.max(0, candidate.startWordIndex);
		const endWordIndex = Math.min(words.length - 1, candidate.endWordIndex);
		const overlapsExisting = ranges.some(
			(range) => startWordIndex <= range.end && endWordIndex >= range.start,
		);
		if (overlapsExisting) continue;

		ranges.push({ start: startWordIndex, end: endWordIndex });
		suggestions.push({
			id: createSuggestionId({
				startWordIndex,
				endWordIndex,
				offset: suggestions.length,
			}),
			startWordIndex,
			endWordIndex,
			reason: candidate.reason,
			accepted: true,
			estimatedDurationSeconds:
				candidate.estimatedDurationSeconds > 0
					? Number(candidate.estimatedDurationSeconds.toFixed(3))
					: Number(
							calculateEstimatedDuration({
								words,
								startWordIndex,
								endWordIndex,
							}).toFixed(3),
						),
			source: candidate.source,
		});
	}

	return suggestions;
}

function clampSuggestionsByWordDeletionRatio({
	suggestions,
	totalWords,
	maxWordDeletionRatio,
}: {
	suggestions: TranscriptCutSuggestion[];
	totalWords: number;
	maxWordDeletionRatio: number;
}): {
	suggestions: TranscriptCutSuggestion[];
	deletedWords: number;
	deletedWordRatio: number;
	limitedByWordRatio: boolean;
} {
	if (totalWords <= 0) {
		return {
			suggestions: [],
			deletedWords: 0,
			deletedWordRatio: 0,
			limitedByWordRatio: false,
		};
	}

	const clampedRatio = Math.max(
		MIN_WORD_DELETION_RATIO,
		Math.min(MAX_WORD_DELETION_RATIO, maxWordDeletionRatio),
	);
	if (clampedRatio >= 1) {
		const deletedWords = suggestions.reduce(
			(sum, suggestion) =>
				sum +
				Math.max(0, suggestion.endWordIndex - suggestion.startWordIndex + 1),
			0,
		);
		return {
			suggestions,
			deletedWords,
			deletedWordRatio: deletedWords / totalWords,
			limitedByWordRatio: false,
		};
	}

	const maxWordsToDelete = Math.max(1, Math.floor(totalWords * clampedRatio));
	const selected: TranscriptCutSuggestion[] = [];
	let deletedWords = 0;

	for (const suggestion of suggestions) {
		const wordCount = Math.max(
			0,
			suggestion.endWordIndex - suggestion.startWordIndex + 1,
		);
		if (wordCount === 0) continue;
		if (deletedWords + wordCount > maxWordsToDelete) {
			break;
		}
		selected.push(suggestion);
		deletedWords += wordCount;
	}

	return {
		suggestions: selected,
		deletedWords,
		deletedWordRatio: deletedWords / totalWords,
		limitedByWordRatio: selected.length < suggestions.length,
	};
}

function buildFallbackSuggestions({
	document,
	context,
	goal,
	maxSuggestions,
}: {
	document: TranscriptDocument;
	context: TranscriptContext;
	goal: SuggestGoal;
	maxSuggestions: number;
}): TranscriptCutSuggestion[] {
	const chunks = transcriptAnalyzerService.segmentTranscript(context, {
		minSeconds: 4,
		maxSeconds: 30,
	});
	const candidates = chunks
		.map((chunk) => {
			const range = mapChunkToWordRange({
				words: document.words,
				startTime: chunk.startTime,
				endTime: chunk.endTime,
			});
			if (!range) return null;
			const ruleScores = transcriptAnalyzerService.computeRuleScores(
				chunk,
				context.words,
			);
			const keepScore =
				(ruleScores.contentDensity +
					ruleScores.engagementMarkers +
					ruleScores.speakingRate +
					ruleScores.silenceRatio) /
				4;
			const deletableScore = 1 - keepScore;
			const reason =
				goal === "remove-repetition"
					? "疑似重复表达，建议压缩"
					: goal === "remove-tangents"
						? "该段偏离主线，建议删除"
						: "信息密度较低，建议收紧";

			return {
				startWordIndex: range.startWordIndex,
				endWordIndex: range.endWordIndex,
				reason,
				estimatedDurationSeconds: Math.max(0, chunk.endTime - chunk.startTime),
				source: "rule" as const,
				rankScore: deletableScore,
			};
		})
		.filter((item) => item !== null) as SuggestedCandidate[];

	return dedupeAndNormalizeSuggestions({
		candidates,
		words: document.words,
		maxSuggestions,
	});
}

function getGoalInstruction(
	goal: SuggestGoal,
	customInstruction?: string,
): string {
	if (goal === "remove-repetition") {
		return "优先删除重复表达、口头重复和信息冗余。";
	}
	if (goal === "remove-tangents") {
		return "优先删除偏题内容、离题说明和弱相关旁支内容。";
	}
	if (goal === "custom") {
		return customInstruction?.trim() || "按照用户自定义目标给出删除建议。";
	}
	return "优先删除低信息密度、停顿感强、可删不伤主线的内容。";
}

async function buildLlmSuggestions({
	document,
	goal,
	customInstruction,
	maxSuggestions,
}: {
	document: TranscriptDocument;
	goal: SuggestGoal;
	customInstruction?: string;
	maxSuggestions: number;
}): Promise<TranscriptCutSuggestion[] | null> {
	const context = buildTranscriptContextFromDocument(document);
	const chunks = transcriptAnalyzerService.segmentTranscript(context, {
		minSeconds: 4,
		maxSeconds: 35,
	});
	if (chunks.length === 0) return [];

	const chunkLines = chunks
		.map((chunk) => {
			const range = mapChunkToWordRange({
				words: document.words,
				startTime: chunk.startTime,
				endTime: chunk.endTime,
			});
			if (!range) return null;
			const text =
				chunk.text.length > 280 ? `${chunk.text.slice(0, 280)}...` : chunk.text;
			return `[${chunk.index}] words(${range.startWordIndex}-${range.endWordIndex}) ${text}`;
		})
		.filter((line): line is string => line !== null);

	if (chunkLines.length === 0) return [];

	const prompt = [
		"你是专业视频剪辑师，请基于转录文本提出“删除建议”。",
		getGoalInstruction(goal, customInstruction),
		"要求：",
		`1) 最多返回 ${maxSuggestions} 条`,
		"2) 每条必须是连续的词索引范围",
		"3) 避免重叠范围",
		"4) 只返回 JSON 数组",
		'格式: [{"startWordIndex":12,"endWordIndex":28,"reason":"..."}]',
		"",
		"可选片段：",
		...chunkLines,
	].join("\n");

	const provider = createRoutedProvider({ taskType: "semantic" });
	const response = await provider.chat({
		messages: [
			{
				role: "system",
				content: "你是严谨的视频剪辑助手。只输出 JSON，不要解释。",
			},
			{
				role: "user",
				content: prompt,
			},
		],
		tools: [],
		temperature: 0.2,
	});
	const content = typeof response.content === "string" ? response.content : "";
	const parsed = safeParseJson(content);
	const payload = normalizeSuggestionPayload(parsed, document.words.length);
	if (payload.length === 0) {
		return [];
	}

	const candidates: SuggestedCandidate[] = payload.map((item) => ({
		startWordIndex: item.startWordIndex,
		endWordIndex: item.endWordIndex,
		reason: item.reason,
		estimatedDurationSeconds: calculateEstimatedDuration({
			words: document.words,
			startWordIndex: item.startWordIndex,
			endWordIndex: item.endWordIndex,
		}),
		source: "llm",
		rankScore: 1,
	}));

	return dedupeAndNormalizeSuggestions({
		candidates,
		words: document.words,
		maxSuggestions,
	});
}

function resolveDocument(editor: EditorCore): TranscriptDocument | null {
	const currentWhisper = transcriptionService.getLastResult();
	const skipWhisper =
		staleWhisperRef !== null && staleWhisperRef === currentWhisper;
	return buildTranscriptDocument(editor, { skipWhisper });
}

function collectWordsBySuggestions({
	document,
	suggestions,
}: {
	document: TranscriptDocument;
	suggestions: TranscriptCutSuggestion[];
}): TranscriptDocumentWord[] {
	const result = new Map<number, TranscriptDocumentWord>();
	for (const suggestion of suggestions) {
		for (
			let index = suggestion.startWordIndex;
			index <= suggestion.endWordIndex;
			index += 1
		) {
			const word = document.words[index];
			if (!word) continue;
			result.set(index, word);
		}
	}
	return [...result.values()].sort((left, right) => left.index - right.index);
}

function buildSuggestionToolResult({
	toolName,
	dryRun,
	document,
	suggestions,
}: {
	toolName: string;
	dryRun: boolean;
	document: TranscriptDocument;
	suggestions: TranscriptCutSuggestion[];
}): ToolResult {
	const wordsToDelete = collectWordsBySuggestions({ document, suggestions });
	const preview = computeTracksAfterWordDeletion({
		tracks: EditorCore.getInstance().timeline.getTracks(),
		wordsToDelete,
	});

	return {
		success: true,
		message: dryRun
			? `已生成 ${suggestions.length} 条建议（预览模式）`
			: `已应用 ${suggestions.length} 条建议`,
		data: {
			toolName,
			dryRun,
			suggestions,
			diff: preview.diff,
			deleteRanges: preview.deleteRanges,
			currentDurationSeconds: preview.diff.duration.beforeSeconds,
			estimatedDurationSeconds: preview.diff.duration.afterSeconds,
			estimatedDurationDeltaSeconds: preview.diff.duration.deltaSeconds,
			fingerprint: document.fingerprint,
		},
	};
}

async function applySuggestions({
	label,
	document,
	suggestions,
}: {
	label: string;
	document: TranscriptDocument;
	suggestions: TranscriptCutSuggestion[];
}): Promise<{ success: boolean; message: string; diff?: unknown }> {
	const wordsToDelete = collectWordsBySuggestions({ document, suggestions });
	if (wordsToDelete.length === 0) {
		return {
			success: false,
			message: "没有可应用的删除词区间",
		};
	}

	let diff: unknown;
	await executeMutationWithUndoGuard({
		label,
		destructive: true,
		run: () => {
			const deletionResult = applyTranscriptWordDeletion({
				editor: EditorCore.getInstance(),
				wordsToDelete,
			});
			if (!deletionResult.success) {
				throw new Error("时间线删除未生效");
			}
			diff = deletionResult.diff;
		},
	});

	staleWhisperRef = transcriptionService.getLastResult();
	return {
		success: true,
		message: `已应用 ${suggestions.length} 条建议`,
		diff,
	};
}

export const suggestTranscriptCutsTool: AgentTool = {
	name: "suggest_transcript_cuts",
	description:
		"基于语义目标给出转录裁剪建议。Suggest transcript cut ranges from semantic intent.",
	parameters: {
		type: "object",
		properties: {
			goal: {
				type: "string",
				enum: ["tighten", "remove-tangents", "remove-repetition", "custom"],
				description: "建议目标",
			},
			customInstruction: {
				type: "string",
				description: "自定义裁剪要求（goal=custom 时生效）",
			},
			maxSuggestions: {
				type: "number",
				description: "最多建议条数（默认 10）",
			},
			dryRun: {
				type: "boolean",
				description: "是否仅返回建议，不实际修改（默认 true）",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		const editor = EditorCore.getInstance();
		const document = resolveDocument(editor);
		if (!document || document.words.length === 0) {
			return {
				success: false,
				message: "缺少可用转录内容，请先生成字幕或转录。",
				data: { errorCode: "NO_TRANSCRIPT" },
			};
		}

		const goal = normalizeSuggestionGoal(params.goal);
		const customInstruction =
			typeof params.customInstruction === "string"
				? params.customInstruction
				: undefined;
		const maxSuggestions =
			isFiniteNumber(params.maxSuggestions) && params.maxSuggestions > 0
				? Math.min(30, Math.floor(params.maxSuggestions))
				: DEFAULT_SUGGESTION_COUNT;
		const dryRun = params.dryRun !== false;
		const context = buildTranscriptContextFromDocument(document);

		let suggestions: TranscriptCutSuggestion[] = [];
		try {
			suggestions =
				(await buildLlmSuggestions({
					document,
					goal,
					customInstruction,
					maxSuggestions,
				})) ?? [];
		} catch {
			suggestions = [];
		}

		if (suggestions.length === 0) {
			suggestions = buildFallbackSuggestions({
				document,
				context,
				goal,
				maxSuggestions,
			});
		}

		if (suggestions.length === 0) {
			return {
				success: true,
				message: "未找到明确可删片段，建议手动检查。",
				data: {
					goal,
					dryRun,
					suggestions: [],
				},
			};
		}

		if (dryRun) {
			return buildSuggestionToolResult({
				toolName: "suggest_transcript_cuts",
				dryRun: true,
				document,
				suggestions,
			});
		}

		try {
			const applied = await applySuggestions({
				label: "suggest_transcript_cuts",
				document,
				suggestions,
			});
			if (!applied.success) {
				return {
					success: false,
					message: applied.message,
					data: { errorCode: "TRANSCRIPT_CUT_APPLY_FAILED" },
				};
			}
			return {
				success: true,
				message: applied.message,
				data: {
					goal,
					dryRun: false,
					suggestions,
					diff: applied.diff,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `应用建议失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "TRANSCRIPT_CUT_APPLY_FAILED" },
			};
		}
	},
};

async function buildSmartTrimSuggestions({
	document,
	strategy,
	targetDurationSeconds,
}: {
	document: TranscriptDocument;
	strategy: SmartTrimStrategy;
	targetDurationSeconds: number;
}): Promise<TranscriptCutSuggestion[]> {
	const context = buildTranscriptContextFromDocument(document);
	const chunks = transcriptAnalyzerService.segmentTranscript(context, {
		minSeconds: 3,
		maxSeconds: 30,
	});
	if (chunks.length === 0) return [];

	const currentDuration = Math.max(
		0,
		EditorCore.getInstance().timeline.getTotalDuration(),
	);
	const requiredCut = Math.max(0, currentDuration - targetDurationSeconds);
	if (requiredCut <= 0) return [];

	const semanticKeepScoreByChunkIndex = new Map<number, number>();
	if (strategy !== "filler-first") {
		try {
			const provider = createRoutedProvider({ taskType: "semantic" });
			const semanticResult = await highlightScorerService.scoreWithLLM(
				chunks,
				provider,
			);
			for (const [chunkIndex, score] of semanticResult.scores.entries()) {
				const keepScore =
					(score.importance +
						score.emotionalIntensity +
						score.hookPotential +
						score.standalone) /
					40;
				semanticKeepScoreByChunkIndex.set(chunkIndex, keepScore);
			}
		} catch {
			// Ignore semantic scoring failures and keep rule-only behavior.
		}
	}

	const candidates: SuggestedCandidate[] = [];
	for (const chunk of chunks) {
		const wordRange = mapChunkToWordRange({
			words: document.words,
			startTime: chunk.startTime,
			endTime: chunk.endTime,
		});
		if (!wordRange) continue;

		const ruleScores = transcriptAnalyzerService.computeRuleScores(
			chunk,
			context.words,
		);
		const ruleKeepScore =
			(ruleScores.contentDensity +
				ruleScores.engagementMarkers +
				ruleScores.speakingRate +
				ruleScores.silenceRatio) /
			4;
		const semanticKeepScore =
			semanticKeepScoreByChunkIndex.get(chunk.index) ?? ruleKeepScore;
		const keepScore =
			strategy === "score-based"
				? ruleKeepScore * 0.5 + semanticKeepScore * 0.5
				: ruleKeepScore * 0.7 + semanticKeepScore * 0.3;

		candidates.push({
			startWordIndex: wordRange.startWordIndex,
			endWordIndex: wordRange.endWordIndex,
			reason: "低综合评分片段，建议裁剪",
			estimatedDurationSeconds: Math.max(0, chunk.endTime - chunk.startTime),
			source: "rule",
			rankScore: 1 - keepScore,
		});
	}

	if (strategy === "filler-first" || strategy === "balanced") {
		const fillerMatches =
			fillerDetectorService.detectFillerWords(context).matches;
		for (const match of fillerMatches) {
			const range = mapChunkToWordRange({
				words: document.words,
				startTime: match.startTime,
				endTime: match.endTime,
			});
			if (!range) continue;
			candidates.push({
				startWordIndex: range.startWordIndex,
				endWordIndex: range.endWordIndex,
				reason: `填充词(${match.category})`,
				estimatedDurationSeconds: Math.max(0, match.endTime - match.startTime),
				source: "filler",
				rankScore:
					strategy === "filler-first"
						? 2 + match.confidence
						: 1.2 + match.confidence * 0.4,
			});
		}
	}

	const deduped = dedupeAndNormalizeSuggestions({
		candidates,
		words: document.words,
		maxSuggestions: 40,
	});

	if (deduped.length === 0) return [];

	const selected: TranscriptCutSuggestion[] = [];
	let accumulated = 0;
	for (const suggestion of deduped) {
		selected.push(suggestion);
		accumulated += suggestion.estimatedDurationSeconds ?? 0;
		if (accumulated >= requiredCut) break;
	}

	return selected;
}

export const transcriptSmartTrimTool: AgentTool = {
	name: "transcript_smart_trim",
	description:
		"按目标时长自动生成并应用转录裁剪建议（仅缩短，不延长）。Smart trim transcript to reduce duration only.",
	parameters: {
		type: "object",
		properties: {
			targetDurationSeconds: {
				type: "number",
				description: "目标时长（秒）",
			},
			strategy: {
				type: "string",
				enum: ["score-based", "filler-first", "balanced"],
				description: "裁剪策略",
			},
			dryRun: {
				type: "boolean",
				description: "仅预览建议，不实际修改（默认 true）",
			},
			maxWordDeletionRatio: {
				type: "number",
				description:
					"最多删除词数占比（0.1-1，默认 1 不限制）。用于避免语义被过度裁剪",
			},
		},
		required: ["targetDurationSeconds"],
	},
	execute: async (params): Promise<ToolResult> => {
		const editor = EditorCore.getInstance();
		const document = resolveDocument(editor);
		if (!document || document.words.length === 0) {
			return {
				success: false,
				message: "缺少可用转录内容，请先生成字幕或转录。",
				data: { errorCode: "NO_TRANSCRIPT" },
			};
		}

		const targetDurationSeconds =
			isFiniteNumber(params.targetDurationSeconds) &&
			params.targetDurationSeconds > 0
				? params.targetDurationSeconds
				: DEFAULT_SMART_TRIM_TARGET_SECONDS;
		const strategy = normalizeSmartTrimStrategy(params.strategy);
		const dryRun = params.dryRun !== false;
		const maxWordDeletionRatio =
			isFiniteNumber(params.maxWordDeletionRatio) &&
			params.maxWordDeletionRatio > 0
				? Math.max(
						MIN_WORD_DELETION_RATIO,
						Math.min(MAX_WORD_DELETION_RATIO, params.maxWordDeletionRatio),
					)
				: DEFAULT_MAX_WORD_DELETION_RATIO;
		const currentDuration = editor.timeline.getTotalDuration();

		if (currentDuration <= targetDurationSeconds) {
			return {
				success: true,
				message: `当前时长 ${currentDuration.toFixed(1)}s，已不超过目标 ${targetDurationSeconds.toFixed(1)}s。transcript_smart_trim 仅能缩短时长，本次未修改时间线。`,
				data: {
					targetDurationSeconds,
					currentDurationSeconds: Number(currentDuration.toFixed(3)),
					canTrim: false,
					noop: true,
					nextStepSuggestion:
						"如需延长时长，请补充素材/镜头，或将目标时长调整为小于当前时长后重试。",
					dryRun,
					suggestions: [],
				},
			};
		}

		const suggestions = await buildSmartTrimSuggestions({
			document,
			strategy,
			targetDurationSeconds,
		});

		const wordRatioGuard = clampSuggestionsByWordDeletionRatio({
			suggestions,
			totalWords: document.words.length,
			maxWordDeletionRatio,
		});
		const guardedSuggestions = wordRatioGuard.suggestions;

		if (guardedSuggestions.length === 0) {
			return {
				success: true,
				message:
					wordRatioGuard.limitedByWordRatio || suggestions.length > 0
						? "智能缩时建议被删词比例保护拦截，未执行实际裁剪。"
						: "未找到可用于缩时的片段建议。",
				data: {
					targetDurationSeconds,
					currentDurationSeconds: Number(currentDuration.toFixed(3)),
					dryRun,
					suggestions: guardedSuggestions,
					maxWordDeletionRatio,
					deletedWordRatio: Number(wordRatioGuard.deletedWordRatio.toFixed(4)),
				},
			};
		}

		if (dryRun) {
			return buildSuggestionToolResult({
				toolName: "transcript_smart_trim",
				dryRun: true,
				document,
				suggestions: guardedSuggestions,
			});
		}

		try {
			const applied = await applySuggestions({
				label: "transcript_smart_trim",
				document,
				suggestions: guardedSuggestions,
			});
			if (!applied.success) {
				return {
					success: false,
					message: applied.message,
					data: { errorCode: "TRANSCRIPT_SMART_TRIM_FAILED" },
				};
			}

			return {
				success: true,
				message: applied.message,
				data: {
					targetDurationSeconds,
					currentDurationSeconds: Number(currentDuration.toFixed(3)),
					dryRun: false,
					strategy,
					suggestions: guardedSuggestions,
					maxWordDeletionRatio,
					deletedWordRatio: Number(wordRatioGuard.deletedWordRatio.toFixed(4)),
					limitedByWordRatio: wordRatioGuard.limitedByWordRatio,
					diff: applied.diff,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `智能缩时失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "TRANSCRIPT_SMART_TRIM_FAILED" },
			};
		}
	},
};

export function getTranscriptEditTools(): AgentTool[] {
	return [suggestTranscriptCutsTool, transcriptSmartTrimTool];
}

export function __resetTranscriptEditToolStateForTests(): void {
	staleWhisperRef = null;
}
