import type { AgentTool, ToolResult } from "../types";
import type { CreateTimelineElement } from "@/types/timeline";
import type { SoundEffect } from "@/types/sounds";
import { EditorCore } from "@/core";
import {
	buildVideoElement,
	buildImageElement,
	buildUploadAudioElement,
	buildStickerElement,
	buildLibraryAudioElement,
} from "@/lib/timeline/element-utils";
import { canElementGoOnTrack } from "@/lib/timeline/track-utils";
import { RemoveMediaAssetCommand } from "@/lib/commands/media";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { processMediaAssets } from "@/lib/media/processing";
import { searchIcons } from "@/lib/iconify-api";
import { executeMutationWithUndoGuard } from "./execution-policy";
import {
	buildExecutionCancelledResult,
	isExecutionCancelled,
	throwIfExecutionCancelled,
} from "../utils/cancellation";

const MEDIA_TYPES = ["image", "video", "audio"] as const;
const FETCH_TIMEOUT_MS = 20000;
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const SOUND_SEARCH_PAGE_SIZE = 20;

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Asset Management Tools
 * Tools for listing and adding assets to the timeline
 */

/**
 * List Assets
 * Returns all assets available in the current project
 */
export const listAssetsTool: AgentTool = {
	name: "list_assets",
	description:
		"列出项目中的所有素材资源。List all assets available in the current project.",
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	execute: async (): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const assets = editor.media.getAssets();

			// Filter out ephemeral assets
			const availableAssets = assets.filter((a) => !a.ephemeral);

			if (availableAssets.length === 0) {
				return {
					success: true,
					message: "项目中没有素材资源 (No assets in project)",
					data: { assets: [], count: 0 },
				};
			}

			const assetList = availableAssets.map((asset) => ({
				id: asset.id,
				name: asset.name,
				type: asset.type,
				duration: asset.duration,
			}));

			return {
				success: true,
				message: `项目中有 ${assetList.length} 个素材资源 (${assetList.length} asset(s) available)`,
				data: {
					assets: assetList,
					count: assetList.length,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `获取素材列表失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Add Asset to Timeline
 * Adds an asset to the timeline at a specified time or current playhead position
 */
export const addAssetToTimelineTool: AgentTool = {
	name: "add_asset_to_timeline",
	description:
		"将素材添加到时间线。可指定素材ID和开始时间。Add an asset to the timeline by ID, optionally at a specific start time.",
	parameters: {
		type: "object",
		properties: {
			assetId: {
				type: "string",
				description: "素材ID (Asset ID to add)",
			},
			startTime: {
				type: "number",
				description:
					"开始时间（秒），默认为当前播放头位置 (Start time in seconds, defaults to current playhead)",
			},
			trackId: {
				type: "string",
				description: "目标轨道ID，可选 (Optional target track ID)",
			},
		},
		required: ["assetId"],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const assetId = params.assetId as string;

			if (!assetId) {
				return {
					success: false,
					message: "缺少素材ID参数 (Missing assetId parameter)",
				};
			}

			// Find the asset
			const assets = editor.media.getAssets();
			const asset = assets.find((a) => a.id === assetId);

			if (!asset) {
				return {
					success: false,
					message: `找不到素材: ${assetId} (Asset not found: ${assetId})`,
				};
			}

			if (asset.ephemeral) {
				return {
					success: false,
					message: `素材为临时资源，无法添加: ${assetId} (Asset is ephemeral and cannot be added: ${assetId})`,
				};
			}

			// Determine start time
			const startTime =
				typeof params.startTime === "number"
					? params.startTime
					: editor.playback.getCurrentTime();

			if (!Number.isFinite(startTime) || startTime < 0) {
				return {
					success: false,
					message: "无效的开始时间 (Invalid start time)",
				};
			}

			// Build element based on asset type
			const duration =
				asset.duration ?? TIMELINE_CONSTANTS.DEFAULT_ELEMENT_DURATION;
			let element: CreateTimelineElement;

			switch (asset.type) {
				case "video":
					element = buildVideoElement({
						mediaId: asset.id,
						name: asset.name,
						duration,
						startTime,
					});
					break;
				case "image":
					element = buildImageElement({
						mediaId: asset.id,
						name: asset.name,
						duration,
						startTime,
					});
					break;
				case "audio":
					element = buildUploadAudioElement({
						mediaId: asset.id,
						name: asset.name,
						duration,
						startTime,
					});
					break;
				default:
					return {
						success: false,
						message: `不支持的素材类型: ${asset.type} (Unsupported asset type)`,
					};
			}

			const requestedTrackId =
				typeof params.trackId === "string" ? params.trackId.trim() : "";
			const placement = requestedTrackId
				? { mode: "explicit" as const, trackId: requestedTrackId }
				: { mode: "auto" as const };

			if (placement.mode === "explicit") {
				const targetTrack = editor.timeline.getTrackById({
					trackId: placement.trackId,
				});
				if (!targetTrack) {
					return {
						success: false,
						message: `找不到轨道: ${placement.trackId} (Track not found: ${placement.trackId})`,
					};
				}

				if (
					!canElementGoOnTrack({
						elementType: element.type,
						trackType: targetTrack.type,
					})
				) {
					return {
						success: false,
						message: `素材类型 ${element.type} 不能放入轨道 ${targetTrack.type} (Incompatible track type)`,
					};
				}
			}

			// Insert element into timeline
			editor.timeline.insertElement({
				element,
				placement,
			});

			return {
				success: true,
				message: `已将 "${asset.name}" 添加到时间线 ${startTime.toFixed(2)} 秒处 (Added "${asset.name}" to timeline at ${startTime.toFixed(2)}s)`,
				data: {
					assetId: asset.id,
					assetName: asset.name,
					assetType: asset.type,
					startTime,
					duration,
					placementMode: placement.mode,
					trackId:
						placement.mode === "explicit" ? placement.trackId : undefined,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `添加素材失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Add Sticker
 * Searches Iconify and inserts a sticker element into the timeline
 */
export const searchStickerTool: AgentTool = {
	name: "search_sticker",
	description:
		"仅搜索贴纸，不插入时间线。返回候选 iconName 列表供后续确认。Search Iconify stickers without adding to timeline.",
	parameters: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "贴纸搜索关键词 (Sticker search query)",
			},
			limit: {
				type: "number",
				description: "返回数量，1-100，默认 20 (Result limit)",
			},
			prefixes: {
				type: "array",
				items: { type: "string" },
				description:
					'可选图标前缀过滤，如 ["mdi","tabler"] (Optional Iconify prefixes)',
			},
		},
		required: ["query"],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const query = isNonEmptyString(params.query) ? params.query.trim() : "";
			if (!query) {
				return {
					success: false,
					message: "缺少 query 参数 (Missing query)",
					data: { errorCode: "INVALID_PARAMS" },
				};
			}

			const limitValue = params.limit === undefined ? 20 : Number(params.limit);
			if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
				return {
					success: false,
					message:
						"limit 必须是 1-100 的整数 (limit must be an integer between 1 and 100)",
					data: { errorCode: "INVALID_LIMIT" },
				};
			}

			const prefixes = Array.isArray(params.prefixes)
				? params.prefixes
						.map((value) => (typeof value === "string" ? value.trim() : ""))
						.filter(Boolean)
				: undefined;

			const result = await searchIcons(query, limitValue, prefixes);
			const candidates = result.icons.map((iconName) => {
				const [prefix, name] = iconName.split(":");
				return {
					iconName,
					prefix,
					name,
					collectionName: prefix ? result.collections[prefix]?.name : undefined,
				};
			});

			return {
				success: true,
				message:
					candidates.length > 0
						? `找到 ${candidates.length} 个贴纸候选（总计 ${result.total}）(Found sticker candidates)`
						: `未找到与 "${query}" 相关的贴纸 (No sticker found for query)`,
				data: {
					query,
					count: candidates.length,
					total: result.total,
					limit: result.limit,
					start: result.start,
					candidates,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `搜索贴纸失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "SEARCH_STICKER_FAILED" },
			};
		}
	},
};

/**
 * Add Sticker
 * Searches Iconify and inserts a sticker element into the timeline
 */
export const addStickerTool: AgentTool = {
	name: "add_sticker",
	description:
		"搜索并添加贴纸到时间线。可传 iconName 直接添加，或传 query 自动选取首个结果。Search Iconify and add a sticker to timeline.",
	parameters: {
		type: "object",
		properties: {
			iconName: {
				type: "string",
				description:
					"Iconify 图标名，例如 mdi:star (Optional explicit icon name)",
			},
			query: {
				type: "string",
				description:
					"搜索关键词（未提供 iconName 时必填）(Search query if iconName is not provided)",
			},
			startTime: {
				type: "number",
				description:
					"开始时间（秒），默认为当前播放头位置 (Start time in seconds)",
			},
			trackId: {
				type: "string",
				description: "目标贴纸轨道ID（可选）(Optional sticker track ID)",
			},
			color: {
				type: "string",
				description: "贴纸颜色（可选）(Optional sticker color)",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const explicitIconName = isNonEmptyString(params.iconName)
				? params.iconName.trim()
				: "";
			const query = isNonEmptyString(params.query) ? params.query.trim() : "";

			if (!explicitIconName && !query) {
				return {
					success: false,
					message: "请提供 iconName 或 query (Missing iconName/query)",
					data: { errorCode: "INVALID_PARAMS" },
				};
			}

			let iconName = explicitIconName;
			let matchCount = 0;
			if (!iconName) {
				const searchResult = await searchIcons(query, 20);
				if (searchResult.icons.length === 0) {
					return {
						success: false,
						message: `未找到与 "${query}" 相关的贴纸 (No sticker found for query)`,
						data: { errorCode: "STICKER_NOT_FOUND", query },
					};
				}
				iconName = searchResult.icons[0];
				matchCount = searchResult.total;
			}

			const startTime =
				typeof params.startTime === "number"
					? params.startTime
					: editor.playback.getCurrentTime();
			if (!isFiniteNumber(startTime) || startTime < 0) {
				return {
					success: false,
					message: "无效的开始时间 (Invalid start time)",
					data: { errorCode: "INVALID_START_TIME" },
				};
			}

			const requestedTrackId =
				typeof params.trackId === "string" ? params.trackId.trim() : "";
			let trackId = requestedTrackId;
			if (requestedTrackId) {
				const track = editor.timeline.getTrackById({
					trackId: requestedTrackId,
				});
				if (!track) {
					return {
						success: false,
						message: `找不到轨道: ${requestedTrackId} (Track not found)`,
						data: { errorCode: "TRACK_NOT_FOUND", trackId: requestedTrackId },
					};
				}

				if (
					!canElementGoOnTrack({
						elementType: "sticker",
						trackType: track.type,
					})
				) {
					return {
						success: false,
						message: `目标轨道不是贴纸轨道: ${requestedTrackId} (Track is not sticker-compatible)`,
						data: {
							errorCode: "INCOMPATIBLE_TRACK",
							trackId: requestedTrackId,
						},
					};
				}
			} else {
				const existingStickerTrack = editor.timeline
					.getTracks()
					.find((track) => track.type === "sticker");
				trackId = existingStickerTrack
					? existingStickerTrack.id
					: editor.timeline.addTrack({ type: "sticker" });
			}

			const element = buildStickerElement({
				iconName,
				startTime,
			});

			const color = isNonEmptyString(params.color) ? params.color.trim() : "";
			if (color) {
				element.color = color;
			}

			editor.timeline.insertElement({
				placement: { mode: "explicit", trackId },
				element,
			});

			return {
				success: true,
				message: `已添加贴纸 "${iconName}" 到 ${startTime.toFixed(2)} 秒 (Sticker added)`,
				data: {
					iconName,
					query: query || undefined,
					matchCount: query ? matchCount : undefined,
					startTime,
					trackId,
					color: color || undefined,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `添加贴纸失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "ADD_STICKER_FAILED" },
			};
		}
	},
};

/**
 * Add Sound Effect
 * Searches Freesound and inserts the chosen sound effect into the timeline
 */
export const searchSoundEffectTool: AgentTool = {
	name: "search_sound_effect",
	description:
		"仅搜索音效，不插入时间线。返回候选与 resultIndex 供后续 add_sound_effect 确认。Search Freesound effects without adding to timeline.",
	parameters: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "音效搜索关键词 (Sound effect search query)",
			},
			commercialOnly: {
				type: "boolean",
				description: "仅商业可用许可（默认 true）(Commercial-use only)",
			},
			minRating: {
				type: "number",
				description: "最低评分 0-5（默认 3）(Minimum rating)",
			},
		},
		required: ["query"],
	},
	execute: async (params, context): Promise<ToolResult> => {
		try {
			throwIfExecutionCancelled(context?.signal);
			const query = isNonEmptyString(params.query) ? params.query.trim() : "";
			if (!query) {
				return {
					success: false,
					message: "缺少 query 参数 (Missing query)",
					data: { errorCode: "INVALID_PARAMS" },
				};
			}

			const commercialOnly =
				typeof params.commercialOnly === "boolean"
					? params.commercialOnly
					: true;
			const minRating =
				typeof params.minRating === "number" &&
				Number.isFinite(params.minRating)
					? params.minRating
					: 3;
			if (minRating < 0 || minRating > 5) {
				return {
					success: false,
					message:
						"minRating 必须在 0-5 之间 (minRating must be between 0 and 5)",
					data: { errorCode: "INVALID_MIN_RATING" },
				};
			}

			const searchParams = new URLSearchParams({
				q: query,
				type: "effects",
				page: "1",
				page_size: SOUND_SEARCH_PAGE_SIZE.toString(),
				commercial_only: commercialOnly ? "true" : "false",
				min_rating: minRating.toString(),
			});

			const response = await fetch(
				`/api/sounds/search?${searchParams.toString()}`,
				{
					signal: context?.signal,
				},
			);
			if (!response.ok) {
				return {
					success: false,
					message: `搜索音效失败: ${response.status} (Sound search failed)`,
					data: { errorCode: "SOUND_SEARCH_FAILED", status: response.status },
				};
			}

			const payload = (await response.json()) as {
				results?: SoundEffect[];
				count?: number;
			};
			const results = Array.isArray(payload.results) ? payload.results : [];
			const candidates = results.map((sound, index) => ({
				resultIndex: index,
				id: sound.id,
				name: sound.name,
				duration: sound.duration,
				previewUrl: sound.previewUrl,
				username: sound.username,
				license: sound.license,
				rating: sound.rating,
				downloads: sound.downloads,
				tags: sound.tags.slice(0, 8),
			}));

			return {
				success: true,
				message:
					candidates.length > 0
						? `找到 ${candidates.length} 个音效候选（总计 ${payload.count ?? candidates.length}）(Found sound effect candidates)`
						: `未找到与 "${query}" 相关的音效 (No sound effects found)`,
				data: {
					query,
					count: candidates.length,
					total: payload.count ?? candidates.length,
					pageSize: SOUND_SEARCH_PAGE_SIZE,
					candidates,
				},
			};
		} catch (error) {
			if (isExecutionCancelled(context?.signal)) {
				return buildExecutionCancelledResult();
			}
			return {
				success: false,
				message: `搜索音效失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "SEARCH_SOUND_EFFECT_FAILED" },
			};
		}
	},
};

/**
 * Add Sound Effect
 * Searches Freesound and inserts the chosen sound effect into the timeline
 */
export const addSoundEffectTool: AgentTool = {
	name: "add_sound_effect",
	description:
		"添加 Freesound 音效到时间线。可用 soundId 直接添加，或 query + resultIndex 选择结果。Add a Freesound effect by soundId or query.",
	parameters: {
		type: "object",
		properties: {
			soundId: {
				type: "number",
				description: "音效 ID（优先）(Sound ID, preferred)",
			},
			query: {
				type: "string",
				description:
					"音效搜索关键词（未提供 soundId 时使用）(Query when soundId is not provided)",
			},
			resultIndex: {
				type: "number",
				description:
					"选择第几个搜索结果（从 0 开始，默认 0，仅 query 模式）(Result index for query mode)",
			},
			startTime: {
				type: "number",
				description:
					"开始时间（秒），默认为当前播放头位置 (Start time in seconds)",
			},
			trackId: {
				type: "string",
				description: "目标音频轨道ID（可选）(Optional target audio track ID)",
			},
			commercialOnly: {
				type: "boolean",
				description: "仅商业可用许可（默认 true）(Commercial-use only)",
			},
			minRating: {
				type: "number",
				description: "最低评分 0-5（默认 3）(Minimum rating)",
			},
		},
		required: [],
	},
	execute: async (params, context): Promise<ToolResult> => {
		try {
			throwIfExecutionCancelled(context?.signal);
			const editor = EditorCore.getInstance();
			const soundId =
				params.soundId === undefined ? undefined : Number(params.soundId);
			const hasSoundId =
				soundId !== undefined && Number.isInteger(soundId) && soundId > 0;
			const query = isNonEmptyString(params.query) ? params.query.trim() : "";
			const hasQuery = query.length > 0;

			if (!hasSoundId && !hasQuery) {
				return {
					success: false,
					message: "请提供 soundId 或 query (Missing soundId/query)",
					data: { errorCode: "INVALID_PARAMS" },
				};
			}
			if (soundId !== undefined && !hasSoundId) {
				return {
					success: false,
					message: "soundId 必须是正整数 (soundId must be a positive integer)",
					data: { errorCode: "INVALID_SOUND_ID" },
				};
			}

			const resultIndex =
				params.resultIndex === undefined ? 0 : Number(params.resultIndex);
			if (!Number.isInteger(resultIndex) || resultIndex < 0) {
				return {
					success: false,
					message:
						"resultIndex 必须是非负整数 (resultIndex must be a non-negative integer)",
					data: { errorCode: "INVALID_RESULT_INDEX" },
				};
			}

			const commercialOnly =
				typeof params.commercialOnly === "boolean"
					? params.commercialOnly
					: true;
			const minRating =
				typeof params.minRating === "number" &&
				Number.isFinite(params.minRating)
					? params.minRating
					: 3;
			if (minRating < 0 || minRating > 5) {
				return {
					success: false,
					message:
						"minRating 必须在 0-5 之间 (minRating must be between 0 and 5)",
					data: { errorCode: "INVALID_MIN_RATING" },
				};
			}

			let sound: SoundEffect | null = null;
			let totalMatches: number | undefined;
			if (hasSoundId) {
				const detailResponse = await fetch(`/api/sounds/${soundId}`, {
					signal: context?.signal,
				});
				if (!detailResponse.ok) {
					return {
						success: false,
						message: `获取音效详情失败: ${detailResponse.status} (Failed to fetch sound by ID)`,
						data: {
							errorCode: "SOUND_DETAIL_FAILED",
							status: detailResponse.status,
							soundId,
						},
					};
				}
				const payload = (await detailResponse.json()) as {
					result?: SoundEffect;
				};
				sound = payload.result ?? null;
				totalMatches = sound ? 1 : 0;
			} else {
				const searchParams = new URLSearchParams({
					q: query,
					type: "effects",
					page: "1",
					page_size: SOUND_SEARCH_PAGE_SIZE.toString(),
					commercial_only: commercialOnly ? "true" : "false",
					min_rating: minRating.toString(),
				});

				const searchResponse = await fetch(
					`/api/sounds/search?${searchParams.toString()}`,
					{
						signal: context?.signal,
					},
				);
				if (!searchResponse.ok) {
					return {
						success: false,
						message: `搜索音效失败: ${searchResponse.status} (Sound search failed)`,
						data: {
							errorCode: "SOUND_SEARCH_FAILED",
							status: searchResponse.status,
						},
					};
				}

				const payload = (await searchResponse.json()) as {
					results?: SoundEffect[];
					count?: number;
				};
				const results = Array.isArray(payload.results) ? payload.results : [];
				if (results.length === 0) {
					return {
						success: false,
						message: `未找到与 "${query}" 相关的音效 (No sound effects found)`,
						data: { errorCode: "SOUND_NOT_FOUND", query },
					};
				}

				if (resultIndex >= results.length) {
					return {
						success: false,
						message: `resultIndex 超出范围，当前仅 ${results.length} 条结果 (resultIndex out of range)`,
						data: {
							errorCode: "RESULT_INDEX_OUT_OF_RANGE",
							resultCount: results.length,
						},
					};
				}

				sound = results[resultIndex] ?? null;
				totalMatches = payload.count;
			}

			if (!sound) {
				return {
					success: false,
					message: "未找到目标音效 (Target sound not found)",
					data: {
						errorCode: "SOUND_NOT_FOUND",
						soundId,
						query: hasQuery ? query : undefined,
					},
				};
			}
			const previewUrl = isNonEmptyString(sound.previewUrl)
				? sound.previewUrl.trim()
				: "";
			if (!previewUrl) {
				return {
					success: false,
					message: `选中的音效没有可用预览地址: ${sound.name} (No preview URL available)`,
					data: { errorCode: "SOUND_PREVIEW_UNAVAILABLE", soundId: sound.id },
				};
			}

			const startTime =
				typeof params.startTime === "number"
					? params.startTime
					: editor.playback.getCurrentTime();
			if (!isFiniteNumber(startTime) || startTime < 0) {
				return {
					success: false,
					message: "无效的开始时间 (Invalid start time)",
					data: { errorCode: "INVALID_START_TIME" },
				};
			}

			const audioResponse = await fetch(previewUrl, {
				signal: context?.signal,
			});
			if (!audioResponse.ok) {
				return {
					success: false,
					message: `下载音效失败: ${audioResponse.status} (Failed to download sound preview)`,
					data: {
						errorCode: "SOUND_DOWNLOAD_FAILED",
						status: audioResponse.status,
					},
				};
			}

			const arrayBuffer = await audioResponse.arrayBuffer();
			throwIfExecutionCancelled(context?.signal);
			let buffer: AudioBuffer | undefined;
			if (typeof AudioContext !== "undefined") {
				const audioContext = new AudioContext();
				try {
					throwIfExecutionCancelled(context?.signal);
					buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
				} catch {
					buffer = undefined;
				} finally {
					if (typeof audioContext.close === "function") {
						await audioContext.close();
					}
				}
			}

			const requestedTrackId =
				typeof params.trackId === "string" ? params.trackId.trim() : "";
			let trackId = requestedTrackId;
			if (requestedTrackId) {
				const track = editor.timeline.getTrackById({
					trackId: requestedTrackId,
				});
				if (!track) {
					return {
						success: false,
						message: `找不到轨道: ${requestedTrackId} (Track not found)`,
						data: { errorCode: "TRACK_NOT_FOUND", trackId: requestedTrackId },
					};
				}

				if (
					!canElementGoOnTrack({ elementType: "audio", trackType: track.type })
				) {
					return {
						success: false,
						message: `目标轨道不是音频轨道: ${requestedTrackId} (Track is not audio-compatible)`,
						data: {
							errorCode: "INCOMPATIBLE_TRACK",
							trackId: requestedTrackId,
						},
					};
				}
			} else {
				const existingAudioTrack = editor.timeline
					.getTracks()
					.find((track) => track.type === "audio");
				trackId = existingAudioTrack
					? existingAudioTrack.id
					: editor.timeline.addTrack({ type: "audio" });
			}

			const duration =
				typeof sound.duration === "number" &&
				Number.isFinite(sound.duration) &&
				sound.duration > 0
					? sound.duration
					: TIMELINE_CONSTANTS.DEFAULT_ELEMENT_DURATION;

			const element = buildLibraryAudioElement({
				sourceUrl: previewUrl,
				name: sound.name,
				duration,
				startTime,
				buffer,
			});
			throwIfExecutionCancelled(context?.signal);

			editor.timeline.insertElement({
				placement: { mode: "explicit", trackId },
				element,
			});

			return {
				success: true,
				message: `已添加音效 "${sound.name}" 到 ${startTime.toFixed(2)} 秒 (Sound effect added)`,
				data: {
					source: hasSoundId ? "soundId" : "query",
					soundIdInput: hasSoundId ? soundId : undefined,
					query: hasQuery ? query : undefined,
					resultIndex: hasSoundId ? undefined : resultIndex,
					totalMatches,
					soundId: sound.id,
					soundName: sound.name,
					duration,
					previewUrl,
					startTime,
					trackId,
				},
			};
		} catch (error) {
			if (isExecutionCancelled(context?.signal)) {
				return buildExecutionCancelledResult();
			}
			return {
				success: false,
				message: `添加音效失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "ADD_SOUND_EFFECT_FAILED" },
			};
		}
	},
};

/**
 * Add Media Asset
 * Adds a media asset from a URL to the project
 */
export const addMediaAssetTool: AgentTool = {
	name: "add_media_asset",
	description:
		"通过URL添加媒体素材（image/video/audio）。Add a media asset from a URL.",
	parameters: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description: "媒体文件URL (Media file URL)",
			},
			name: {
				type: "string",
				description: "素材名称（可选）(Asset name, optional)",
			},
			type: {
				type: "string",
				enum: [...MEDIA_TYPES],
				description: "素材类型 (image/video/audio)",
			},
			mimeType: {
				type: "string",
				description: "MIME 类型（可选）(Optional MIME type)",
			},
		},
		required: ["url", "type"],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const activeProject = editor.project.getActive();

			if (!activeProject) {
				return {
					success: false,
					message: "当前没有活动项目 (No active project)",
					data: { errorCode: "NO_ACTIVE_PROJECT" },
				};
			}

			const url = isNonEmptyString(params.url) ? params.url.trim() : "";
			const type = isNonEmptyString(params.type) ? params.type.trim() : "";

			if (!url) {
				return {
					success: false,
					message: "缺少 url 参数 (Missing url)",
					data: { errorCode: "INVALID_PARAMS" },
				};
			}

			if (!MEDIA_TYPES.includes(type as (typeof MEDIA_TYPES)[number])) {
				return {
					success: false,
					message: `无效的素材类型: ${type} (Invalid media type)`,
					data: { errorCode: "INVALID_MEDIA_TYPE" },
				};
			}

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
			let response: Response;

			try {
				response = await fetch(url, { signal: controller.signal });
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return {
						success: false,
						message: "下载超时 (Fetch timed out)",
						data: { errorCode: "FETCH_TIMEOUT" },
					};
				}
				return {
					success: false,
					message:
						"下载失败，可能是网络错误或跨域限制 (Fetch failed, possibly due to network/CORS)",
					data: { errorCode: "FETCH_FAILED" },
				};
			} finally {
				clearTimeout(timeoutId);
			}

			if (!response.ok) {
				return {
					success: false,
					message: `下载失败: ${response.status} (Failed to fetch media)`,
					data: { errorCode: "FETCH_FAILED" },
				};
			}

			const contentLength = response.headers.get("content-length");
			if (contentLength) {
				const length = Number(contentLength);
				if (Number.isFinite(length) && length > MAX_MEDIA_BYTES) {
					return {
						success: false,
						message: "文件过大，无法处理 (File is too large)",
						data: { errorCode: "FILE_TOO_LARGE", maxBytes: MAX_MEDIA_BYTES },
					};
				}
			}

			const blob = await response.blob();
			if (blob.size > MAX_MEDIA_BYTES) {
				return {
					success: false,
					message: "文件过大，无法处理 (File is too large)",
					data: { errorCode: "FILE_TOO_LARGE", maxBytes: MAX_MEDIA_BYTES },
				};
			}
			const mimeTypeParam = isNonEmptyString(params.mimeType)
				? params.mimeType.trim()
				: "";
			const fallbackMimeType = `${type}/*`;
			const mimeType = mimeTypeParam || blob.type || fallbackMimeType;

			const nameParam = isNonEmptyString(params.name) ? params.name.trim() : "";
			const urlName = (() => {
				try {
					const parsed = new URL(url);
					return parsed.pathname.split("/").pop() || "";
				} catch {
					return "";
				}
			})();
			const fileName = nameParam || urlName || `asset-${Date.now()}`;

			const file = new File([blob], fileName, {
				type: mimeType,
				lastModified: Date.now(),
			});

			const processedAssets = await processMediaAssets({
				files: [file],
			});

			if (processedAssets.length === 0) {
				return {
					success: false,
					message: "媒体处理失败 (Media processing failed)",
					data: { errorCode: "PROCESSING_FAILED" },
				};
			}

			const processed = processedAssets[0];
			await editor.media.addMediaAsset({
				projectId: activeProject.metadata.id,
				asset: processed,
			});

			const assets = editor.media.getAssets();
			const added =
				assets.find((asset) => asset.file === processed.file) ??
				assets.find(
					(asset) =>
						asset.name === processed.name && asset.type === processed.type,
				);

			if (!added) {
				return {
					success: true,
					message:
						"已添加素材，但未能解析ID，请使用 list_assets 获取 (Asset added, ID unavailable)",
					data: {
						assetId: null,
						name: processed.name,
						type: processed.type,
						duration: processed.duration,
					},
				};
			}

			return {
				success: true,
				message: `已添加素材 "${processed.name}" (Asset added)`,
				data: {
					assetId: added?.id,
					name: processed.name,
					type: processed.type,
					duration: processed.duration,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `添加素材失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "ADD_ASSET_FAILED" },
			};
		}
	},
};

/**
 * Remove Asset
 * Removes a media asset from the project
 */
export const removeAssetTool: AgentTool = {
	name: "remove_asset",
	description: "从项目中删除素材资源。Remove a media asset from the project.",
	parameters: {
		type: "object",
		properties: {
			assetId: {
				type: "string",
				description: "素材ID (Asset ID)",
			},
		},
		required: ["assetId"],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const activeProject = editor.project.getActive();

			if (!activeProject) {
				return {
					success: false,
					message: "当前没有活动项目 (No active project)",
					data: { errorCode: "NO_ACTIVE_PROJECT" },
				};
			}

			const assetId = isNonEmptyString(params.assetId)
				? params.assetId.trim()
				: "";
			if (!assetId) {
				return {
					success: false,
					message: "缺少 assetId 参数 (Missing assetId)",
					data: { errorCode: "INVALID_PARAMS" },
				};
			}

			const asset = editor.media
				.getAssets()
				.find((item) => item.id === assetId);
			if (!asset) {
				return {
					success: false,
					message: `找不到素材: ${assetId} (Asset not found)`,
					data: { errorCode: "ASSET_NOT_FOUND" },
				};
			}

			await executeMutationWithUndoGuard({
				label: "remove_asset",
				destructive: true,
				run: () => {
					const command = new RemoveMediaAssetCommand(
						activeProject.metadata.id,
						assetId,
					);
					editor.command.execute({ command });
				},
			});

			return {
				success: true,
				message: `已删除素材 "${asset.name}" (Asset removed)`,
				data: { assetId, name: asset.name, type: asset.type },
			};
		} catch (error) {
			return {
				success: false,
				message: `删除素材失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "REMOVE_ASSET_FAILED" },
			};
		}
	},
};

/**
 * Get all asset tools
 */
export function getAssetTools(): AgentTool[] {
	return [
		listAssetsTool,
		addAssetToTimelineTool,
		searchStickerTool,
		addStickerTool,
		searchSoundEffectTool,
		addSoundEffectTool,
		addMediaAssetTool,
		removeAssetTool,
	];
}
