import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({
	hasActionHandlers: vi.fn(() => true),
	invokeAction: vi.fn(() => []),
}));

vi.mock("@/core", () => ({
	EditorCore: {
		getInstance: vi.fn(() => ({
			command: {
				canUndo: vi.fn(() => true),
			},
		})),
	},
}));

import { EditorCore } from "@/core";
import { hasActionHandlers, invokeAction } from "@/lib/actions";
import {
	executeActionFirst,
	executeMutationWithUndoGuard,
} from "../tools/execution-policy";

describe("execution-policy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should fail when action is unavailable in user-facing mode", () => {
		(hasActionHandlers as ReturnType<typeof vi.fn>).mockReturnValue(false);

		expect(() =>
			executeActionFirst({
				action: "split",
				context: { mode: "chat" },
			}),
		).toThrow('Action "split" is not available');
	});

	it("should allow fallback when running in internal mode", () => {
		(hasActionHandlers as ReturnType<typeof vi.fn>).mockReturnValue(false);
		const fallback = vi.fn(() => ["fallback-ok"]);

		const result = executeActionFirst({
			action: "split",
			fallback,
		});

		expect(result).toEqual(["fallback-ok"]);
		expect(fallback).toHaveBeenCalledTimes(1);
	});

	it("should enforce undo checkpoint for destructive action execution", () => {
		(hasActionHandlers as ReturnType<typeof vi.fn>).mockReturnValue(true);
		const canUndo = vi
			.fn()
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(false);
		(EditorCore.getInstance as ReturnType<typeof vi.fn>).mockReturnValue({
			command: { canUndo },
		});

		expect(() =>
			executeActionFirst({
				action: "delete-selected",
				destructive: true,
			}),
		).toThrow("did not create an undo checkpoint");
	});

	it("should enforce undo checkpoint for destructive mutations", async () => {
		const canUndo = vi
			.fn()
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(true);
		(EditorCore.getInstance as ReturnType<typeof vi.fn>).mockReturnValue({
			command: { canUndo },
		});

		await expect(
			executeMutationWithUndoGuard({
				label: "remove_asset",
				destructive: true,
				run: () => Promise.resolve("ok"),
			}),
		).resolves.toBe("ok");
	});

	it("should still invoke action when available", () => {
		(hasActionHandlers as ReturnType<typeof vi.fn>).mockReturnValue(true);
		executeActionFirst({
			action: "split",
			args: undefined,
		});
		expect(invokeAction).toHaveBeenCalledWith("split", undefined);
	});
});
