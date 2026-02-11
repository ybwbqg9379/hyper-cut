import { describe, expect, it, type vi } from "vitest";
import { getToolByName } from "./integration-harness";
import { __resetVisionToolCachesForTests } from "../tools/vision-tools";

export function registerWorkflowPlaybackQueryTests() {
	describe("Workflow Tools", () => {
		it("list_workflows should return preset workflows", async () => {
			const tool = getToolByName("list_workflows");
			const result = await tool.execute({});

			expect(result.success).toBe(true);
			expect(result.message).toContain("auto-caption-cleanup");
			expect(result.message).toContain("selection-caption-cleanup");
			expect(result.message).toContain("long-to-short");
			expect(result.message).toContain("podcast-to-clips");
			expect(result.message).toContain("one-click-masterpiece");
			const workflows = (result.data as { workflows?: Array<unknown> })
				?.workflows;
			const longToShort =
				(Array.isArray(workflows) ? workflows : []).find(
					(item) =>
						typeof item === "object" &&
						item !== null &&
						(item as { name?: string }).name === "long-to-short",
				) ?? null;
			const steps =
				longToShort && typeof longToShort === "object"
					? ((longToShort as { steps?: Array<unknown> }).steps ?? [])
					: [];
			const applyCut =
				(Array.isArray(steps) ? steps : []).find(
					(step) =>
						typeof step === "object" &&
						step !== null &&
						(step as { id?: string }).id === "apply-cut",
				) ?? null;
			expect(
				(applyCut as { requiresConfirmation?: boolean } | null)
					?.requiresConfirmation,
			).toBe(true);
			const podcastToClips =
				(Array.isArray(workflows) ? workflows : []).find(
					(item) =>
						typeof item === "object" &&
						item !== null &&
						(item as { name?: string }).name === "podcast-to-clips",
				) ?? null;
			expect((podcastToClips as { scenario?: string } | null)?.scenario).toBe(
				"podcast",
			);
		});

		it("run_workflow should execute preset steps", async () => {
			const tool = getToolByName("run_workflow");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: {
					insertElement: ReturnType<typeof vi.fn>;
				};
			};

			const result = await tool.execute({
				workflowName: "auto-caption-cleanup",
			});

			expect(result.success).toBe(true);
			expect(result.message).toContain("执行完成");
			expect(editor.timeline.insertElement).toHaveBeenCalled();
		});

		it("run_workflow should pause before confirmation-required steps", async () => {
			const tool = getToolByName("run_workflow");
			const result = await tool.execute({
				workflowName: "long-to-short",
				startFromStepId: "apply-cut",
			});

			expect(result.success).toBe(true);
			expect(result.message).toContain("暂停");
			expect(result.data).toMatchObject({
				errorCode: "WORKFLOW_CONFIRMATION_REQUIRED",
				status: "awaiting_confirmation",
			});
		});

		it("run_workflow should execute transcript step tools", async () => {
			const tool = getToolByName("run_workflow");
			const result = await tool.execute({
				workflowName: "text-based-cleanup",
				startFromStepId: "suggest-semantic-cuts",
				confirmRequiredSteps: true,
			});

			expect(
				(result.data as { errorCode?: string } | undefined)?.errorCode,
			).not.toBe("WORKFLOW_TOOL_NOT_FOUND");
		});

		it("run_workflow should execute content step tools", async () => {
			const tool = getToolByName("run_workflow");
			const result = await tool.execute({
				workflowName: "one-click-masterpiece",
				startFromStepId: "quality-report",
				stepOverrides: [
					{
						stepId: "quality-report",
						arguments: { targetDurationSeconds: 5 },
					},
				],
				confirmRequiredSteps: true,
			});

			expect(result.success).toBe(true);
			expect(result.message).toContain("执行完成");
		});

		it("run_workflow should continue when optional step fails", async () => {
			const tool = getToolByName("run_workflow");
			const result = await tool.execute({
				workflowName: "one-click-masterpiece",
				startFromStepId: "analyze-frames",
				stepOverrides: [
					{
						stepId: "analyze-frames",
						arguments: {
							videoAssetId: "__missing_asset__",
						},
					},
				],
				confirmRequiredSteps: true,
			});

			expect(result.success).toBe(true);
			expect(result.message).toContain("可选步骤失败");
			const optionalFailures = (
				result.data as
					| { optionalFailures?: Array<{ stepId?: string }> }
					| undefined
			)?.optionalFailures;
			expect(Array.isArray(optionalFailures)).toBe(true);
			expect(
				optionalFailures?.some(
					(failure) => failure.stepId === "analyze-frames",
				),
			).toBe(true);
		});

		it("run_workflow should execute apply-caption-layout with inline suggestion override", async () => {
			const tool = getToolByName("run_workflow");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: {
					updateElements: ReturnType<typeof vi.fn>;
				};
			};

			const result = await tool.execute({
				workflowName: "talking-head-polish",
				startFromStepId: "apply-caption-layout",
				stepOverrides: [
					{
						stepId: "apply-caption-layout",
						arguments: {
							target: "caption",
							elementId: "el1",
							trackId: "track1",
							suggestion: {
								target: "caption",
								anchor: "bottom-center",
								marginX: 0,
								marginY: 0.1,
							},
						},
					},
				],
				confirmRequiredSteps: true,
			});

			expect(result.success).toBe(true);
			expect(editor.timeline.updateElements).toHaveBeenCalled();
		});
	});

	describe("Vision Tools", () => {
		it("apply_layout_suggestion should position element from inline suggestion", async () => {
			__resetVisionToolCachesForTests();
			const tool = getToolByName("apply_layout_suggestion");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { updateElements: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({
				elementId: "el1",
				trackId: "track1",
				suggestion: {
					target: "logo",
					anchor: "top-right",
					marginX: 0.06,
					marginY: 0.06,
				},
			});
			expect(result.success).toBe(true);
			expect(editor.timeline.updateElements).toHaveBeenCalledWith({
				updates: [
					{
						trackId: "track1",
						elementId: "el1",
						updates: {
							transform: {
								scale: 1,
								rotate: 0,
								position: { x: 844.8, y: -475.2 },
							},
						},
					},
				],
			});
		});

		it("apply_layout_suggestion should support confirmation flow for low-confidence suggestions", async () => {
			__resetVisionToolCachesForTests();
			const tool = getToolByName("apply_layout_suggestion");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { updateElements: ReturnType<typeof vi.fn> };
			};
			editor.timeline.updateElements.mockClear();

			const previewResult = await tool.execute({
				elementId: "el1",
				trackId: "track1",
				minConfidence: 0.8,
				suggestion: {
					target: "caption",
					anchor: "bottom-center",
					marginX: 0,
					marginY: 0.08,
					confidence: 0.6,
				},
			});
			expect(previewResult.success).toBe(true);
			expect(previewResult.data).toMatchObject({
				stateCode: "REQUIRES_CONFIRMATION",
				confirmationReason: "LOW_CONFIDENCE",
				applied: false,
			});
			expect(editor.timeline.updateElements).not.toHaveBeenCalled();

			const confirmResult = await tool.execute({
				elementId: "el1",
				trackId: "track1",
				minConfidence: 0.8,
				confirmLowConfidence: true,
				suggestion: {
					target: "caption",
					anchor: "bottom-center",
					marginX: 0,
					marginY: 0.08,
					confidence: 0.6,
				},
			});
			expect(confirmResult.success).toBe(true);
			expect(editor.timeline.updateElements).toHaveBeenCalledTimes(1);
		});

		it("apply_layout_suggestion should allow retry with fallback candidate after auto-match failure", async () => {
			__resetVisionToolCachesForTests();
			const tool = getToolByName("apply_layout_suggestion");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: {
					getTracks: ReturnType<typeof vi.fn>;
					updateElements: ReturnType<typeof vi.fn>;
				};
			};
			editor.timeline.updateElements.mockClear();
			editor.timeline.getTracks.mockReturnValueOnce([
				{
					id: "track1",
					type: "video",
					isMain: true,
					elements: [
						{
							id: "el1",
							type: "video",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 0,
							mediaId: "asset1",
							transform: {
								scale: 1,
								position: { x: 0, y: 0 },
								rotate: 0,
							},
							opacity: 1,
						},
					],
				},
			]);

			const failedResult = await tool.execute({
				target: "caption",
				suggestion: {
					target: "caption",
					anchor: "bottom-center",
					marginX: 0,
					marginY: 0.08,
					confidence: 0.9,
				},
			});
			expect(failedResult.success).toBe(false);
			expect(failedResult.data).toMatchObject({
				errorCode: "AUTO_TARGET_NOT_FOUND",
			});

			const candidateElements = (
				failedResult.data as {
					candidateElements?: Array<{ elementId?: string; trackId?: string }>;
				}
			).candidateElements;
			expect(Array.isArray(candidateElements)).toBe(true);
			expect(candidateElements?.[0]).toMatchObject({
				elementId: "el1",
				trackId: "track1",
			});

			const retryResult = await tool.execute({
				elementId: candidateElements?.[0]?.elementId,
				trackId: candidateElements?.[0]?.trackId,
				confirmLowConfidence: true,
				suggestion: {
					target: "caption",
					anchor: "bottom-center",
					marginX: 0,
					marginY: 0.08,
					confidence: 0.9,
				},
			});
			expect(retryResult.success).toBe(true);
			expect(editor.timeline.updateElements).toHaveBeenCalledTimes(1);
		});

		it("apply_layout_suggestion should return multiple ranked candidates when auto-match fails on default tracks", async () => {
			__resetVisionToolCachesForTests();
			const tool = getToolByName("apply_layout_suggestion");

			const result = await tool.execute({
				target: "caption",
				suggestion: {
					target: "caption",
					anchor: "bottom-center",
					marginX: 0,
					marginY: 0.08,
					confidence: 0.9,
				},
			});
			expect(result.success).toBe(false);
			expect(result.data).toMatchObject({
				errorCode: "AUTO_TARGET_NOT_FOUND",
			});
			const candidates = (
				result.data as {
					candidateElements?: Array<{
						elementId?: string;
						trackId?: string;
						rank?: number;
					}>;
				}
			).candidateElements;
			expect(Array.isArray(candidates)).toBe(true);
			expect(candidates?.length).toBeGreaterThanOrEqual(2);
			expect(candidates?.[0].rank).toBe(1);
			expect(candidates?.[1].rank).toBe(2);
		});

		it("apply_layout_suggestion should succeed when retrying with a non-first candidate", async () => {
			__resetVisionToolCachesForTests();
			const tool = getToolByName("apply_layout_suggestion");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				timeline: { updateElements: ReturnType<typeof vi.fn> };
			};
			editor.timeline.updateElements.mockClear();

			const failedResult = await tool.execute({
				target: "caption",
				suggestion: {
					target: "caption",
					anchor: "bottom-center",
					marginX: 0,
					marginY: 0.08,
					confidence: 0.9,
				},
			});
			expect(failedResult.success).toBe(false);
			const candidates = (
				failedResult.data as {
					candidateElements?: Array<{
						elementId?: string;
						trackId?: string;
						rank?: number;
					}>;
				}
			).candidateElements;
			expect(candidates?.length).toBeGreaterThanOrEqual(2);

			const second = candidates?.[1];
			expect(second).toBeDefined();
			const retryResult = await tool.execute({
				elementId: second?.elementId,
				trackId: second?.trackId,
				confirmLowConfidence: true,
				suggestion: {
					target: "caption",
					anchor: "bottom-center",
					marginX: 0,
					marginY: 0.08,
					confidence: 0.9,
				},
			});
			expect(retryResult.success).toBe(true);
			expect(editor.timeline.updateElements).toHaveBeenCalledTimes(1);
		});

		it("apply_layout_suggestion should fail when no cached suggestions are available", async () => {
			__resetVisionToolCachesForTests();
			const tool = getToolByName("apply_layout_suggestion");
			const result = await tool.execute({
				elementId: "el1",
				trackId: "track1",
			});
			expect(result.success).toBe(false);
			expect(result.data).toMatchObject({ errorCode: "NO_LAYOUT_SUGGESTIONS" });
		});
	});

	describe("Playback Tools", () => {
		it("toggle_play should invoke toggle-play action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("toggle_play");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("toggle-play", undefined);
			expect(result.success).toBe(true);
		});

		it("seek_forward should invoke seek-forward action with seconds", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("seek_forward");

			const result = await tool.execute({ seconds: 5 });
			expect(invokeAction).toHaveBeenCalledWith("seek-forward", { seconds: 5 });
			expect(result.success).toBe(true);
		});

		it("undo should invoke undo action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("undo");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("undo", undefined);
			expect(result.success).toBe(true);
		});

		it("seek_to_time should seek to specified time", async () => {
			const tool = getToolByName("seek_to_time");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				playback: { seek: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ time: 10 });
			expect(result.success).toBe(true);
			expect(editor.playback.seek).toHaveBeenCalledWith({ time: 10 });
		});

		it("seek_to_time should fail on invalid time", async () => {
			const tool = getToolByName("seek_to_time");

			const result = await tool.execute({ time: -1 });
			expect(result.success).toBe(false);
		});

		it("seek_to_time should fail when scrubbing is active", async () => {
			const tool = getToolByName("seek_to_time");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				playback: { getIsScrubbing: ReturnType<typeof vi.fn> };
			};

			editor.playback.getIsScrubbing.mockReturnValueOnce(true);
			const result = await tool.execute({ time: 10 });
			expect(result.success).toBe(false);
			expect(result.data).toMatchObject({
				errorCode: "SCRUBBING_IN_PROGRESS",
			});
		});

		it("set_volume should update playback volume", async () => {
			const tool = getToolByName("set_volume");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				playback: { setVolume: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({ volume: 0.5 });
			expect(result.success).toBe(true);
			expect(editor.playback.setVolume).toHaveBeenCalledWith({ volume: 0.5 });
		});

		it("set_volume should fail on invalid volume", async () => {
			const tool = getToolByName("set_volume");

			const result = await tool.execute({ volume: "loud" });
			expect(result.success).toBe(false);
		});

		it("toggle_playback_mute should toggle mute", async () => {
			const tool = getToolByName("toggle_playback_mute");
			const { EditorCore } = await import("@/core");
			const editor = EditorCore.getInstance() as unknown as {
				playback: { toggleMute: ReturnType<typeof vi.fn> };
			};

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(editor.playback.toggleMute).toHaveBeenCalled();
		});

		it("jump_forward should invoke jump-forward action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("jump_forward");

			const result = await tool.execute({ seconds: 5 });
			expect(invokeAction).toHaveBeenCalledWith("jump-forward", { seconds: 5 });
			expect(result.success).toBe(true);
		});

		it("jump_backward should invoke jump-backward action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("jump_backward");

			const result = await tool.execute({ seconds: 5 });
			expect(invokeAction).toHaveBeenCalledWith("jump-backward", {
				seconds: 5,
			});
			expect(result.success).toBe(true);
		});

		it("stop_playback should invoke stop-playback action", async () => {
			const { invokeAction } = await import("@/lib/actions");
			const tool = getToolByName("stop_playback");

			const result = await tool.execute({});
			expect(invokeAction).toHaveBeenCalledWith("stop-playback", undefined);
			expect(result.success).toBe(true);
		});
	});

	describe("Query Tools", () => {
		it("get_timeline_info should return track and element counts", async () => {
			const tool = getToolByName("get_timeline_info");

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				trackCount: 4,
				totalElements: 5,
			});
		});

		it("get_current_time should return playhead position", async () => {
			const tool = getToolByName("get_current_time");

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				currentTimeSeconds: 5,
			});
		});

		it("get_element_details should return full element info", async () => {
			const tool = getToolByName("get_element_details");

			const result = await tool.execute({ elementId: "el1" });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				track: { id: "track1" },
				element: { id: "el1", type: "video" },
			});
		});

		it("get_elements_in_range should return elements in range with track filter", async () => {
			const tool = getToolByName("get_elements_in_range");

			const result = await tool.execute({
				startTime: 1,
				endTime: 13,
				trackId: "track1",
			});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				count: 2,
				trackId: "track1",
			});
		});

		it("get_track_details should return single track summary", async () => {
			const tool = getToolByName("get_track_details");

			const result = await tool.execute({ trackId: "track1" });
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				track: { id: "track1", type: "video" },
				stats: { elementCount: 2 },
			});
		});

		it("get_timeline_summary should return structured summary", async () => {
			const tool = getToolByName("get_timeline_summary");

			const result = await tool.execute({});
			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({
				trackCount: 4,
				totalElements: 5,
				trackTypeDistribution: {
					video: 1,
					audio: 1,
					text: 1,
					sticker: 1,
				},
				elementTypeDistribution: {
					video: 1,
					image: 1,
					audio: 1,
					text: 1,
					sticker: 1,
				},
			});
		});
	});
}
