import type { MediaAsset } from "@/types/assets";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { canElementHaveAudio, hasMediaId } from "@/lib/timeline/element-utils";
import { EditorCore } from "@/core";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import { transcriptionService } from "@/services/transcription/service";
import type { AgentTool, ContentPart, ToolResult } from "../types";
import { LMStudioProvider } from "../providers/lm-studio-provider";
import {
	frameExtractorService,
	type EncodedVideoFrame,
} from "../services/frame-extractor";
import {
	sceneDetectorService,
	type SceneBoundary,
} from "../services/scene-detector";
import type {
	TranscriptContext,
	TranscriptSegment,
	TranscriptWord,
} from "./highlight-types";
import { parseEnvNumber, toNumberOrDefault } from "../utils/values";
import {
	DEFAULT_SCENE_DIFF_THRESHOLD,
	DEFAULT_SCENE_MAX_FRAMES,
	DEFAULT_SCENE_SAMPLE_INTERVAL_SECONDS,
	DEFAULT_VISION_ANALYSIS_MAX_FRAMES,
	DEFAULT_VISION_MODEL_TEMPERATURE,
	DEFAULT_VISION_TRANSCRIPT_WINDOW_SECONDS,
} from "../constants/vision";

type SuggestionStrategy = "highlight" | "cleanup" | "pacing" | "auto";

interface FrameAnalysisResult {
	timestamp: number;
	description: string;
	sceneType: string;
	mood: string;
	people: string[];
	textOnScreen: string[];
	changes: string;
	transcriptSegment: string;
}

interface EditSuggestion {
	type: string;
	timeRange: {
		startTime: number;
		endTime: number;
	};
	reason: string;
	suggestedAction: "cut" | "keep" | "trim" | "speed-up";
}

interface SceneCacheEntry {
	assetId: string;
	scenes: SceneBoundary[];
	sampleCount: number;
	sampleInterval: number;
	threshold: number;
	updatedAt: string;
}

interface FrameAnalysisCacheEntry {
	assetId: string;
	analyses: FrameAnalysisResult[];
	updatedAt: string;
}

interface TranscriptContextCacheEntry {
	cacheKey: string;
	context: TranscriptContext;
	updatedAt: string;
}

interface VisionProjectCache {
	sceneCache: Map<string, SceneCacheEntry>;
	frameAnalysisCache: Map<string, FrameAnalysisCacheEntry>;
	transcriptContextCache: Map<string, TranscriptContextCacheEntry>;
}

const visionCacheStore = new Map<string, VisionProjectCache>();

function getActiveProjectId(): string {
	const editor = EditorCore.getInstance();
	return editor.project.getActive()?.metadata.id ?? "unknown-project";
}

function getVisionProjectCache(
	projectId = getActiveProjectId(),
): VisionProjectCache {
	const existing = visionCacheStore.get(projectId);
	if (existing) {
		return existing;
	}

	const initial: VisionProjectCache = {
		sceneCache: new Map<string, SceneCacheEntry>(),
		frameAnalysisCache: new Map<string, FrameAnalysisCacheEntry>(),
		transcriptContextCache: new Map<string, TranscriptContextCacheEntry>(),
	};
	visionCacheStore.set(projectId, initial);
	return initial;
}

function createVisionProvider(): LMStudioProvider {
	return new LMStudioProvider({
		url: process.env.NEXT_PUBLIC_LM_STUDIO_URL,
		model: process.env.NEXT_PUBLIC_LM_STUDIO_MODEL,
		timeoutMs: parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_TIMEOUT_MS),
		maxTokens: parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_MAX_TOKENS),
	});
}

function findElementByRef({
	tracks,
	trackId,
	elementId,
}: {
	tracks: TimelineTrack[];
	trackId: string;
	elementId: string;
}): TimelineElement | null {
	const track = tracks.find((item) => item.id === trackId);
	if (!track) return null;
	return track.elements.find((item) => item.id === elementId) ?? null;
}

function findVideoAssetIdFromSelection({
	tracks,
	selectedElements,
}: {
	tracks: TimelineTrack[];
	selectedElements: Array<{ trackId: string; elementId: string }>;
}): string | null {
	for (const selected of selectedElements) {
		const element = findElementByRef({
			tracks,
			trackId: selected.trackId,
			elementId: selected.elementId,
		});
		if (element?.type === "video" && hasMediaId(element)) {
			return element.mediaId;
		}
	}
	return null;
}

function findFirstTimelineVideoAssetId({
	tracks,
}: {
	tracks: TimelineTrack[];
}): string | null {
	const ordered = tracks
		.flatMap((track) =>
			track.elements
				.filter(
					(element): element is Extract<TimelineElement, { type: "video" }> =>
						element.type === "video",
				)
				.map((element) => ({
					mediaId: element.mediaId,
					startTime: element.startTime,
				})),
		)
		.sort((a, b) => a.startTime - b.startTime);

	return ordered[0]?.mediaId ?? null;
}

function resolveVideoAsset({ videoAssetId }: { videoAssetId?: string }): {
	asset: MediaAsset;
	tracks: TimelineTrack[];
} {
	const editor = EditorCore.getInstance();
	const tracks = editor.timeline.getTracks();
	const assets = editor.media.getAssets();

	const videoAssets = assets.filter(
		(asset): asset is MediaAsset =>
			asset.type === "video" && Boolean(asset.file),
	);
	if (videoAssets.length === 0) {
		throw new Error("项目中没有可用视频素材");
	}

	if (typeof videoAssetId === "string" && videoAssetId.trim()) {
		const explicitAsset = videoAssets.find(
			(asset) => asset.id === videoAssetId.trim(),
		);
		if (!explicitAsset) {
			throw new Error(`找不到视频素材: ${videoAssetId}`);
		}
		return { asset: explicitAsset, tracks };
	}

	const selectedAssetId = findVideoAssetIdFromSelection({
		tracks,
		selectedElements: editor.selection.getSelectedElements(),
	});
	if (selectedAssetId) {
		const selectedAsset = videoAssets.find(
			(asset) => asset.id === selectedAssetId,
		);
		if (selectedAsset) {
			return { asset: selectedAsset, tracks };
		}
	}

	const timelineAssetId = findFirstTimelineVideoAssetId({ tracks });
	if (timelineAssetId) {
		const timelineAsset = videoAssets.find(
			(asset) => asset.id === timelineAssetId,
		);
		if (timelineAsset) {
			return { asset: timelineAsset, tracks };
		}
	}

	return { asset: videoAssets[0], tracks };
}

function toStringOrDefault(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: fallback;
}

function toTimestamps(value: unknown): number[] | null {
	if (!Array.isArray(value)) return null;
	const timestamps = value
		.filter(
			(item): item is number =>
				typeof item === "number" && Number.isFinite(item) && item >= 0,
		)
		.sort((a, b) => a - b);
	return timestamps.length > 0 ? timestamps : null;
}

function collectCaptionSegmentsFromTimeline({
	tracks,
}: {
	tracks: TimelineTrack[];
}): TranscriptSegment[] {
	const segments = tracks
		.flatMap((track) =>
			track.type === "text"
				? track.elements
						.filter((element) => element.metadata?.kind === "caption")
						.map((element) => ({
							startTime: element.startTime,
							endTime: element.startTime + element.duration,
							text: element.content.trim(),
						}))
				: [],
		)
		.filter((segment) => segment.text.length > 0)
		.sort((a, b) => a.startTime - b.startTime);

	return segments;
}

function splitTranscriptTokens(text: string): string[] {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return [];
	return normalized.split(" ").filter(Boolean);
}

function buildWordsFromSegments(
	segments: TranscriptSegment[],
): TranscriptWord[] {
	const words: TranscriptWord[] = [];
	for (const segment of segments) {
		const tokens = splitTranscriptTokens(segment.text);
		if (tokens.length === 0) continue;

		if (tokens.length === 1) {
			words.push({
				text: tokens[0],
				startTime: segment.startTime,
				endTime: segment.endTime,
			});
			continue;
		}

		const duration = Math.max(0, segment.endTime - segment.startTime);
		const tokenDuration = duration > 0 ? duration / tokens.length : 0;
		for (let i = 0; i < tokens.length; i++) {
			const tokenStart = segment.startTime + tokenDuration * i;
			const tokenEnd =
				i === tokens.length - 1
					? segment.endTime
					: segment.startTime + tokenDuration * (i + 1);
			words.push({
				text: tokens[i],
				startTime: tokenStart,
				endTime: Math.max(tokenStart, tokenEnd),
			});
		}
	}
	return words;
}

function buildTranscriptCacheKey({
	projectId,
	tracks,
}: {
	projectId: string;
	tracks: TimelineTrack[];
}): string {
	const fingerprint = tracks
		.map((track) => {
			const elementFingerprint = track.elements
				.map((element) => {
					if (element.type === "text" && element.metadata?.kind === "caption") {
						return `${element.id}:${element.startTime.toFixed(2)}:${element.duration.toFixed(2)}:${element.content}`;
					}
					return `${element.id}:${element.type}:${element.startTime.toFixed(2)}:${element.duration.toFixed(2)}`;
				})
				.join("|");
			return `${track.id}:${track.type}:${elementFingerprint}`;
		})
		.join("||");
	return `${projectId}:${fingerprint}`;
}

async function buildWhisperTranscriptContext({
	tracks,
}: {
	tracks: TimelineTrack[];
}): Promise<TranscriptContext | null> {
	const hasAudioSource = tracks.some((track) =>
		track.elements.some((element) => canElementHaveAudio(element)),
	);
	if (!hasAudioSource) {
		return null;
	}

	const editor = EditorCore.getInstance();
	const mediaAssets = editor.media.getAssets();
	const totalDuration = editor.timeline.getTotalDuration();
	if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
		return null;
	}

	const audioBlob = await extractTimelineAudio({
		tracks,
		mediaAssets,
		totalDuration,
	});
	const { samples } = await decodeAudioToFloat32({ audioBlob });
	if (samples.length === 0) {
		return null;
	}

	const result = await transcriptionService.transcribe({
		audioData: samples,
		language: "auto",
	});

	const segments = result.segments
		.map((segment) => ({
			startTime: segment.start,
			endTime: segment.end,
			text: segment.text.trim(),
		}))
		.filter((segment) => segment.text.length > 0);
	const words = result.words
		.map((word) => ({
			startTime: word.start,
			endTime: word.end,
			text: word.text.trim(),
		}))
		.filter((word) => word.text.length > 0);

	if (segments.length === 0 && words.length === 0) {
		return null;
	}

	return {
		segments,
		words,
		source: "whisper",
	};
}

async function getTranscriptContext({
	tracks,
}: {
	tracks: TimelineTrack[];
}): Promise<TranscriptContext> {
	const editor = EditorCore.getInstance();
	const activeProject = editor.project.getActive();
	const projectId = activeProject?.metadata.id ?? "unknown-project";
	const { transcriptContextCache } = getVisionProjectCache(projectId);
	const cacheKey = buildTranscriptCacheKey({ projectId, tracks });
	const cached = transcriptContextCache.get(cacheKey);
	if (cached) {
		return cached.context;
	}

	const captionSegments = collectCaptionSegmentsFromTimeline({ tracks });
	const captionWords = buildWordsFromSegments(captionSegments);
	const lastTranscription = transcriptionService.getLastResult();
	const whisperFromMemory: TranscriptContext | null = lastTranscription
		? {
				segments: lastTranscription.segments.map((segment) => ({
					startTime: segment.start,
					endTime: segment.end,
					text: segment.text.trim(),
				})),
				words: lastTranscription.words.map((word) => ({
					startTime: word.start,
					endTime: word.end,
					text: word.text.trim(),
				})),
				source: "whisper",
			}
		: null;

	let resolvedContext: TranscriptContext = {
		segments: captionSegments,
		words: captionWords,
		source: captionSegments.length > 0 ? "captions" : "none",
	};

	if (whisperFromMemory && whisperFromMemory.words.length > 0) {
		resolvedContext = whisperFromMemory;
	} else {
		try {
			const whisperContext = await buildWhisperTranscriptContext({ tracks });
			if (whisperContext) {
				resolvedContext = whisperContext;
			} else if (captionSegments.length > 0 && captionWords.length > 0) {
				resolvedContext = {
					segments: captionSegments,
					words: captionWords,
					source: "mixed",
				};
			}
		} catch (error) {
			console.warn("Failed to build whisper transcript context:", error);
			if (captionSegments.length > 0 && captionWords.length > 0) {
				resolvedContext = {
					segments: captionSegments,
					words: captionWords,
					source: "mixed",
				};
			}
		}
	}

	transcriptContextCache.set(cacheKey, {
		cacheKey,
		context: resolvedContext,
		updatedAt: new Date().toISOString(),
	});

	return resolvedContext;
}

interface AssetTimePlacement {
	timelineStartTime: number;
	timelineEndTime: number;
	sourceStartTime: number;
	sourceEndTime: number;
}

function createAssetTimeToTimelineMapper({
	tracks,
	assetId,
}: {
	tracks: TimelineTrack[];
	assetId: string;
}): (assetTime: number) => number {
	const placements = tracks
		.flatMap((track) =>
			track.elements
				.filter(
					(element): element is Extract<TimelineElement, { type: "video" }> =>
						element.type === "video" && element.mediaId === assetId,
				)
				.map((element) => {
					const sourceStartTime = element.trimStart ?? 0;
					const sourceEndTime = sourceStartTime + element.duration;
					return {
						timelineStartTime: element.startTime,
						timelineEndTime: element.startTime + element.duration,
						sourceStartTime,
						sourceEndTime,
					} satisfies AssetTimePlacement;
				}),
		)
		.sort((a, b) => a.timelineStartTime - b.timelineStartTime);

	if (placements.length === 0) {
		return (assetTime: number) => assetTime;
	}

	return (assetTime: number) => {
		const matchedPlacement =
			placements.find(
				(placement) =>
					assetTime >= placement.sourceStartTime &&
					assetTime <= placement.sourceEndTime,
			) ?? placements[0];

		const relativeTime = assetTime - matchedPlacement.sourceStartTime;
		const timelineTime = matchedPlacement.timelineStartTime + relativeTime;
		if (!Number.isFinite(timelineTime)) {
			return assetTime;
		}
		return Math.max(
			matchedPlacement.timelineStartTime,
			Math.min(timelineTime, matchedPlacement.timelineEndTime),
		);
	};
}

function getTranscriptForWindow({
	context,
	centerTime,
	windowSeconds = DEFAULT_VISION_TRANSCRIPT_WINDOW_SECONDS,
}: {
	context: TranscriptContext;
	centerTime: number;
	windowSeconds?: number;
}): string {
	const start = Math.max(0, centerTime - windowSeconds);
	const end = centerTime + windowSeconds;

	const wordsInRange = context.words
		.filter((word) => word.endTime >= start && word.startTime <= end)
		.map((word) => word.text)
		.join(" ")
		.trim();
	if (wordsInRange.length > 0) {
		return wordsInRange;
	}

	return context.segments
		.filter((segment) => segment.endTime >= start && segment.startTime <= end)
		.map((segment) => segment.text)
		.join(" ")
		.trim();
}

function getFullTranscript({
	context,
}: {
	context: TranscriptContext;
}): string {
	if (context.segments.length > 0) {
		return context.segments
			.map(
				(segment) =>
					`[${segment.startTime.toFixed(2)}-${segment.endTime.toFixed(2)}] ${segment.text}`,
			)
			.join("\n");
	}

	if (context.words.length === 0) {
		return "";
	}

	return context.words
		.map(
			(word) =>
				`[${word.startTime.toFixed(2)}-${word.endTime.toFixed(2)}] ${word.text}`,
		)
		.join("\n");
}

function cleanJsonMarkdown(value: string): string {
	const trimmed = value.trim();
	if (!trimmed.startsWith("```")) {
		return trimmed;
	}

	return trimmed
		.replace(/^```(?:json)?/i, "")
		.replace(/```$/i, "")
		.trim();
}

function parseStructuredResponse(
	content: string,
): Record<string, unknown> | null {
	const cleaned = cleanJsonMarkdown(content);
	if (!cleaned) return null;

	try {
		const parsed = JSON.parse(cleaned);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		const match = cleaned.match(/\{[\s\S]*\}/);
		if (!match) return null;
		try {
			const parsed = JSON.parse(match[0]);
			return parsed && typeof parsed === "object" && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: null;
		} catch {
			return null;
		}
	}
}

function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((item): item is string => typeof item === "string")
			.map((item) => item.trim())
			.filter(Boolean);
	}
	if (typeof value === "string" && value.trim().length > 0) {
		return value
			.split(/[，,]/)
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return [];
}

function normalizeFrameAnalysis({
	frame,
	responseContent,
	transcriptSegment,
}: {
	frame: EncodedVideoFrame;
	responseContent: string;
	transcriptSegment: string;
}): FrameAnalysisResult {
	const parsed = parseStructuredResponse(responseContent);
	return {
		timestamp: frame.timestamp,
		description: toStringOrDefault(
			parsed?.description,
			responseContent.trim() || "未返回描述",
		),
		sceneType: toStringOrDefault(parsed?.sceneType, "unknown"),
		mood: toStringOrDefault(parsed?.mood, ""),
		people: toStringArray(parsed?.people),
		textOnScreen: toStringArray(parsed?.textOnScreen),
		changes: toStringOrDefault(parsed?.changes, ""),
		transcriptSegment,
	};
}

function buildFramePrompt({
	timestamp,
	previousDescription,
	transcriptSegment,
	customPrompt,
}: {
	timestamp: number;
	previousDescription: string;
	transcriptSegment: string;
	customPrompt: string;
}): string {
	return [
		`你是视频内容分析助手。这是视频在 ${timestamp.toFixed(2)} 秒的帧。`,
		`前一帧描述：${previousDescription || "无"}`,
		`对应转录文本：${transcriptSegment || "无"}`,
		customPrompt ? `补充要求：${customPrompt}` : "",
		"请严格输出 JSON 对象，字段包含：description, sceneType, mood, people, textOnScreen, changes。",
		"其中 people/textOnScreen 必须是字符串数组。",
	]
		.filter(Boolean)
		.join("\n");
}

function clampStrategy(value: unknown): SuggestionStrategy {
	if (
		value === "highlight" ||
		value === "cleanup" ||
		value === "pacing" ||
		value === "auto"
	) {
		return value;
	}
	return "auto";
}

function summarizeSceneAnalyses(scenes: SceneBoundary[]): string {
	if (scenes.length === 0) {
		return "[]";
	}
	return JSON.stringify(
		scenes.slice(0, 120).map((scene) => ({
			startTime: Number(scene.startTime.toFixed(2)),
			endTime: Number(scene.endTime.toFixed(2)),
			keyframeTimestamp: Number(scene.keyframeTimestamp.toFixed(2)),
			diffScore: Number(scene.diffScore.toFixed(3)),
		})),
	);
}

function summarizeFrameAnalyses(analyses: FrameAnalysisResult[]): string {
	if (analyses.length === 0) return "[]";
	return JSON.stringify(
		analyses.slice(0, 120).map((analysis) => ({
			timestamp: Number(analysis.timestamp.toFixed(2)),
			sceneType: analysis.sceneType,
			mood: analysis.mood,
			description: analysis.description,
			textOnScreen: analysis.textOnScreen,
			changes: analysis.changes,
			transcriptSegment: analysis.transcriptSegment,
		})),
	);
}

function toEditSuggestions(value: unknown): EditSuggestion[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const record = item as Record<string, unknown>;
			const timeRange = (record.timeRange ?? {}) as Record<string, unknown>;
			const startTime = toNumberOrDefault(timeRange.startTime, 0);
			const endTime = toNumberOrDefault(timeRange.endTime, startTime);
			const action = toStringOrDefault(record.suggestedAction, "keep");
			const normalizedAction: EditSuggestion["suggestedAction"] =
				action === "cut" || action === "trim" || action === "speed-up"
					? action
					: "keep";
			return {
				type: toStringOrDefault(record.type, "generic"),
				timeRange: {
					startTime,
					endTime: Math.max(startTime, endTime),
				},
				reason: toStringOrDefault(record.reason, ""),
				suggestedAction: normalizedAction,
			};
		})
		.filter((item): item is EditSuggestion => Boolean(item));
}

function buildFallbackSuggestions({
	strategy,
	scenes,
}: {
	strategy: SuggestionStrategy;
	scenes: SceneBoundary[];
}): EditSuggestion[] {
	if (scenes.length === 0) {
		return [];
	}

	const cleanupSuggestions = scenes
		.filter(
			(scene) => scene.endTime - scene.startTime >= 8 && scene.diffScore < 0.12,
		)
		.slice(0, 3)
		.map((scene) => ({
			type: "cleanup",
			timeRange: {
				startTime: scene.startTime,
				endTime: scene.endTime,
			},
			reason: "该段画面变化较少且时长较长，可能存在冗余镜头",
			suggestedAction: "trim" as const,
		}));

	const highlightSuggestions = scenes
		.filter((scene) => scene.diffScore >= 0.45)
		.slice(0, 3)
		.map((scene) => ({
			type: "highlight",
			timeRange: {
				startTime: scene.startTime,
				endTime: scene.endTime,
			},
			reason: "该段场景变化明显，可能是信息密度较高的片段",
			suggestedAction: "keep" as const,
		}));

	const pacingSuggestions = scenes
		.filter((scene) => scene.endTime - scene.startTime >= 15)
		.slice(0, 2)
		.map((scene) => ({
			type: "pacing",
			timeRange: {
				startTime: scene.startTime,
				endTime: scene.endTime,
			},
			reason: "该段连续时长较长，可考虑提升播放节奏",
			suggestedAction: "speed-up" as const,
		}));

	if (strategy === "cleanup") return cleanupSuggestions;
	if (strategy === "highlight") return highlightSuggestions;
	if (strategy === "pacing") return pacingSuggestions;

	return [
		...cleanupSuggestions,
		...highlightSuggestions,
		...pacingSuggestions,
	].slice(0, 6);
}

export const detectScenesTool: AgentTool = {
	name: "detect_scenes",
	description:
		"检测视频场景边界（浏览器端像素差分，无需上传）。Detect scene boundaries with browser-side frame differencing.",
	parameters: {
		type: "object",
		properties: {
			videoAssetId: {
				type: "string",
				description:
					"视频素材 ID（可选，默认自动选择）(Optional video asset ID)",
			},
			sampleInterval: {
				type: "number",
				description:
					"采样间隔秒数（默认 1s）(Frame sampling interval in seconds)",
			},
			threshold: {
				type: "number",
				description: "场景切换阈值（0-1，默认 0.3）(Scene diff threshold)",
			},
			maxFrames: {
				type: "number",
				description: "最大采样帧数（默认 600）(Max sampled frames)",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const { sceneCache } = getVisionProjectCache();
			const { asset } = resolveVideoAsset({
				videoAssetId:
					typeof params.videoAssetId === "string"
						? params.videoAssetId
						: undefined,
			});

			const sampleInterval = toNumberOrDefault(
				params.sampleInterval,
				DEFAULT_SCENE_SAMPLE_INTERVAL_SECONDS,
			);
			const threshold = toNumberOrDefault(
				params.threshold,
				DEFAULT_SCENE_DIFF_THRESHOLD,
			);
			const maxFrames = toNumberOrDefault(
				params.maxFrames,
				DEFAULT_SCENE_MAX_FRAMES,
			);

			const detection = await sceneDetectorService.detectScenes({
				asset,
				sampleIntervalSeconds: sampleInterval,
				threshold,
				maxFrames,
			});

			const cacheEntry: SceneCacheEntry = {
				assetId: asset.id,
				scenes: detection.scenes,
				sampleCount: detection.sampleCount,
				sampleInterval,
				threshold,
				updatedAt: new Date().toISOString(),
			};
			sceneCache.set(asset.id, cacheEntry);

			return {
				success: true,
				message: `已检测到 ${detection.scenes.length} 个场景边界段（采样 ${detection.sampleCount} 帧）`,
				data: {
					videoAssetId: asset.id,
					sampleInterval,
					threshold,
					sampleCount: detection.sampleCount,
					scenes: detection.scenes,
					cachedAt: cacheEntry.updatedAt,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `场景检测失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "SCENE_DETECTION_FAILED" },
			};
		}
	},
};

export const analyzeFramesTool: AgentTool = {
	name: "analyze_frames",
	description:
		"分析视频帧视觉内容（Qwen3-VL），可结合字幕上下文。Analyze sampled video frames with multimodal VLM.",
	parameters: {
		type: "object",
		properties: {
			videoAssetId: {
				type: "string",
				description: "视频素材 ID（可选）(Optional video asset ID)",
			},
			timestamps: {
				type: "array",
				description:
					"指定要分析的时间戳数组（秒）(Optional timestamps array in seconds)",
			},
			maxFrames: {
				type: "number",
				description: "最多分析帧数（默认 20）(Maximum analyzed frames)",
			},
			prompt: {
				type: "string",
				description: "额外分析提示 (Additional analysis prompt)",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const { sceneCache, frameAnalysisCache } = getVisionProjectCache();
			const { asset, tracks } = resolveVideoAsset({
				videoAssetId:
					typeof params.videoAssetId === "string"
						? params.videoAssetId
						: undefined,
			});
			const maxFrames = Math.max(
				1,
				Math.floor(
					toNumberOrDefault(
						params.maxFrames,
						DEFAULT_VISION_ANALYSIS_MAX_FRAMES,
					),
				),
			);
			const customPrompt =
				typeof params.prompt === "string" ? params.prompt.trim() : "";
			const explicitTimestamps = toTimestamps(params.timestamps);

			let sampledFrames: EncodedVideoFrame[] = [];
			if (explicitTimestamps) {
				const rawFrames =
					await frameExtractorService.sampleVideoFramesAtTimestamps({
						asset,
						timestamps: explicitTimestamps.slice(0, maxFrames),
					});
				sampledFrames = await frameExtractorService.encodeFramesAsJpeg({
					frames: rawFrames,
				});
			} else {
				const cachedScenes = sceneCache.get(asset.id);
				if (cachedScenes && cachedScenes.scenes.length > 0) {
					const sceneTimestamps = cachedScenes.scenes
						.map((scene) => scene.keyframeTimestamp)
						.slice(0, maxFrames);
					const rawFrames =
						await frameExtractorService.sampleVideoFramesAtTimestamps({
							asset,
							timestamps: sceneTimestamps,
						});
					sampledFrames = await frameExtractorService.encodeFramesAsJpeg({
						frames: rawFrames,
					});
				} else {
					const duration =
						asset.duration ??
						EditorCore.getInstance().timeline.getTotalDuration();
					const intervalSeconds =
						maxFrames > 0 && duration > 0
							? Math.max(0.5, duration / maxFrames)
							: DEFAULT_SCENE_SAMPLE_INTERVAL_SECONDS;
					const rawFrames = await frameExtractorService.sampleVideoFrames({
						asset,
						durationSeconds: duration,
						intervalSeconds,
						maxFrames,
					});
					sampledFrames = await frameExtractorService.encodeFramesAsJpeg({
						frames: rawFrames,
					});
				}
			}

			if (sampledFrames.length === 0) {
				return {
					success: false,
					message: "未提取到可分析视频帧 (No frames extracted for analysis)",
					data: { errorCode: "NO_FRAMES" },
				};
			}

			const provider = createVisionProvider();
			const providerAvailable = await provider.isAvailable();
			if (!providerAvailable) {
				return {
					success: false,
					message: "LM Studio 不可用，请确认服务已启动",
					data: { errorCode: "PROVIDER_UNAVAILABLE" },
				};
			}

			const transcriptContext = await getTranscriptContext({ tracks });
			const assetTimeToTimelineTime = createAssetTimeToTimelineMapper({
				tracks,
				assetId: asset.id,
			});
			const analyses: FrameAnalysisResult[] = [];

			for (let i = 0; i < sampledFrames.length; i++) {
				const frame = sampledFrames[i];
				const previousDescription = analyses[i - 1]?.description ?? "";
				const timelineTime = assetTimeToTimelineTime(frame.timestamp);
				const transcriptSegment = getTranscriptForWindow({
					context: transcriptContext,
					centerTime: timelineTime,
				});

				const promptText = buildFramePrompt({
					timestamp: frame.timestamp,
					previousDescription,
					transcriptSegment,
					customPrompt,
				});

				const contentParts: ContentPart[] = [
					{
						type: "text",
						text: promptText,
					},
					{
						type: "image_url",
						image_url: {
							url: frame.dataUrl,
						},
					},
				];

				const response = await provider.chat({
					messages: [
						{
							role: "system",
							content:
								"你是视频视觉理解助手。只输出 JSON，不要输出额外解释文本。",
						},
						{
							role: "user",
							content: contentParts,
						},
					],
					tools: [],
					temperature: DEFAULT_VISION_MODEL_TEMPERATURE,
				});

				const responseContent =
					typeof response.content === "string" ? response.content : "";
				analyses.push(
					normalizeFrameAnalysis({
						frame,
						responseContent,
						transcriptSegment,
					}),
				);
			}

			const cacheEntry: FrameAnalysisCacheEntry = {
				assetId: asset.id,
				analyses,
				updatedAt: new Date().toISOString(),
			};
			frameAnalysisCache.set(asset.id, cacheEntry);

			return {
				success: true,
				message: `已完成 ${analyses.length} 帧视觉分析`,
				data: {
					videoAssetId: asset.id,
					frameCount: analyses.length,
					analyses,
					cachedAt: cacheEntry.updatedAt,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `帧分析失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "FRAME_ANALYSIS_FAILED" },
			};
		}
	},
};

export const suggestEditsTool: AgentTool = {
	name: "suggest_edits",
	description:
		"基于视觉分析与字幕上下文给出剪辑建议。Generate editing suggestions from scene/frame analysis and transcript context.",
	parameters: {
		type: "object",
		properties: {
			videoAssetId: {
				type: "string",
				description: "视频素材 ID（可选）(Optional video asset ID)",
			},
			strategy: {
				type: "string",
				enum: ["highlight", "cleanup", "pacing", "auto"],
				description:
					"建议策略（highlight/cleanup/pacing/auto）(Suggestion strategy)",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const { sceneCache, frameAnalysisCache } = getVisionProjectCache();
			const strategy = clampStrategy(params.strategy);
			const { asset, tracks } = resolveVideoAsset({
				videoAssetId:
					typeof params.videoAssetId === "string"
						? params.videoAssetId
						: undefined,
			});

			let scenes = sceneCache.get(asset.id)?.scenes ?? [];
			if (scenes.length === 0) {
				const detected = await sceneDetectorService.detectScenes({
					asset,
					sampleIntervalSeconds: DEFAULT_SCENE_SAMPLE_INTERVAL_SECONDS,
					threshold: DEFAULT_SCENE_DIFF_THRESHOLD,
					maxFrames: DEFAULT_SCENE_MAX_FRAMES,
				});
				scenes = detected.scenes;
				sceneCache.set(asset.id, {
					assetId: asset.id,
					scenes: detected.scenes,
					sampleCount: detected.sampleCount,
					sampleInterval: DEFAULT_SCENE_SAMPLE_INTERVAL_SECONDS,
					threshold: DEFAULT_SCENE_DIFF_THRESHOLD,
					updatedAt: new Date().toISOString(),
				});
			}

			const frameAnalyses = frameAnalysisCache.get(asset.id)?.analyses ?? [];
			const transcriptContext = await getTranscriptContext({ tracks });
			const transcript = getFullTranscript({ context: transcriptContext });

			const provider = createVisionProvider();
			let suggestions: EditSuggestion[] = [];
			if (await provider.isAvailable()) {
				const promptText = [
					`以下是一段视频的完整分析，策略为 ${strategy}：`,
					"",
					"场景列表：",
					summarizeSceneAnalyses(scenes),
					"",
					"视觉帧分析：",
					summarizeFrameAnalyses(frameAnalyses),
					"",
					"完整转录：",
					transcript || "(无可用字幕转录)",
					"",
					'请输出 JSON 对象：{"suggestions":[{"type":"...","timeRange":{"startTime":0,"endTime":1},"reason":"...","suggestedAction":"cut|keep|trim|speed-up"}]}',
				].join("\n");

				const response = await provider.chat({
					messages: [
						{
							role: "system",
							content: "你是视频剪辑建议助手。只输出 JSON，且建议要可执行。",
						},
						{
							role: "user",
							content: promptText,
						},
					],
					tools: [],
					temperature: 0.2,
				});

				const responseContent =
					typeof response.content === "string" ? response.content : "";
				const parsed = parseStructuredResponse(responseContent);
				suggestions = toEditSuggestions(parsed?.suggestions);
			}

			if (suggestions.length === 0) {
				suggestions = buildFallbackSuggestions({ strategy, scenes });
			}

			return {
				success: true,
				message:
					suggestions.length > 0
						? `已生成 ${suggestions.length} 条剪辑建议`
						: "暂无可执行建议，请先运行 analyze_frames 获取更多视觉上下文",
				data: {
					strategy,
					videoAssetId: asset.id,
					suggestions,
					inputs: {
						sceneCount: scenes.length,
						frameAnalysisCount: frameAnalyses.length,
						transcriptSegmentCount: transcriptContext.segments.length,
						transcriptWordCount: transcriptContext.words.length,
						transcriptSource: transcriptContext.source,
					},
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `生成编辑建议失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "SUGGEST_EDITS_FAILED" },
			};
		}
	},
};

export function __resetVisionToolCachesForTests(): void {
	visionCacheStore.clear();
}

export function getVisionTools(): AgentTool[] {
	return [detectScenesTool, analyzeFramesTool, suggestEditsTool];
}
