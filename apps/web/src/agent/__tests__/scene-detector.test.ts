import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaAsset } from "@/types/assets";
import {
	SceneDetectorService,
	computeFrameDiff,
} from "../services/scene-detector";
import { frameExtractorService } from "../services/frame-extractor";

vi.mock("../services/frame-extractor", () => ({
	frameExtractorService: {
		sampleVideoFrames: vi.fn(),
	},
}));

class FakeOffscreenCanvas {
	width: number;
	height: number;
	private source: { data?: Uint8ClampedArray } | null = null;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
	}

	getContext(): OffscreenCanvasRenderingContext2D {
		return {
			clearRect: () => {},
			drawImage: (image: { data?: Uint8ClampedArray }) => {
				this.source = image;
			},
			getImageData: () => ({
				data:
					this.source?.data ??
					new Uint8ClampedArray(this.width * this.height * 4),
			}),
		} as unknown as OffscreenCanvasRenderingContext2D;
	}
}

function createFrameData({
	r,
	g,
	b,
	width = 160,
	height = 90,
}: {
	r: number;
	g: number;
	b: number;
	width?: number;
	height?: number;
}): Uint8ClampedArray {
	const pixelCount = width * height;
	const data = new Uint8ClampedArray(pixelCount * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = r;
		data[i + 1] = g;
		data[i + 2] = b;
		data[i + 3] = 255;
	}
	return data;
}

function createVideoAsset(id: string): MediaAsset {
	return {
		id,
		name: `video-${id}`,
		type: "video",
		file: new File([], `${id}.mp4`, { type: "video/mp4" }),
		duration: 3,
	} as unknown as MediaAsset;
}

describe("SceneDetectorService", () => {
	const service = new SceneDetectorService();

	beforeEach(() => {
		vi.clearAllMocks();
		(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas =
			FakeOffscreenCanvas;
	});

	it("computeFrameDiff should return normalized diff", () => {
		const previousFrame = {
			timestamp: 0,
			duration: 1,
			canvas: {
				width: 2,
				height: 1,
				data: createFrameData({ r: 0, g: 0, b: 0, width: 2, height: 1 }),
			},
			width: 2,
			height: 1,
		};
		const currentFrame = {
			timestamp: 1,
			duration: 1,
			canvas: {
				width: 2,
				height: 1,
				data: createFrameData({ r: 255, g: 255, b: 255, width: 2, height: 1 }),
			},
			width: 2,
			height: 1,
		};

		const diff = computeFrameDiff({
			previousFrame: previousFrame as never,
			currentFrame: currentFrame as never,
			width: 2,
			height: 1,
		});

		expect(diff).toBeGreaterThan(0.9);
		expect(diff).toBeLessThanOrEqual(1);
	});

	it("detectScenes should split scenes when diff crosses threshold", async () => {
		vi.mocked(frameExtractorService.sampleVideoFrames).mockResolvedValue([
			{
				timestamp: 0,
				duration: 1,
				canvas: {
					width: 160,
					height: 90,
					data: createFrameData({ r: 0, g: 0, b: 0 }),
				},
				width: 160,
				height: 90,
			},
			{
				timestamp: 1,
				duration: 1,
				canvas: {
					width: 160,
					height: 90,
					data: createFrameData({ r: 255, g: 255, b: 255 }),
				},
				width: 160,
				height: 90,
			},
			{
				timestamp: 2,
				duration: 1,
				canvas: {
					width: 160,
					height: 90,
					data: createFrameData({ r: 255, g: 255, b: 255 }),
				},
				width: 160,
				height: 90,
			},
		] as never);

		const result = await service.detectScenes({
			asset: createVideoAsset("b"),
			threshold: 0.2,
		});

		expect(result.sampleCount).toBe(3);
		expect(result.scenes.length).toBe(2);
		expect(result.scenes[0]?.startTime).toBe(0);
		expect(result.scenes[0]?.endTime).toBe(1);
		expect(result.scenes[1]?.startTime).toBe(1);
	});
});
