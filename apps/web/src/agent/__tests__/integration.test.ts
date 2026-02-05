/**
 * Agent Integration Tests
 * Tests for agent → action flow to ensure tools correctly invoke HyperCut actions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAllTools, getToolsSummary } from "../tools";

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
		transcribe: vi.fn(async () => ({
			text: "Hello world Second line",
			segments: [
				{ text: "Hello world", start: 0, end: 1.5 },
				{ text: "Second line", start: 1.5, end: 2.7 },
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
			})),
			createScene: vi.fn(async () => "new-scene-id"),
			switchToScene: vi.fn(async () => {}),
			renameScene: vi.fn(async () => {}),
			deleteScene: vi.fn(async () => {}),
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
function getToolByName(name: string) {
	const tool = getAllTools().find((t) => t.name === name);
	if (!tool) {
		throw new Error(`Tool "${name}" not found`);
	}
	return tool;
}

describe("Agent Tools Integration", () => {
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

	describe("Tool Registry", () => {
		it("should have all expected tools registered", () => {
			const tools = getAllTools();
			expect(tools.length).toBeGreaterThanOrEqual(60);
		});

		it("should categorize tools correctly", () => {
			const summary = getToolsSummary();
			expect(summary).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ category: "Timeline" }),
					expect.objectContaining({ category: "Playback" }),
					expect.objectContaining({ category: "Query" }),
					expect.objectContaining({ category: "Media" }),
					expect.objectContaining({ category: "Scene" }),
					expect.objectContaining({ category: "Asset" }),
					expect.objectContaining({ category: "Project" }),
				]),
			);
		});

		it("should have unique tool names", () => {
			const tools = getAllTools();
			const names = tools.map((t) => t.name);
			const uniqueNames = new Set(names);
			expect(names.length).toBe(uniqueNames.size);
		});

		it("should have valid tool definitions", () => {
			const tools = getAllTools();
			for (const tool of tools) {
				expect(tool.name).toBeDefined();
				expect(tool.description).toBeDefined();
				expect(tool.parameters).toBeDefined();
				expect(tool.parameters.type).toBe("object");
				expect(typeof tool.execute).toBe("function");
			}
		});
	});

	describe("Timeline Tools", () => {
		it("split_at_playhead should invoke split action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("split_at_playhead");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("split", undefined);
			expect(result.success).toBe(true);
		});

		it("delete_selected should invoke delete-selected action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("delete_selected");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("delete-selected", undefined);
			expect(result.success).toBe(true);
		});

		it("select_element should select by elementId", async () => {
			const tool = getToolByName("select_element");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				selection: { setSelectedElements: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ elementId: "el1" });
			expect(result.success).toBe(true);
			expect(editor.selection.setSelectedElements).toHaveBeenCalledWith({
				elements: [{ trackId: "track1", elementId: "el1" }],
			});
		});

		it("select_element should fail for missing element", async () => {
			const tool = getToolByName("select_element");

			const result = await tool.execute({ elementId: "missing" });
			expect(result.success).toBe(false);
		});

		it("clear_selection should clear current selection", async () => {
			const tool = getToolByName("clear_selection");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				selection: { clearSelection: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(editor.selection.clearSelection).toHaveBeenCalled();
		});

		it("add_track should add a new track", async () => {
			const tool = getToolByName("add_track");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { addTrack: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ type: "audio" });
			expect(result.success).toBe(true);
			expect(editor.timeline.addTrack).toHaveBeenCalledWith({
				type: "audio",
				index: undefined,
			});
		});

		it("add_track should fail on invalid type", async () => {
			const tool = getToolByName("add_track");

			const result = await tool.execute({ type: "invalid" });
			expect(result.success).toBe(false);
		});

		it("remove_track should remove a non-main track", async () => {
			const tool = getToolByName("remove_track");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { removeTrack: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ trackId: "track2" });
			expect(result.success).toBe(true);
			expect(editor.timeline.removeTrack).toHaveBeenCalledWith({
				trackId: "track2",
			});
		});

		it("remove_track should fail for main track", async () => {
			const tool = getToolByName("remove_track");

			const result = await tool.execute({ trackId: "track1" });
			expect(result.success).toBe(false);
		});

		it("toggle_track_mute should toggle audio track mute", async () => {
			const tool = getToolByName("toggle_track_mute");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { toggleTrackMute: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ trackId: "track2" });
			expect(result.success).toBe(true);
			expect(editor.timeline.toggleTrackMute).toHaveBeenCalledWith({
				trackId: "track2",
			});
		});

		it("toggle_track_mute should fail on non-audio track", async () => {
			const tool = getToolByName("toggle_track_mute");

			const result = await tool.execute({ trackId: "track3" });
			expect(result.success).toBe(false);
		});

		it("toggle_track_visibility should toggle track visibility", async () => {
			const tool = getToolByName("toggle_track_visibility");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { toggleTrackVisibility: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ trackId: "track1" });
			expect(result.success).toBe(true);
			expect(editor.timeline.toggleTrackVisibility).toHaveBeenCalledWith({
				trackId: "track1",
			});
		});

		it("toggle_track_visibility should fail on audio track", async () => {
			const tool = getToolByName("toggle_track_visibility");

			const result = await tool.execute({ trackId: "track2" });
			expect(result.success).toBe(false);
		});

		it("update_text_style should update selected text element", async () => {
			const tool = getToolByName("update_text_style");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				selection: { getSelectedElements: ReturnType<typeof vi.fn> };
				timeline: { updateTextElement: ReturnType<typeof vi.fn> };
			};

			editor.selection.getSelectedElements.mockReturnValueOnce([
				{ trackId: "track3", elementId: "text1" },
			]);

			const result = await tool.execute({ content: "Updated" });
			expect(result.success).toBe(true);
			expect(editor.timeline.updateTextElement).toHaveBeenCalledWith({
				trackId: "track3",
				elementId: "text1",
				updates: expect.objectContaining({ content: "Updated" }),
			});
		});

		it("update_text_style should fail on non-text element", async () => {
			const tool = getToolByName("update_text_style");

			const result = await tool.execute({
				elementId: "el1",
				trackId: "track1",
				content: "X",
			});
			expect(result.success).toBe(false);
		});

		it("move_element should move selected element", async () => {
			const tool = getToolByName("move_element");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { moveElement: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ newStartTime: 5 });
			expect(result.success).toBe(true);
			expect(editor.timeline.moveElement).toHaveBeenCalledWith(
				expect.objectContaining({
					elementId: "el1",
					sourceTrackId: "track1",
					targetTrackId: "track1",
					newStartTime: 5,
				}),
			);
		});

		it("move_element should fail on incompatible track", async () => {
			const tool = getToolByName("move_element");

			const result = await tool.execute({
				elementId: "el1",
				targetTrackId: "track2",
				newStartTime: 1,
			});
			expect(result.success).toBe(false);
		});

		it("move_elements should update start time for multiple elements", async () => {
			const tool = getToolByName("move_elements");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { updateElementStartTime: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({
				startTime: 2,
				elements: [
					{ trackId: "track1", elementId: "el1" },
					{ trackId: "track1", elementId: "el2" },
				],
			});
			expect(result.success).toBe(true);
			expect(editor.timeline.updateElementStartTime).toHaveBeenCalledWith({
				elements: [
					{ trackId: "track1", elementId: "el1" },
					{ trackId: "track1", elementId: "el2" },
				],
				startTime: 2,
			});
		});

		it("move_elements should fail on empty elements", async () => {
			const tool = getToolByName("move_elements");
			const result = await tool.execute({ startTime: 2, elements: [] });
			expect(result.success).toBe(false);
		});

		it("trim_element should update trim values", async () => {
			const tool = getToolByName("trim_element");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { updateElementTrim: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({
				elementId: "el1",
				trimStart: 1,
				trimEnd: 0,
			});
			expect(result.success).toBe(true);
			expect(editor.timeline.updateElementTrim).toHaveBeenCalledWith({
				elementId: "el1",
				trimStart: 1,
				trimEnd: 0,
			});
		});

		it("trim_element should fail on invalid trimStart", async () => {
			const tool = getToolByName("trim_element");

			const result = await tool.execute({ elementId: "el1", trimStart: -1 });
			expect(result.success).toBe(false);
		});

		it("resize_element should update duration", async () => {
			const tool = getToolByName("resize_element");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { updateElementDuration: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ elementId: "el1", duration: 6 });
			expect(result.success).toBe(true);
			expect(editor.timeline.updateElementDuration).toHaveBeenCalledWith({
				trackId: "track1",
				elementId: "el1",
				duration: 6,
			});
		});

		it("resize_element should fail on invalid duration", async () => {
			const tool = getToolByName("resize_element");

			const result = await tool.execute({ elementId: "el1", duration: -2 });
			expect(result.success).toBe(false);
		});

		it("generate_captions should insert caption elements", async () => {
			const tool = getToolByName("generate_captions");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				selection: { getSelectedElements: ReturnType<typeof vi.fn> };
				timeline: { insertElement: ReturnType<typeof vi.fn> };
			};

			editor.selection.getSelectedElements.mockReturnValueOnce([
				{ trackId: "track2", elementId: "el3" },
			]);

			const result = await tool.execute({ source: "selection" });
			expect(result.success).toBe(true);
			expect(editor.timeline.insertElement).toHaveBeenCalledTimes(2);
			expect(editor.timeline.insertElement).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({
					element: expect.objectContaining({
						metadata: {
							kind: "caption",
							caption: expect.objectContaining({
								source: "whisper",
								origin: "agent-tool",
								segmentIndex: 0,
								language: "en",
								modelId: "whisper-small",
							}),
						},
					}),
				}),
			);
		});

		it("generate_captions should fail without selection", async () => {
			const tool = getToolByName("generate_captions");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				selection: { getSelectedElements: ReturnType<typeof vi.fn> };
			};

			editor.selection.getSelectedElements.mockReturnValueOnce([]);
			const result = await tool.execute({ source: "selection" });
			expect(result.success).toBe(false);
		});

		it("update_element_transform should execute command for transform updates", async () => {
			const tool = getToolByName("update_element_transform");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				command: { execute: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({
				elementId: "el1",
				transform: { scale: 1.2, position: { x: 10, y: 20 }, rotate: 15 },
				opacity: 0.8,
			});
			expect(result.success).toBe(true);
			expect(editor.command.execute).toHaveBeenCalled();
		});

		it("update_element_transform should fail on unsupported element", async () => {
			const tool = getToolByName("update_element_transform");

			const result = await tool.execute({
				elementId: "el3",
				trackId: "track2",
				opacity: 0.5,
			});
			expect(result.success).toBe(false);
		});

		it("insert_text should insert a text element", async () => {
			const tool = getToolByName("insert_text");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { insertElement: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ content: "Hello", startTime: 2 });
			expect(result.success).toBe(true);
			expect(editor.timeline.insertElement).toHaveBeenCalled();
		});

		it("insert_text should fail on invalid startTime", async () => {
			const tool = getToolByName("insert_text");

			const result = await tool.execute({ content: "Hello", startTime: -1 });
			expect(result.success).toBe(false);
		});

		it("remove_silence should detect and process silent segments", async () => {
			const tool = getToolByName("remove_silence");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: {
					splitElements: ReturnType<typeof vi.fn>;
					getTracks: ReturnType<typeof vi.fn>;
				};
			};

			// Mock getTracks to return audio track (tool calls getTracks multiple times)
			const testTracks = [
				{
					id: "track-audio",
					type: "audio",
					muted: false,
					elements: [
						{
							id: "audio-1",
							type: "audio",
							sourceType: "upload",
							mediaId: "asset4",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 0,
							volume: 1,
						},
					],
				},
			];
			editor.timeline.getTracks.mockImplementation(() => testTracks);

			const result = await tool.execute({
				source: "timeline",
				threshold: 0.5,
				minDuration: 0.00001,
			});
			expect(result.success).toBe(true);
			// Tool should detect silence and attempt to split at silence boundaries
			expect(editor.timeline.splitElements).toHaveBeenCalled();
			// Note: deleteElements only called if elements are fully within silence interval
			// which depends on mock audio data; main goal is to verify silence detection works
		});

		it("remove_silence should fail with no audio source", async () => {
			const tool = getToolByName("remove_silence");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { getTracks: ReturnType<typeof vi.fn> };
			};

			editor.timeline.getTracks.mockReturnValueOnce([
				{ id: "track3", type: "text", hidden: false, elements: [] },
			]);
			const result = await tool.execute({ source: "timeline" });
			expect(result.success).toBe(false);
		});
	});

	describe("Playback Tools", () => {
		it("toggle_play should invoke toggle-play action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("toggle_play");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("toggle-play", undefined);
			expect(result.success).toBe(true);
		});

		it("seek_forward should invoke seek-forward action with seconds", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("seek_forward");

			const result = await tool.execute({ seconds: 5 });
			expect(invokeAction).toHaveBeenCalledWith("seek-forward", { seconds: 5 });
			expect(result.success).toBe(true);
		});

		it("undo should invoke undo action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("undo");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("undo", undefined);
			expect(result.success).toBe(true);
		});

		it("seek_to_time should seek to specified time", async () => {
			const tool = getToolByName("seek_to_time");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				playback: { seek: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ time: 10 });
			expect(result.success).toBe(true);
			expect(editor.playback.seek).toHaveBeenCalledWith({ time: 10 });
		});

		it("seek_to_time should fail on invalid time", async () => {
			const tool = getToolByName("seek_to_time");

			const result = await tool.execute({ time: -1 });
			expect(result.success).toBe(false);
		});

		it("set_volume should update playback volume", async () => {
			const tool = getToolByName("set_volume");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				playback: { setVolume: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ volume: 0.5 });
			expect(result.success).toBe(true);
			expect(editor.playback.setVolume).toHaveBeenCalledWith({ volume: 0.5 });
		});

		it("set_volume should fail on invalid volume", async () => {
			const tool = getToolByName("set_volume");

			const result = await tool.execute({ volume: "loud" });
			expect(result.success).toBe(false);
		});

		it("toggle_playback_mute should toggle mute", async () => {
			const tool = getToolByName("toggle_playback_mute");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				playback: { toggleMute: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(editor.playback.toggleMute).toHaveBeenCalled();
		});

		it("jump_forward should invoke jump-forward action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("jump_forward");

			const result = await tool.execute({ seconds: 5 });
			expect(invokeAction).toHaveBeenCalledWith("jump-forward", { seconds: 5 });
			expect(result.success).toBe(true);
		});

		it("jump_backward should invoke jump-backward action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("jump_backward");

			const result = await tool.execute({ seconds: 5 });
			expect(invokeAction).toHaveBeenCalledWith("jump-backward", {
				seconds: 5,
			});
			expect(result.success).toBe(true);
		});

		it("stop_playback should invoke stop-playback action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("stop_playback");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("stop-playback", undefined);
			expect(result.success).toBe(true);
		});
	});

	describe("Query Tools", () => {
		it("get_timeline_info should return track and element counts", async () => {
			const tool = getToolByName("get_timeline_info");

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				trackCount: 3,
				totalElements: 4,
			});
		});

		it("get_current_time should return playhead position", async () => {
			const tool = getToolByName("get_current_time");

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				currentTimeSeconds: 5,
			});
		});

		it("get_element_details should return full element info", async () => {
			const tool = getToolByName("get_element_details");

			const result = await tool.execute({ elementId: "el1" });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				track: { id: "track1" },
				element: { id: "el1", type: "video" },
			});
		});

		it("get_elements_in_range should return elements in range with track filter", async () => {
			const tool = getToolByName("get_elements_in_range");

			const result = await tool.execute({
				startTime: 1,
				endTime: 13,
				trackId: "track1",
			});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				count: 2,
				trackId: "track1",
			});
		});

		it("get_track_details should return single track summary", async () => {
			const tool = getToolByName("get_track_details");

			const result = await tool.execute({ trackId: "track1" });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				track: { id: "track1", type: "video" },
				stats: { elementCount: 2 },
			});
		});

		it("get_timeline_summary should return structured summary", async () => {
			const tool = getToolByName("get_timeline_summary");

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				trackCount: 3,
				totalElements: 4,
			});
		});
	});

	describe("Media Tools", () => {
		it("copy_selected should invoke copy-selected action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("copy_selected");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("copy-selected", undefined);
			expect(result.success).toBe(true);
		});

		it("paste_copied should invoke paste-copied action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("paste_copied");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("paste-copied", undefined);
			expect(result.success).toBe(true);
		});

		it("toggle_mute_selected should invoke toggle-elements-muted-selected action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("toggle_mute_selected");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith(
				"toggle-elements-muted-selected",
				undefined,
			);
			expect(result.success).toBe(true);
		});

		it("paste_at_time should paste clipboard items at time", async () => {
			const tool = getToolByName("paste_at_time");
			const { invokeAction } = await import("@/lib/actions");
			(invokeAction as ReturnType<typeof vi.fn>).mockReturnValueOnce([
				{
					kind: "paste-at-time",
					pastedElements: [{ trackId: "track1", elementId: "el1" }],
					pastedCount: 1,
				},
			]);

			const result = await tool.execute({ time: 3 });
			expect(result.success).toBe(true);
			expect(invokeAction).toHaveBeenCalledWith("paste-at-time", { time: 3 });
			expect(result.data).toMatchObject({ pastedCount: 1 });
		});

		it("paste_at_time should fail when clipboard is empty", async () => {
			const tool = getToolByName("paste_at_time");
			const { invokeAction } = await import("@/lib/actions");
			(invokeAction as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
				throw new Error("剪贴板为空 (Clipboard is empty)");
			});

			const result = await tool.execute({ time: 3 });
			expect(result.success).toBe(false);
		});
	});

	describe("Scene Tools", () => {
		it("list_scenes should return all scenes", async () => {
			const tool = getToolByName("list_scenes");

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(Array.isArray(result.data)).toBe(true);
			expect((result.data as unknown[]).length).toBe(2);
		});

		it("create_scene should create a new scene", async () => {
			const tool = getToolByName("create_scene");

			const result = await tool.execute({ name: "Test Scene" });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				sceneId: "new-scene-id",
				name: "Test Scene",
			});
		});

		it("switch_scene should switch to named scene", async () => {
			const tool = getToolByName("switch_scene");

			const result = await tool.execute({ name: "Scene 2" });
			expect(result.success).toBe(true);
		});

		it("toggle_bookmark should invoke toggle-bookmark action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("toggle_bookmark");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("toggle-bookmark", undefined);
			expect(result.success).toBe(true);
		});

		it("delete_scene should delete a scene by name", async () => {
			const tool = getToolByName("delete_scene");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				scenes: { deleteScene: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ name: "Scene 2" });
			expect(result.success).toBe(true);
			expect(editor.scenes.deleteScene).toHaveBeenCalledWith({
				sceneId: "scene2",
			});
		});

		it("delete_scene should fail when scene is missing", async () => {
			const tool = getToolByName("delete_scene");

			const result = await tool.execute({ name: "Missing" });
			expect(result.success).toBe(false);
		});
	});

	describe("Tool Error Handling", () => {
		it("should return error result when action fails", async () => {
			// Import and manually mock for this test
			const actions = await import("@/lib/actions");
			(actions.invokeAction as ReturnType<typeof vi.fn>).mockImplementationOnce(
				() => {
					throw new Error("Action failed");
				},
			);

			const tool = getToolByName("split_at_playhead");
			const result = await tool.execute({});

			expect(result.success).toBe(false);
			expect(result.message).toContain("Action failed");
		});
	});

	describe("Asset Tools", () => {
		it("list_assets should return all assets", async () => {
			const tool = getToolByName("list_assets");

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				count: 3,
			});
			expect((result.data as { assets: unknown[] }).assets).toHaveLength(3);
		});

		it("add_asset_to_timeline should insert element into timeline", async () => {
			const tool = getToolByName("add_asset_to_timeline");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { insertElement: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ assetId: "asset1" });
			expect(result.success).toBe(true);
			// Verify result contains correct data (indicates successful processing)
			expect(result.data).toMatchObject({
				assetId: "asset1",
				assetName: "Test Video",
				assetType: "video",
			});
			expect(editor.timeline.insertElement).toHaveBeenCalledWith(
				expect.objectContaining({
					element: expect.objectContaining({ type: "video" }),
					placement: { mode: "auto" },
				}),
			);
		});

		it("add_asset_to_timeline should fail for non-existent asset", async () => {
			const tool = getToolByName("add_asset_to_timeline");

			const result = await tool.execute({ assetId: "non-existent" });
			expect(result.success).toBe(false);
			expect(result.message).toContain("non-existent");
		});

		it("add_asset_to_timeline should fail for ephemeral asset", async () => {
			const tool = getToolByName("add_asset_to_timeline");

			const result = await tool.execute({ assetId: "asset3" });
			expect(result.success).toBe(false);
			expect(result.message).toContain("临时");
		});

		it("add_asset_to_timeline should fail for invalid start time", async () => {
			const tool = getToolByName("add_asset_to_timeline");

			const result = await tool.execute({ assetId: "asset1", startTime: -1 });
			expect(result.success).toBe(false);
			expect(result.message).toContain("无效");
		});

		it("add_asset_to_timeline should use explicit placement with trackId", async () => {
			const tool = getToolByName("add_asset_to_timeline");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { insertElement: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({
				assetId: "asset1",
				trackId: "track1",
			});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				placementMode: "explicit",
				trackId: "track1",
			});
			expect(editor.timeline.insertElement).toHaveBeenCalledWith(
				expect.objectContaining({
					placement: { mode: "explicit", trackId: "track1" },
				}),
			);
		});

		it("add_asset_to_timeline should fail for non-existent track", async () => {
			const tool = getToolByName("add_asset_to_timeline");

			const result = await tool.execute({
				assetId: "asset1",
				trackId: "non-existent",
			});
			expect(result.success).toBe(false);
			expect(result.message).toContain("Track not found");
		});

		it("add_asset_to_timeline should fail for incompatible track type", async () => {
			const tool = getToolByName("add_asset_to_timeline");

			// asset1 is video type, track2 is audio type - incompatible
			const result = await tool.execute({
				assetId: "asset1",
				trackId: "track2",
			});
			expect(result.success).toBe(false);
			expect(result.message).toContain("Incompatible track type");
		});

		it("add_media_asset should add asset from url", async () => {
			const tool = getToolByName("add_media_asset");
			const result = await tool.execute({
				url: "https://example.com/mock.png",
				type: "image",
			});
			expect(result.success).toBe(true);
		});

		it("add_media_asset should fail when processing returns empty", async () => {
			const tool = getToolByName("add_media_asset");
			const processing = await import("@/lib/media/processing");
			(
				processing.processMediaAssets as ReturnType<typeof vi.fn>
			).mockResolvedValueOnce([]);

			const result = await tool.execute({
				url: "https://example.com/mock.png",
				type: "image",
			});
			expect(result.success).toBe(false);
		});

		it("add_media_asset should surface CORS/network failures", async () => {
			const tool = getToolByName("add_media_asset");
			const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
			fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

			const result = await tool.execute({
				url: "https://example.com/mock.png",
				type: "image",
			});
			expect(result.success).toBe(false);
			expect(result.message).toContain("跨域");
		});

		it("remove_asset should remove asset", async () => {
			const tool = getToolByName("remove_asset");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				media: { removeMediaAsset: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ assetId: "asset2" });
			expect(result.success).toBe(true);
			expect(editor.media.removeMediaAsset).toHaveBeenCalledWith(
				expect.objectContaining({ id: "asset2" }),
			);
		});

		it("remove_asset should fail for missing asset", async () => {
			const tool = getToolByName("remove_asset");
			const result = await tool.execute({ assetId: "missing" });
			expect(result.success).toBe(false);
		});
	});

	describe("Project Tools", () => {
		it("export_video should export and trigger download", async () => {
			const tool = getToolByName("export_video");
			const result = await tool.execute({ format: "mp4", quality: "high" });
			expect(result.success).toBe(true);
		});

		it("export_video should fail without active project", async () => {
			const tool = getToolByName("export_video");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				project: { getActive: ReturnType<typeof vi.fn> };
			};

			editor.project.getActive.mockReturnValueOnce(null);
			const result = await tool.execute({});
			expect(result.success).toBe(false);
		});

		it("update_project_settings should update settings", async () => {
			const tool = getToolByName("update_project_settings");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				project: { updateSettings: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({
				fps: 30,
				canvasPreset: "1920x1080",
				background: { type: "color", color: "#ffffff" },
			});
			expect(result.success).toBe(true);
			expect(editor.project.updateSettings).toHaveBeenCalledWith({
				settings: expect.objectContaining({
					fps: 30,
					canvasSize: { width: 1920, height: 1080 },
					background: { type: "color", color: "#ffffff" },
				}),
			});
		});

		it("update_project_settings should fail on invalid fps", async () => {
			const tool = getToolByName("update_project_settings");
			const result = await tool.execute({ fps: 23 });
			expect(result.success).toBe(false);
		});

		it("get_project_info should return active project", async () => {
			const tool = getToolByName("get_project_info");
			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({ name: "Test Project" });
		});

		it("save_project should persist project", async () => {
			const tool = getToolByName("save_project");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				project: { saveCurrentProject: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(editor.project.saveCurrentProject).toHaveBeenCalled();
		});
	});

	describe("Split at Time", () => {
		it("split_at_time should seek and split", async () => {
			const tool = getToolByName("split_at_time");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				playback: { seek: ReturnType<typeof vi.fn> };
				timeline: { splitElements: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ time: 30 });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({ splitTime: 30 });
			expect(editor.playback.seek).toHaveBeenCalledWith({ time: 30 });
			expect(editor.timeline.splitElements).toHaveBeenCalledWith({
				elements: [{ trackId: "track1", elementId: "el1" }],
				splitTime: 30,
			});
		});

		it("split_at_time should fail for invalid time", async () => {
			const tool = getToolByName("split_at_time");

			const result = await tool.execute({ time: -5 });
			expect(result.success).toBe(false);
			expect(result.message).toContain("无效");
		});

		it("split_at_time should fail when time exceeds duration", async () => {
			const tool = getToolByName("split_at_time");

			const result = await tool.execute({ time: 200 }); // Duration is 120s
			expect(result.success).toBe(false);
			expect(result.message).toContain("超出");
		});

		it("split_at_time should support selectAll", async () => {
			const tool = getToolByName("split_at_time");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				selection: { getSelectedElements: ReturnType<typeof vi.fn> };
				timeline: { splitElements: ReturnType<typeof vi.fn> };
			};

			editor.selection.getSelectedElements.mockReturnValueOnce([]);

			const result = await tool.execute({ time: 30, selectAll: true });
			expect(result.success).toBe(true);
			expect(editor.timeline.splitElements).toHaveBeenCalledWith({
				elements: [
					{ trackId: "track1", elementId: "el1" },
					{ trackId: "track1", elementId: "el2" },
					{ trackId: "track2", elementId: "el3" },
					{ trackId: "track3", elementId: "text1" },
				],
				splitTime: 30,
			});
		});
	});
});
