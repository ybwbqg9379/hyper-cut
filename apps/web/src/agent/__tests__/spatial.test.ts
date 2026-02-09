import { describe, expect, it } from "vitest";
import {
	resolveAnchorToPixels,
	isSpatialAnchor,
	MAX_SPATIAL_MARGIN_RATIO,
} from "../utils/spatial";

describe("spatial utils", () => {
	it("should resolve basic anchors using center-based coordinates", () => {
		const canvasSize = { width: 1920, height: 1080 };

		expect(
			resolveAnchorToPixels({
				anchor: "top-left",
				canvasSize,
			}),
		).toEqual({ x: -960, y: -540 });

		expect(
			resolveAnchorToPixels({
				anchor: "center",
				canvasSize,
			}),
		).toEqual({ x: 0, y: 0 });

		expect(
			resolveAnchorToPixels({
				anchor: "bottom-right",
				canvasSize,
			}),
		).toEqual({ x: 960, y: 540 });
	});

	it("should apply margins toward inner canvas area", () => {
		const canvasSize = { width: 1920, height: 1080 };

		expect(
			resolveAnchorToPixels({
				anchor: "top-right",
				canvasSize,
				marginX: 0.1,
				marginY: 0.1,
			}),
		).toEqual({ x: 768, y: -432 });

		expect(
			resolveAnchorToPixels({
				anchor: "center-left",
				canvasSize,
				marginX: MAX_SPATIAL_MARGIN_RATIO,
			}),
		).toEqual({ x: 0, y: 0 });
	});

	it("should validate spatial anchor enum", () => {
		expect(isSpatialAnchor("top-center")).toBe(true);
		expect(isSpatialAnchor("left-top")).toBe(false);
		expect(isSpatialAnchor(123)).toBe(false);
	});
});
