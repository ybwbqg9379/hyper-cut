"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { useEditor } from "@/hooks/use-editor";
import { useRafLoop } from "@/hooks/use-raf-loop";
import { useContainerSize } from "@/hooks/use-container-size";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import { buildScene } from "@/services/renderer/scene-builder";
import { formatTimeCode, getLastFrameTime } from "@/lib/time";
// HyperCut: Agent highlight preview overlay
import { useAgentUiStore } from "@/stores/agent-ui-store";
import { Ban, Loader2, Pause, Play } from "lucide-react";
import { PreviewInteractionOverlay } from "./preview-interaction-overlay";
import { EditableTimecode } from "@/components/editable-timecode";
import { invokeAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
	FullScreenIcon,
	PauseIcon,
	PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/utils/ui";

function usePreviewSize() {
	const editor = useEditor();
	const activeProject = editor.project.getActive();

	return {
		width: activeProject?.settings.canvasSize.width,
		height: activeProject?.settings.canvasSize.height,
	};
}

function RenderTreeController() {
	const editor = useEditor();
	const tracks = editor.timeline.getTracks();
	const mediaAssets = editor.media.getAssets();
	const activeProject = editor.project.getActive();

	const { width, height } = usePreviewSize();

	useDeepCompareEffect(() => {
		if (!activeProject) return;

		const duration = editor.timeline.getTotalDuration();
		const renderTree = buildScene({
			tracks,
			mediaAssets,
			duration,
			canvasSize: { width, height },
			background: activeProject.settings.background,
		});

		editor.renderer.setRenderTree({ renderTree });
	}, [tracks, mediaAssets, activeProject?.settings.background, width, height]);

	return null;
}

export function PreviewPanel() {
	const containerRef = useRef<HTMLDivElement>(null);
	const { isFullscreen, toggleFullscreen } = useFullscreen({ containerRef });

	return (
		<div
			ref={containerRef}
			className={cn(
				"panel bg-background relative flex h-full min-h-0 w-full min-w-0 flex-col rounded-sm border",
				isFullscreen && "bg-background",
			)}
		>
			<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-2 pb-0">
				<PreviewCanvas />
				<RenderTreeController />
				{/* HyperCut: Agent highlight preview overlay */}
				<AgentPreviewOverlay />
			</div>
			<PreviewToolbar
				isFullscreen={isFullscreen}
				onToggleFullscreen={toggleFullscreen}
			/>
		</div>
	);
}

function PreviewToolbar({
	isFullscreen,
	onToggleFullscreen,
}: {
	isFullscreen: boolean;
	onToggleFullscreen: () => void;
}) {
	const editor = useEditor();
	const isPlaying = editor.playback.getIsPlaying();
	const currentTime = editor.playback.getCurrentTime();
	const totalDuration = editor.timeline.getTotalDuration();
	const fps = editor.project.getActive().settings.fps;

	return (
		<div className="grid grid-cols-[1fr_auto_1fr] items-center pb-3 pt-5 px-5">
			<div className="flex items-center mt-1">
				<EditableTimecode
					time={currentTime}
					duration={totalDuration}
					format="HH:MM:SS:FF"
					fps={fps}
					onTimeChange={({ time }) => editor.playback.seek({ time })}
					className="text-center"
				/>
				<span className="text-muted-foreground px-2 font-mono text-xs">/</span>
				<span className="text-muted-foreground font-mono text-xs">
					{formatTimeCode({
						timeInSeconds: totalDuration,
						format: "HH:MM:SS:FF",
						fps,
					})}
				</span>
			</div>

			<Button
				variant="text"
				size="icon"
				type="button"
				onClick={() => invokeAction("toggle-play")}
			>
				<HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} />
			</Button>

			<div className="justify-self-end">
				<Button
					variant="text"
					size="icon"
					type="button"
					onClick={onToggleFullscreen}
					title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
				>
					<HugeiconsIcon icon={FullScreenIcon} />
				</Button>
			</div>
		</div>
	);
}

// HyperCut: Agent highlight preview overlay component
function AgentPreviewOverlay() {
	const editor = useEditor();
	const highlightPreview = useAgentUiStore((state) => state.highlightPreview);
	const highlightPreviewPlaybackEnabled = useAgentUiStore(
		(state) => state.highlightPreviewPlaybackEnabled,
	);
	const setHighlightPreviewPlaybackEnabled = useAgentUiStore(
		(state) => state.setHighlightPreviewPlaybackEnabled,
	);
	const clearHighlightPreview = useAgentUiStore(
		(state) => state.clearHighlightPreview,
	);
	const executionProgress = useAgentUiStore((state) => state.executionProgress);

	const handleTogglePreviewPlayback = useCallback(() => {
		if (!highlightPreview || highlightPreview.keepRanges.length === 0) {
			return;
		}

		if (highlightPreviewPlaybackEnabled) {
			setHighlightPreviewPlaybackEnabled({ enabled: false });
			editor.playback.pause();
			return;
		}

		const firstRange = highlightPreview.keepRanges[0];
		if (!firstRange) return;
		editor.playback.seek({ time: firstRange.start });
		editor.playback.play();
		setHighlightPreviewPlaybackEnabled({ enabled: true });
	}, [
		highlightPreview,
		highlightPreviewPlaybackEnabled,
		setHighlightPreviewPlaybackEnabled,
		editor.playback,
	]);

	const handleClearHighlightPreview = useCallback(() => {
		setHighlightPreviewPlaybackEnabled({ enabled: false });
		clearHighlightPreview();
	}, [clearHighlightPreview, setHighlightPreviewPlaybackEnabled]);

	return (
		<>
			{executionProgress ? (
				<div className="pointer-events-none absolute top-3 right-3 left-3 z-20 flex justify-center">
					<div className="flex w-full max-w-[min(92vw,560px)] items-center gap-2 overflow-hidden rounded-md border border-border/80 bg-background/92 px-3 py-2 text-xs shadow-sm">
						<Loader2 className="size-3.5 animate-spin text-primary" />
						<div className="flex min-w-0 flex-col">
							<span className="font-medium">AI 正在处理</span>
							<span className="block max-w-full truncate text-muted-foreground">
								{executionProgress.message}
							</span>
						</div>
					</div>
				</div>
			) : null}

			{highlightPreview ? (
				<div className="pointer-events-none absolute bottom-3 left-3 z-20">
					<div className="pointer-events-auto min-w-[220px] rounded-md border border-border/80 bg-background/95 p-2 shadow-sm">
						<div className="text-xs font-medium">精华预览</div>
						<div className="mt-1 text-[11px] text-muted-foreground">
							保留 {highlightPreview.keepRanges.length} 段，删除{" "}
							{highlightPreview.deleteRanges.length} 段
						</div>
						<div className="mt-2 flex items-center gap-1.5">
							<Button
								size="sm"
								variant="secondary"
								className="h-7 px-2 text-[11px]"
								onClick={handleTogglePreviewPlayback}
							>
								{highlightPreviewPlaybackEnabled ? (
									<Pause className="size-3 mr-1" />
								) : (
									<Play className="size-3 mr-1" />
								)}
								{highlightPreviewPlaybackEnabled ? "停止预览" : "播放预览"}
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="h-7 px-2 text-[11px]"
								onClick={handleClearHighlightPreview}
							>
								<Ban className="size-3 mr-1" />
								清除
							</Button>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}

function PreviewCanvas() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const lastFrameRef = useRef(-1);
	const lastSceneRef = useRef<RootNode | null>(null);
	const renderingRef = useRef(false);
	const { width: nativeWidth, height: nativeHeight } = usePreviewSize();
	const containerSize = useContainerSize({ containerRef });
	const editor = useEditor();
	const activeProject = editor.project.getActive();

	const renderer = useMemo(() => {
		return new CanvasRenderer({
			width: nativeWidth,
			height: nativeHeight,
			fps: activeProject.settings.fps,
		});
	}, [nativeWidth, nativeHeight, activeProject.settings.fps]);

	// HyperCut: Agent highlight preview playback state
	const highlightPreview = useAgentUiStore((state) => state.highlightPreview);
	const highlightPreviewPlaybackEnabled = useAgentUiStore(
		(state) => state.highlightPreviewPlaybackEnabled,
	);
	const setHighlightPreviewPlaybackEnabled = useAgentUiStore(
		(state) => state.setHighlightPreviewPlaybackEnabled,
	);

	const displaySize = useMemo(() => {
		if (
			!nativeWidth ||
			!nativeHeight ||
			containerSize.width === 0 ||
			containerSize.height === 0
		) {
			return { width: nativeWidth ?? 0, height: nativeHeight ?? 0 };
		}

		const paddingBuffer = 4;
		const availableWidth = containerSize.width - paddingBuffer;
		const availableHeight = containerSize.height - paddingBuffer;

		const aspectRatio = nativeWidth / nativeHeight;
		const containerAspect = availableWidth / availableHeight;

		const displayWidth =
			containerAspect > aspectRatio
				? availableHeight * aspectRatio
				: availableWidth;
		const displayHeight =
			containerAspect > aspectRatio
				? availableHeight
				: availableWidth / aspectRatio;

		return { width: displayWidth, height: displayHeight };
	}, [nativeWidth, nativeHeight, containerSize.width, containerSize.height]);

	const renderTree = editor.renderer.getRenderTree();

	const render = useCallback(() => {
		// HyperCut: Agent highlight preview playback — skip to next keep range
		if (
			highlightPreviewPlaybackEnabled &&
			highlightPreview &&
			highlightPreview.keepRanges.length > 0
		) {
			const currentTime = editor.playback.getCurrentTime();
			const epsilon = 1 / 120;
			const inKeepRange = highlightPreview.keepRanges.some(
				(range) =>
					currentTime >= range.start - epsilon &&
					currentTime < range.end - epsilon,
			);

			if (!inKeepRange) {
				const nextRange = highlightPreview.keepRanges.find(
					(range) => range.start > currentTime - epsilon,
				);
				if (nextRange) {
					editor.playback.seek({ time: nextRange.start });
				} else {
					editor.playback.pause();
					setHighlightPreviewPlaybackEnabled({ enabled: false });
				}
			}
		}

		if (canvasRef.current && renderTree && !renderingRef.current) {
			const time = editor.playback.getCurrentTime();
			const lastFrameTime = getLastFrameTime({
				duration: renderTree.duration,
				fps: renderer.fps,
			});
			const renderTime = Math.min(time, lastFrameTime);
			const frame = Math.floor(renderTime * renderer.fps);

			if (
				frame !== lastFrameRef.current ||
				renderTree !== lastSceneRef.current
			) {
				renderingRef.current = true;
				lastSceneRef.current = renderTree;
				lastFrameRef.current = frame;
				renderer
					.renderToCanvas({
						node: renderTree,
						time: renderTime,
						targetCanvas: canvasRef.current,
					})
					.then(() => {
						renderingRef.current = false;
					});
			}
		}
	}, [
		renderer,
		renderTree,
		editor.playback,
		highlightPreview,
		highlightPreviewPlaybackEnabled,
		setHighlightPreviewPlaybackEnabled,
	]);

	// HyperCut: Cleanup highlight preview on unmount
	useEffect(() => {
		return () => {
			setHighlightPreviewPlaybackEnabled({ enabled: false });
		};
	}, [setHighlightPreviewPlaybackEnabled]);

	useRafLoop(render);

	return (
		<div
			ref={containerRef}
			className="relative flex h-full w-full items-center justify-center"
		>
			<canvas
				ref={canvasRef}
				width={nativeWidth}
				height={nativeHeight}
				className="block border"
				style={{
					width: displaySize.width,
					height: displaySize.height,
					background:
						activeProject.settings.background.type === "blur"
							? "transparent"
							: activeProject?.settings.background.color,
				}}
			/>
			<PreviewInteractionOverlay canvasRef={canvasRef} />
		</div>
	);
}
