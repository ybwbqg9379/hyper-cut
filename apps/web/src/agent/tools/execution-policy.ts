import { EditorCore } from "@/core";
import { hasActionHandlers, invokeAction } from "@/lib/actions";
import type { TAction, TArgOfAction } from "@/lib/actions";
import type { ToolExecutionContext } from "../types";

const USER_FACING_MODES = new Set(["chat", "workflow", "plan_confirmation"]);

interface CommandLike {
	canUndo?: () => boolean;
}

function getCommandManager(): CommandLike | null {
	const editor = EditorCore.getInstance() as unknown as {
		command?: CommandLike;
	};
	return editor.command ?? null;
}

function readCanUndo(): boolean | null {
	const command = getCommandManager();
	if (!command || typeof command.canUndo !== "function") {
		return null;
	}
	return command.canUndo();
}

function assertUndoCheckpoint({
	beforeCanUndo,
	label,
}: {
	beforeCanUndo: boolean | null;
	label: string;
}): void {
	if (beforeCanUndo !== false) {
		return;
	}
	const afterCanUndo = readCanUndo();
	if (afterCanUndo === false) {
		throw new Error(`${label} completed but did not create an undo checkpoint`);
	}
}

function canUseFallbackForContext({
	context,
	allowFallbackForUserFacing,
}: {
	context?: ToolExecutionContext;
	allowFallbackForUserFacing: boolean;
}): boolean {
	const mode = context?.mode;
	if (!mode) {
		return true;
	}
	if (!USER_FACING_MODES.has(mode)) {
		return true;
	}
	return allowFallbackForUserFacing;
}

export function executeActionFirst<A extends TAction, R = unknown>({
	action,
	args,
	context,
	fallback,
	allowFallbackForUserFacing = false,
	destructive = false,
}: {
	action: A;
	args?: TArgOfAction<A>;
	context?: ToolExecutionContext;
	fallback?: () => R[];
	allowFallbackForUserFacing?: boolean;
	destructive?: boolean;
}): R[] {
	if (hasActionHandlers(action)) {
		const beforeCanUndo = destructive ? readCanUndo() : null;
		const result = (invokeAction as (name: TAction, args?: unknown) => R[])(
			action,
			args,
		);
		if (destructive) {
			assertUndoCheckpoint({
				beforeCanUndo,
				label: `Action "${action}"`,
			});
		}
		return result;
	}

	if (
		fallback &&
		canUseFallbackForContext({
			context,
			allowFallbackForUserFacing,
		})
	) {
		const beforeCanUndo = destructive ? readCanUndo() : null;
		const result = fallback();
		if (destructive) {
			assertUndoCheckpoint({
				beforeCanUndo,
				label: `Fallback for action "${action}"`,
			});
		}
		return result;
	}

	throw new Error(`Action "${action}" is not available`);
}

export async function executeMutationWithUndoGuard<T>({
	label,
	destructive = false,
	run,
}: {
	label: string;
	destructive?: boolean;
	run: () => Promise<T> | T;
}): Promise<T> {
	const beforeCanUndo = destructive ? readCanUndo() : null;
	const result = await run();
	if (destructive) {
		assertUndoCheckpoint({ beforeCanUndo, label });
	}
	return result;
}
