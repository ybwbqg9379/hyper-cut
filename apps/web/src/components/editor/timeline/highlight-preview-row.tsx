import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { useAgentUiStore } from "@/stores/agent-ui-store";

interface TimelineHighlightPreviewRowProps {
	zoomLevel: number;
	dynamicTimelineWidth: number;
	handleWheel: (e: React.WheelEvent) => void;
	handleTimelineContentClick: (e: React.MouseEvent) => void;
	handleRulerTrackingMouseDown: (e: React.MouseEvent) => void;
	handleRulerMouseDown: (e: React.MouseEvent) => void;
}

export function TimelineHighlightPreviewRow({
	zoomLevel,
	dynamicTimelineWidth,
	handleWheel,
	handleTimelineContentClick,
	handleRulerTrackingMouseDown,
	handleRulerMouseDown,
}: TimelineHighlightPreviewRowProps) {
	const highlightPreview = useAgentUiStore((state) => state.highlightPreview);
	if (!highlightPreview) return null;

	const pixelsPerSecond = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

	return (
		<div className="relative h-5 flex-1 overflow-hidden border-t border-border/60 bg-background/75">
			<button
				type="button"
				className="relative h-5 w-full cursor-default select-none border-0 bg-transparent p-0"
				style={{ width: `${dynamicTimelineWidth}px` }}
				aria-label="AI highlight preview ranges"
				onWheel={handleWheel}
				onClick={handleTimelineContentClick}
				onMouseDown={(event) => {
					handleRulerMouseDown(event);
					handleRulerTrackingMouseDown(event);
				}}
			>
				{highlightPreview.deleteRanges.map((range, index) => (
					<div
						key={`delete-range-${range.start}-${range.end}-${index}`}
						className="absolute top-0 h-5 border-destructive/40 border-x bg-destructive/18"
						style={{
							left: `${Math.max(0, range.start * pixelsPerSecond)}px`,
							width: `${Math.max(
								1,
								(range.end - range.start) * pixelsPerSecond,
							)}px`,
						}}
					/>
				))}
				{highlightPreview.keepRanges.map((range, index) => (
					<div
						key={`keep-range-${range.start}-${range.end}-${index}`}
						className="absolute top-0 h-5 border-constructive/55 border-x bg-constructive/20"
						style={{
							left: `${Math.max(0, range.start * pixelsPerSecond)}px`,
							width: `${Math.max(
								1,
								(range.end - range.start) * pixelsPerSecond,
							)}px`,
						}}
						title={
							range.reason
								? `${range.start.toFixed(2)}s - ${range.end.toFixed(2)}s | ${range.reason}`
								: `${range.start.toFixed(2)}s - ${range.end.toFixed(2)}s`
						}
					/>
				))}
			</button>
		</div>
	);
}
