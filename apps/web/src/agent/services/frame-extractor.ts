import type { MediaAsset } from "@/types/assets";
import { videoCache } from "@/services/video-cache/service";
import { encodeCanvasAsJpeg } from "../utils/image";

const DEFAULT_INTERVAL_SECONDS = 10;
const DEFAULT_MAX_FRAMES = 60;
const MIN_INTERVAL_SECONDS = 0.1;
const DEFAULT_JPEG_QUALITY = 0.8;

export interface SampledVideoFrame {
	timestamp: number;
	duration: number;
	canvas: HTMLCanvasElement | OffscreenCanvas;
	width: number;
	height: number;
}

export interface EncodedVideoFrame {
	timestamp: number;
	duration: number;
	width: number;
	height: number;
	dataUrl: string;
	base64: string;
}

function clampIntervalSeconds(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return DEFAULT_INTERVAL_SECONDS;
	}
	return Math.max(MIN_INTERVAL_SECONDS, value);
}

function resolveDurationSeconds({
	asset,
	durationSeconds,
}: {
	asset: MediaAsset;
	durationSeconds?: number;
}): number {
	const resolved = durationSeconds ?? asset.duration ?? 0;
	if (!Number.isFinite(resolved) || resolved <= 0) {
		throw new Error("无法确定视频时长，请先确保素材包含 duration 元数据");
	}
	return resolved;
}

function buildTimestamps({
	durationSeconds,
	intervalSeconds,
	maxFrames,
}: {
	durationSeconds: number;
	intervalSeconds: number;
	maxFrames: number;
}): number[] {
	const timestamps: number[] = [];
	const step = clampIntervalSeconds(intervalSeconds);
	const frameLimit =
		Number.isFinite(maxFrames) && maxFrames > 0
			? Math.floor(maxFrames)
			: DEFAULT_MAX_FRAMES;

	for (
		let time = 0;
		time < durationSeconds && timestamps.length < frameLimit;
		time += step
	) {
		timestamps.push(Math.max(0, Math.min(durationSeconds, time)));
	}

	if (timestamps.length === 0) {
		timestamps.push(0);
	}

	return timestamps;
}

export class FrameExtractorService {
	async sampleVideoFrames({
		asset,
		durationSeconds,
		intervalSeconds = DEFAULT_INTERVAL_SECONDS,
		maxFrames = DEFAULT_MAX_FRAMES,
	}: {
		asset: MediaAsset;
		durationSeconds?: number;
		intervalSeconds?: number;
		maxFrames?: number;
	}): Promise<SampledVideoFrame[]> {
		if (asset.type !== "video") {
			throw new Error(`素材不是视频: ${asset.id}`);
		}

		const targetDuration = resolveDurationSeconds({ asset, durationSeconds });
		const timestamps = buildTimestamps({
			durationSeconds: targetDuration,
			intervalSeconds,
			maxFrames,
		});

		return this.sampleVideoFramesAtTimestamps({ asset, timestamps });
	}

	async sampleVideoFramesAtTimestamps({
		asset,
		timestamps,
	}: {
		asset: MediaAsset;
		timestamps: number[];
	}): Promise<SampledVideoFrame[]> {
		if (asset.type !== "video") {
			throw new Error(`素材不是视频: ${asset.id}`);
		}
		if (!asset.file) {
			throw new Error(`视频素材缺少文件对象: ${asset.id}`);
		}

		const sortedTimestamps = [...timestamps]
			.filter(
				(value) =>
					typeof value === "number" && Number.isFinite(value) && value >= 0,
			)
			.sort((a, b) => a - b);

		const frames: SampledVideoFrame[] = [];
		for (const timestamp of sortedTimestamps) {
			const wrapped = await videoCache.getFrameAt({
				mediaId: asset.id,
				file: asset.file,
				time: timestamp,
			});

			if (!wrapped) {
				continue;
			}

			frames.push({
				timestamp: wrapped.timestamp,
				duration: wrapped.duration,
				canvas: wrapped.canvas,
				width: wrapped.canvas.width,
				height: wrapped.canvas.height,
			});
		}

		return frames;
	}

	async encodeFramesAsJpeg({
		frames,
		quality = DEFAULT_JPEG_QUALITY,
	}: {
		frames: SampledVideoFrame[];
		quality?: number;
	}): Promise<EncodedVideoFrame[]> {
		const encodedFrames: EncodedVideoFrame[] = [];
		for (const frame of frames) {
			const encoded = await encodeCanvasAsJpeg({
				canvas: frame.canvas,
				quality,
			});

			encodedFrames.push({
				timestamp: frame.timestamp,
				duration: frame.duration,
				width: encoded.width,
				height: encoded.height,
				dataUrl: encoded.dataUrl,
				base64: encoded.base64,
			});
		}
		return encodedFrames;
	}
}

export const frameExtractorService = new FrameExtractorService();
