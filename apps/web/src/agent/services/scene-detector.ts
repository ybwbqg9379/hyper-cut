import type { MediaAsset } from '@/types/assets';
import { frameExtractorService, type SampledVideoFrame } from './frame-extractor';

const DEFAULT_SCENE_DIFF_THRESHOLD = 0.3;
const DEFAULT_SAMPLE_INTERVAL_SECONDS = 1;
const DEFAULT_MAX_FRAMES = 600;
const DETECTOR_WIDTH = 160;
const DETECTOR_HEIGHT = 90;

export interface SceneBoundary {
  startTime: number;
  endTime: number;
  keyframeTimestamp: number;
  diffScore: number;
}

function createWorkingCanvas({
  width,
  height,
}: {
  width: number;
  height: number;
}): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  throw new Error('Canvas API unavailable in current runtime');
}

function getCanvasContext(canvas: HTMLCanvasElement | OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Failed to get canvas context for scene detection');
  }
  return context as OffscreenCanvasRenderingContext2D;
}

function readDownsampledPixels({
  frame,
  width,
  height,
  workingCanvas,
}: {
  frame: SampledVideoFrame;
  width: number;
  height: number;
  workingCanvas: HTMLCanvasElement | OffscreenCanvas;
}): Uint8ClampedArray {
  const context = getCanvasContext(workingCanvas);
  context.clearRect(0, 0, width, height);
  context.drawImage(frame.canvas, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return imageData.data;
}

export function computeFrameDiff({
  previousFrame,
  currentFrame,
  width = DETECTOR_WIDTH,
  height = DETECTOR_HEIGHT,
}: {
  previousFrame: SampledVideoFrame;
  currentFrame: SampledVideoFrame;
  width?: number;
  height?: number;
}): number {
  const workingCanvas = createWorkingCanvas({ width, height });
  const previousPixels = readDownsampledPixels({
    frame: previousFrame,
    width,
    height,
    workingCanvas,
  });
  const currentPixels = readDownsampledPixels({
    frame: currentFrame,
    width,
    height,
    workingCanvas,
  });

  let totalDiff = 0;
  const channelCount = 3;
  for (let i = 0; i < previousPixels.length; i += 4) {
    totalDiff += Math.abs(previousPixels[i] - currentPixels[i]);
    totalDiff += Math.abs(previousPixels[i + 1] - currentPixels[i + 1]);
    totalDiff += Math.abs(previousPixels[i + 2] - currentPixels[i + 2]);
  }

  const pixelCount = width * height;
  const maxDiff = pixelCount * 255 * channelCount;
  return maxDiff > 0 ? totalDiff / maxDiff : 0;
}

function resolveDuration({
  asset,
  durationSeconds,
  frames,
}: {
  asset: MediaAsset;
  durationSeconds?: number;
  frames: SampledVideoFrame[];
}): number {
  const byArg = durationSeconds;
  if (typeof byArg === 'number' && Number.isFinite(byArg) && byArg > 0) {
    return byArg;
  }

  const byAsset = asset.duration;
  if (typeof byAsset === 'number' && Number.isFinite(byAsset) && byAsset > 0) {
    return byAsset;
  }

  const lastFrame = frames[frames.length - 1];
  if (!lastFrame) {
    return 0;
  }
  return lastFrame.timestamp + lastFrame.duration;
}

function normalizeThreshold(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SCENE_DIFF_THRESHOLD;
  }
  return Math.max(0, Math.min(1, value));
}

export class SceneDetectorService {
  async detectScenes({
    asset,
    durationSeconds,
    sampleIntervalSeconds = DEFAULT_SAMPLE_INTERVAL_SECONDS,
    threshold = DEFAULT_SCENE_DIFF_THRESHOLD,
    maxFrames = DEFAULT_MAX_FRAMES,
  }: {
    asset: MediaAsset;
    durationSeconds?: number;
    sampleIntervalSeconds?: number;
    threshold?: number;
    maxFrames?: number;
  }): Promise<{
    scenes: SceneBoundary[];
    sampleCount: number;
  }> {
    const frames = await frameExtractorService.sampleVideoFrames({
      asset,
      durationSeconds,
      intervalSeconds: sampleIntervalSeconds,
      maxFrames,
    });

    if (frames.length === 0) {
      return { scenes: [], sampleCount: 0 };
    }

    const normalizedThreshold = normalizeThreshold(threshold);
    const totalDuration = resolveDuration({ asset, durationSeconds, frames });
    const scenes: SceneBoundary[] = [];

    let sceneStart = frames[0].timestamp;
    let previousFrame = frames[0];
    let latestDiff = 0;

    for (let i = 1; i < frames.length; i++) {
      const currentFrame = frames[i];
      const diffScore = computeFrameDiff({
        previousFrame,
        currentFrame,
      });
      latestDiff = diffScore;

      if (diffScore >= normalizedThreshold) {
        const endTime = Math.max(sceneStart, currentFrame.timestamp);
        scenes.push({
          startTime: sceneStart,
          endTime,
          keyframeTimestamp: (sceneStart + endTime) / 2,
          diffScore,
        });
        sceneStart = currentFrame.timestamp;
      }

      previousFrame = currentFrame;
    }

    const finalEnd = Math.max(sceneStart, totalDuration || previousFrame.timestamp);
    scenes.push({
      startTime: sceneStart,
      endTime: finalEnd,
      keyframeTimestamp: (sceneStart + finalEnd) / 2,
      diffScore: latestDiff,
    });

    return {
      scenes,
      sampleCount: frames.length,
    };
  }
}

export const sceneDetectorService = new SceneDetectorService();
