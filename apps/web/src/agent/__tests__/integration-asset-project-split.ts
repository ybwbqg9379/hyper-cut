import { describe, expect, it, vi } from "vitest";
import { getToolByName } from "./integration-harness";

export function registerAssetProjectSplitTests() {
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

		it("search_sticker should return sticker candidates without insertion", async () => {
			const tool = getToolByName("search_sticker");
			const result = await tool.execute({ query: "star" });

			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				query: "star",
				count: 2,
			});
			expect(
				(result.data as { candidates: Array<{ iconName: string }> })
					.candidates[0],
			).toMatchObject({
				iconName: "mdi:star",
			});
		});

		it("search_sticker should fail when query is missing", async () => {
			const tool = getToolByName("search_sticker");
			const result = await tool.execute({});
			expect(result.success).toBe(false);
		});

		it("add_sticker should search and insert sticker element", async () => {
			const tool = getToolByName("add_sticker");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { insertElement: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ query: "star" });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				iconName: "mdi:star",
			});
			expect(editor.timeline.insertElement).toHaveBeenCalledWith(
				expect.objectContaining({
					placement: { mode: "explicit", trackId: "track4" },
					element: expect.objectContaining({ type: "sticker" }),
				}),
			);
		});

		it("search_sound_effect should return sound candidates without insertion", async () => {
			const tool = getToolByName("search_sound_effect");
			const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
			fetchMock.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					count: 1,
					results: [
						{
							id: 101,
							name: "Whoosh",
							description: "",
							url: "https://freesound.org/s/101",
							previewUrl: "https://cdn.freesound.org/previews/101.mp3",
							duration: 2.4,
							filesize: 1234,
							type: "mp3",
							channels: 2,
							bitrate: 128,
							bitdepth: 16,
							samplerate: 44100,
							username: "tester",
							tags: ["whoosh"],
							license: "cc0",
							created: "2025-01-01",
							downloads: 10,
							rating: 4.5,
							ratingCount: 8,
						},
					],
				}),
			});

			const result = await tool.execute({ query: "whoosh" });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				query: "whoosh",
				count: 1,
			});
			expect(
				(
					result.data as {
						candidates: Array<{ id: number; resultIndex: number }>;
					}
				).candidates[0],
			).toMatchObject({
				id: 101,
				resultIndex: 0,
			});
		});

		it("search_sound_effect should fail when query is missing", async () => {
			const tool = getToolByName("search_sound_effect");
			const result = await tool.execute({});
			expect(result.success).toBe(false);
		});

		it("add_sound_effect should search and insert audio element", async () => {
			const tool = getToolByName("add_sound_effect");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { insertElement: ReturnType<typeof vi.fn> };
			};
			const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
			fetchMock
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({
						count: 1,
						results: [
							{
								id: 101,
								name: "Whoosh",
								description: "",
								url: "https://freesound.org/s/101",
								previewUrl: "https://cdn.freesound.org/previews/101.mp3",
								duration: 2.4,
								filesize: 1234,
								type: "mp3",
								channels: 2,
								bitrate: 128,
								bitdepth: 16,
								samplerate: 44100,
								username: "tester",
								tags: ["whoosh"],
								license: "cc0",
								created: "2025-01-01",
								downloads: 10,
								rating: 4.5,
								ratingCount: 8,
							},
						],
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					arrayBuffer: async () => new ArrayBuffer(16),
				});
			class MockAudioContext {
				decodeAudioData = vi.fn(async () => ({ sampleRate: 44100 }));
				close = vi.fn(async () => {});
			}
			vi.stubGlobal("AudioContext", MockAudioContext);

			const result = await tool.execute({ query: "whoosh" });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				soundId: 101,
				soundName: "Whoosh",
			});
			expect(editor.timeline.insertElement).toHaveBeenCalledWith(
				expect.objectContaining({
					placement: { mode: "explicit", trackId: "track2" },
					element: expect.objectContaining({
						type: "audio",
						sourceType: "library",
					}),
				}),
			);
		});

		it("add_sound_effect should insert audio by soundId", async () => {
			const tool = getToolByName("add_sound_effect");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { insertElement: ReturnType<typeof vi.fn> };
			};
			const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
			fetchMock
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({
						result: {
							id: 202,
							name: "Impact",
							description: "",
							url: "https://freesound.org/s/202",
							previewUrl: "https://cdn.freesound.org/previews/202.mp3",
							duration: 1.8,
							filesize: 1234,
							type: "mp3",
							channels: 2,
							bitrate: 128,
							bitdepth: 16,
							samplerate: 44100,
							username: "tester",
							tags: ["impact"],
							license: "cc0",
							created: "2025-01-01",
							downloads: 10,
							rating: 4.5,
							ratingCount: 8,
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					arrayBuffer: async () => new ArrayBuffer(16),
				});
			class MockAudioContext {
				decodeAudioData = vi.fn(async () => ({ sampleRate: 44100 }));
				close = vi.fn(async () => {});
			}
			vi.stubGlobal("AudioContext", MockAudioContext);

			const result = await tool.execute({ soundId: 202 });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				source: "soundId",
				soundId: 202,
				soundName: "Impact",
			});
			expect(editor.timeline.insertElement).toHaveBeenCalledWith(
				expect.objectContaining({
					placement: { mode: "explicit", trackId: "track2" },
					element: expect.objectContaining({
						type: "audio",
						sourceType: "library",
					}),
				}),
			);
		});

		it("add_sound_effect should fail when result index is out of range", async () => {
			const tool = getToolByName("add_sound_effect");
			const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
			fetchMock.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					count: 1,
					results: [
						{
							id: 101,
							name: "Whoosh",
							description: "",
							url: "https://freesound.org/s/101",
							previewUrl: "https://cdn.freesound.org/previews/101.mp3",
							duration: 2.4,
							filesize: 1234,
							type: "mp3",
							channels: 2,
							bitrate: 128,
							bitdepth: 16,
							samplerate: 44100,
							username: "tester",
							tags: ["whoosh"],
							license: "cc0",
							created: "2025-01-01",
							downloads: 10,
							rating: 4.5,
							ratingCount: 8,
						},
					],
				}),
			});

			const result = await tool.execute({
				query: "whoosh",
				resultIndex: 5,
			});
			expect(result.success).toBe(false);
		});

		it("add_sound_effect should fail when soundId and query are both missing", async () => {
			const tool = getToolByName("add_sound_effect");
			const result = await tool.execute({});
			expect(result.success).toBe(false);
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
				command: { execute: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ assetId: "asset2" });
			expect(result.success).toBe(true);
			expect(editor.command.execute).toHaveBeenCalledWith(
				expect.objectContaining({
					command: expect.objectContaining({
						assetId: "asset2",
					}),
				}),
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
					{ trackId: "track4", elementId: "sticker1" },
				],
				splitTime: 30,
			});
		});
	});
}
