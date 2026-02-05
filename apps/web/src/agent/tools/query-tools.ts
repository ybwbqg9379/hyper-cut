import type { AgentTool, ToolResult } from "../types";
import { EditorCore } from "@/core";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";

/**
 * Query Tools
 * Read-only tools for getting information about the timeline state
 */

function getElementTiming(element: TimelineElement): {
	startTime: number;
	endTime: number;
	duration: number;
} {
	const startTime = element.startTime;
	const duration = element.duration;
	const endTime = startTime + duration;
	return { startTime, endTime, duration };
}

function getElementRef(
	tracks: TimelineTrack[],
	elementId: string,
	trackId?: string,
): { track: TimelineTrack; element: TimelineElement } | null {
	if (trackId) {
		const track = tracks.find((item) => item.id === trackId);
		if (!track) return null;
		const element = track.elements.find((item) => item.id === elementId);
		return element ? { track, element } : null;
	}

	for (const track of tracks) {
		const element = track.elements.find((item) => item.id === elementId);
		if (element) {
			return { track, element };
		}
	}

	return null;
}

/**
 * Get Timeline Info
 * Returns information about tracks and elements on the timeline
 */
export const getTimelineInfoTool: AgentTool = {
	name: "get_timeline_info",
	description:
		"获取时间线信息，包括轨道数量和片段数量。Get timeline information including track count and element count.",
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	execute: async (): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const tracks = editor.timeline.getTracks();

			const totalElements = tracks.reduce(
				(sum, track) => sum + track.elements.length,
				0,
			);

			const trackInfo = tracks.map((track, index) => ({
				index,
				type: track.type,
				elementCount: track.elements.length,
			}));

			return {
				success: true,
				message: `时间线有 ${tracks.length} 个轨道，共 ${totalElements} 个片段。(Timeline has ${tracks.length} track(s) with ${totalElements} element(s))`,
				data: {
					trackCount: tracks.length,
					totalElements,
					tracks: trackInfo,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `获取时间线信息失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Get Total Duration
 * Returns the total duration of the timeline
 */
export const getTotalDurationTool: AgentTool = {
	name: "get_total_duration",
	description: "获取时间线总时长。Get the total duration of the timeline.",
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	execute: async (): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			// Duration is in seconds (timeline standard unit)
			const duration = editor.timeline.getTotalDuration();

			// Format duration as mm:ss.ms
			const minutes = Math.floor(duration / 60);
			const seconds = Math.floor(duration % 60);
			const ms = Math.round((duration % 1) * 100);
			const formatted = `${minutes}:${seconds.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;

			return {
				success: true,
				message: `时间线总时长: ${formatted} (${duration.toFixed(2)} 秒)`,
				data: {
					durationSeconds: duration,
					formatted,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `获取时长失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Get Current Time
 * Returns the current playhead position
 */
export const getCurrentTimeTool: AgentTool = {
	name: "get_current_time",
	description: "获取当前播放头位置。Get the current playhead position.",
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	execute: async (): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const currentTime = editor.playback.getCurrentTime();

			// Format time as mm:ss.ms
			const minutes = Math.floor(currentTime / 60);
			const seconds = Math.floor(currentTime % 60);
			const ms = Math.round((currentTime % 1) * 100);
			const formatted = `${minutes}:${seconds.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;

			return {
				success: true,
				message: `当前播放位置: ${formatted} (${currentTime.toFixed(2)} 秒)`,
				data: {
					currentTimeSeconds: currentTime,
					formatted,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `获取当前时间失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Get Selected Elements
 * Returns information about currently selected elements
 */
export const getSelectedElementsTool: AgentTool = {
	name: "get_selected_elements",
	description:
		"获取当前选中的元素信息。Get information about currently selected elements.",
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	execute: async (): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const selection = editor.selection.getSelectedElements();

			if (!selection || selection.length === 0) {
				return {
					success: true,
					message: "当前没有选中任何元素 (No elements currently selected)",
					data: { selectedCount: 0, elements: [] },
				};
			}

			return {
				success: true,
				message: `当前选中了 ${selection.length} 个元素 (${selection.length} element(s) selected)`,
				data: {
					selectedCount: selection.length,
					elements: selection,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `获取选中元素失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Get Element Details
 * Returns the full element data and related track info
 */
export const getElementDetailsTool: AgentTool = {
	name: "get_element_details",
	description:
		"获取指定元素的完整属性信息。Get full properties of a specific timeline element.",
	parameters: {
		type: "object",
		properties: {
			elementId: {
				type: "string",
				description: "元素 ID (Element ID)",
			},
			trackId: {
				type: "string",
				description: "轨道 ID（可选）(Optional track ID)",
			},
		},
		required: ["elementId"],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const elementId =
				typeof params.elementId === "string" ? params.elementId.trim() : "";
			const trackId =
				typeof params.trackId === "string" ? params.trackId.trim() : undefined;
			if (!elementId) {
				return {
					success: false,
					message: "缺少 elementId 参数 (Missing elementId)",
					data: { errorCode: "INVALID_PARAMS" },
				};
			}

			const editor = EditorCore.getInstance();
			const tracks = editor.timeline.getTracks();
			const resolved = getElementRef(tracks, elementId, trackId);
			if (!resolved) {
				return {
					success: false,
					message: `找不到元素: ${elementId} (Element not found)`,
					data: { errorCode: "ELEMENT_NOT_FOUND", elementId, trackId },
				};
			}

			const timing = getElementTiming(resolved.element);

			return {
				success: true,
				message: `已获取元素 ${resolved.element.id} 的详细信息 (Fetched element details)`,
				data: {
					track: {
						id: resolved.track.id,
						type: resolved.track.type,
						name: resolved.track.name,
					},
					element: resolved.element,
					timing,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `获取元素详情失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Get Elements In Range
 * Returns elements within a time range (or overlapping range)
 */
export const getElementsInRangeTool: AgentTool = {
	name: "get_elements_in_range",
	description:
		"获取指定时间范围内（或与范围重叠）的所有元素。Get all elements in or overlapping a time range.",
	parameters: {
		type: "object",
		properties: {
			startTime: {
				type: "number",
				description: "开始时间（秒）(Start time in seconds)",
			},
			endTime: {
				type: "number",
				description: "结束时间（秒）(End time in seconds)",
			},
			trackId: {
				type: "string",
				description: "轨道 ID（可选）(Optional track ID)",
			},
			elementType: {
				type: "string",
				enum: ["video", "image", "audio", "text", "sticker"],
				description: "元素类型过滤（可选）(Optional element type filter)",
			},
			includePartial: {
				type: "boolean",
				description:
					"是否包含部分重叠元素 (Include partially overlapping elements)",
			},
		},
		required: ["startTime", "endTime"],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const startTime = params.startTime;
			const endTime = params.endTime;
			if (
				typeof startTime !== "number" ||
				typeof endTime !== "number" ||
				!Number.isFinite(startTime) ||
				!Number.isFinite(endTime) ||
				startTime < 0 ||
				endTime <= startTime
			) {
				return {
					success: false,
					message: "时间范围无效 (Invalid time range)",
					data: { errorCode: "INVALID_TIME_RANGE" },
				};
			}

			const trackId =
				typeof params.trackId === "string" ? params.trackId.trim() : undefined;
			const elementType =
				typeof params.elementType === "string"
					? params.elementType.trim()
					: undefined;
			const includePartial =
				typeof params.includePartial === "boolean"
					? params.includePartial
					: true;

			const editor = EditorCore.getInstance();
			const tracks = editor.timeline.getTracks();
			const sourceTracks = trackId
				? tracks.filter((track) => track.id === trackId)
				: tracks;
			if (trackId && sourceTracks.length === 0) {
				return {
					success: false,
					message: `找不到轨道: ${trackId} (Track not found)`,
					data: { errorCode: "TRACK_NOT_FOUND", trackId },
				};
			}

			const items = sourceTracks.flatMap((track) =>
				track.elements
					.filter((element) => {
						if (elementType && element.type !== elementType) {
							return false;
						}
						const timing = getElementTiming(element);
						if (includePartial) {
							return timing.endTime > startTime && timing.startTime < endTime;
						}
						return timing.startTime >= startTime && timing.endTime <= endTime;
					})
					.map((element) => ({
						trackId: track.id,
						trackType: track.type,
						element,
						timing: getElementTiming(element),
					})),
			);

			return {
				success: true,
				message: `找到 ${items.length} 个范围内元素 (Found ${items.length} element(s) in range)`,
				data: {
					startTime,
					endTime,
					trackId,
					elementType,
					includePartial,
					count: items.length,
					elements: items,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `按范围查询元素失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Get Track Details
 * Returns complete information for a specific track
 */
export const getTrackDetailsTool: AgentTool = {
	name: "get_track_details",
	description:
		"获取单个轨道的完整信息，包括元素列表与统计。Get full details for a specific track.",
	parameters: {
		type: "object",
		properties: {
			trackId: {
				type: "string",
				description: "轨道 ID (Track ID)",
			},
			includeElements: {
				type: "boolean",
				description: "是否包含元素完整数据 (Include full element data)",
			},
		},
		required: ["trackId"],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const trackId =
				typeof params.trackId === "string" ? params.trackId.trim() : "";
			if (!trackId) {
				return {
					success: false,
					message: "缺少 trackId 参数 (Missing trackId)",
					data: { errorCode: "INVALID_PARAMS" },
				};
			}

			const includeElements =
				typeof params.includeElements === "boolean"
					? params.includeElements
					: true;

			const editor = EditorCore.getInstance();
			const track = editor.timeline.getTrackById({ trackId });
			if (!track) {
				return {
					success: false,
					message: `找不到轨道: ${trackId} (Track not found)`,
					data: { errorCode: "TRACK_NOT_FOUND", trackId },
				};
			}

			const timings = track.elements.map((element) =>
				getElementTiming(element),
			);
			const startTimes = timings.map((timing) => timing.startTime);
			const endTimes = timings.map((timing) => timing.endTime);

			return {
				success: true,
				message: `已获取轨道 ${trackId} 详情 (Fetched track details)`,
				data: {
					track: {
						id: track.id,
						name: track.name,
						type: track.type,
						hidden: "hidden" in track ? track.hidden : undefined,
						muted: "muted" in track ? track.muted : undefined,
						isMain: "isMain" in track ? track.isMain : undefined,
					},
					stats: {
						elementCount: track.elements.length,
						earliestStart: startTimes.length > 0 ? Math.min(...startTimes) : 0,
						latestEnd: endTimes.length > 0 ? Math.max(...endTimes) : 0,
					},
					elements: includeElements ? track.elements : undefined,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `获取轨道详情失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Get Timeline Summary
 * Returns a structured summary for all tracks/elements/gaps
 */
export const getTimelineSummaryTool: AgentTool = {
	name: "get_timeline_summary",
	description:
		"获取时间线结构化摘要（轨道统计、元素分布、间隔分布）。Get structured timeline summary.",
	parameters: {
		type: "object",
		properties: {
			gapBucketSeconds: {
				type: "number",
				description:
					"间隔统计桶大小（秒）(Gap histogram bucket size in seconds)",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const tracks = editor.timeline.getTracks();
			const totalDuration = editor.timeline.getTotalDuration();
			const gapBucketSeconds =
				typeof params.gapBucketSeconds === "number" &&
				Number.isFinite(params.gapBucketSeconds) &&
				params.gapBucketSeconds > 0
					? params.gapBucketSeconds
					: 5;

			const typeDistribution: Record<string, number> = {};
			const trackSummaries = tracks.map((track) => {
				const sorted = [...track.elements].sort(
					(a, b) => a.startTime - b.startTime,
				);
				const gaps: number[] = [];
				let previousEnd = 0;
				for (const element of sorted) {
					const timing = getElementTiming(element);
					if (timing.startTime > previousEnd) {
						gaps.push(timing.startTime - previousEnd);
					}
					previousEnd = Math.max(previousEnd, timing.endTime);
					typeDistribution[element.type] =
						(typeDistribution[element.type] ?? 0) + 1;
				}
				if (totalDuration > previousEnd) {
					gaps.push(totalDuration - previousEnd);
				}

				const gapHistogram: Record<string, number> = {};
				for (const gap of gaps) {
					const bucketStart =
						Math.floor(gap / gapBucketSeconds) * gapBucketSeconds;
					const bucketKey = `${bucketStart.toFixed(2)}-${(bucketStart + gapBucketSeconds).toFixed(2)}`;
					gapHistogram[bucketKey] = (gapHistogram[bucketKey] ?? 0) + 1;
				}

				return {
					trackId: track.id,
					trackType: track.type,
					elementCount: track.elements.length,
					gapCount: gaps.length,
					maxGap: gaps.length > 0 ? Math.max(...gaps) : 0,
					avgGap:
						gaps.length > 0
							? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
							: 0,
					gapHistogram,
				};
			});

			return {
				success: true,
				message: "已生成时间线结构化摘要 (Generated timeline summary)",
				data: {
					trackCount: tracks.length,
					totalDuration,
					totalElements: tracks.reduce(
						(sum, track) => sum + track.elements.length,
						0,
					),
					elementTypeDistribution: typeDistribution,
					trackSummaries,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `获取时间线摘要失败: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};

/**
 * Get all query tools
 */
export function getQueryTools(): AgentTool[] {
	return [
		getTimelineInfoTool,
		getTotalDurationTool,
		getCurrentTimeTool,
		getSelectedElementsTool,
		getElementDetailsTool,
		getElementsInRangeTool,
		getTrackDetailsTool,
		getTimelineSummaryTool,
	];
}
