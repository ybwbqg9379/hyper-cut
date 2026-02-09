import { create } from "zustand";

export interface TimeRange {
	start: number;
	end: number;
}

export interface HighlightPreviewRange extends TimeRange {
	score?: number;
	reason?: string;
}

export interface HighlightPreviewState {
	keepRanges: HighlightPreviewRange[];
	deleteRanges: TimeRange[];
	totalDuration: number;
	targetDuration?: number;
	actualDuration?: number;
	sourceRequestId?: string;
	updatedAt: string;
}

export interface AgentExecutionProgressState {
	requestId: string;
	message: string;
	toolName?: string;
	stepIndex?: number;
	totalSteps?: number;
	updatedAt: string;
}

export interface AgentOperationDiffPreviewState {
	toolName: string;
	diff: {
		affectedElements: {
			added: string[];
			removed: string[];
			moved: string[];
		};
		duration: {
			beforeSeconds: number;
			afterSeconds: number;
			deltaSeconds: number;
		};
		keepRanges?: TimeRange[];
		deleteRanges?: TimeRange[];
	};
	sourceRequestId?: string;
	updatedAt: string;
}

interface AgentUiStore {
	highlightPreview: HighlightPreviewState | null;
	highlightPreviewPlaybackEnabled: boolean;
	operationDiffPreview: AgentOperationDiffPreviewState | null;
	executionProgress: AgentExecutionProgressState | null;
	setHighlightPreviewFromPlan: (payload: {
		segments: Array<{
			startTime: number;
			endTime: number;
			score?: number;
			reason?: string;
		}>;
		totalDuration: number;
		targetDuration?: number;
		actualDuration?: number;
		sourceRequestId?: string;
	}) => void;
	clearHighlightPreview: () => void;
	setOperationDiffPreview: (payload: {
		toolName: string;
		diff: AgentOperationDiffPreviewState["diff"];
		sourceRequestId?: string;
	}) => void;
	clearOperationDiffPreview: () => void;
	setHighlightPreviewPlaybackEnabled: ({
		enabled,
	}: {
		enabled: boolean;
	}) => void;
	setExecutionProgress: (progress: AgentExecutionProgressState | null) => void;
	clearExecutionProgressByRequest: ({
		requestId,
	}: {
		requestId: string;
	}) => void;
	clearAllAgentUiState: () => void;
}

function clampTime(value: number, totalDuration: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(totalDuration, value));
}

function mergeRanges(ranges: TimeRange[]): TimeRange[] {
	if (ranges.length === 0) return [];
	const sorted = [...ranges]
		.filter((range) => range.end > range.start)
		.sort((a, b) => a.start - b.start);
	if (sorted.length === 0) return [];

	const merged: TimeRange[] = [{ ...sorted[0] }];
	for (const range of sorted.slice(1)) {
		const last = merged[merged.length - 1];
		if (!last) continue;
		if (range.start <= last.end) {
			last.end = Math.max(last.end, range.end);
			continue;
		}
		merged.push({ ...range });
	}
	return merged;
}

function buildDeleteRanges({
	totalDuration,
	keepRanges,
}: {
	totalDuration: number;
	keepRanges: TimeRange[];
}): TimeRange[] {
	if (totalDuration <= 0) return [];
	const mergedKeepRanges = mergeRanges(keepRanges);
	if (mergedKeepRanges.length === 0) {
		return [{ start: 0, end: totalDuration }];
	}

	const deleteRanges: TimeRange[] = [];
	let cursor = 0;

	for (const range of mergedKeepRanges) {
		if (range.start > cursor) {
			deleteRanges.push({ start: cursor, end: range.start });
		}
		cursor = Math.max(cursor, range.end);
	}
	if (cursor < totalDuration) {
		deleteRanges.push({ start: cursor, end: totalDuration });
	}

	return deleteRanges;
}

function isHighlightPreviewRange(
	value: HighlightPreviewRange | null,
): value is HighlightPreviewRange {
	return value !== null;
}

export const useAgentUiStore = create<AgentUiStore>((set) => ({
	highlightPreview: null,
	highlightPreviewPlaybackEnabled: false,
	operationDiffPreview: null,
	executionProgress: null,

	setHighlightPreviewFromPlan: ({
		segments,
		totalDuration,
		targetDuration,
		actualDuration,
		sourceRequestId,
	}) => {
		const normalizedTotalDuration = Number.isFinite(totalDuration)
			? Math.max(0, totalDuration)
			: 0;
		if (normalizedTotalDuration <= 0) {
			set({
				highlightPreview: null,
				highlightPreviewPlaybackEnabled: false,
			});
			return;
		}

		const mappedSegments = segments.map((segment) => {
			const start = clampTime(segment.startTime, normalizedTotalDuration);
			const end = clampTime(segment.endTime, normalizedTotalDuration);
			if (end <= start) return null;
			const nextSegment: HighlightPreviewRange = {
				start,
				end,
			};
			if (Number.isFinite(segment.score)) {
				nextSegment.score = Number(segment.score?.toFixed(4));
			}
			if (typeof segment.reason === "string") {
				nextSegment.reason = segment.reason;
			}
			return nextSegment;
		});
		const normalizedSegments: HighlightPreviewRange[] = mappedSegments
			.filter(isHighlightPreviewRange)
			.sort((a, b) => a.start - b.start);

		if (normalizedSegments.length === 0) {
			set({
				highlightPreview: null,
				highlightPreviewPlaybackEnabled: false,
			});
			return;
		}

		const keepRanges = mergeRanges(normalizedSegments);
		const deleteRanges = buildDeleteRanges({
			totalDuration: normalizedTotalDuration,
			keepRanges,
		});

		set({
			highlightPreview: {
				keepRanges: normalizedSegments,
				deleteRanges,
				totalDuration: normalizedTotalDuration,
				targetDuration,
				actualDuration,
				sourceRequestId,
				updatedAt: new Date().toISOString(),
			},
			highlightPreviewPlaybackEnabled: false,
		});
	},

	clearHighlightPreview: () => {
		set({
			highlightPreview: null,
			highlightPreviewPlaybackEnabled: false,
		});
	},

	setOperationDiffPreview: ({ toolName, diff, sourceRequestId }) => {
		set({
			operationDiffPreview: {
				toolName,
				diff,
				sourceRequestId,
				updatedAt: new Date().toISOString(),
			},
		});
	},

	clearOperationDiffPreview: () => {
		set({ operationDiffPreview: null });
	},

	setHighlightPreviewPlaybackEnabled: ({ enabled }) => {
		set({ highlightPreviewPlaybackEnabled: enabled });
	},

	setExecutionProgress: (progress) => {
		set({ executionProgress: progress });
	},

	clearExecutionProgressByRequest: ({ requestId }) => {
		set((state) => {
			if (!state.executionProgress) return state;
			if (state.executionProgress.requestId !== requestId) return state;
			return { executionProgress: null };
		});
	},

	clearAllAgentUiState: () => {
		set({
			highlightPreview: null,
			highlightPreviewPlaybackEnabled: false,
			operationDiffPreview: null,
			executionProgress: null,
		});
	},
}));
