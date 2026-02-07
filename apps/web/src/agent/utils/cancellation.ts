import type { ToolResult } from "../types";

export const EXECUTION_CANCELLED_ERROR_CODE = "EXECUTION_CANCELLED";

export function isExecutionCancelled(signal?: AbortSignal): boolean {
	return signal?.aborted === true;
}

export function throwIfExecutionCancelled(signal?: AbortSignal): void {
	if (!isExecutionCancelled(signal)) {
		return;
	}
	throw new Error("Execution cancelled");
}

export function isCancellationError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const message = error.message.toLowerCase();
	return (
		error.name === "AbortError" ||
		message.includes("cancelled") ||
		message.includes("canceled") ||
		message.includes("execution cancelled")
	);
}

export function buildExecutionCancelledResult(
	data?: Record<string, unknown>,
): ToolResult {
	return {
		success: false,
		message: "执行已取消 (Execution cancelled)",
		data: {
			...(data ?? {}),
			errorCode: EXECUTION_CANCELLED_ERROR_CODE,
		},
	};
}
