import { calculateTotalDuration, isMainTrack } from "@/lib/timeline";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { generateUUID } from "@/utils/id";

export interface TimeRange {
	start: number;
	end: number;
}

export interface TimelineOperationDiff {
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
}

interface ElementContext {
	trackId: string;
	element: TimelineElement;
}

type ElementPredicate = (context: ElementContext) => boolean;

const DEFAULT_EPSILON = 1e-6;

function roundTime(value: number): number {
	return Number(value.toFixed(6));
}

function toElementRefId({
	trackId,
	elementId,
}: {
	trackId: string;
	elementId: string;
}): string {
	return `${trackId}:${elementId}`;
}

function collectElementPositions(
	tracks: TimelineTrack[],
): Record<string, number> {
	const positions: Record<string, number> = {};
	for (const track of tracks) {
		for (const element of track.elements) {
			positions[toElementRefId({ trackId: track.id, elementId: element.id })] =
				element.startTime;
		}
	}
	return positions;
}

function collectElementRefIds(tracks: TimelineTrack[]): Set<string> {
	const ids = new Set<string>();
	for (const track of tracks) {
		for (const element of track.elements) {
			ids.add(toElementRefId({ trackId: track.id, elementId: element.id }));
		}
	}
	return ids;
}

export function buildTimelineOperationDiff({
	beforeTracks,
	afterTracks,
	keepRanges,
	deleteRanges,
	epsilon = DEFAULT_EPSILON,
}: {
	beforeTracks: TimelineTrack[];
	afterTracks: TimelineTrack[];
	keepRanges?: TimeRange[];
	deleteRanges?: TimeRange[];
	epsilon?: number;
}): TimelineOperationDiff {
	const beforeIds = collectElementRefIds(beforeTracks);
	const afterIds = collectElementRefIds(afterTracks);
	const beforePositions = collectElementPositions(beforeTracks);
	const afterPositions = collectElementPositions(afterTracks);

	const added = [...afterIds].filter((id) => !beforeIds.has(id));
	const removed = [...beforeIds].filter((id) => !afterIds.has(id));
	const moved = [...afterIds].filter((id) => {
		if (!beforeIds.has(id)) return false;
		const before = beforePositions[id];
		const after = afterPositions[id];
		return Math.abs(before - after) > epsilon;
	});

	const beforeSeconds = calculateTotalDuration({ tracks: beforeTracks });
	const afterSeconds = calculateTotalDuration({ tracks: afterTracks });
	const deltaSeconds = roundTime(afterSeconds - beforeSeconds);

	return {
		affectedElements: {
			added,
			removed,
			moved,
		},
		duration: {
			beforeSeconds: roundTime(beforeSeconds),
			afterSeconds: roundTime(afterSeconds),
			deltaSeconds,
		},
		...(keepRanges ? { keepRanges } : {}),
		...(deleteRanges ? { deleteRanges } : {}),
	};
}

export function splitTracksAtTime({
	tracks,
	splitTime,
	shouldInclude,
	epsilon = DEFAULT_EPSILON,
}: {
	tracks: TimelineTrack[];
	splitTime: number;
	shouldInclude?: ElementPredicate;
	epsilon?: number;
}): {
	tracks: TimelineTrack[];
	splitCount: number;
	rightSideElements: Array<{ trackId: string; elementId: string }>;
} {
	let splitCount = 0;
	const rightSideElements: Array<{ trackId: string; elementId: string }> = [];

	const nextTracks = tracks.map((track) => {
		const nextElements = track.elements.flatMap((element) => {
			if (shouldInclude && !shouldInclude({ trackId: track.id, element })) {
				return [element];
			}

			const elementStart = element.startTime;
			const elementEnd = element.startTime + element.duration;
			if (
				splitTime <= elementStart + epsilon ||
				splitTime >= elementEnd - epsilon
			) {
				return [element];
			}

			const leftDuration = splitTime - element.startTime;
			const rightDuration = element.duration - leftDuration;
			if (leftDuration <= epsilon || rightDuration <= epsilon) {
				return [element];
			}

			splitCount += 1;
			const rightId = generateUUID();
			rightSideElements.push({
				trackId: track.id,
				elementId: rightId,
			});
			return [
				{
					...element,
					duration: roundTime(leftDuration),
					trimEnd: roundTime(element.trimEnd + rightDuration),
					name: `${element.name} (left)`,
				},
				{
					...element,
					id: rightId,
					startTime: roundTime(splitTime),
					duration: roundTime(rightDuration),
					trimStart: roundTime(element.trimStart + leftDuration),
					name: `${element.name} (right)`,
				},
			];
		}) as typeof track.elements;

		return {
			...track,
			elements: nextElements,
		} as TimelineTrack;
	});

	return {
		tracks: nextTracks,
		splitCount,
		rightSideElements,
	};
}

export function splitTracksAtTimes({
	tracks,
	splitTimes,
	shouldInclude,
	epsilon = DEFAULT_EPSILON,
}: {
	tracks: TimelineTrack[];
	splitTimes: number[];
	shouldInclude?: ElementPredicate;
	epsilon?: number;
}): {
	tracks: TimelineTrack[];
	splitCount: number;
	rightSideElements: Array<{ trackId: string; elementId: string }>;
} {
	let splitCount = 0;
	let workingTracks = tracks;
	const rightSideElements: Array<{ trackId: string; elementId: string }> = [];

	for (const splitTime of splitTimes) {
		const splitResult = splitTracksAtTime({
			tracks: workingTracks,
			splitTime,
			shouldInclude,
			epsilon,
		});
		workingTracks = splitResult.tracks;
		splitCount += splitResult.splitCount;
		rightSideElements.push(...splitResult.rightSideElements);
	}

	return {
		tracks: workingTracks,
		splitCount,
		rightSideElements,
	};
}

export function deleteElementsFullyInRange({
	tracks,
	range,
	shouldInclude,
	epsilon = DEFAULT_EPSILON,
}: {
	tracks: TimelineTrack[];
	range: TimeRange;
	shouldInclude?: ElementPredicate;
	epsilon?: number;
}): { tracks: TimelineTrack[]; deletedCount: number } {
	let deletedCount = 0;

	const nextTracks = tracks
		.map((track) => {
			const nextElements = track.elements.filter((element) => {
				if (shouldInclude && !shouldInclude({ trackId: track.id, element })) {
					return true;
				}

				const elementStart = element.startTime;
				const elementEnd = element.startTime + element.duration;
				const inRange =
					elementStart >= range.start - epsilon &&
					elementEnd <= range.end + epsilon &&
					elementEnd > elementStart + epsilon;
				if (!inRange) {
					return true;
				}

				deletedCount += 1;
				return false;
			}) as typeof track.elements;

			return {
				...track,
				elements: nextElements,
			} as TimelineTrack;
		})
		.filter((track) => track.elements.length > 0 || isMainTrack(track));

	return {
		tracks: nextTracks,
		deletedCount,
	};
}

export function getDeletedDurationBeforeTime({
	time,
	deleteRanges,
	epsilon = DEFAULT_EPSILON,
}: {
	time: number;
	deleteRanges: TimeRange[];
	epsilon?: number;
}): number {
	let deleted = 0;
	for (const range of deleteRanges) {
		if (time >= range.end - epsilon) {
			deleted += range.end - range.start;
			continue;
		}
		if (time <= range.start + epsilon) {
			break;
		}
		deleted += Math.max(0, time - range.start);
		break;
	}
	return deleted;
}

export function rippleCompressTracks({
	tracks,
	deleteRanges,
	shouldShift,
	epsilon = DEFAULT_EPSILON,
}: {
	tracks: TimelineTrack[];
	deleteRanges: TimeRange[];
	shouldShift?: ElementPredicate;
	epsilon?: number;
}): { tracks: TimelineTrack[]; movedElementCount: number } {
	if (deleteRanges.length === 0) {
		return { tracks, movedElementCount: 0 };
	}

	const sortedRanges = [...deleteRanges]
		.filter((range) => range.end > range.start)
		.sort((a, b) => a.start - b.start);
	if (sortedRanges.length === 0) {
		return { tracks, movedElementCount: 0 };
	}

	let movedElementCount = 0;
	const compressedTracks = tracks.map((track) => {
		const nextElements = track.elements.map((element) => {
			if (shouldShift && !shouldShift({ trackId: track.id, element })) {
				return element;
			}

			const shift = getDeletedDurationBeforeTime({
				time: element.startTime,
				deleteRanges: sortedRanges,
				epsilon,
			});
			if (shift <= epsilon) {
				return element;
			}

			movedElementCount += 1;
			return {
				...element,
				startTime: Math.max(0, roundTime(element.startTime - shift)),
			};
		}) as typeof track.elements;

		return {
			...track,
			elements: nextElements,
		} as TimelineTrack;
	});

	return {
		tracks: compressedTracks,
		movedElementCount,
	};
}
