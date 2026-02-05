import { describe, expect, it, vi } from "vitest";
import type { EditorCore } from "@/core";
import { SaveManager } from "../save-manager";

function createEditorStub({
	activeProject,
}: {
	activeProject: Record<string, unknown> | null;
}) {
	const saveCurrentProject = vi.fn(async () => {});

	const editor = {
		project: {
			getIsLoading: () => false,
			getMigrationState: () => ({ isMigrating: false }),
			getActiveOrNull: () => activeProject,
			saveCurrentProject,
		},
	} as unknown as EditorCore;

	return { editor, saveCurrentProject };
}

describe("SaveManager", () => {
	it("无 active project 时 markDirty 不应排队保存", () => {
		const { editor } = createEditorStub({
			activeProject: null,
		});
		const manager = new SaveManager(editor, { debounceMs: 0 });

		manager.markDirty();
		expect(manager.getIsDirty()).toBe(false);
	});

	it("flush 在无 active project 时应静默返回，不抛错", async () => {
		const { editor, saveCurrentProject } = createEditorStub({
			activeProject: null,
		});
		const manager = new SaveManager(editor, { debounceMs: 0 });

		await expect(manager.flush()).resolves.toBeUndefined();
		expect(saveCurrentProject).not.toHaveBeenCalled();
		expect(manager.getIsDirty()).toBe(false);
	});

	it("flush 在有 active project 时应执行保存", async () => {
		const { editor, saveCurrentProject } = createEditorStub({
			activeProject: { id: "project-1" },
		});
		const manager = new SaveManager(editor, { debounceMs: 0 });

		await manager.flush();
		expect(saveCurrentProject).toHaveBeenCalledTimes(1);
		expect(manager.getIsDirty()).toBe(false);
	});
});
