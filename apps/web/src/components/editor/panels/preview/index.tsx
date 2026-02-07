"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { useEditor } from "@/hooks/use-editor";
import { useRafLoop } from "@/hooks/use-raf-loop";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import { buildScene } from "@/services/renderer/scene-builder";
import { getLastFrameTime } from "@/lib/time";
import { useAgentUiStore } from "@/stores/agent-ui-store";
import { Button } from "@/components/ui/button";
import { Ban, Loader2, Pause, Play } from "lucide-react";

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
	return (
		<div className="bg-panel relative flex h-full min-h-0 w-full min-w-0 flex-col rounded-sm">
			<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-2">
				<PreviewCanvas />
				<RenderTreeController />
				<AgentPreviewOverlay />
			</div>
		</div>
	);
}

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
					<div className="flex items-center gap-2 rounded-md border border-border/80 bg-background/92 px-3 py-2 text-xs shadow-sm">
						<Loader2 className="size-3.5 animate-spin text-primary" />
						<div className="flex min-w-0 flex-col">
							<span className="font-medium">AI 正在处理</span>
							<span className="truncate text-muted-foreground">
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
	const ref = useRef<HTMLCanvasElement>(null);
	const lastFrameRef = useRef(-1);
	const lastSceneRef = useRef<RootNode | null>(null);
	const renderingRef = useRef(false);
	const { width, height } = usePreviewSize();
	const editor = useEditor();
	const activeProject = editor.project.getActive();

	const renderer = useMemo(() => {
		return new CanvasRenderer({
			width,
			height,
			fps: activeProject.settings.fps,
		});
	}, [width, height, activeProject.settings.fps]);
	const highlightPreview = useAgentUiStore((state) => state.highlightPreview);
	const highlightPreviewPlaybackEnabled = useAgentUiStore(
		(state) => state.highlightPreviewPlaybackEnabled,
	);
	const setHighlightPreviewPlaybackEnabled = useAgentUiStore(
		(state) => state.setHighlightPreviewPlaybackEnabled,
	);

	const renderTree = editor.renderer.getRenderTree();

	const render = useCallback(() => {
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

		if (ref.current && renderTree && !renderingRef.current) {
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
						targetCanvas: ref.current,
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

	useEffect(() => {
		return () => {
			setHighlightPreviewPlaybackEnabled({ enabled: false });
		};
	}, [setHighlightPreviewPlaybackEnabled]);

	useRafLoop(render);

	return (
		<canvas
			ref={ref}
			width={width}
			height={height}
			className="block max-h-full max-w-full border"
			style={{
				background:
					activeProject.settings.background.type === "blur"
						? "transparent"
						: activeProject?.settings.background.color,
			}}
		/>
	);
}
