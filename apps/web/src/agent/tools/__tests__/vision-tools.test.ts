import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	__resetVisionToolCachesForTests,
	getVisionTools,
} from "../vision-tools";

const {
	mockGetInstance,
	mockProviderChat,
	mockSampleVideoFramesAtTimestamps,
	mockEncodeFramesAsJpeg,
} = vi.hoisted(() => ({
	mockGetInstance: vi.fn(),
	mockProviderChat: vi.fn(),
	mockSampleVideoFramesAtTimestamps: vi.fn(),
	mockEncodeFramesAsJpeg: vi.fn(),
}));

vi.mock("@/core", () => ({
	EditorCore: {
		getInstance: mockGetInstance,
	},
}));

vi.mock("../../providers", () => ({
	createRoutedProvider: vi.fn(() => ({
		name: "mock-vision-provider",
		isAvailable: async () => true,
		chat: mockProviderChat,
	})),
}));

vi.mock("../../services/frame-extractor", () => ({
	frameExtractorService: {
		sampleVideoFramesAtTimestamps: mockSampleVideoFramesAtTimestamps,
		encodeFramesAsJpeg: mockEncodeFramesAsJpeg,
	},
}));

vi.mock("@/lib/timeline/element-utils", () => ({
	canElementHaveAudio: vi.fn(() => false),
	hasMediaId: vi.fn(
		(
			element: Record<string, unknown>,
		): element is Record<string, unknown> & { mediaId: string } =>
			typeof element.mediaId === "string" && element.mediaId.length > 0,
	),
}));

vi.mock("@/services/transcription/service", () => ({
	transcriptionService: {
		getLastResult: vi.fn(() => null),
		transcribe: vi.fn(async () => ({
			text: "",
			segments: [],
			words: [],
			language: "en",
		})),
		cancel: vi.fn(),
	},
}));

function createEditorMock() {
	const tracks = [
		{
			id: "video-track-1",
			type: "video",
			isMain: true,
			elements: [
				{
					id: "video-clip-1",
					type: "video",
					name: "Main clip",
					startTime: 0,
					duration: 12,
					trimStart: 0,
					trimEnd: 0,
					mediaId: "video-asset-1",
					transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
					opacity: 1,
				},
			],
		},
		{
			id: "text-track-1",
			type: "text",
			elements: [
				{
					id: "caption-1",
					type: "text",
					name: "Caption 1",
					content: "Hello world",
					startTime: 0,
					duration: 4,
					trimStart: 0,
					trimEnd: 0,
					fontSize: 48,
					fontFamily: "Arial",
					color: "#fff",
					backgroundColor: "transparent",
					textAlign: "center",
					fontWeight: "normal",
					fontStyle: "normal",
					textDecoration: "none",
					metadata: {
						kind: "caption",
						caption: {
							version: 1,
							source: "whisper",
							origin: "agent-tool",
							segmentIndex: 0,
						},
					},
					transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
					opacity: 1,
				},
			],
		},
	];

	return {
		timeline: {
			getTracks: vi.fn(() => tracks),
			getTotalDuration: vi.fn(() => 12),
			updateElements: vi.fn(),
		},
		selection: {
			getSelectedElements: vi.fn(() => []),
		},
		media: {
			getAssets: vi.fn(() => [
				{
					id: "video-asset-1",
					name: "Demo video",
					type: "video",
					duration: 12,
					ephemeral: false,
					file: new File([], "demo.mp4"),
				},
			]),
		},
		project: {
			getActive: vi.fn(() => ({
				metadata: { id: "project-1" },
				settings: { canvasSize: { width: 1920, height: 1080 } },
			})),
		},
	};
}

function createEditorMockWithoutCaption() {
	const tracks = [
		{
			id: "video-track-1",
			type: "video",
			isMain: true,
			elements: [
				{
					id: "video-clip-1",
					type: "video",
					name: "Main clip",
					startTime: 0,
					duration: 12,
					trimStart: 0,
					trimEnd: 0,
					mediaId: "video-asset-1",
					transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
					opacity: 1,
				},
			],
		},
	];

	return {
		timeline: {
			getTracks: vi.fn(() => tracks),
			getTotalDuration: vi.fn(() => 12),
			updateElements: vi.fn(),
		},
		selection: {
			getSelectedElements: vi.fn(() => []),
		},
		media: {
			getAssets: vi.fn(() => [
				{
					id: "video-asset-1",
					name: "Demo video",
					type: "video",
					duration: 12,
					ephemeral: false,
					file: new File([], "demo.mp4"),
				},
			]),
		},
		project: {
			getActive: vi.fn(() => ({
				metadata: { id: "project-1" },
				settings: { canvasSize: { width: 1920, height: 1080 } },
			})),
		},
	};
}

let editorMock: ReturnType<typeof createEditorMock>;

function findTool(name: string) {
	const tool = getVisionTools().find((candidate) => candidate.name === name);
	if (!tool) {
		throw new Error(`Tool not found: ${name}`);
	}
	return tool;
}

describe("vision tools", () => {
	beforeEach(() => {
		__resetVisionToolCachesForTests();
		mockProviderChat.mockReset();
		mockProviderChat.mockResolvedValue({
			content: JSON.stringify({
				description: "A person speaking in center frame",
				sceneType: "talking-head",
				mood: "neutral",
				people: ["host"],
				textOnScreen: ["topic title"],
				changes: "stable shot",
			}),
			toolCalls: [],
			finishReason: "stop",
		});
		mockSampleVideoFramesAtTimestamps.mockReset();
		mockSampleVideoFramesAtTimestamps.mockResolvedValue([
			{
				timestamp: 1,
				duration: 1,
				width: 1280,
				height: 720,
				canvas: {} as HTMLCanvasElement,
			},
		]);
		mockEncodeFramesAsJpeg.mockReset();
		mockEncodeFramesAsJpeg.mockResolvedValue([
			{
				timestamp: 1,
				duration: 1,
				width: 1280,
				height: 720,
				dataUrl: "data:image/jpeg;base64,ZmFrZQ==",
				base64: "ZmFrZQ==",
			},
		]);
		editorMock = createEditorMock();
		mockGetInstance.mockReturnValue(editorMock);
	});

	it("analyze_frames should output executable layout suggestions", async () => {
		const result = await findTool("analyze_frames").execute({
			timestamps: [1],
			maxFrames: 1,
		});
		expect(result.success).toBe(true);
		const data = result.data as {
			layoutSuggestions?: Array<{
				target: string;
				positionElementArgs?: { anchor?: string };
			}>;
		};
		expect(Array.isArray(data.layoutSuggestions)).toBe(true);
		expect(data.layoutSuggestions?.length).toBeGreaterThan(0);
		expect(
			data.layoutSuggestions?.every(
				(item) => typeof item.positionElementArgs?.anchor === "string",
			),
		).toBe(true);
	});

	it("analyze_frames to apply_layout_suggestion should update timeline with auto target matching", async () => {
		const analyzeResult = await findTool("analyze_frames").execute({
			timestamps: [1],
			maxFrames: 1,
		});
		expect(analyzeResult.success).toBe(true);

		const applyResult = await findTool("apply_layout_suggestion").execute({
			target: "caption",
		});
		expect(applyResult.success).toBe(true);

		expect(editorMock.timeline.updateElements).toHaveBeenCalledWith({
			updates: [
				expect.objectContaining({
					trackId: "text-track-1",
					elementId: "caption-1",
				}),
			],
		});

		expect(
			(
				applyResult.data as {
					autoMatchedElement?: { matchReason?: string };
				}
			).autoMatchedElement,
		).toMatchObject({
			matchReason: "auto-caption-first",
		});
	});

	it("apply_layout_suggestion should return preview when confidence is below threshold", async () => {
		const result = await findTool("apply_layout_suggestion").execute({
			elementId: "caption-1",
			trackId: "text-track-1",
			minConfidence: 0.8,
			suggestion: {
				target: "caption",
				anchor: "bottom-center",
				marginX: 0,
				marginY: 0.08,
				confidence: 0.5,
			},
		});

		expect(result.success).toBe(true);
		expect(
			(
				result.data as {
					stateCode?: string;
					confirmationReason?: string;
					suggestion?: { confidence?: number };
				}
			).stateCode,
		).toBe("REQUIRES_CONFIRMATION");
		expect(
			(
				result.data as {
					stateCode?: string;
					confirmationReason?: string;
					suggestion?: { confidence?: number };
				}
			).confirmationReason,
		).toBe("LOW_CONFIDENCE");
		expect(
			(result.data as { errorCode?: string; applied?: boolean }).errorCode,
		).toBe("LOW_CONFIDENCE_REQUIRES_CONFIRMATION");
		expect(
			(
				result.data as {
					stateCode?: string;
					confirmationReason?: string;
					suggestion?: { confidence?: number };
				}
			).suggestion?.confidence,
		).toBe(0.55);
		expect((result.data as { applied?: boolean }).applied).toBe(false);
		expect(editorMock.timeline.updateElements).not.toHaveBeenCalled();
	});

	it("apply_layout_suggestion should support dryRun without timeline mutation", async () => {
		const result = await findTool("apply_layout_suggestion").execute({
			elementId: "caption-1",
			trackId: "text-track-1",
			dryRun: true,
			suggestion: {
				target: "caption",
				anchor: "bottom-center",
				marginX: 0,
				marginY: 0.08,
				confidence: 0.99,
			},
		});

		expect(result.success).toBe(true);
		expect(
			(result.data as { dryRun?: boolean; applied?: boolean }).dryRun,
		).toBe(true);
		expect(
			(result.data as { suggestion?: { confidence?: number } }).suggestion
				?.confidence,
		).toBe(0.95);
		expect((result.data as { applied?: boolean }).applied).toBe(false);
		expect(editorMock.timeline.updateElements).not.toHaveBeenCalled();
	});

	it("apply_layout_suggestion should return fallback candidates when auto match fails", async () => {
		editorMock = createEditorMockWithoutCaption();
		mockGetInstance.mockReturnValue(editorMock);

		const result = await findTool("apply_layout_suggestion").execute({
			target: "caption",
			suggestion: {
				target: "caption",
				anchor: "bottom-center",
				marginX: 0,
				marginY: 0.08,
				confidence: 0.9,
			},
		});

		expect(result.success).toBe(false);
		expect((result.data as { errorCode?: string }).errorCode).toBe(
			"AUTO_TARGET_NOT_FOUND",
		);
		expect(
			(result.data as { candidateElements?: Array<unknown> }).candidateElements
				?.length ?? 0,
		).toBeGreaterThan(0);
		expect(
			(
				result.data as {
					candidateElements?: Array<{ rank?: number }>;
				}
			).candidateElements?.[0]?.rank,
		).toBe(1);
	});
});
