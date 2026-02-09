import { describe, expect, it } from "vitest";
import {
	resolveAnchorToPixels,
	isSpatialAnchor,
	MAX_SPATIAL_MARGIN_RATIO,
	buildLayoutSuggestionsFromObservations,
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

	it("should recommend top-center caption when bottom area is text-dense", () => {
		const suggestions = buildLayoutSuggestionsFromObservations([
			{
				description: "host in center",
				people: ["host"],
				textOnScreen: ["SUBTITLE LINE 1", "SUBTITLE LINE 2"],
				changes: "lower third caption appears at bottom",
			},
		]);
		const captionSuggestion = suggestions.find(
			(suggestion) => suggestion.target === "caption",
		);
		expect(captionSuggestion?.anchor).toBe("top-center");
		expect(captionSuggestion?.positionElementArgs).toMatchObject({
			anchor: "top-center",
		});
	});

	it("should keep logo in top-right for balanced scenes", () => {
		const suggestions = buildLayoutSuggestionsFromObservations([
			{
				description: "wide shot with clean background",
				people: [],
				textOnScreen: [],
				changes: "camera static",
			},
		]);
		const logoSuggestion = suggestions.find(
			(suggestion) => suggestion.target === "logo",
		);
		expect(logoSuggestion?.anchor).toBe("top-right");
		expect(typeof logoSuggestion?.confidence).toBe("number");
	});

	it("should avoid english substring false positives for occupancy detection", () => {
		const suggestions = buildLayoutSuggestionsFromObservations([
			{
				description: "bright desktop context with subtle texture",
				people: [],
				textOnScreen: [],
			},
		]);
		const captionSuggestion = suggestions.find(
			(suggestion) => suggestion.target === "caption",
		);
		expect(captionSuggestion?.anchor).toBe("bottom-center");
	});

	it("should still detect explicit english right keyword", () => {
		const suggestions = buildLayoutSuggestionsFromObservations([
			{
				description: "host stands on the right side of frame",
				people: ["host"],
				textOnScreen: [],
			},
		]);
		const logoSuggestion = suggestions.find(
			(suggestion) => suggestion.target === "logo",
		);
		expect(logoSuggestion?.anchor).toBe("top-left");
	});
});
