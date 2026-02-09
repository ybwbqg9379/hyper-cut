import { describe, expect, it } from "vitest";
import { buildTimelineOperationDiff } from "../tools/timeline-edit-ops";

describe("timeline diff schema", () => {
	it("should compute added/removed/moved elements and duration delta", () => {
		const beforeTracks = [
			{
				id: "track1",
				type: "video",
				isMain: true,
				elements: [
					{
						id: "a",
						type: "video",
						startTime: 0,
						duration: 10,
						trimStart: 0,
						trimEnd: 0,
						mediaId: "m1",
					},
					{
						id: "b",
						type: "video",
						startTime: 12,
						duration: 4,
						trimStart: 0,
						trimEnd: 0,
						mediaId: "m2",
					},
				],
			},
		];

		const afterTracks = [
			{
				id: "track1",
				type: "video",
				isMain: true,
				elements: [
					{
						id: "b",
						type: "video",
						startTime: 8,
						duration: 4,
						trimStart: 0,
						trimEnd: 0,
						mediaId: "m2",
					},
					{
						id: "c",
						type: "video",
						startTime: 12,
						duration: 3,
						trimStart: 0,
						trimEnd: 0,
						mediaId: "m3",
					},
				],
			},
		];

		const diff = buildTimelineOperationDiff({
			beforeTracks,
			afterTracks,
			deleteRanges: [{ start: 0, end: 4 }],
		});

		expect(diff.affectedElements.removed).toContain("track1:a");
		expect(diff.affectedElements.added).toContain("track1:c");
		expect(diff.affectedElements.moved).toContain("track1:b");
		expect(diff.duration.beforeSeconds).toBeGreaterThan(0);
		expect(diff.duration.afterSeconds).toBeGreaterThan(0);
		expect(diff.deleteRanges?.length).toBe(1);
		expect(JSON.parse(JSON.stringify(diff))).toMatchObject({
			duration: {
				deltaSeconds: expect.any(Number),
			},
		});
	});
});
