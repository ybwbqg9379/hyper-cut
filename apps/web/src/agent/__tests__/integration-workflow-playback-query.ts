import { describe, expect, it, type vi } from "vitest";
import { getToolByName } from "./integration-harness";

export function registerWorkflowPlaybackQueryTests() {
	describe("Workflow Tools", () => {
		it("list_workflows should return preset workflows", async () => {
			const tool = getToolByName("list_workflows");
			const result = await tool.execute({});

			expect(result.success).toBe(true);
			expect(result.message).toContain("auto-caption-cleanup");
			expect(result.message).toContain("selection-caption-cleanup");
			expect(result.message).toContain("long-to-short");
			expect(result.message).toContain("podcast-to-clips");
			const workflows = (result.data as { workflows?: Array<unknown> })
				?.workflows;
			const longToShort =
				(Array.isArray(workflows) ? workflows : []).find(
					(item) =>
						typeof item === "object" &&
						item !== null &&
						(item as { name?: string }).name === "long-to-short",
				) ?? null;
			const steps =
				longToShort && typeof longToShort === "object"
					? ((longToShort as { steps?: Array<unknown> }).steps ?? [])
					: [];
			const applyCut =
				(Array.isArray(steps) ? steps : []).find(
					(step) =>
						typeof step === "object" &&
						step !== null &&
						(step as { id?: string }).id === "apply-cut",
				) ?? null;
			expect(
				(applyCut as { requiresConfirmation?: boolean } | null)
					?.requiresConfirmation,
			).toBe(true);
			const podcastToClips =
				(Array.isArray(workflows) ? workflows : []).find(
					(item) =>
						typeof item === "object" &&
						item !== null &&
						(item as { name?: string }).name === "podcast-to-clips",
				) ?? null;
			expect((podcastToClips as { scenario?: string } | null)?.scenario).toBe(
				"podcast",
			);
		});

		it("run_workflow should execute preset steps", async () => {
			const tool = getToolByName("run_workflow");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: {
					insertElement: ReturnType<typeof vi.fn>;
				};
			};

			const result = await tool.execute({
				workflowName: "auto-caption-cleanup",
			});

			expect(result.success).toBe(true);
			expect(result.message).toContain("执行完成");
			expect(editor.timeline.insertElement).toHaveBeenCalled();
		});

		it("run_workflow should pause before confirmation-required steps", async () => {
			const tool = getToolByName("run_workflow");
			const result = await tool.execute({
				workflowName: "long-to-short",
				startFromStepId: "apply-cut",
			});

			expect(result.success).toBe(true);
			expect(result.message).toContain("暂停");
			expect(result.data).toMatchObject({
				errorCode: "WORKFLOW_CONFIRMATION_REQUIRED",
				status: "awaiting_confirmation",
			});
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
				trackCount: 4,
				totalElements: 5,
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
				trackCount: 4,
				totalElements: 5,
				trackTypeDistribution: {
					video: 1,
					audio: 1,
					text: 1,
					sticker: 1,
				},
				elementTypeDistribution: {
					video: 1,
					image: 1,
					audio: 1,
					text: 1,
					sticker: 1,
				},
			});
		});
	});
}
