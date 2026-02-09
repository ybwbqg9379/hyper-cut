/**
 * Agent Integration Tests
 * Tests for agent → action flow to ensure tools correctly invoke HyperCut actions
 */

import { vi, beforeEach, afterEach } from "vitest";
import { getAllTools } from "../tools";

const buildTracksState = () => [
	{
		id: "track1",
		type: "video",
		isMain: true,
		muted: false,
		hidden: false,
		elements: [
			{
				id: "el1",
				type: "video",
				startTime: 0,
				duration: 10,
				trimStart: 0,
				trimEnd: 0,
				mediaId: "asset1",
				transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
				opacity: 1,
			},
			{
				id: "el2",
				type: "image",
				startTime: 12,
				duration: 5,
				trimStart: 0,
				trimEnd: 0,
				mediaId: "asset2",
				transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
				opacity: 1,
			},
		],
	},
	{
		id: "track2",
		type: "audio",
		muted: false,
		elements: [
			{
				id: "el3",
				type: "audio",
				sourceType: "upload",
				mediaId: "asset4",
				startTime: 0,
				duration: 8,
				trimStart: 0,
				trimEnd: 0,
				volume: 1,
			},
		],
	},
	{
		id: "track3",
		type: "text",
		hidden: false,
		elements: [
			{
				id: "text1",
				type: "text",
				name: "Title",
				content: "Hello",
				fontSize: 48,
				fontFamily: "Arial",
				color: "#fff",
				backgroundColor: "transparent",
				textAlign: "center",
				fontWeight: "normal",
				fontStyle: "normal",
				textDecoration: "none",
				startTime: 0,
				duration: 4,
				trimStart: 0,
				trimEnd: 0,
				transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
				opacity: 1,
			},
		],
	},
	{
		id: "track4",
		type: "sticker",
		hidden: false,
		elements: [
			{
				id: "sticker1",
				type: "sticker",
				name: "star",
				iconName: "mdi:star",
				startTime: 1,
				duration: 4,
				trimStart: 0,
				trimEnd: 0,
				transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
				opacity: 1,
				color: "#ffffff",
			},
		],
	},
];

let tracksState = buildTracksState();

// Mock invokeAction to track calls without side effects
vi.mock("@/lib/actions", () => ({
	invokeAction: vi.fn(),
	hasActionHandlers: vi.fn(() => true),
}));

// Mock element builder functions
vi.mock("@/lib/timeline/element-utils", () => ({
	buildVideoElement: vi.fn(() => ({ type: "video", id: "mock-element" })),
	buildImageElement: vi.fn(() => ({ type: "image", id: "mock-element" })),
	buildUploadAudioElement: vi.fn(() => ({ type: "audio", id: "mock-element" })),
	buildStickerElement: vi.fn(({ iconName }: { iconName: string }) => ({
		type: "sticker",
		iconName,
		name: iconName,
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	})),
	buildLibraryAudioElement: vi.fn(
		({
			sourceUrl,
			name,
			duration,
			startTime,
			buffer,
		}: {
			sourceUrl: string;
			name: string;
			duration: number;
			startTime: number;
			buffer?: AudioBuffer;
		}) => ({
			type: "audio",
			sourceType: "library",
			sourceUrl,
			name,
			duration,
			startTime,
			trimStart: 0,
			trimEnd: 0,
			volume: 1,
			muted: false,
			buffer,
		}),
	),
	buildTextElement: vi.fn(() => ({
		type: "text",
		name: "Text",
		content: "Mock text",
		duration: 5,
		startTime: 0,
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
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	})),
	getElementsAtTime: vi.fn(() => [{ trackId: "track1", elementId: "el1" }]),
	canElementHaveAudio: vi.fn(
		(element: { type?: string }) =>
			element.type === "audio" || element.type === "video",
	),
}));

vi.mock("@/lib/iconify-api", () => ({
	searchIcons: vi.fn(async () => ({
		icons: ["mdi:star", "mdi:heart"],
		total: 2,
		limit: 20,
		start: 0,
		collections: {},
	})),
}));

// Mock constants
vi.mock("@/constants/timeline-constants", () => ({
	TIMELINE_CONSTANTS: { DEFAULT_ELEMENT_DURATION: 5 },
}));

vi.mock("@/lib/media/mediabunny", () => ({
	extractTimelineAudio: vi.fn(
		async () => new Blob([new Uint8Array([1, 2, 3])]),
	),
}));

vi.mock("@/lib/media/audio", () => ({
	decodeAudioToFloat32: vi.fn(async () => ({
		samples: new Float32Array([0.1, -0.1, 0.2]),
		sampleRate: 44100,
	})),
}));

vi.mock("@/lib/transcription/caption", () => ({
	buildCaptionChunks: vi.fn(() => [
		{ text: "Hello world", startTime: 0, duration: 1.5 },
		{ text: "Second line", startTime: 1.5, duration: 1.2 },
	]),
}));

vi.mock("@/services/transcription/service", () => ({
	transcriptionService: {
		getLastResult: vi.fn(() => null),
		transcribe: vi.fn(async () => ({
			text: "Hello world Second line",
			segments: [
				{ text: "Hello world", start: 0, end: 1.5 },
				{ text: "Second line", start: 1.5, end: 2.7 },
			],
			words: [
				{ text: "Hello", start: 0, end: 0.7 },
				{ text: "world", start: 0.7, end: 1.5 },
				{ text: "Second", start: 1.5, end: 2.1 },
				{ text: "line", start: 2.1, end: 2.7 },
			],
			language: "en",
		})),
		cancel: vi.fn(),
	},
}));

vi.mock("@/lib/media/processing", () => ({
	processMediaAssets: vi.fn(async () => [
		{
			name: "mock-asset",
			type: "image",
			file: new File([], "mock.png", { type: "image/png" }),
			url: "blob:mock",
			thumbnailUrl: "blob:thumb",
			duration: undefined,
			width: 100,
			height: 100,
			fps: undefined,
		},
	]),
}));

vi.mock("@/stores/timeline-store", () => ({
	useTimelineStore: {
		getState: vi.fn(() => ({
			clipboard: {
				items: [
					{
						trackId: "track1",
						trackType: "video",
						element: {
							type: "video",
							name: "Clip",
							duration: 2,
							startTime: 0,
							trimStart: 0,
							trimEnd: 0,
							mediaId: "asset1",
							muted: false,
							hidden: false,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					},
				],
			},
		})),
	},
}));

// Mock EditorCore for query, scene, and asset tools
vi.mock("@/core", () => {
	const mockEditor = {
		timeline: {
			getTracks: vi.fn(() => tracksState),
			// Returns seconds (timeline uses seconds for all time values)
			getTotalDuration: vi.fn(() => 120),
			insertElement: vi.fn(),
			splitElements: vi.fn(),
			replaceTracks: vi.fn(),
			updateTextElement: vi.fn(),
			updateElementTrim: vi.fn(),
			updateElementDuration: vi.fn(),
			updateElementStartTime: vi.fn(),
			moveElement: vi.fn(),
			deleteElements: vi.fn(),
			pasteAtTime: vi.fn(() => [{ trackId: "track1", elementId: "el1" }]),
			addTrack: vi.fn(() => "new-track-id"),
			removeTrack: vi.fn(({ trackId }: { trackId: string }) => {
				const index = tracksState.findIndex((t) => t.id === trackId);
				if (index >= 0) tracksState.splice(index, 1);
			}),
			toggleTrackMute: vi.fn(({ trackId }: { trackId: string }) => {
				const track = tracksState.find((t) => t.id === trackId);
				if (track && "muted" in track) {
					track.muted = !track.muted;
				}
			}),
			toggleTrackVisibility: vi.fn(({ trackId }: { trackId: string }) => {
				const track = tracksState.find((t) => t.id === trackId);
				if (track && "hidden" in track) {
					track.hidden = !track.hidden;
				}
			}),
			getTrackById: vi.fn(({ trackId }: { trackId: string }) => {
				return tracksState.find((track) => track.id === trackId) ?? null;
			}),
		},
		playback: {
			getCurrentTime: vi.fn(() => 5), // Returns seconds, not milliseconds
			seek: vi.fn(),
			setVolume: vi.fn(),
			toggleMute: vi.fn(),
			getVolume: vi.fn(() => 0.8),
			isMuted: vi.fn(() => false),
		},
		selection: {
			getSelectedElements: vi.fn(() => [
				{ trackId: "track1", elementId: "el1" },
			]),
			setSelectedElements: vi.fn(),
			clearSelection: vi.fn(),
		},
		media: {
			getAssets: vi.fn(() => [
				{
					id: "asset1",
					name: "Test Video",
					type: "video",
					duration: 60,
					ephemeral: false,
					file: new File([], "video.mp4"),
				},
				{
					id: "asset2",
					name: "Test Image",
					type: "image",
					duration: 5,
					ephemeral: false,
					file: new File([], "image.png"),
				},
				{
					id: "asset3",
					name: "Temp Clip",
					type: "video",
					duration: 10,
					ephemeral: true,
					file: new File([], "temp.mp4"),
				},
				{
					id: "asset4",
					name: "Test Audio",
					type: "audio",
					duration: 8,
					ephemeral: false,
					file: new File([], "audio.wav"),
				},
			]),
			addMediaAsset: vi.fn(async () => {}),
			removeMediaAsset: vi.fn(async () => {}),
		},
		project: {
			getActive: vi.fn(() => ({
				metadata: {
					name: "Test Project",
					id: "project-1",
					duration: 10,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				settings: {
					fps: 30,
					canvasSize: { width: 1920, height: 1080 },
					background: { type: "color", color: "#000000" },
				},
				scenes: [],
				currentSceneId: "scene1",
			})),
			export: vi.fn(async () => ({
				success: true,
				buffer: new ArrayBuffer(8),
			})),
			updateSettings: vi.fn(async () => {}),
			saveCurrentProject: vi.fn(async () => {}),
		},
		command: {
			execute: vi.fn(),
		},
		scenes: {
			getScenes: vi.fn(() => [
				{ id: "scene1", name: "Main Scene", isMain: true, tracks: [] },
				{ id: "scene2", name: "Scene 2", isMain: false, tracks: [] },
			]),
			getActiveScene: vi.fn(() => ({
				id: "scene1",
				name: "Main Scene",
				isMain: true,
				bookmarks: [1.5, 3.0, 7.5],
			})),
			createScene: vi.fn(async () => "new-scene-id"),
			switchToScene: vi.fn(async () => {}),
			renameScene: vi.fn(async () => {}),
			deleteScene: vi.fn(async () => {}),
			toggleBookmark: vi.fn(async () => {}),
			isBookmarked: vi.fn(({ time }: { time: number }) => {
				return [1.5, 3.0, 7.5].includes(time);
			}),
		},
	};

	return {
		EditorCore: {
			getInstance: vi.fn(() => mockEditor),
		},
	};
});

/**
 * Helper to get a tool by name and throw if not found
 */
export function getToolByName(name: string) {
	const tool = getAllTools().find((t) => t.name === name);
	if (!tool) {
		throw new Error(`Tool "${name}" not found`);
	}
	return tool;
}

export function setupIntegrationHarness() {
	beforeEach(async () => {
		vi.clearAllMocks();
		tracksState = buildTracksState();

		// Reset getTracks mock to use fresh tracksState
		const { EditorCore } = await import("@/core");
		const editor = EditorCore.getInstance() as unknown as {
			timeline: { getTracks: ReturnType<typeof vi.fn> };
		};
		editor.timeline.getTracks.mockImplementation(() => tracksState);

		if (!URL.createObjectURL) {
			URL.createObjectURL = vi.fn(() => "blob:mock");
		}
		if (!URL.revokeObjectURL) {
			URL.revokeObjectURL = vi.fn();
		}

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				headers: new Headers({ "content-length": "1024" }),
				blob: async () =>
					new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
			})) as unknown as typeof fetch,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});
}
