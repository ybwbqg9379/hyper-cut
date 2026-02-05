import { describe, expect, it, type vi } from "vitest";
import { getToolByName } from "./integration-harness";

export function registerMediaSceneErrorTests() {
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
}
