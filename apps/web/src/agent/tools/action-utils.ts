import type { TAction, TArgOfAction } from "@/lib/actions";
import type { ToolExecutionContext } from "../types";
import { executeActionFirst } from "./execution-policy";

export function invokeActionWithCheck<A extends TAction, R = unknown>(
	action: A,
	args?: TArgOfAction<A>,
	options?: {
		context?: ToolExecutionContext;
		fallback?: () => R[];
		allowFallbackForUserFacing?: boolean;
	},
): R[] {
	return executeActionFirst<A, R>({
		action,
		args,
		context: options?.context,
		fallback: options?.fallback,
		allowFallbackForUserFacing: options?.allowFallbackForUserFacing ?? false,
	});
}

export function invokeDestructiveActionWithCheck<
	A extends TAction,
	R = unknown,
>(
	action: A,
	args?: TArgOfAction<A>,
	options?: {
		context?: ToolExecutionContext;
		fallback?: () => R[];
		allowFallbackForUserFacing?: boolean;
	},
): R[] {
	return executeActionFirst<A, R>({
		action,
		args,
		context: options?.context,
		fallback: options?.fallback,
		allowFallbackForUserFacing: options?.allowFallbackForUserFacing ?? false,
		destructive: true,
	});
}
