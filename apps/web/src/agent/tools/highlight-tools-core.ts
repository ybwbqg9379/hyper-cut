import type { MediaAsset } from "@/types/assets";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { EditorCore } from "@/core";
import { canElementHaveAudio, hasMediaId } from "@/lib/timeline/element-utils";
import { calculateTotalDuration } from "@/lib/timeline";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import { transcriptionService } from "@/services/transcription/service";
import { isCaptionTextElement } from "@/lib/transcription/caption-metadata";
import { encodeCanvasAsJpeg } from "../utils/image";
import { LMStudioProvider } from "../providers/lm-studio-provider";
import type { AgentTool, ToolResult } from "../types";
import { transcriptAnalyzerService } from "../services/transcript-analyzer";
import {
	highlightScorerService,
	DEFAULT_SCORING_WEIGHTS,
} from "../services/highlight-scorer";
import { segmentSelectorService } from "../services/segment-selector";
import { mapWithConcurrency } from "../utils/concurrency";
import { clamp } from "../utils/math";
import {
	parseEnvNumber,
	toBooleanOrDefault,
	toNumberOrDefault,
} from "../utils/values";
import {
	DEFAULT_HIGHLIGHT_DURATION_TOLERANCE,
	DEFAULT_HIGHLIGHT_FRAME_EXTRACTION_CONCURRENCY,
	DEFAULT_HIGHLIGHT_SEGMENT_MAX_SECONDS,
	DEFAULT_HIGHLIGHT_SEGMENT_MIN_SECONDS,
	DEFAULT_HIGHLIGHT_TARGET_DURATION,
	DEFAULT_HIGHLIGHT_TOP_N_VISUAL,
} from "../constants/highlight";
import type {
	HighlightPlan,
	ScoredSegment,
	SemanticScores,
	TranscriptContext,
	TranscriptSegment,
	TranscriptWord,
	VisualScores,
	ScoringWeights,
} from "./highlight-types";
import { generateCaptionsTool, removeSilenceTool } from "./timeline-tools";
import {
	splitTracksAtTimes,
	deleteElementsFullyInRange,
	rippleCompressTracks,
} from "./timeline-edit-ops";

const MIN_INTERVAL_SECONDS = 0.03;
const SELECT_EPSILON = 0.02;
const MAX_HIGHLIGHT_FRAME_WIDTH = 640;
const MAX_HIGHLIGHT_FRAME_HEIGHT = 360;
const TRANSCRIPT_ALIGNMENT_TOLERANCE_SECONDS = 1;
const EXECUTION_CANCELLED_ERROR_CODE = "EXECUTION_CANCELLED";

interface HighlightCacheState {
	scoredSegments: ScoredSegment[] | null;
	highlightPlan: HighlightPlan | null;
	assetId: string | null;
	timelineFingerprint: string | null;
	updatedAt: string | null;
}

interface TranscriptContextCacheEntry {
	cacheKey: string;
	context: TranscriptContext;
	updatedAt: string;
}

const highlightCacheStore = new Map<string, HighlightCacheState>();

const transcriptContextCache = new Map<string, TranscriptContextCacheEntry>();
const hydratedHighlightCacheProjects = new Set<string>();
const AGENT_CACHE_DB_NAME = "hypercut-agent-cache";
const AGENT_CACHE_DB_VERSION = 1;
const HIGHLIGHT_CACHE_STORE_NAME = "highlight-cache";
const TRANSCRIPT_CACHE_STORE_NAME = "transcript-context-cache";

function isIndexedDBAvailable(): boolean {
	return (
		typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
	);
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function toOptionalString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function normalizePersistedHighlightCache(
	value: unknown,
): HighlightCacheState | null {
	const record = toObjectRecord(value);
	if (!record) return null;

	return {
		scoredSegments: Array.isArray(record.scoredSegments)
			? (record.scoredSegments as ScoredSegment[])
			: null,
		highlightPlan:
			record.highlightPlan &&
			typeof record.highlightPlan === "object" &&
			!Array.isArray(record.highlightPlan)
				? (record.highlightPlan as HighlightPlan)
				: null,
		assetId: toOptionalString(record.assetId),
		timelineFingerprint: toOptionalString(record.timelineFingerprint),
		updatedAt: toOptionalString(record.updatedAt),
	};
}

function normalizePersistedTranscriptCacheEntry(
	value: unknown,
): TranscriptContextCacheEntry | null {
	const record = toObjectRecord(value);
	if (!record) return null;
	const contextRecord = toObjectRecord(record.context);
	if (!contextRecord) return null;

	const source =
		contextRecord.source === "whisper" ||
		contextRecord.source === "captions" ||
		contextRecord.source === "mixed" ||
		contextRecord.source === "none"
			? contextRecord.source
			: "none";

	return {
		cacheKey:
			typeof record.cacheKey === "string"
				? record.cacheKey
				: typeof record.id === "string"
					? record.id
					: "",
		context: {
			segments: Array.isArray(contextRecord.segments)
				? (contextRecord.segments as TranscriptSegment[])
				: [],
			words: Array.isArray(contextRecord.words)
				? (contextRecord.words as TranscriptWord[])
				: [],
			source,
		},
		updatedAt:
			typeof record.updatedAt === "string"
				? record.updatedAt
				: new Date().toISOString(),
	};
}

async function openAgentCacheDatabase(): Promise<IDBDatabase | null> {
	if (!isIndexedDBAvailable()) {
		return null;
	}

	return new Promise((resolve) => {
		try {
			const request = window.indexedDB.open(
				AGENT_CACHE_DB_NAME,
				AGENT_CACHE_DB_VERSION,
			);
			request.onerror = () => resolve(null);
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(HIGHLIGHT_CACHE_STORE_NAME)) {
					db.createObjectStore(HIGHLIGHT_CACHE_STORE_NAME, {
						keyPath: "id",
					});
				}
				if (!db.objectStoreNames.contains(TRANSCRIPT_CACHE_STORE_NAME)) {
					db.createObjectStore(TRANSCRIPT_CACHE_STORE_NAME, {
						keyPath: "id",
					});
				}
			};
			request.onsuccess = () => resolve(request.result);
		} catch {
			resolve(null);
		}
	});
}

async function readAgentCacheRecord({
	storeName,
	id,
}: {
	storeName: string;
	id: string;
}): Promise<unknown | null> {
	const db = await openAgentCacheDatabase();
	if (!db) return null;

	return new Promise((resolve) => {
		try {
			const transaction = db.transaction([storeName], "readonly");
			const store = transaction.objectStore(storeName);
			const request = store.get(id);
			request.onerror = () => resolve(null);
			request.onsuccess = () => resolve(request.result ?? null);
		} catch {
			resolve(null);
		}
	});
}

async function writeAgentCacheRecord({
	storeName,
	id,
	value,
}: {
	storeName: string;
	id: string;
	value: unknown;
}): Promise<void> {
	const db = await openAgentCacheDatabase();
	if (!db) return;

	try {
		const transaction = db.transaction([storeName], "readwrite");
		const store = transaction.objectStore(storeName);
		const normalizedValue = toObjectRecord(value);
		if (normalizedValue) {
			store.put({ id, ...normalizedValue });
		} else {
			store.put({ id, value });
		}
	} catch {
		// Ignore persistence failures and keep in-memory behavior.
	}
}

async function removeAgentCacheRecord({
	storeName,
	id,
}: {
	storeName: string;
	id: string;
}): Promise<void> {
	const db = await openAgentCacheDatabase();
	if (!db) return;

	try {
		const transaction = db.transaction([storeName], "readwrite");
		const store = transaction.objectStore(storeName);
		store.delete(id);
	} catch {
		// Ignore persistence failures and keep in-memory behavior.
	}
}

async function ensureHighlightCacheLoaded(projectId = getActiveProjectId()) {
	if (hydratedHighlightCacheProjects.has(projectId)) {
		return;
	}
	hydratedHighlightCacheProjects.add(projectId);

	const persisted = normalizePersistedHighlightCache(
		await readAgentCacheRecord({
			storeName: HIGHLIGHT_CACHE_STORE_NAME,
			id: projectId,
		}),
	);
	if (!persisted) {
		return;
	}
	highlightCacheStore.set(projectId, persisted);
}

function persistHighlightCache({
	projectId,
	cache,
}: {
	projectId: string;
	cache: HighlightCacheState;
}): void {
	void writeAgentCacheRecord({
		storeName: HIGHLIGHT_CACHE_STORE_NAME,
		id: projectId,
		value: {
			assetId: cache.assetId,
			scoredSegments: cache.scoredSegments,
			highlightPlan: cache.highlightPlan,
			timelineFingerprint: cache.timelineFingerprint,
			updatedAt: cache.updatedAt,
		},
	});
}

async function getPersistedTranscriptCacheEntry({
	cacheKey,
}: {
	cacheKey: string;
}): Promise<TranscriptContextCacheEntry | null> {
	return normalizePersistedTranscriptCacheEntry(
		await readAgentCacheRecord({
			storeName: TRANSCRIPT_CACHE_STORE_NAME,
			id: cacheKey,
		}),
	);
}

function persistTranscriptCacheEntry(entry: TranscriptContextCacheEntry): void {
	void writeAgentCacheRecord({
		storeName: TRANSCRIPT_CACHE_STORE_NAME,
		id: entry.cacheKey,
		value: entry,
	});
}

function removePersistedTranscriptCacheEntry({
	cacheKey,
}: {
	cacheKey: string;
}): void {
	void removeAgentCacheRecord({
		storeName: TRANSCRIPT_CACHE_STORE_NAME,
		id: cacheKey,
	});
}

function clearPersistedAgentCacheDatabase(): void {
	if (!isIndexedDBAvailable()) return;
	try {
		window.indexedDB.deleteDatabase(AGENT_CACHE_DB_NAME);
	} catch {
		// Ignore persistence failures and keep in-memory behavior.
	}
}

function isExecutionCancelled(signal?: AbortSignal): boolean {
	return signal?.aborted === true;
}

function throwIfExecutionCancelled(signal?: AbortSignal): void {
	if (!isExecutionCancelled(signal)) {
		return;
	}
	throw new Error("Execution cancelled");
}

function isExecutionCancelledError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const lower = error.message.toLowerCase();
	return (
		error.name === "AbortError" ||
		lower.includes("cancelled") ||
		lower.includes("canceled")
	);
}

function getActiveProjectId(): string {
	const editor = EditorCore.getInstance();
	return editor.project.getActive()?.metadata.id ?? "unknown-project";
}

function getHighlightCache(
	projectId = getActiveProjectId(),
): HighlightCacheState {
	const existing = highlightCacheStore.get(projectId);
	if (existing) return existing;

	const initial: HighlightCacheState = {
		scoredSegments: null,
		highlightPlan: null,
		assetId: null,
		timelineFingerprint: null,
		updatedAt: null,
	};
	highlightCacheStore.set(projectId, initial);
	return initial;
}

function createLocalProvider(): LMStudioProvider {
	return new LMStudioProvider({
		url: process.env.NEXT_PUBLIC_LM_STUDIO_URL,
		model: process.env.NEXT_PUBLIC_LM_STUDIO_MODEL,
		timeoutMs: parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_TIMEOUT_MS),
		maxTokens: parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_MAX_TOKENS),
	});
}

function buildTimelineFingerprint(tracks: TimelineTrack[]): string {
	return tracks
		.map((track) => {
			const elements = track.elements
				.map((element) => {
					const mediaId =
						"mediaId" in element && typeof element.mediaId === "string"
							? element.mediaId
							: "";
					const content =
						element.type === "text" && typeof element.content === "string"
							? element.content
							: "";
					const trimStart =
						"trimStart" in element && typeof element.trimStart === "number"
							? element.trimStart
							: 0;
					const trimEnd =
						"trimEnd" in element && typeof element.trimEnd === "number"
							? element.trimEnd
							: 0;
					return [
						element.id,
						element.type,
						element.startTime.toFixed(3),
						element.duration.toFixed(3),
						trimStart.toFixed(3),
						trimEnd.toFixed(3),
						mediaId,
						content,
					].join(":");
				})
				.join("|");
			return `${track.id}:${track.type}:${elements}`;
		})
		.join("||");
}

function isHighlightCacheStale({
	tracks,
	cache,
}: {
	tracks: TimelineTrack[];
	cache: HighlightCacheState;
}): boolean {
	if (!cache.timelineFingerprint) {
		return Boolean(cache.scoredSegments || cache.highlightPlan);
	}
	return cache.timelineFingerprint !== buildTimelineFingerprint(tracks);
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
	const highlightCache = getHighlightCache();
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

	if (typeof videoAssetId === "string" && videoAssetId.trim().length > 0) {
		const explicitAsset = videoAssets.find(
			(asset) => asset.id === videoAssetId.trim(),
		);
		if (!explicitAsset) {
			throw new Error(`找不到视频素材: ${videoAssetId}`);
		}
		return { asset: explicitAsset, tracks };
	}

	if (highlightCache.assetId) {
		const cachedAsset = videoAssets.find(
			(asset) => asset.id === highlightCache.assetId,
		);
		if (cachedAsset) {
			return { asset: cachedAsset, tracks };
		}
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

function splitTranscriptTokens(text: string): string[] {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return [];
	return normalized.split(" ").filter(Boolean);
}

function collectCaptionSegmentsFromTimeline({
	tracks,
}: {
	tracks: TimelineTrack[];
}): TranscriptSegment[] {
	return tracks
		.flatMap((track) =>
			track.type === "text"
				? track.elements
						.filter((element) => isCaptionTextElement(element))
						.map((element) => ({
							startTime: element.startTime,
							endTime: element.startTime + element.duration,
							text: element.content.trim(),
						}))
				: [],
		)
		.filter((segment) => segment.text.length > 0)
		.sort((a, b) => a.startTime - b.startTime);
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

		for (let i = 0; i < tokens.length; i += 1) {
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
					if (element.type === "text" && isCaptionTextElement(element)) {
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

function getTracksDuration(tracks: TimelineTrack[]): number {
	let maxEndTime = 0;
	for (const track of tracks) {
		for (const element of track.elements) {
			const endTime = element.startTime + element.duration;
			if (Number.isFinite(endTime) && endTime > maxEndTime) {
				maxEndTime = endTime;
			}
		}
	}
	return maxEndTime;
}

function clampIntervalToDuration({
	startTime,
	endTime,
	totalDuration,
}: {
	startTime: number;
	endTime: number;
	totalDuration: number;
}): { startTime: number; endTime: number } | null {
	const clampedStart = clamp(startTime, 0, totalDuration);
	const clampedEnd = clamp(endTime, 0, totalDuration);
	if (clampedEnd - clampedStart < MIN_INTERVAL_SECONDS) {
		return null;
	}
	return {
		startTime: clampedStart,
		endTime: clampedEnd,
	};
}

function normalizeTranscriptSegments({
	segments,
	totalDuration,
}: {
	segments: TranscriptSegment[];
	totalDuration: number;
}): TranscriptSegment[] {
	return segments
		.map((segment) => {
			const normalizedText = segment.text.trim();
			if (!normalizedText) return null;
			const clampedRange = clampIntervalToDuration({
				startTime: segment.startTime,
				endTime: segment.endTime,
				totalDuration,
			});
			if (!clampedRange) return null;
			return {
				startTime: clampedRange.startTime,
				endTime: clampedRange.endTime,
				text: normalizedText,
			} satisfies TranscriptSegment;
		})
		.filter((segment): segment is TranscriptSegment => segment !== null);
}

function normalizeTranscriptWords({
	words,
	totalDuration,
}: {
	words: TranscriptWord[];
	totalDuration: number;
}): TranscriptWord[] {
	return words
		.map((word) => {
			const normalizedText = word.text.trim();
			if (!normalizedText) return null;
			const clampedRange = clampIntervalToDuration({
				startTime: word.startTime,
				endTime: word.endTime,
				totalDuration,
			});
			if (!clampedRange) return null;
			return {
				startTime: clampedRange.startTime,
				endTime: clampedRange.endTime,
				text: normalizedText,
			} satisfies TranscriptWord;
		})
		.filter((word): word is TranscriptWord => word !== null);
}

function getTranscriptBounds({
	segments,
	words,
}: Pick<TranscriptContext, "segments" | "words">): {
	minStart: number;
	maxEnd: number;
} | null {
	const starts: number[] = [];
	const ends: number[] = [];

	for (const segment of segments) {
		starts.push(segment.startTime);
		ends.push(segment.endTime);
	}
	for (const word of words) {
		starts.push(word.startTime);
		ends.push(word.endTime);
	}

	if (starts.length === 0 || ends.length === 0) {
		return null;
	}

	return {
		minStart: Math.min(...starts),
		maxEnd: Math.max(...ends),
	};
}

function isTranscriptAlignedWithTimeline({
	context,
	totalDuration,
}: {
	context: Pick<TranscriptContext, "segments" | "words">;
	totalDuration: number;
}): boolean {
	if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
		return false;
	}

	const bounds = getTranscriptBounds(context);
	if (!bounds) {
		return false;
	}

	if (
		bounds.minStart >
		totalDuration + TRANSCRIPT_ALIGNMENT_TOLERANCE_SECONDS
	) {
		return false;
	}
	if (bounds.maxEnd > totalDuration + TRANSCRIPT_ALIGNMENT_TOLERANCE_SECONDS) {
		return false;
	}

	return true;
}

async function buildWhisperTranscriptContext({
	tracks,
	signal,
}: {
	tracks: TimelineTrack[];
	signal?: AbortSignal;
}): Promise<TranscriptContext | null> {
	throwIfExecutionCancelled(signal);
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
	throwIfExecutionCancelled(signal);
	const { samples, sampleRate } = await decodeAudioToFloat32({ audioBlob });
	if (samples.length === 0) {
		return null;
	}

	const handleAbort = () => {
		transcriptionService.cancel();
	};
	if (signal) {
		signal.addEventListener("abort", handleAbort, { once: true });
	}
	let transcription: Awaited<
		ReturnType<typeof transcriptionService.transcribe>
	>;
	try {
		transcription = await transcriptionService.transcribe({
			audioData: samples,
			sampleRate,
			language: "auto",
		});
	} finally {
		if (signal) {
			signal.removeEventListener("abort", handleAbort);
		}
	}
	throwIfExecutionCancelled(signal);

	const segments = normalizeTranscriptSegments({
		segments: transcription.segments.map((segment) => ({
			startTime: segment.start,
			endTime: segment.end,
			text: segment.text,
		})),
		totalDuration,
	});

	const words = normalizeTranscriptWords({
		words: transcription.words.map((word) => ({
			startTime: word.start,
			endTime: word.end,
			text: word.text,
		})),
		totalDuration,
	});

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
	signal,
}: {
	tracks: TimelineTrack[];
	signal?: AbortSignal;
}): Promise<TranscriptContext> {
	throwIfExecutionCancelled(signal);
	const editor = EditorCore.getInstance();
	const activeProject = editor.project.getActive();
	const projectId = activeProject?.metadata.id ?? "unknown-project";

	const cacheKey = buildTranscriptCacheKey({ projectId, tracks });
	let cached = transcriptContextCache.get(cacheKey) ?? null;
	if (!cached) {
		cached = await getPersistedTranscriptCacheEntry({ cacheKey });
		if (cached) {
			transcriptContextCache.set(cacheKey, cached);
		}
	}
	if (
		cached &&
		(cached.context.segments.length > 0 || cached.context.words.length > 0)
	) {
		return cached.context;
	}
	if (cached) {
		transcriptContextCache.delete(cacheKey);
		removePersistedTranscriptCacheEntry({ cacheKey });
	}

	const captionSegments = collectCaptionSegmentsFromTimeline({ tracks });
	const captionWords = buildWordsFromSegments(captionSegments);
	const totalDuration = getTracksDuration(tracks);

	let context: TranscriptContext = {
		segments: captionSegments,
		words: captionWords,
		source: captionSegments.length > 0 ? "captions" : "none",
	};

	const lastResult = transcriptionService.getLastResult();
	const memorySegments: TranscriptSegment[] = lastResult
		? lastResult.segments.map((segment) => ({
				startTime: segment.start,
				endTime: segment.end,
				text: segment.text,
			}))
		: [];
	const memoryWords: TranscriptWord[] = lastResult
		? lastResult.words.map((word) => ({
				startTime: word.start,
				endTime: word.end,
				text: word.text,
			}))
		: [];
	const hasMemoryTranscript =
		memorySegments.length > 0 || memoryWords.length > 0;
	const canUseMemoryTranscript =
		hasMemoryTranscript &&
		isTranscriptAlignedWithTimeline({
			context: {
				segments: memorySegments,
				words: memoryWords,
			},
			totalDuration,
		});

	if (canUseMemoryTranscript) {
		const normalizedSegments = normalizeTranscriptSegments({
			segments: memorySegments,
			totalDuration,
		});
		const normalizedWords = normalizeTranscriptWords({
			words: memoryWords,
			totalDuration,
		});

		if (normalizedSegments.length > 0 || normalizedWords.length > 0) {
			context = {
				segments: normalizedSegments,
				words: normalizedWords,
				source: "whisper",
			};
		}
	} else {
		try {
			const whisperContext = await buildWhisperTranscriptContext({
				tracks,
				signal,
			});
			if (whisperContext) {
				context = whisperContext;
			} else if (captionSegments.length > 0 && captionWords.length > 0) {
				context = {
					segments: captionSegments,
					words: captionWords,
					source: "mixed",
				};
			}
		} catch {
			if (captionSegments.length > 0 && captionWords.length > 0) {
				context = {
					segments: captionSegments,
					words: captionWords,
					source: "mixed",
				};
			}
		}
	}
	throwIfExecutionCancelled(signal);

	if (context.segments.length > 0 || context.words.length > 0) {
		const entry = {
			cacheKey,
			context,
			updatedAt: new Date().toISOString(),
		};
		transcriptContextCache.set(cacheKey, entry);
		persistTranscriptCacheEntry(entry);
	} else {
		removePersistedTranscriptCacheEntry({ cacheKey });
	}

	return context;
}

function assignRanks(segments: ScoredSegment[]): ScoredSegment[] {
	return [...segments]
		.sort((a, b) => b.combinedScore - a.combinedScore)
		.map((segment, index) => ({
			...segment,
			rank: index + 1,
		}));
}

function stripSegmentThumbnail(segment: ScoredSegment): ScoredSegment {
	const { thumbnailDataUrl: _thumbnailDataUrl, ...rest } = segment;
	return rest;
}

function stripSegmentThumbnails(segments: ScoredSegment[]): ScoredSegment[] {
	return segments.map(stripSegmentThumbnail);
}

function getScoringWeights({
	hasSemantic,
	hasVisual,
}: {
	hasSemantic: boolean;
	hasVisual: boolean;
}): ScoringWeights {
	if (hasSemantic && hasVisual) {
		return DEFAULT_SCORING_WEIGHTS;
	}

	if (hasSemantic && !hasVisual) {
		return {
			rule: 0.5,
			semantic: 0.5,
			visual: 0,
		};
	}

	if (!hasSemantic && hasVisual) {
		return {
			rule: 0.7,
			semantic: 0,
			visual: 0.3,
		};
	}

	return {
		rule: 1,
		semantic: 0,
		visual: 0,
	};
}

interface TimelinePlacement {
	timelineStartTime: number;
	timelineEndTime: number;
	sourceStartTime: number;
}

function createTimelineToAssetMapper({
	tracks,
	assetId,
}: {
	tracks: TimelineTrack[];
	assetId: string;
}): (timelineTime: number) => number {
	const placements = tracks
		.flatMap((track) =>
			track.elements
				.filter(
					(element): element is Extract<TimelineElement, { type: "video" }> =>
						element.type === "video" && element.mediaId === assetId,
				)
				.map(
					(element) =>
						({
							timelineStartTime: element.startTime,
							timelineEndTime: element.startTime + element.duration,
							sourceStartTime: element.trimStart ?? 0,
						}) satisfies TimelinePlacement,
				),
		)
		.sort((a, b) => a.timelineStartTime - b.timelineStartTime);

	if (placements.length === 0) {
		return (timelineTime: number) => Math.max(0, timelineTime);
	}

	return (timelineTime: number) => {
		const containing = placements.find(
			(placement) =>
				timelineTime >= placement.timelineStartTime &&
				timelineTime <= placement.timelineEndTime,
		);

		const chosen =
			containing ??
			placements.reduce((nearest, placement) => {
				const nearestDistance = Math.abs(
					nearest.timelineStartTime - timelineTime,
				);
				const placementDistance = Math.abs(
					placement.timelineStartTime - timelineTime,
				);
				return placementDistance < nearestDistance ? placement : nearest;
			}, placements[0]);

		const relative = timelineTime - chosen.timelineStartTime;
		return Math.max(0, chosen.sourceStartTime + Math.max(0, relative));
	};
}

interface FrameExtractor {
	video: HTMLVideoElement;
	objectUrl: string;
}

async function createFrameExtractor(
	file: File,
): Promise<FrameExtractor | null> {
	const video = document.createElement("video");
	const objectUrl = URL.createObjectURL(file);
	video.muted = true;
	video.preload = "auto";

	try {
		await new Promise<void>((resolve, reject) => {
			const timeoutId = setTimeout(
				() => reject(new Error("Video load timeout (30s)")),
				30_000,
			);
			video.addEventListener(
				"canplay",
				() => {
					clearTimeout(timeoutId);
					resolve();
				},
				{ once: true },
			);
			video.addEventListener(
				"error",
				() => {
					clearTimeout(timeoutId);
					reject(
						new Error(`Video load error: ${video.error?.message ?? "unknown"}`),
					);
				},
				{ once: true },
			);
			video.src = objectUrl;
		});
		console.debug(
			`[highlight] Video loaded: ${video.videoWidth}x${video.videoHeight}, duration=${video.duration.toFixed(2)}s`,
		);
		return { video, objectUrl };
	} catch (error) {
		console.warn("[highlight] Failed to create frame extractor:", error);
		URL.revokeObjectURL(objectUrl);
		return null;
	}
}

function destroyFrameExtractor(extractor: FrameExtractor): void {
	URL.revokeObjectURL(extractor.objectUrl);
	extractor.video.removeAttribute("src");
	extractor.video.load();
}

async function captureFrameAt(
	extractor: FrameExtractor,
	time: number,
): Promise<HTMLCanvasElement | null> {
	const { video } = extractor;
	const clamped = Math.min(Math.max(0, time), video.duration || 0);

	try {
		video.currentTime = clamped;
		await new Promise<void>((resolve, reject) => {
			const timeoutId = setTimeout(
				() => reject(new Error("Seek timeout (10s)")),
				10_000,
			);
			video.addEventListener(
				"seeked",
				() => {
					clearTimeout(timeoutId);
					resolve();
				},
				{ once: true },
			);
		});

		const sourceW = video.videoWidth || 640;
		const sourceH = video.videoHeight || 360;
		const scale = Math.min(
			1,
			MAX_HIGHLIGHT_FRAME_WIDTH / Math.max(1, sourceW),
			MAX_HIGHLIGHT_FRAME_HEIGHT / Math.max(1, sourceH),
		);
		const w = Math.max(1, Math.round(sourceW * scale));
		const h = Math.max(1, Math.round(sourceH * scale));
		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;

		ctx.drawImage(video, 0, 0, w, h);
		return canvas;
	} catch (error) {
		console.warn(
			`[highlight] captureFrameAt(${time.toFixed(2)}s) failed:`,
			error,
		);
		return null;
	}
}

function isCanvasBlank(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
	try {
		const ctx =
			"getContext" in canvas
				? (canvas as HTMLCanvasElement).getContext("2d")
				: (canvas as OffscreenCanvas).getContext("2d");
		if (!ctx) return true;
		const w = Math.min(canvas.width, 64);
		const h = Math.min(canvas.height, 64);
		if (w === 0 || h === 0) return true;
		const data = ctx.getImageData(0, 0, w, h).data;
		let nonZero = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (data[i] > 5 || data[i + 1] > 5 || data[i + 2] > 5) {
				nonZero++;
			}
		}
		return nonZero < w * h * 0.01;
	} catch {
		return false;
	}
}

async function extractFrameDataUrl({
	extractor,
	timelineTime,
	timelineToAssetTime,
}: {
	extractor: FrameExtractor;
	timelineTime: number;
	timelineToAssetTime: (timelineTime: number) => number;
}): Promise<string | null> {
	const assetTime = timelineToAssetTime(timelineTime);

	const canvas = await captureFrameAt(extractor, assetTime);
	if (!canvas) {
		console.warn(
			`[highlight] No frame at tl=${timelineTime.toFixed(2)} asset=${assetTime.toFixed(2)}`,
		);
		return null;
	}

	const blank = isCanvasBlank(canvas);
	console.debug(
		`[highlight] Frame: tl=${timelineTime.toFixed(2)} asset=${assetTime.toFixed(2)} ${canvas.width}x${canvas.height} blank=${blank}`,
	);

	if (blank) return null;

	const encoded = await encodeCanvasAsJpeg({ canvas, quality: 0.8 });
	canvas.width = 1;
	canvas.height = 1;
	return encoded.dataUrl;
}

interface TimeRange {
	start: number;
	end: number;
}

function mergeRanges(ranges: TimeRange[]): TimeRange[] {
	const sorted = [...ranges]
		.filter((range) => range.end > range.start)
		.sort((a, b) => a.start - b.start);

	if (sorted.length === 0) {
		return [];
	}

	const merged: TimeRange[] = [sorted[0]];
	for (let i = 1; i < sorted.length; i += 1) {
		const current = sorted[i];
		const last = merged[merged.length - 1];

		if (current.start <= last.end + SELECT_EPSILON) {
			last.end = Math.max(last.end, current.end);
			continue;
		}

		merged.push({ ...current });
	}

	return merged;
}

function complementRanges({
	totalDuration,
	keepRanges,
}: {
	totalDuration: number;
	keepRanges: TimeRange[];
}): TimeRange[] {
	const mergedKeep = mergeRanges(keepRanges);
	if (mergedKeep.length === 0) {
		return totalDuration > 0 ? [{ start: 0, end: totalDuration }] : [];
	}

	const deletes: TimeRange[] = [];
	let cursor = 0;

	for (const keep of mergedKeep) {
		if (keep.start > cursor + MIN_INTERVAL_SECONDS) {
			deletes.push({ start: cursor, end: keep.start });
		}
		cursor = Math.max(cursor, keep.end);
	}

	if (totalDuration > cursor + MIN_INTERVAL_SECONDS) {
		deletes.push({ start: cursor, end: totalDuration });
	}

	return deletes;
}

function collectElementsOverlappingRange({
	tracks,
	start,
	end,
}: {
	tracks: TimelineTrack[];
	start: number;
	end: number;
}): Array<{ trackId: string; elementId: string }> {
	const refs: Array<{ trackId: string; elementId: string }> = [];

	for (const track of tracks) {
		for (const element of track.elements) {
			const elementStart = element.startTime;
			const elementEnd = element.startTime + element.duration;
			if (
				elementEnd > start + SELECT_EPSILON &&
				elementStart < end - SELECT_EPSILON &&
				elementEnd > elementStart
			) {
				refs.push({
					trackId: track.id,
					elementId: element.id,
				});
			}
		}
	}

	return refs;
}

function updateHighlightCache({
	projectId,
	assetId,
	scoredSegments,
	highlightPlan,
	timelineFingerprint,
}: {
	projectId?: string;
	assetId?: string;
	scoredSegments?: ScoredSegment[] | null;
	highlightPlan?: HighlightPlan | null;
	timelineFingerprint?: string | null;
}): void {
	const resolvedProjectId = projectId ?? getActiveProjectId();
	const cache = getHighlightCache(resolvedProjectId);
	if (assetId !== undefined) {
		cache.assetId = assetId;
	}
	if (scoredSegments !== undefined) {
		cache.scoredSegments = scoredSegments;
	}
	if (highlightPlan !== undefined) {
		cache.highlightPlan = highlightPlan;
	}
	if (timelineFingerprint !== undefined) {
		cache.timelineFingerprint = timelineFingerprint;
	}
	cache.updatedAt = new Date().toISOString();
	persistHighlightCache({
		projectId: resolvedProjectId,
		cache,
	});
}

export const scoreHighlightsTool: AgentTool = {
	name: "score_highlights",
	description:
		"分析视频转录文本，为每个片段计算高光评分。Analyze transcript and score each segment for highlight potential.",
	parameters: {
		type: "object",
		properties: {
			videoAssetId: {
				type: "string",
				description:
					"视频素材 ID（可选，默认自动选择）(Optional video asset ID)",
			},
			segmentMinSeconds: {
				type: "number",
				description:
					"最小分段时长（秒），默认 8 (Minimum segment length in seconds)",
			},
			segmentMaxSeconds: {
				type: "number",
				description:
					"最大分段时长（秒），默认 30 (Maximum segment length in seconds)",
			},
			useLLM: {
				type: "boolean",
				description:
					"是否使用 LLM 做语义评分（默认 true）(Use LLM semantic scoring)",
			},
		},
		required: [],
	},
	execute: async (params, context): Promise<ToolResult> => {
		try {
			throwIfExecutionCancelled(context?.signal);
			await ensureHighlightCacheLoaded();
			const highlightCache = getHighlightCache();
			const { asset, tracks } = resolveVideoAsset({
				videoAssetId:
					typeof params.videoAssetId === "string"
						? params.videoAssetId
						: undefined,
			});
			const timelineFingerprint = buildTimelineFingerprint(tracks);

			context?.reportProgress?.({
				message: "正在准备转录上下文...",
			});
			const transcriptContext = await getTranscriptContext({
				tracks,
				signal: context?.signal,
			});
			throwIfExecutionCancelled(context?.signal);
			if (transcriptContext.segments.length === 0) {
				return {
					success: false,
					message:
						"未获取到可用转录文本，请先生成字幕或检查音频 (No transcript context available)",
					data: { errorCode: "NO_TRANSCRIPT" },
				};
			}

			const segmentMinSeconds = clamp(
				toNumberOrDefault(
					params.segmentMinSeconds,
					DEFAULT_HIGHLIGHT_SEGMENT_MIN_SECONDS,
				),
				2,
				120,
			);
			const segmentMaxSeconds = clamp(
				toNumberOrDefault(
					params.segmentMaxSeconds,
					DEFAULT_HIGHLIGHT_SEGMENT_MAX_SECONDS,
				),
				segmentMinSeconds + 1,
				180,
			);
			const useLLM = toBooleanOrDefault(params.useLLM, true);

			context?.reportProgress?.({
				message: "正在切分候选片段...",
			});
			const chunks = transcriptAnalyzerService.segmentTranscript(
				transcriptContext,
				{
					minSeconds: segmentMinSeconds,
					maxSeconds: segmentMaxSeconds,
				},
			);

			if (chunks.length === 0) {
				return {
					success: false,
					message: "分段结果为空，无法评分 (No transcript chunks to score)",
					data: { errorCode: "NO_CHUNKS" },
				};
			}

			let scoredSegments: ScoredSegment[] = chunks.map((chunk) => {
				const ruleScores = transcriptAnalyzerService.computeRuleScores(
					chunk,
					transcriptContext.words,
				);
				return {
					chunk,
					ruleScores,
					semanticScores: null,
					visualScores: null,
					combinedScore: highlightScorerService.computeCombinedScore(
						ruleScores,
						null,
						null,
						getScoringWeights({ hasSemantic: false, hasVisual: false }),
					),
					rank: 0,
				} satisfies ScoredSegment;
			});

			let semanticScoresMap = new Map<number, SemanticScores>();
			let llmDiagnostics: {
				totalBlocks: number;
				failedBlocks: number;
				failedSamples: string[];
				allFailed: boolean;
			} | null = null;
			let llmMode: "enabled" | "disabled" | "unavailable" = useLLM
				? "enabled"
				: "disabled";

			if (useLLM) {
				const provider = createLocalProvider();
				const available = await provider.isAvailable();

				if (available) {
					context?.reportProgress?.({
						message: "正在进行语义评分...",
					});
					const scoringResult = await highlightScorerService.scoreWithLLM(
						chunks,
						provider,
					);
					semanticScoresMap = scoringResult.scores;
					llmDiagnostics = scoringResult.diagnostics;
				} else {
					llmMode = "unavailable";
				}
			}
			throwIfExecutionCancelled(context?.signal);

			const hasSemantic = semanticScoresMap.size > 0;
			const weights = getScoringWeights({ hasSemantic, hasVisual: false });

			scoredSegments = scoredSegments.map((segment) => {
				const semantic = semanticScoresMap.get(segment.chunk.index) ?? null;
				return {
					...segment,
					semanticScores: semantic,
					combinedScore: highlightScorerService.computeCombinedScore(
						segment.ruleScores,
						semantic,
						null,
						weights,
					),
				};
			});

			const ranked = assignRanks(scoredSegments);
			const cleanRanked = stripSegmentThumbnails(ranked);
			updateHighlightCache({
				assetId: asset.id,
				scoredSegments: cleanRanked,
				highlightPlan: null,
				timelineFingerprint,
			});

			return {
				success: true,
				message: `完成 ${ranked.length} 段高光评分${
					hasSemantic
						? "（含语义增强）"
						: llmMode === "unavailable"
							? "（LLM 不可用，已降级规则评分）"
							: llmDiagnostics?.allFailed
								? "（LLM 调用全部失败，已降级规则评分）"
								: "（规则评分）"
				}`,
				data: {
					assetId: asset.id,
					transcriptSource: transcriptContext.source,
					segmentCount: cleanRanked.length,
					hasSemantic,
					llmMode,
					llmDiagnostics,
					weights,
					topSegments: cleanRanked.slice(0, 10),
					segments: cleanRanked,
					cachedAt: highlightCache.updatedAt,
					timelineFingerprint: highlightCache.timelineFingerprint,
				},
			};
		} catch (error) {
			if (isExecutionCancelledError(error)) {
				return {
					success: false,
					message: "高光评分已取消 (Highlight scoring cancelled)",
					data: { errorCode: EXECUTION_CANCELLED_ERROR_CODE },
				};
			}
			return {
				success: false,
				message: `高光评分失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "SCORE_HIGHLIGHTS_FAILED" },
			};
		}
	},
};

export const validateHighlightsVisualTool: AgentTool = {
	name: "validate_highlights_visual",
	description:
		"对候选高光片段做视觉质量验证（VLM 帧分析）。Validate highlight candidates with visual frame analysis.",
	parameters: {
		type: "object",
		properties: {
			videoAssetId: {
				type: "string",
				description: "视频素材 ID（可选）(Optional video asset ID)",
			},
			topN: {
				type: "number",
				description: "验证前 N 个候选段（默认 15）(Top N candidates)",
			},
			frameConcurrency: {
				type: "number",
				description:
					"关键帧提取并发度，默认 4，范围 1-8 (Frame extraction concurrency)",
			},
		},
		required: [],
	},
	execute: async (params, context): Promise<ToolResult> => {
		try {
			throwIfExecutionCancelled(context?.signal);
			await ensureHighlightCacheLoaded();
			const highlightCache = getHighlightCache();
			const cachedSegments = highlightCache.scoredSegments;
			if (!cachedSegments || cachedSegments.length === 0) {
				return {
					success: false,
					message:
						"请先执行 score_highlights 生成候选段 (Run score_highlights first)",
					data: { errorCode: "HIGHLIGHT_CACHE_MISSING" },
				};
			}

			const { asset, tracks } = resolveVideoAsset({
				videoAssetId:
					typeof params.videoAssetId === "string"
						? params.videoAssetId
						: undefined,
			});
			const timelineFingerprint = buildTimelineFingerprint(tracks);
			if (isHighlightCacheStale({ tracks, cache: highlightCache })) {
				updateHighlightCache({
					assetId: asset.id,
					scoredSegments: null,
					highlightPlan: null,
					timelineFingerprint,
				});
				return {
					success: false,
					message: "时间线已变化，缓存评分已失效，请重新执行 score_highlights",
					data: {
						errorCode: "HIGHLIGHT_CACHE_STALE",
						timelineFingerprint,
					},
				};
			}

			const topN = Math.max(
				1,
				Math.floor(
					toNumberOrDefault(params.topN, DEFAULT_HIGHLIGHT_TOP_N_VISUAL),
				),
			);
			const frameConcurrency = clamp(
				Math.floor(
					toNumberOrDefault(
						params.frameConcurrency,
						DEFAULT_HIGHLIGHT_FRAME_EXTRACTION_CONCURRENCY,
					),
				),
				1,
				8,
			);

			const provider = createLocalProvider();
			const providerAvailable = await provider.isAvailable();

			if (!providerAvailable) {
				const cleanCachedSegments = stripSegmentThumbnails(cachedSegments);
				return {
					success: true,
					message:
						"LM Studio 不可用，跳过视觉验证并保留当前评分 (Provider unavailable, visual validation skipped)",
					data: {
						assetId: asset.id,
						topN,
						validatedCount: 0,
						hasVisual: false,
						segments: cleanCachedSegments,
						timelineFingerprint,
					},
				};
			}

			const ranked = [...cachedSegments].sort(
				(a, b) => b.combinedScore - a.combinedScore,
			);
			const topCandidates = ranked.slice(0, topN);
			const timelineToAsset = createTimelineToAssetMapper({
				tracks,
				assetId: asset.id,
			});

			const extractor = asset.file
				? await createFrameExtractor(asset.file)
				: null;

			let candidatesWithFrames: ScoredSegment[];
			try {
				context?.reportProgress?.({
					message: "正在提取关键帧...",
				});
				candidatesWithFrames = extractor
					? await mapWithConcurrency({
							items: topCandidates,
							limit: frameConcurrency,
							worker: async (candidate) => {
								throwIfExecutionCancelled(context?.signal);
								const center =
									(candidate.chunk.startTime + candidate.chunk.endTime) / 2;
								const dataUrl = await extractFrameDataUrl({
									extractor,
									timelineTime: center,
									timelineToAssetTime: timelineToAsset,
								});
								return {
									...candidate,
									thumbnailDataUrl: dataUrl ?? undefined,
								} satisfies ScoredSegment;
							},
						})
					: topCandidates.map((c) => ({ ...c }));
			} finally {
				if (extractor) destroyFrameExtractor(extractor);
			}
			throwIfExecutionCancelled(context?.signal);

			context?.reportProgress?.({
				message: "正在进行视觉评分...",
			});
			const visualMap = await highlightScorerService.scoreWithVision(
				candidatesWithFrames,
				topN,
				provider,
			);
			throwIfExecutionCancelled(context?.signal);

			const hasSemantic = cachedSegments.some(
				(segment) => segment.semanticScores !== null,
			);
			const hasVisual = visualMap.size > 0;
			const weights = getScoringWeights({ hasSemantic, hasVisual });

			const mergedByIndex = new Map<number, ScoredSegment>();
			for (const segment of cachedSegments) {
				mergedByIndex.set(segment.chunk.index, segment);
			}

			for (const candidate of candidatesWithFrames) {
				mergedByIndex.set(
					candidate.chunk.index,
					stripSegmentThumbnail(candidate),
				);
			}

			const rescored = Array.from(mergedByIndex.values()).map((segment) => {
				const visualScores: VisualScores | null =
					visualMap.get(segment.chunk.index) ?? segment.visualScores ?? null;

				return {
					...segment,
					visualScores,
					combinedScore: highlightScorerService.computeCombinedScore(
						segment.ruleScores,
						segment.semanticScores,
						visualScores,
						weights,
					),
				};
			});

			const reranked = assignRanks(rescored);
			const cleanReranked = stripSegmentThumbnails(reranked);
			updateHighlightCache({
				assetId: asset.id,
				scoredSegments: cleanReranked,
				timelineFingerprint,
			});

			for (const candidate of candidatesWithFrames) {
				delete candidate.thumbnailDataUrl;
			}

			return {
				success: true,
				message: `已完成 ${visualMap.size} 段视觉验证并更新综合评分`,
				data: {
					assetId: asset.id,
					topN,
					validatedCount: visualMap.size,
					hasVisual,
					weights,
					topSegments: cleanReranked.slice(0, 10),
					segments: cleanReranked,
					cachedAt: highlightCache.updatedAt,
					timelineFingerprint: highlightCache.timelineFingerprint,
				},
			};
		} catch (error) {
			if (isExecutionCancelledError(error)) {
				return {
					success: false,
					message: "视觉验证已取消 (Visual validation cancelled)",
					data: { errorCode: EXECUTION_CANCELLED_ERROR_CODE },
				};
			}
			return {
				success: false,
				message: `视觉验证失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "VALIDATE_HIGHLIGHTS_VISUAL_FAILED" },
			};
		}
	},
};

export const generateHighlightPlanTool: AgentTool = {
	name: "generate_highlight_plan",
	description:
		"根据评分结果生成精华剪辑计划。Generate a highlight reel plan from scored segments.",
	parameters: {
		type: "object",
		properties: {
			targetDuration: {
				type: "number",
				description: "目标时长（秒），默认 60 (Target duration in seconds)",
			},
			tolerance: {
				type: "number",
				description: "时长容差比例，默认 0.15 (Duration tolerance ratio)",
			},
			includeHook: {
				type: "boolean",
				description:
					"是否优先包含强 Hook 段（默认 true）(Prefer strong hook segment)",
			},
		},
		required: [],
	},
	execute: async (params, context): Promise<ToolResult> => {
		try {
			throwIfExecutionCancelled(context?.signal);
			await ensureHighlightCacheLoaded();
			const highlightCache = getHighlightCache();
			const scoredSegments = highlightCache.scoredSegments;
			if (!scoredSegments || scoredSegments.length === 0) {
				return {
					success: false,
					message:
						"请先执行 score_highlights 获取评分结果 (Run score_highlights first)",
					data: { errorCode: "HIGHLIGHT_CACHE_MISSING" },
				};
			}
			const editor = EditorCore.getInstance();
			const tracks = editor.timeline.getTracks();
			const timelineFingerprint = buildTimelineFingerprint(tracks);
			if (isHighlightCacheStale({ tracks, cache: highlightCache })) {
				updateHighlightCache({
					scoredSegments: null,
					highlightPlan: null,
					timelineFingerprint,
				});
				return {
					success: false,
					message: "时间线已变化，缓存评分已失效，请重新执行 score_highlights",
					data: {
						errorCode: "HIGHLIGHT_CACHE_STALE",
						timelineFingerprint,
					},
				};
			}

			const targetDuration =
				toNumberOrDefault(
					params.targetDuration,
					DEFAULT_HIGHLIGHT_TARGET_DURATION,
				) > 0
					? toNumberOrDefault(
							params.targetDuration,
							DEFAULT_HIGHLIGHT_TARGET_DURATION,
						)
					: DEFAULT_HIGHLIGHT_TARGET_DURATION;
			const tolerance = clamp(
				toNumberOrDefault(
					params.tolerance,
					DEFAULT_HIGHLIGHT_DURATION_TOLERANCE,
				),
				0,
				0.5,
			);
			const includeHook = toBooleanOrDefault(params.includeHook, true);
			context?.reportProgress?.({
				message: "正在生成精华计划...",
			});

			const plan = segmentSelectorService.selectSegments(
				scoredSegments,
				targetDuration,
				tolerance,
				{
					includeHook,
				},
			);

			if (plan.segments.length === 0) {
				return {
					success: false,
					message: "未选出可执行的精华片段，请调整参数后重试",
					data: { errorCode: "EMPTY_PLAN" },
				};
			}

			updateHighlightCache({ highlightPlan: plan, timelineFingerprint });

			return {
				success: true,
				message: `已生成精华计划：${plan.segments.length} 段，${plan.actualDuration.toFixed(2)} 秒`,
				data: {
					plan,
					cachedAt: highlightCache.updatedAt,
					timelineFingerprint: highlightCache.timelineFingerprint,
				},
			};
		} catch (error) {
			if (isExecutionCancelledError(error)) {
				return {
					success: false,
					message: "精华计划生成已取消 (Highlight plan cancelled)",
					data: { errorCode: EXECUTION_CANCELLED_ERROR_CODE },
				};
			}
			return {
				success: false,
				message: `生成精华计划失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "GENERATE_HIGHLIGHT_PLAN_FAILED" },
			};
		}
	},
};

export const applyHighlightCutTool: AgentTool = {
	name: "apply_highlight_cut",
	description:
		"将精华剪辑计划应用到时间线（删除非选中区间）。Apply highlight plan to timeline by removing non-selected intervals.",
	parameters: {
		type: "object",
		properties: {
			addCaptions: {
				type: "boolean",
				description:
					"是否追加生成字幕（默认 false）(Generate captions after cutting)",
			},
			removeSilence: {
				type: "boolean",
				description:
					"是否追加静音删除（默认 false）(Remove silence after cutting)",
			},
		},
		required: [],
	},
	execute: async (params, context): Promise<ToolResult> => {
		try {
			throwIfExecutionCancelled(context?.signal);
			await ensureHighlightCacheLoaded();
			const highlightCache = getHighlightCache();
			const plan = highlightCache.highlightPlan;
			if (!plan || plan.segments.length === 0) {
				return {
					success: false,
					message:
						"请先执行 generate_highlight_plan 并确认计划 (Generate highlight plan first)",
					data: { errorCode: "HIGHLIGHT_PLAN_MISSING" },
				};
			}

			const addCaptions = toBooleanOrDefault(params.addCaptions, false);
			const removeSilence = toBooleanOrDefault(params.removeSilence, false);

			const editor = EditorCore.getInstance();
			const tracksSnapshot = editor.timeline.getTracks();
			const timelineFingerprint = buildTimelineFingerprint(tracksSnapshot);
			if (
				isHighlightCacheStale({
					tracks: tracksSnapshot,
					cache: highlightCache,
				})
			) {
				updateHighlightCache({
					scoredSegments: null,
					highlightPlan: null,
					timelineFingerprint,
				});
				return {
					success: false,
					message:
						"时间线已变化，缓存计划已失效，请重新执行 score_highlights 和 generate_highlight_plan",
					data: {
						errorCode: "HIGHLIGHT_PLAN_STALE",
						timelineFingerprint,
					},
				};
			}

			const totalDuration = calculateTotalDuration({ tracks: tracksSnapshot });

			const keepRanges = mergeRanges(
				plan.segments
					.map((segment) => ({
						start: Math.max(0, segment.chunk.startTime),
						end: Math.min(totalDuration, segment.chunk.endTime),
					}))
					.filter((range) => range.end - range.start >= MIN_INTERVAL_SECONDS),
			);

			if (keepRanges.length === 0) {
				return {
					success: false,
					message:
						"精华计划区间无效（超出时间线或长度过短），请重新生成计划 (Invalid keep ranges)",
					data: {
						errorCode: "HIGHLIGHT_KEEP_RANGES_INVALID",
						totalDurationBefore: Number(totalDuration.toFixed(4)),
					},
				};
			}

			const keepElementRefs = keepRanges.flatMap((range) =>
				collectElementsOverlappingRange({
					tracks: tracksSnapshot,
					start: range.start,
					end: range.end,
				}),
			);
			if (keepElementRefs.length === 0) {
				return {
					success: false,
					message:
						"精华计划未命中任何时间线片段，请重新评分或调整目标时长 (No elements matched keep ranges)",
					data: {
						errorCode: "HIGHLIGHT_KEEP_RANGES_NO_MATCH",
						keepRanges,
						totalDurationBefore: Number(totalDuration.toFixed(4)),
					},
				};
			}

			const deleteRanges = complementRanges({ totalDuration, keepRanges })
				.filter((range) => range.end - range.start >= MIN_INTERVAL_SECONDS)
				.sort((a, b) => b.start - a.start);
			const totalDeletedDuration = deleteRanges.reduce(
				(sum, range) => sum + (range.end - range.start),
				0,
			);
			const expectedDuration = Math.max(
				0,
				totalDuration - totalDeletedDuration,
			);

			let deletedRangeCount = 0;
			let deletedElementCount = 0;

			const splitTimes = Array.from(
				new Set(
					deleteRanges
						.flatMap((range) => [range.start, range.end])
						.map((time) => Number(time.toFixed(4))),
				),
			).sort((a, b) => b - a);

			const splitResult = splitTracksAtTimes({
				tracks: tracksSnapshot,
				splitTimes,
			});
			context?.reportProgress?.({
				message: "正在应用剪辑区间...",
			});
			let workingTracks = splitResult.tracks;
			for (const range of deleteRanges) {
				const deleteResult = deleteElementsFullyInRange({
					tracks: workingTracks,
					range,
					epsilon: SELECT_EPSILON,
				});
				workingTracks = deleteResult.tracks;
				if (deleteResult.deletedCount === 0) {
					continue;
				}
				deletedRangeCount += 1;
				deletedElementCount += deleteResult.deletedCount;
			}

			const ripple = rippleCompressTracks({
				tracks: workingTracks,
				deleteRanges,
				epsilon: SELECT_EPSILON,
			});
			throwIfExecutionCancelled(context?.signal);
			const finalTracks = ripple.tracks;
			const finalDuration = calculateTotalDuration({ tracks: finalTracks });
			const remainingElementCount = finalTracks.reduce(
				(sum, track) => sum + track.elements.length,
				0,
			);
			if (
				finalDuration <= MIN_INTERVAL_SECONDS ||
				remainingElementCount === 0
			) {
				return {
					success: false,
					message:
						"剪辑结果会清空时间线，请降低 targetDuration 或重新生成计划 (Cut would empty timeline)",
					data: {
						errorCode: "HIGHLIGHT_CUT_EMPTIED_TIMELINE",
						deleteRanges,
						keepRanges,
						totalDurationBefore: Number(totalDuration.toFixed(4)),
						expectedDuration: Number(expectedDuration.toFixed(4)),
						finalDuration: Number(finalDuration.toFixed(4)),
					},
				};
			}
			const durationChanged =
				totalDeletedDuration <= MIN_INTERVAL_SECONDS ||
				finalDuration <= totalDuration - MIN_INTERVAL_SECONDS;
			if (!durationChanged) {
				const debugSummary =
					`before=${totalDuration.toFixed(2)}s, ` +
					`expected=${expectedDuration.toFixed(2)}s, ` +
					`final=${finalDuration.toFixed(2)}s, ` +
					`deleteRanges=${deleteRanges.length}, ` +
					`deletedDuration=${totalDeletedDuration.toFixed(2)}s, ` +
					`rippleMoved=${ripple.movedElementCount}`;
				return {
					success: false,
					message:
						`剪辑未实际缩短时间线，请检查候选区间或重试。${debugSummary} ` +
						"(Cut applied but timeline duration did not change)",
					data: {
						errorCode: "HIGHLIGHT_CUT_NO_EFFECT",
						deleteRanges,
						totalDurationBefore: Number(totalDuration.toFixed(4)),
						expectedDuration: Number(expectedDuration.toFixed(4)),
						finalDuration: Number(finalDuration.toFixed(4)),
						deletedRangeCount,
						splitCount: splitResult.splitCount,
					},
				};
			}

			editor.timeline.replaceTracks({
				tracks: finalTracks,
				selection: null,
			});

			const followUps: Array<{
				step: string;
				success: boolean;
				message: string;
			}> = [];

			if (addCaptions) {
				context?.reportProgress?.({
					message: "正在生成字幕...",
				});
				const captionResult = await generateCaptionsTool.execute(
					{
						source: "timeline",
					},
					context,
				);
				followUps.push({
					step: "generate_captions",
					success: captionResult.success,
					message: captionResult.message,
				});
			}

			if (removeSilence) {
				context?.reportProgress?.({
					message: "正在执行静音删除...",
				});
				const silenceResult = await removeSilenceTool.execute(
					{
						source: "timeline",
					},
					context,
				);
				followUps.push({
					step: "remove_silence",
					success: silenceResult.success,
					message: silenceResult.message,
				});
			}

			const followUpFailed = followUps.some((item) => !item.success);

			return {
				success: !followUpFailed,
				message: followUpFailed
					? "精华剪辑已应用，但后处理步骤存在失败，请查看详情"
					: `精华剪辑已应用，删除区间 ${deletedRangeCount} 个，` +
						`时长 ${totalDuration.toFixed(2)}s → ${finalDuration.toFixed(2)}s ` +
						`(expected ${expectedDuration.toFixed(2)}s)，` +
						`rippleMoved=${ripple.movedElementCount}`,
				data: {
					deleteRanges,
					splitTimes,
					deletedRangeCount,
					deletedElementCount,
					splitCount: splitResult.splitCount,
					totalDurationBefore: Number(totalDuration.toFixed(4)),
					expectedDuration: Number(expectedDuration.toFixed(4)),
					finalDuration: Number(finalDuration.toFixed(4)),
					rippleMovedElementCount: ripple.movedElementCount,
					followUps,
					plan,
					timelineFingerprint: highlightCache.timelineFingerprint,
				},
			};
		} catch (error) {
			if (isExecutionCancelledError(error)) {
				return {
					success: false,
					message: "应用精华剪辑已取消 (Highlight cut cancelled)",
					data: { errorCode: EXECUTION_CANCELLED_ERROR_CODE },
				};
			}
			return {
				success: false,
				message: `应用精华剪辑失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "APPLY_HIGHLIGHT_CUT_FAILED" },
			};
		}
	},
};

export function __resetHighlightToolCachesForTests(): void {
	highlightCacheStore.clear();
	transcriptContextCache.clear();
	hydratedHighlightCacheProjects.clear();
	clearPersistedAgentCacheDatabase();
}

export function getHighlightTools(): AgentTool[] {
	return [
		scoreHighlightsTool,
		validateHighlightsVisualTool,
		generateHighlightPlanTool,
		applyHighlightCutTool,
	];
}
