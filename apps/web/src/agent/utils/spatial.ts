export const SPATIAL_ANCHORS = [
	"top-left",
	"top-center",
	"top-right",
	"center-left",
	"center",
	"center-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
] as const;

export type SpatialAnchor = (typeof SPATIAL_ANCHORS)[number];

export const MAX_SPATIAL_MARGIN_RATIO = 0.5;

const ANCHOR_VECTORS: Record<SpatialAnchor, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> =
	{
		"top-left": { x: -1, y: -1 },
		"top-center": { x: 0, y: -1 },
		"top-right": { x: 1, y: -1 },
		"center-left": { x: -1, y: 0 },
		center: { x: 0, y: 0 },
		"center-right": { x: 1, y: 0 },
		"bottom-left": { x: -1, y: 1 },
		"bottom-center": { x: 0, y: 1 },
		"bottom-right": { x: 1, y: 1 },
	};

function roundTo3(value: number): number {
	return Number(value.toFixed(3));
}

export function isSpatialAnchor(value: unknown): value is SpatialAnchor {
	return (
		typeof value === "string" &&
		(SPATIAL_ANCHORS as readonly string[]).includes(value)
	);
}

export function resolveAnchorToPixels({
	anchor,
	canvasSize,
	marginX = 0,
	marginY = 0,
}: {
	anchor: SpatialAnchor;
	canvasSize: { width: number; height: number };
	marginX?: number;
	marginY?: number;
}): { x: number; y: number } {
	const vector = ANCHOR_VECTORS[anchor];
	const halfWidth = canvasSize.width / 2;
	const halfHeight = canvasSize.height / 2;

	const x = vector.x * halfWidth - vector.x * marginX * canvasSize.width;
	const y = vector.y * halfHeight - vector.y * marginY * canvasSize.height;

	return {
		x: roundTo3(x),
		y: roundTo3(y),
	};
}
