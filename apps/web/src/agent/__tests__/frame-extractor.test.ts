import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MediaAsset } from "@/types/assets";
import { FrameExtractorService } from "../services/frame-extractor";
import { videoCache } from "@/services/video-cache/service";
import { encodeCanvasAsJpeg } from "../utils/image";

vi.mock("@/services/video-cache/service", () => ({
	videoCache: {
		getFrameAt: vi.fn(),
	},
}));

vi.mock("../utils/image", () => ({
	encodeCanvasAsJpeg: vi.fn(),
}));

function createVideoAsset(id: string): MediaAsset {
	return {
		id,
		name: `video-${id}`,
		type: "video",
		file: new File([], `${id}.mp4`, { type: "video/mp4" }),
		duration: 20,
	} as unknown as MediaAsset;
}

describe("FrameExtractorService", () => {
	const service = new FrameExtractorService();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("sampleVideoFramesAtTimestamps should filter invalid timestamps and sort", async () => {
		vi.mocked(videoCache.getFrameAt).mockImplementation(async ({ time }) => {
			return {
				timestamp: time,
				duration: 0.5,
				canvas: {
					width: 1920,
					height: 1080,
				} as unknown as HTMLCanvasElement,
			};
		});

		const frames = await service.sampleVideoFramesAtTimestamps({
			asset: createVideoAsset("a"),
			timestamps: [3, -1, Number.NaN, 1],
		});

		expect(vi.mocked(videoCache.getFrameAt)).toHaveBeenCalledTimes(2);
		expect(frames.map((item) => item.timestamp)).toEqual([1, 3]);
		expect(frames[0]?.width).toBe(1920);
		expect(frames[0]?.height).toBe(1080);
	});

	it("encodeFramesAsJpeg should map encoded metadata", async () => {
		vi.mocked(encodeCanvasAsJpeg).mockResolvedValue({
			dataUrl: "data:image/jpeg;base64,abc",
			base64: "abc",
			width: 320,
			height: 180,
		});

		const encoded = await service.encodeFramesAsJpeg({
			frames: [
				{
					timestamp: 1,
					duration: 0.5,
					canvas: { width: 320, height: 180 } as unknown as HTMLCanvasElement,
					width: 320,
					height: 180,
				},
			],
		});

		expect(vi.mocked(encodeCanvasAsJpeg)).toHaveBeenCalledTimes(1);
		expect(encoded).toEqual([
			{
				timestamp: 1,
				duration: 0.5,
				width: 320,
				height: 180,
				dataUrl: "data:image/jpeg;base64,abc",
				base64: "abc",
			},
		]);
	});
});
