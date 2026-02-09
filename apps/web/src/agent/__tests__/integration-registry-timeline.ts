import { describe, expect, it, type vi } from "vitest";
import { getAllTools, getToolsSummary } from "../tools";
import { getToolByName } from "./integration-harness";

export function registerRegistryTimelineTests() {
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
					expect.objectContaining({ category: "Workflow" }),
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

		it("split_at_playhead should fail when action handler is unavailable", async () => {
			const { hasActionHandlers } = await import("@/lib/actions");
			(hasActionHandlers as ReturnType<typeof vi.fn>).mockImplementationOnce(
				() => false,
			);

			const tool = getToolByName("split_at_playhead");
			const result = await tool.execute({});

			expect(result.success).toBe(false);
			expect(result.message).toContain('Action "split" is not available');
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
				timeline: { updateElements: ReturnType<typeof vi.fn> };
			};

			editor.selection.getSelectedElements.mockReturnValueOnce([
				{ trackId: "track3", elementId: "text1" },
			]);

			const result = await tool.execute({ content: "Updated" });
			expect(result.success).toBe(true);
			expect(editor.timeline.updateElements).toHaveBeenCalledWith({
				updates: [
					{
						trackId: "track3",
						elementId: "text1",
						updates: expect.objectContaining({ content: "Updated" }),
					},
				],
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

		it("update_text_style should fail on out-of-range fontSize", async () => {
			const tool = getToolByName("update_text_style");

			const result = await tool.execute({
				elementId: "text1",
				trackId: "track3",
				fontSize: 1000,
			});
			expect(result.success).toBe(false);
			expect(result.data).toMatchObject({ errorCode: "INVALID_FONT_SIZE" });
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

		it("update_element_transform should call updateElements for transform updates", async () => {
			const tool = getToolByName("update_element_transform");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { updateElements: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({
				elementId: "el1",
				transform: { scale: 1.2, position: { x: 10, y: 20 }, rotate: 15 },
				opacity: 0.8,
			});
			expect(result.success).toBe(true);
			expect(editor.timeline.updateElements).toHaveBeenCalledWith({
				updates: [{
					trackId: "track1",
					elementId: "el1",
					updates: {
						transform: { scale: 1.2, position: { x: 10, y: 20 }, rotate: 15 },
						opacity: 0.8,
					},
				}],
			});
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

		it("update_sticker_color should call updateElements for sticker updates", async () => {
			const tool = getToolByName("update_sticker_color");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { updateElements: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({
				elementId: "sticker1",
				trackId: "track4",
				color: "#ff5500",
			});
			expect(result.success).toBe(true);
			expect(editor.timeline.updateElements).toHaveBeenCalledWith({
				updates: [{
					trackId: "track4",
					elementId: "sticker1",
					updates: { color: "#ff5500" },
				}],
			});
		});

		it("update_sticker_color should fail on non-sticker element", async () => {
			const tool = getToolByName("update_sticker_color");
			const result = await tool.execute({
				elementId: "el1",
				trackId: "track1",
				color: "#ff5500",
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

		it("insert_text should fail on out-of-range fontSize", async () => {
			const tool = getToolByName("insert_text");

			const result = await tool.execute({
				content: "Hello",
				startTime: 2,
				fontSize: 1000,
			});
			expect(result.success).toBe(false);
			expect(result.data).toMatchObject({ errorCode: "INVALID_FONT_SIZE" });
		});

		it("remove_silence should detect and process silent segments", async () => {
			const tool = getToolByName("remove_silence");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: {
					replaceTracks: ReturnType<typeof vi.fn>;
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
			expect((result.data as { diff?: unknown })?.diff).toBeDefined();
			// After P0/P1 refactor, remove_silence uses pure split/delete/ripple functions
			// then atomically replaces tracks via replaceTracks
			expect(editor.timeline.replaceTracks).toHaveBeenCalled();
		});

		it("remove_silence dryRun should return diff without mutating timeline", async () => {
			const tool = getToolByName("remove_silence");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: {
					replaceTracks: ReturnType<typeof vi.fn>;
					getTracks: ReturnType<typeof vi.fn>;
				};
			};

			editor.timeline.getTracks.mockImplementation(() => [
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
			]);

			const result = await tool.execute({
				source: "timeline",
				dryRun: true,
				threshold: 0.5,
				minDuration: 0.00001,
			});

			expect(result.success).toBe(true);
			expect((result.data as { dryRun?: boolean })?.dryRun).toBe(true);
			expect((result.data as { diff?: unknown })?.diff).toBeDefined();
			expect(editor.timeline.replaceTracks).not.toHaveBeenCalled();
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

		describe("delete_element_by_id", () => {
			it("should delete a single element by ID", async () => {
				const tool = getToolByName("delete_element_by_id");
				const { EditorCore } = await import("@/core");
				const editor = EditorCore.getInstance() as unknown as {
					timeline: { deleteElements: ReturnType<typeof vi.fn> };
				};

				const result = await tool.execute({ elementId: "el1" });
				expect(result.success).toBe(true);
				expect(editor.timeline.deleteElements).toHaveBeenCalledWith({
					elements: [{ trackId: "track1", elementId: "el1" }],
				});
				const data = result.data as { deletedCount: number };
				expect(data.deletedCount).toBe(1);
			});

			it("should delete a single element with trackId hint", async () => {
				const tool = getToolByName("delete_element_by_id");
				const { EditorCore } = await import("@/core");
				const editor = EditorCore.getInstance() as unknown as {
					timeline: { deleteElements: ReturnType<typeof vi.fn> };
				};

				const result = await tool.execute({
					elementId: "el3",
					trackId: "track2",
				});
				expect(result.success).toBe(true);
				expect(editor.timeline.deleteElements).toHaveBeenCalledWith({
					elements: [{ trackId: "track2", elementId: "el3" }],
				});
			});

			it("should fallback to global lookup when trackId hint is wrong", async () => {
				const tool = getToolByName("delete_element_by_id");
				const { EditorCore } = await import("@/core");
				const editor = EditorCore.getInstance() as unknown as {
					timeline: { deleteElements: ReturnType<typeof vi.fn> };
				};

				const result = await tool.execute({
					elementId: "el1",
					trackId: "wrong-track-id",
				});
				expect(result.success).toBe(true);
				expect(editor.timeline.deleteElements).toHaveBeenCalledWith({
					elements: [{ trackId: "track1", elementId: "el1" }],
				});
			});

			it("should batch delete multiple elements", async () => {
				const tool = getToolByName("delete_element_by_id");
				const { EditorCore } = await import("@/core");
				const editor = EditorCore.getInstance() as unknown as {
					timeline: { deleteElements: ReturnType<typeof vi.fn> };
				};

				const result = await tool.execute({
					elements: [
						{ elementId: "el1" },
						{ elementId: "el3", trackId: "track2" },
					],
				});
				expect(result.success).toBe(true);
				const data = result.data as { deletedCount: number };
				expect(data.deletedCount).toBe(2);
				expect(editor.timeline.deleteElements).toHaveBeenCalledWith({
					elements: [
						{ trackId: "track1", elementId: "el1" },
						{ trackId: "track2", elementId: "el3" },
					],
				});
			});

			it("should deduplicate repeated elementIds in batch mode", async () => {
				const tool = getToolByName("delete_element_by_id");
				const { EditorCore } = await import("@/core");
				const editor = EditorCore.getInstance() as unknown as {
					timeline: { deleteElements: ReturnType<typeof vi.fn> };
				};

				const result = await tool.execute({
					elements: [
						{ elementId: "el1" },
						{ elementId: "el1" },
						{ elementId: "el1" },
					],
				});
				expect(result.success).toBe(true);
				const data = result.data as { deletedCount: number };
				expect(data.deletedCount).toBe(1);
				expect(editor.timeline.deleteElements).toHaveBeenCalledWith({
					elements: [{ trackId: "track1", elementId: "el1" }],
				});
			});

			it("should report not-found elements in batch mode", async () => {
				const tool = getToolByName("delete_element_by_id");
				const { EditorCore } = await import("@/core");
				const editor = EditorCore.getInstance() as unknown as {
					timeline: { deleteElements: ReturnType<typeof vi.fn> };
				};

				const result = await tool.execute({
					elements: [{ elementId: "el1" }, { elementId: "nonexistent" }],
				});
				expect(result.success).toBe(true);
				const data = result.data as {
					deletedCount: number;
					notFound?: string[];
				};
				expect(data.deletedCount).toBe(1);
				expect(data.notFound).toEqual(["nonexistent"]);
				expect(result.message).toContain("未找到");
				expect(editor.timeline.deleteElements).toHaveBeenCalled();
			});

			it("should fail when all elements are not found", async () => {
				const tool = getToolByName("delete_element_by_id");

				const result = await tool.execute({
					elements: [{ elementId: "missing1" }, { elementId: "missing2" }],
				});
				expect(result.success).toBe(false);
				expect(result.data).toMatchObject({
					errorCode: "ELEMENT_NOT_FOUND",
				});
				const data = result.data as { notFound: string[] };
				expect(data.notFound).toEqual(["missing1", "missing2"]);
			});

			it("should fail when single elementId is not found", async () => {
				const tool = getToolByName("delete_element_by_id");

				const result = await tool.execute({ elementId: "nonexistent" });
				expect(result.success).toBe(false);
				expect(result.data).toMatchObject({
					errorCode: "ELEMENT_NOT_FOUND",
					notFound: ["nonexistent"],
				});
			});

			it("should fail when no params provided", async () => {
				const tool = getToolByName("delete_element_by_id");

				const result = await tool.execute({});
				expect(result.success).toBe(false);
				expect(result.data).toMatchObject({
					errorCode: "INVALID_PARAMS",
				});
			});

			it("should fail with INVALID_PARAMS when all batch items are invalid", async () => {
				const tool = getToolByName("delete_element_by_id");

				const result = await tool.execute({
					elements: [{}, { elementId: "" }, { elementId: "   " }],
				});
				expect(result.success).toBe(false);
				expect(result.data).toMatchObject({
					errorCode: "INVALID_PARAMS",
				});
				const data = result.data as {
					invalidItems?: Array<{ index: number; reason: string }>;
				};
				expect(data.invalidItems?.length).toBe(3);
			});
		});
	});
}
