import type {
	HighlightPlan,
	ScoredSegment,
	SelectedSegment,
} from "../tools/highlight-types";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function overlaps(left: ScoredSegment, right: ScoredSegment): boolean {
	return (
		left.chunk.startTime < right.chunk.endTime &&
		right.chunk.startTime < left.chunk.endTime
	);
}

function getDuration(segment: ScoredSegment): number {
	return Math.max(0, segment.chunk.endTime - segment.chunk.startTime);
}

function findBestHookSegment(segments: ScoredSegment[]): ScoredSegment | null {
	const withHookScores = segments
		.filter((segment) => segment.semanticScores !== null)
		.sort((a, b) => {
			const aHook = a.semanticScores?.hookPotential ?? 0;
			const bHook = b.semanticScores?.hookPotential ?? 0;
			return bHook - aHook;
		});

	return withHookScores[0] ?? null;
}

function buildSelectionReason(segment: ScoredSegment): string {
	const reasons: Array<{ label: string; value: number }> = [];

	reasons.push({
		label: "规则密度高",
		value: segment.ruleScores.contentDensity,
	});
	reasons.push({
		label: "互动信号强",
		value: segment.ruleScores.engagementMarkers,
	});

	if (segment.semanticScores) {
		reasons.push({
			label: "信息重要度高",
			value: segment.semanticScores.importance / 10,
		});
		reasons.push({
			label: "开头吸引力强",
			value: segment.semanticScores.hookPotential / 10,
		});
	}

	if (segment.visualScores) {
		reasons.push({
			label: "画面吸引力高",
			value: segment.visualScores.visualInterest,
		});
	}

	reasons.sort((a, b) => b.value - a.value);
	const topReason = reasons[0];
	if (!topReason) {
		return "综合评分靠前";
	}

	return `${topReason.label}，综合评分高`;
}

function toSelectedSegment(segment: ScoredSegment): SelectedSegment {
	return {
		chunk: segment.chunk,
		combinedScore: segment.combinedScore,
		reason: buildSelectionReason(segment),
		thumbnailDataUrl: segment.thumbnailDataUrl,
	};
}

export class SegmentSelectorService {
	selectSegments(
		segments: ScoredSegment[],
		targetDuration: number,
		tolerance = 0.15,
		{
			includeHook = true,
		}: {
			includeHook?: boolean;
		} = {},
	): HighlightPlan {
		const normalizedTargetDuration =
			Number.isFinite(targetDuration) && targetDuration > 0
				? targetDuration
				: 60;
		const normalizedTolerance = clamp(
			Number.isFinite(tolerance) ? tolerance : 0.15,
			0,
			0.5,
		);

		const ranked = [...segments].sort(
			(a, b) => b.combinedScore - a.combinedScore,
		);
		const minDuration = normalizedTargetDuration * (1 - normalizedTolerance);
		const maxDuration = normalizedTargetDuration * (1 + normalizedTolerance);

		const selected: ScoredSegment[] = [];
		let currentDuration = 0;

		for (const candidate of ranked) {
			const candidateDuration = getDuration(candidate);
			if (candidateDuration <= 0) continue;
			if (selected.some((segment) => overlaps(segment, candidate))) continue;

			if (
				currentDuration + candidateDuration > maxDuration &&
				currentDuration >= minDuration
			) {
				continue;
			}

			selected.push(candidate);
			currentDuration += candidateDuration;

			if (currentDuration >= minDuration && currentDuration <= maxDuration) {
				break;
			}
		}

		if (currentDuration < minDuration) {
			for (const candidate of ranked) {
				if (selected.includes(candidate)) continue;
				const candidateDuration = getDuration(candidate);
				if (candidateDuration <= 0) continue;
				if (selected.some((segment) => overlaps(segment, candidate))) continue;

				if (
					currentDuration + candidateDuration > maxDuration &&
					currentDuration > 0
				) {
					continue;
				}

				selected.push(candidate);
				currentDuration += candidateDuration;

				if (currentDuration >= minDuration) {
					break;
				}
			}
		}

		if (includeHook && selected.length > 0) {
			const bestHook = findBestHookSegment(ranked);
			if (bestHook && !selected.includes(bestHook)) {
				const orderedSelected = [...selected].sort(
					(a, b) => a.chunk.startTime - b.chunk.startTime,
				);
				const firstSegment = orderedSelected[0];

				if (firstSegment) {
					const hookScore = bestHook.semanticScores?.hookPotential ?? 0;
					const firstHookScore =
						firstSegment.semanticScores?.hookPotential ?? 0;
					const withoutFirst = selected.filter(
						(segment) => segment !== firstSegment,
					);
					const overlapsOthers = withoutFirst.some((segment) =>
						overlaps(segment, bestHook),
					);
					const nextDuration =
						currentDuration - getDuration(firstSegment) + getDuration(bestHook);

					if (
						!overlapsOthers &&
						hookScore >= firstHookScore + 2 &&
						nextDuration <= maxDuration
					) {
						const index = selected.indexOf(firstSegment);
						if (index >= 0) {
							selected[index] = bestHook;
							currentDuration = nextDuration;
						}
					}
				}
			}
		}

		const ordered = [...selected].sort(
			(a, b) => a.chunk.startTime - b.chunk.startTime,
		);
		const actualDuration = ordered.reduce(
			(sum, segment) => sum + getDuration(segment),
			0,
		);

		const sourceStart =
			segments.length > 0
				? Math.min(...segments.map((segment) => segment.chunk.startTime))
				: 0;
		const sourceEnd =
			segments.length > 0
				? Math.max(...segments.map((segment) => segment.chunk.endTime))
				: 0;
		const sourceDuration = Math.max(0.001, sourceEnd - sourceStart);

		return {
			targetDuration: normalizedTargetDuration,
			actualDuration: Number(actualDuration.toFixed(2)),
			segments: ordered.map(toSelectedSegment),
			totalSegments: segments.length,
			coveragePercent: Number(
				((actualDuration / sourceDuration) * 100).toFixed(2),
			),
		};
	}
}

export const segmentSelectorService = new SegmentSelectorService();
