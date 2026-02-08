/**
 * Filler Word Agent Tools
 *
 * detect_filler_words — read-only scan of the transcript for filler words
 * remove_filler_words — surgically removes filler segments via timeline edits
 */

import type { AgentTool, ToolExecutionContext, ToolResult } from "../types";
import { EditorCore } from "@/core";
import {
	fillerDetectorService,
	type FillerWordMatch,
} from "../services/filler-detector";
import { buildTranscriptContext } from "../services/transcript-context-builder";
import { FILLER_CUT_MARGIN_SECONDS } from "../constants/filler";
import {
	splitTracksAtTimes,
	deleteElementsFullyInRange,
	rippleCompressTracks,
	type TimeRange,
} from "./timeline-edit-ops";
import type { TimelineTrack } from "@/types/timeline";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function resolveTranscriptContext() {
	try {
		return buildTranscriptContext(EditorCore.getInstance());
	} catch {
		return null;
	}
}

function matchesToTimeRanges(
	matches: FillerWordMatch[],
	margin: number,
): TimeRange[] {
	return matches.map((match) => ({
		start: Math.max(0, match.startTime - margin),
		end: match.endTime + margin,
	}));
}

function mergeOverlappingRanges(ranges: TimeRange[]): TimeRange[] {
	if (ranges.length <= 1) return ranges;
	const sorted = [...ranges].sort((a, b) => a.start - b.start);
	const merged: TimeRange[] = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		const prev = merged[merged.length - 1];
		const curr = sorted[i];
		if (curr.start <= prev.end) {
			prev.end = Math.max(prev.end, curr.end);
		} else {
			merged.push(curr);
		}
	}
	return merged;
}

// ── Detect Filler Words Tool ─────────────────────────────────────────────────

export const detectFillerWordsTool: AgentTool = {
	name: "detect_filler_words",
	description:
		"检测转录文本中的填充词（嗯/啊/um/uh/like等）。" +
		"Detect filler words, hesitations, and repetitions in the transcript. " +
		"Returns locations, statistics, and category breakdown. Read-only, always safe.",
	parameters: {
		type: "object",
		properties: {
			minConfidence: {
				type: "number",
				description:
					"最低置信度 0~1（默认 0.5）。Minimum confidence threshold (default 0.5)",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		const context = resolveTranscriptContext();
		if (!context) {
			return {
				success: false,
				message:
					"无法获取转录文本。请先为视频生成字幕。" +
					"(No transcript available. Generate captions first.)",
				data: { errorCode: "NO_TRANSCRIPT" },
			};
		}

		const result = fillerDetectorService.detectFillerWords(context);

		const minConfidence =
			isFiniteNumber(params.minConfidence) && params.minConfidence >= 0
				? params.minConfidence
				: 0.5;

		const filteredMatches = result.matches.filter(
			(m) => m.confidence >= minConfidence,
		);

		const filteredDuration = filteredMatches.reduce(
			(sum, m) => sum + (m.endTime - m.startTime),
			0,
		);

		const summary = filteredMatches
			.slice(0, 10)
			.map(
				(m) =>
					`  [${m.startTime.toFixed(1)}s-${m.endTime.toFixed(1)}s] "${m.text}" (${m.category}, ${(m.confidence * 100).toFixed(0)}%)`,
			)
			.join("\n");

		return {
			success: true,
			message:
				`检测到 ${filteredMatches.length} 个填充词，` +
				`总时长 ${filteredDuration.toFixed(1)}s ` +
				`(占比 ${result.stats.percentageOfDuration}%)\n` +
				(summary ? `前 ${Math.min(10, filteredMatches.length)} 个:\n${summary}` : ""),
			data: {
				totalCount: filteredMatches.length,
				totalDurationSeconds: Number(filteredDuration.toFixed(3)),
				percentageOfDuration: result.stats.percentageOfDuration,
				byCategory: result.stats.byCategory,
				matches: filteredMatches.map((m) => ({
					text: m.text,
					startTime: m.startTime,
					endTime: m.endTime,
					confidence: m.confidence,
					category: m.category,
				})),
			},
		};
	},
};

// ── Remove Filler Words Tool ─────────────────────────────────────────────────

export const removeFillerWordsTool: AgentTool = {
	name: "remove_filler_words",
	description:
		"从时间线中删除填充词片段并收缩间隙。" +
		"Remove filler word segments from the timeline and ripple-compress gaps. " +
		"Supports dryRun for preview without changes.",
	parameters: {
		type: "object",
		properties: {
			dryRun: {
				type: "boolean",
				description:
					"预览模式，不做实际修改（默认 false）。Preview without changes (default false)",
			},
			minConfidence: {
				type: "number",
				description:
					"最低置信度 0~1（默认 0.7）。Minimum confidence to remove (default 0.7)",
			},
			categories: {
				type: "array",
				items: { type: "string", enum: ["filler", "hesitation", "repetition"] },
				description:
					"要删除的类别（默认全部）。Categories to remove (default all)",
			},
		},
		required: [],
	},
	execute: async (
		params,
		_context?: ToolExecutionContext,
	): Promise<ToolResult> => {
		const context = resolveTranscriptContext();
		if (!context) {
			return {
				success: false,
				message:
					"无法获取转录文本。请先为视频生成字幕。" +
					"(No transcript available. Generate captions first.)",
				data: { errorCode: "NO_TRANSCRIPT" },
			};
		}

		const dryRun = params.dryRun === true;
		const minConfidence =
			isFiniteNumber(params.minConfidence) && params.minConfidence >= 0
				? params.minConfidence
				: 0.7;
		const allowedCategories = Array.isArray(params.categories)
			? new Set(
					(params.categories as string[]).filter((c) =>
						["filler", "hesitation", "repetition"].includes(c),
					),
				)
			: null;

		const result = fillerDetectorService.detectFillerWords(context);
		const matches = result.matches.filter((m) => {
			if (m.confidence < minConfidence) return false;
			if (allowedCategories && !allowedCategories.has(m.category)) return false;
			return true;
		});

		if (matches.length === 0) {
			return {
				success: true,
				message:
					"未检测到符合条件的填充词。(No qualifying filler words found.)",
				data: { removedCount: 0, dryRun },
			};
		}

		const cutRanges = mergeOverlappingRanges(
			matchesToTimeRanges(matches, FILLER_CUT_MARGIN_SECONDS),
		);
		const totalCutDuration = cutRanges.reduce(
			(sum, r) => sum + (r.end - r.start),
			0,
		);

		if (dryRun) {
			return {
				success: true,
				message:
					`[预览] 将删除 ${matches.length} 个填充词，` +
					`共 ${cutRanges.length} 个区间，` +
					`总时长 ${totalCutDuration.toFixed(1)}s。` +
					"(Dry run — no changes made.)",
				data: {
					removedCount: matches.length,
					cutRanges: cutRanges.length,
					totalCutDurationSeconds: Number(totalCutDuration.toFixed(3)),
					dryRun: true,
				},
			};
		}

		// Perform actual timeline edits
		try {
			const editor = EditorCore.getInstance();
			let tracks = editor.timeline.getTracks() as TimelineTrack[];

			// Collect all split times from cut ranges
			const splitTimes = cutRanges.flatMap((r) => [r.start, r.end]);
			const { tracks: splitTracks, splitCount } = splitTracksAtTimes({
				tracks,
				splitTimes,
			});
			tracks = splitTracks;

			// Delete elements fully within cut ranges
			let totalDeleted = 0;
			for (const range of cutRanges) {
				const { tracks: deletedTracks, deletedCount } =
					deleteElementsFullyInRange({ tracks, range });
				tracks = deletedTracks;
				totalDeleted += deletedCount;
			}

			// Ripple compress to close gaps
			const { tracks: compressedTracks, movedElementCount } =
				rippleCompressTracks({ tracks, deleteRanges: cutRanges });
			tracks = compressedTracks;

			// Apply to editor (same pattern as removeSilenceTool)
			const previousSelection = editor.selection.getSelectedElements();
			editor.timeline.replaceTracks({
				tracks,
				selection: previousSelection,
			});

			return {
				success: true,
				message:
					`已删除 ${matches.length} 个填充词（${cutRanges.length} 个区间），` +
					`共分割 ${splitCount} 次，删除 ${totalDeleted} 个元素，` +
					`移动 ${movedElementCount} 个元素，` +
					`节省 ${totalCutDuration.toFixed(1)}s。`,
				data: {
					removedCount: matches.length,
					cutRanges: cutRanges.length,
					splitCount,
					deletedElementCount: totalDeleted,
					movedElementCount,
					totalCutDurationSeconds: Number(totalCutDuration.toFixed(3)),
					dryRun: false,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `填充词删除失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "FILLER_REMOVAL_FAILED" },
			};
		}
	},
};

// ── Export ────────────────────────────────────────────────────────────────────

export function getFillerTools(): AgentTool[] {
	return [detectFillerWordsTool, removeFillerWordsTool];
}
