import { formatTimecode as wasmFormatTimecode, mediaTimeToSeconds as wasmMediaTimeToSeconds } from "opencut-wasm";
import { TICKS_PER_SECOND } from "./constants";
import type { FormatTimecodeOptions, MediaTimeToSecondsOptions } from "opencut-wasm";

/**
 * Detects whether a time value is in seconds (float) or ticks (large integer).
 * TICKS_PER_SECOND = 120,000, so any value that would represent > 0.01s as ticks
 * would be >= 1200. Values below this threshold with decimals are likely seconds.
 */
function isLikelySeconds(time: number): boolean {
	// If the value has decimal places and is relatively small, it's seconds
	// Ticks are always integers and typically large (120000 per second)
	return !Number.isInteger(time) || (time > 0 && time < TICKS_PER_SECOND);
}

/**
 * Converts a time value to ticks if it appears to be in seconds.
 * This handles the mismatch between legacy float-seconds data and
 * the new i64-ticks WASM API.
 */
function ensureTicks(time: number): number {
	if (isLikelySeconds(time)) {
		return Math.round(time * TICKS_PER_SECOND);
	}
	return time;
}

/**
 * Safe wrapper around WASM formatTimecode that handles both
 * float-seconds and integer-ticks input gracefully.
 */
export function safeFormatTimecode(options: FormatTimecodeOptions): string | undefined {
	return wasmFormatTimecode({
		...options,
		time: ensureTicks(options.time),
	});
}

/**
 * Safe wrapper around WASM mediaTimeToSeconds that handles both
 * float-seconds and integer-ticks input gracefully.
 */
export function safeMediaTimeToSeconds(options: MediaTimeToSecondsOptions): number {
	const time = options.time;
	if (isLikelySeconds(time)) {
		// Already in seconds, just return as-is
		return time;
	}
	return wasmMediaTimeToSeconds(options);
}
