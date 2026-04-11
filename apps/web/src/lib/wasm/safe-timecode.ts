/**
 * Safe wrappers for opencut-wasm functions.
 *
 * The upstream WASM API migrated MediaTime from float-seconds to i64 ticks
 * (TICKS_PER_SECOND = 120,000), but timeline element data still stores
 * float-seconds. These wrappers auto-detect the input format and convert
 * to ticks before calling WASM.
 */
import {
	formatTimecode as wasmFormatTimecode,
	mediaTimeToSeconds as wasmMediaTimeToSeconds,
	lastFrameTime as wasmLastFrameTime,
	snappedSeekTime as wasmSnappedSeekTime,
	roundToFrame as wasmRoundToFrame,
	floorToFrame as wasmFloorToFrame,
	isFrameAligned as wasmIsFrameAligned,
	mediaTimeToFrame as wasmMediaTimeToFrame,
	mediaTimeAdd as wasmMediaTimeAdd,
	mediaTimeSub as wasmMediaTimeSub,
	mediaTimeClamp as wasmMediaTimeClamp,
	mediaTimeMax as wasmMediaTimeMax,
	mediaTimeMin as wasmMediaTimeMin,
	type FormatTimecodeOptions,
	type MediaTimeToSecondsOptions,
	type LastFrameTimeOptions,
	type SnappedSeekTimeOptions,
	type RoundToFrameOptions,
	type FloorToFrameOptions,
	type IsFrameAlignedOptions,
	type MediaTimeToFrameOptions,
	type MediaTimeAddOptions,
	type MediaTimeSubOptions,
	type MediaTimeClampOptions,
	type MediaTimeMaxOptions,
	type MediaTimeMinOptions,
	type MediaTime,
} from "opencut-wasm";


/**
 * Safely converts any time value to a valid MediaTime (i64 ticks) by rounding.
 * The upstream WASM API requires MediaTime to be an integer.
 * Note: Since migration to v23, timeline state is strictly represented in ticks.
 * This wrapper ensures float precision errors do not crash WASM boundaries.
 */
function ensureTicks(time: number): MediaTime {
	return Math.round(time);
}

// --- Single MediaTime parameter wrappers ---

export function safeFormatTimecode(
	options: FormatTimecodeOptions,
): string | undefined {
	return wasmFormatTimecode({
		...options,
		time: ensureTicks(options.time),
	});
}

export function safeMediaTimeToSeconds(
	options: MediaTimeToSecondsOptions,
): number {
	return wasmMediaTimeToSeconds({
		...options,
		time: ensureTicks(options.time),
	});
}

export function safeLastFrameTime(
	options: LastFrameTimeOptions,
): MediaTime | undefined {
	return wasmLastFrameTime({
		...options,
		duration: ensureTicks(options.duration),
	});
}

export function safeRoundToFrame(
	options: RoundToFrameOptions,
): MediaTime | undefined {
	return wasmRoundToFrame({
		...options,
		time: ensureTicks(options.time),
	});
}

export function safeFloorToFrame(
	options: FloorToFrameOptions,
): MediaTime | undefined {
	return wasmFloorToFrame({
		...options,
		time: ensureTicks(options.time),
	});
}

export function safeIsFrameAligned(
	options: IsFrameAlignedOptions,
): boolean | undefined {
	return wasmIsFrameAligned({
		...options,
		time: ensureTicks(options.time),
	});
}

export function safeMediaTimeToFrame(
	options: MediaTimeToFrameOptions,
): bigint | undefined {
	return wasmMediaTimeToFrame({
		...options,
		time: ensureTicks(options.time),
	});
}

// --- Dual MediaTime parameter wrappers ---

export function safeSnappedSeekTime(
	options: SnappedSeekTimeOptions,
): MediaTime | undefined {
	return wasmSnappedSeekTime({
		...options,
		time: ensureTicks(options.time),
		duration: ensureTicks(options.duration),
	});
}

export function safeMediaTimeAdd(options: MediaTimeAddOptions): MediaTime {
	return wasmMediaTimeAdd({
		lhs: ensureTicks(options.lhs),
		rhs: ensureTicks(options.rhs),
	});
}

export function safeMediaTimeSub(options: MediaTimeSubOptions): MediaTime {
	return wasmMediaTimeSub({
		lhs: ensureTicks(options.lhs),
		rhs: ensureTicks(options.rhs),
	});
}

export function safeMediaTimeMax(options: MediaTimeMaxOptions): MediaTime {
	return wasmMediaTimeMax({
		lhs: ensureTicks(options.lhs),
		rhs: ensureTicks(options.rhs),
	});
}

export function safeMediaTimeMin(options: MediaTimeMinOptions): MediaTime {
	return wasmMediaTimeMin({
		lhs: ensureTicks(options.lhs),
		rhs: ensureTicks(options.rhs),
	});
}

export function safeMediaTimeClamp(options: MediaTimeClampOptions): MediaTime {
	return wasmMediaTimeClamp({
		time: ensureTicks(options.time),
		min: ensureTicks(options.min),
		max: ensureTicks(options.max),
	});
}
