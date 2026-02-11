/**
 * AgentOrchestrator Tests
 * Verifies tool-call loop behavior and system prompt overrides
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
	AgentExecutionEvent,
	AgentTool,
	LLMProvider,
	ToolExecutionContext,
} from "../types";
import { AgentOrchestrator } from "../orchestrator";

vi.mock("../providers", () => ({
	createRoutedProvider: vi.fn(),
	getConfiguredProviderType: vi.fn(() => "lm-studio"),
}));
const { evaluateQuality } = vi.hoisted(() => ({
	evaluateQuality: vi.fn(),
}));
vi.mock("../services/quality-evaluator", () => ({
	qualityEvaluatorService: {
		evaluate: evaluateQuality,
	},
}));

import { createRoutedProvider } from "../providers";

describe("AgentOrchestrator", () => {
	const buildProvider = () => {
		const provider: LLMProvider = {
			name: "mock-provider",
			chat: vi.fn(),
			isAvailable: vi.fn().mockResolvedValue(true),
		};
		return provider;
	};

	beforeEach(() => {
		vi.clearAllMocks();
		evaluateQuality.mockReturnValue({
			passed: true,
			overallScore: 0.9,
			timelineDurationSeconds: 60,
			metrics: {
				semanticCompleteness: {
					value: 0.9,
					score: 0.9,
					passed: true,
					threshold: 0.65,
				},
				silenceRate: {
					value: 0.1,
					score: 0.9,
					passed: true,
					threshold: 0.45,
				},
				subtitleCoverage: {
					value: 0.9,
					score: 0.9,
					passed: true,
					threshold: 0.55,
				},
				durationCompliance: {
					value: 0.9,
					score: 0.9,
					passed: true,
					threshold: 0.7,
				},
			},
			reasons: [],
			evaluatedAt: "2026-02-09T00:00:00.000Z",
		});
	});

	it("should execute tool calls and return final response", async () => {
		const provider = buildProvider();
		const toolExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "ok",
		});

		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [
					{ id: "call-1", name: "test_tool", arguments: { value: 1 } },
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "已完成",
				toolCalls: [],
				finishReason: "stop",
			});

		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const tools: AgentTool[] = [
			{
				name: "test_tool",
				description: "test tool",
				parameters: {
					type: "object",
					properties: {},
					required: [],
				},
				execute: toolExecute,
			},
		];

		const orchestrator = new AgentOrchestrator(tools, {
			systemPrompt: "CUSTOM",
			maxToolIterations: 3,
		});

		const result = await orchestrator.process("do it");

		expect(toolExecute).toHaveBeenCalledWith(
			{ value: 1 },
			expect.objectContaining({
				mode: "chat",
				toolName: "test_tool",
				toolCallId: "call-1",
			}),
		);
		expect(provider.chat).toHaveBeenCalledTimes(2);
		expect(result.success).toBe(true);
		expect(result.message).toBe("已完成");
		expect(result.toolCalls?.length).toBe(1);
	});

	it("should stop after max tool iterations", async () => {
		const provider = buildProvider();
		const toolExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "ok",
		});

		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});

		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const tools: AgentTool[] = [
			{
				name: "test_tool",
				description: "test tool",
				parameters: {
					type: "object",
					properties: {},
					required: [],
				},
				execute: toolExecute,
			},
		];

		const orchestrator = new AgentOrchestrator(tools, {
			maxToolIterations: 1,
		});

		const result = await orchestrator.process("do it");

		expect(result.success).toBe(false);
		expect(result.message).toContain("工具调用次数已达上限");
		expect(toolExecute).toHaveBeenCalledTimes(1);
	});

	it("process should stop executing remaining tools when workflow pauses", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [
				{ id: "call-1", name: "first_tool", arguments: { value: 1 } },
				{ id: "call-2", name: "second_tool", arguments: { value: 2 } },
			],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const firstExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "pause",
			data: {
				errorCode: "WORKFLOW_CONFIRMATION_REQUIRED",
				status: "awaiting_confirmation",
				nextStep: { id: "apply-cut", toolName: "delete_selection" },
				resumeHint: {
					workflowName: "long-to-short",
					startFromStepId: "apply-cut",
					confirmRequiredSteps: true,
				},
			},
		});
		const secondExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "should not run" });

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "first_tool",
					description: "first tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: firstExecute,
				},
				{
					name: "second_tool",
					description: "second tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: secondExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.process("do it");

		expect(firstExecute).toHaveBeenCalledTimes(1);
		expect(secondExecute).not.toHaveBeenCalled();
		expect(provider.chat).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(false);
		expect(result.status).toBe("awaiting_confirmation");
		expect(result.requiresConfirmation).toBe(true);
	});

	it("process should abort running sibling nodes after pause", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [
				{ id: "call-1", name: "get_pause", arguments: {} },
				{ id: "call-2", name: "get_slow", arguments: {} },
			],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const getPauseExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "pause",
			data: {
				errorCode: "WORKFLOW_CONFIRMATION_REQUIRED",
				status: "awaiting_confirmation",
				nextStep: { id: "apply-cut", toolName: "delete_selection" },
				resumeHint: {
					workflowName: "long-to-short",
					startFromStepId: "apply-cut",
					confirmRequiredSteps: true,
				},
			},
		});

		let slowAborted = false;
		const getSlowExecute = vi.fn(
			(_params: Record<string, unknown>, context?: ToolExecutionContext) =>
				new Promise<{ success: boolean; message: string; data: unknown }>(
					(resolve) => {
						if (context?.signal?.aborted) {
							slowAborted = true;
							resolve({
								success: false,
								message: "cancelled",
								data: { errorCode: "EXECUTION_CANCELLED" },
							});
							return;
						}
						context?.signal?.addEventListener(
							"abort",
							() => {
								slowAborted = true;
								resolve({
									success: false,
									message: "cancelled",
									data: { errorCode: "EXECUTION_CANCELLED" },
								});
							},
							{ once: true },
						);
					},
				),
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "get_pause",
					description: "pause tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: getPauseExecute,
				},
				{
					name: "get_slow",
					description: "slow tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: getSlowExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.process("pause and stop siblings");

		expect(result.status).toBe("awaiting_confirmation");
		expect(getPauseExecute).toHaveBeenCalledTimes(1);
		expect(getSlowExecute).toHaveBeenCalledTimes(1);
		expect(slowAborted).toBe(true);
	});

	it("should abort tool signal when execution times out", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [{ id: "call-1", name: "slow_tool", arguments: {} }],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "done",
				toolCalls: [],
				finishReason: "stop",
			});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		let aborted = false;
		const slowExecute = vi.fn(
			(_: Record<string, unknown>, context?: ToolExecutionContext) =>
				new Promise<{ success: boolean; message: string }>((resolve) => {
					context?.signal?.addEventListener(
						"abort",
						() => {
							aborted = true;
							resolve({ success: false, message: "aborted by signal" });
						},
						{ once: true },
					);
				}),
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "slow_tool",
					description: "slow tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: slowExecute,
				},
			],
			{
				toolTimeoutMs: 5,
			},
		);

		const result = await orchestrator.process("do it");

		expect(aborted).toBe(true);
		expect(result.success).toBe(false);
		expect(provider.chat).toHaveBeenCalledTimes(2);
		expect(result.toolCalls?.[0]?.result.message).toBe("aborted by signal");
	});

	it("should mark response failed if any tool execution fails", async () => {
		const provider = buildProvider();
		const toolExecute = vi.fn().mockResolvedValue({
			success: false,
			message: "failed",
		});

		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [
					{ id: "call-1", name: "test_tool", arguments: { value: 1 } },
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "已完成",
				toolCalls: [],
				finishReason: "stop",
			});

		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const tools: AgentTool[] = [
			{
				name: "test_tool",
				description: "test tool",
				parameters: {
					type: "object",
					properties: {},
					required: [],
				},
				execute: toolExecute,
			},
		];

		const orchestrator = new AgentOrchestrator(tools);

		const result = await orchestrator.process("do it");

		expect(result.success).toBe(false);
		expect(result.toolCalls?.length).toBe(1);
	});

	it("should not call chat when provider is unavailable", async () => {
		const provider = buildProvider();
		(provider.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false);
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator([]);
		const result = await orchestrator.process("do it");

		expect(result.success).toBe(false);
		expect(provider.chat).not.toHaveBeenCalled();
	});

	it("should omit assistant content when tool calls are present", async () => {
		const provider = buildProvider();
		const toolExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "ok",
		});

		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: "intermediate text",
				toolCalls: [
					{ id: "call-1", name: "test_tool", arguments: { value: 1 } },
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "done",
				toolCalls: [],
				finishReason: "stop",
			});

		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const tools: AgentTool[] = [
			{
				name: "test_tool",
				description: "test tool",
				parameters: {
					type: "object",
					properties: {},
					required: [],
				},
				execute: toolExecute,
			},
		];

		const orchestrator = new AgentOrchestrator(tools);

		await orchestrator.process("do it");

		const secondCall = (provider.chat as ReturnType<typeof vi.fn>).mock
			.calls[1];
		const messages = secondCall?.[0]?.messages ?? [];
		const assistantMessage = messages.find(
			(message: { role?: string }) => message.role === "assistant",
		);

		expect(assistantMessage?.content).toBeNull();
	});

	it("should use custom system prompt", async () => {
		const provider = buildProvider();

		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
			content: "ok",
			toolCalls: [],
			finishReason: "stop",
		});

		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator([], {
			systemPrompt: "CUSTOM-SYSTEM",
		});

		await orchestrator.process("hi");

		const firstCall = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
		const firstMessages = firstCall?.[0]?.messages ?? [];
		expect(firstMessages[0]?.content).toBe("CUSTOM-SYSTEM");
	});

	it("should return pending plan when planning mode is enabled", async () => {
		const provider = buildProvider();
		const toolExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "ok",
		});

		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});

		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: {
						type: "object",
						properties: {},
						required: [],
					},
					execute: toolExecute,
				},
			],
			{ planningEnabled: true },
		);

		const result = await orchestrator.process("do it");

		expect(result.success).toBe(true);
		expect(result.requiresConfirmation).toBe(true);
		expect(result.status).toBe("planned");
		expect(result.plan?.steps.length).toBe(1);
		expect(toolExecute).not.toHaveBeenCalled();
	});

	it("should expand run_workflow into concrete plan steps", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [
				{
					id: "call-workflow-1",
					name: "run_workflow",
					arguments: { workflowName: "auto-caption-cleanup" },
				},
			],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const generateCaptionsExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "captions ok" });
		const removeSilenceExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "silence ok" });

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "generate_captions",
					description: "Generate captions",
					parameters: { type: "object", properties: {}, required: [] },
					execute: generateCaptionsExecute,
				},
				{
					name: "remove_silence",
					description: "Remove silence",
					parameters: { type: "object", properties: {}, required: [] },
					execute: removeSilenceExecute,
				},
			],
			{ planningEnabled: true },
		);

		const result = await orchestrator.process("run workflow");

		expect(result.success).toBe(true);
		expect(result.status).toBe("planned");
		expect(result.plan?.steps.map((step) => step.toolName)).toEqual([
			"generate_captions",
			"remove_silence",
		]);
	});

	it("should execute expanded workflow steps after confirmation", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [
				{
					id: "call-workflow-1",
					name: "run_workflow",
					arguments: { workflowName: "auto-caption-cleanup" },
				},
			],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const generateCaptionsExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "captions ok" });
		const removeSilenceExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "silence ok" });

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "generate_captions",
					description: "Generate captions",
					parameters: { type: "object", properties: {}, required: [] },
					execute: generateCaptionsExecute,
				},
				{
					name: "remove_silence",
					description: "Remove silence",
					parameters: { type: "object", properties: {}, required: [] },
					execute: removeSilenceExecute,
				},
			],
			{ planningEnabled: true },
		);

		await orchestrator.process("run workflow");
		const confirmResult = await orchestrator.confirmPendingPlan();

		expect(confirmResult.success).toBe(true);
		expect(generateCaptionsExecute).toHaveBeenCalledTimes(1);
		expect(removeSilenceExecute).toHaveBeenCalledTimes(1);
	});

	it("runWorkflow should create a pending plan when planning is enabled", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const generateCaptionsExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "captions ok" });
		const removeSilenceExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "silence ok" });

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "generate_captions",
					description: "Generate captions",
					parameters: { type: "object", properties: {}, required: [] },
					execute: generateCaptionsExecute,
				},
				{
					name: "remove_silence",
					description: "Remove silence",
					parameters: { type: "object", properties: {}, required: [] },
					execute: removeSilenceExecute,
				},
			],
			{ planningEnabled: true },
		);

		const result = await orchestrator.runWorkflow({
			workflowName: "auto-caption-cleanup",
		});

		expect(result.success).toBe(true);
		expect(result.status).toBe("planned");
		expect(result.requiresConfirmation).toBe(true);
		expect(result.plan?.steps.length).toBe(2);
	});

	it("runWorkflow should execute run_workflow tool when planning is disabled", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const runWorkflowExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "workflow ok" });
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "run_workflow",
					description: "Run workflow",
					parameters: { type: "object", properties: {}, required: [] },
					execute: runWorkflowExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.runWorkflow({
			workflowName: "auto-caption-cleanup",
		});

		expect(result.success).toBe(true);
		expect(result.status).toBe("completed");
		expect(runWorkflowExecute).toHaveBeenCalledWith(
			{
				workflowName: "auto-caption-cleanup",
			},
			expect.objectContaining({
				mode: "workflow",
				toolName: "run_workflow",
			}),
		);
	});

	it("runWorkflow should forward resume parameters", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const runWorkflowExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "workflow ok" });
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "run_workflow",
					description: "Run workflow",
					parameters: { type: "object", properties: {}, required: [] },
					execute: runWorkflowExecute,
				},
			],
			{ planningEnabled: false },
		);

		await orchestrator.runWorkflow({
			workflowName: "long-to-short",
			startFromStepId: "apply-cut",
			confirmRequiredSteps: true,
			stepOverrides: [
				{
					stepId: "apply-cut",
					arguments: { addCaptions: false, removeSilence: false },
				},
			],
		});

		expect(runWorkflowExecute).toHaveBeenCalledWith(
			{
				workflowName: "long-to-short",
				startFromStepId: "apply-cut",
				confirmRequiredSteps: true,
				stepOverrides: [
					{
						stepId: "apply-cut",
						arguments: { addCaptions: false, removeSilence: false },
					},
				],
			},
			expect.objectContaining({
				mode: "workflow",
				toolName: "run_workflow",
			}),
		);
	});

	it("runWorkflow should auto-iterate when quality is not met", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		evaluateQuality
			.mockReturnValueOnce({
				passed: false,
				overallScore: 0.52,
				timelineDurationSeconds: 80,
				targetDurationSeconds: 45,
				metrics: {
					semanticCompleteness: {
						value: 0.8,
						score: 0.8,
						passed: true,
						threshold: 0.65,
					},
					silenceRate: {
						value: 0.2,
						score: 0.8,
						passed: true,
						threshold: 0.45,
					},
					subtitleCoverage: {
						value: 0.7,
						score: 0.7,
						passed: true,
						threshold: 0.55,
					},
					durationCompliance: {
						value: 0.3,
						score: 0.3,
						passed: false,
						threshold: 0.7,
					},
				},
				reasons: ["时长未达标"],
				evaluatedAt: "2026-02-09T00:00:00.000Z",
			})
			.mockReturnValueOnce({
				passed: true,
				overallScore: 0.88,
				timelineDurationSeconds: 46,
				targetDurationSeconds: 45,
				metrics: {
					semanticCompleteness: {
						value: 0.88,
						score: 0.88,
						passed: true,
						threshold: 0.65,
					},
					silenceRate: {
						value: 0.15,
						score: 0.85,
						passed: true,
						threshold: 0.45,
					},
					subtitleCoverage: {
						value: 0.8,
						score: 0.8,
						passed: true,
						threshold: 0.55,
					},
					durationCompliance: {
						value: 0.9,
						score: 0.9,
						passed: true,
						threshold: 0.7,
					},
				},
				reasons: [],
				evaluatedAt: "2026-02-09T00:00:01.000Z",
			});

		const runWorkflowExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "workflow ok" });
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "run_workflow",
					description: "Run workflow",
					parameters: { type: "object", properties: {}, required: [] },
					execute: runWorkflowExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.runWorkflow({
			workflowName: "podcast-to-clips",
			confirmRequiredSteps: true,
		});

		expect(runWorkflowExecute).toHaveBeenCalledTimes(2);
		expect(result.success).toBe(true);
		expect(result.toolCalls?.[0]?.result.message).toContain("质量评分");
	});

	it("process should apply quality loop when run_workflow is called in chat mode", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [
					{
						id: "call-1",
						name: "run_workflow",
						arguments: {
							workflowName: "podcast-to-clips",
							confirmRequiredSteps: true,
						},
					},
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "workflow done",
				toolCalls: [],
				finishReason: "stop",
			});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		evaluateQuality
			.mockReturnValueOnce({
				passed: false,
				overallScore: 0.52,
				timelineDurationSeconds: 80,
				targetDurationSeconds: 45,
				metrics: {
					semanticCompleteness: {
						value: 0.8,
						score: 0.8,
						passed: true,
						threshold: 0.65,
					},
					silenceRate: {
						value: 0.2,
						score: 0.8,
						passed: true,
						threshold: 0.45,
					},
					subtitleCoverage: {
						value: 0.7,
						score: 0.7,
						passed: true,
						threshold: 0.55,
					},
					durationCompliance: {
						value: 0.3,
						score: 0.3,
						passed: false,
						threshold: 0.7,
					},
				},
				reasons: ["时长未达标"],
				evaluatedAt: "2026-02-09T00:00:00.000Z",
			})
			.mockReturnValueOnce({
				passed: true,
				overallScore: 0.88,
				timelineDurationSeconds: 46,
				targetDurationSeconds: 45,
				metrics: {
					semanticCompleteness: {
						value: 0.88,
						score: 0.88,
						passed: true,
						threshold: 0.65,
					},
					silenceRate: {
						value: 0.15,
						score: 0.85,
						passed: true,
						threshold: 0.45,
					},
					subtitleCoverage: {
						value: 0.8,
						score: 0.8,
						passed: true,
						threshold: 0.55,
					},
					durationCompliance: {
						value: 0.9,
						score: 0.9,
						passed: true,
						threshold: 0.7,
					},
				},
				reasons: [],
				evaluatedAt: "2026-02-09T00:00:01.000Z",
			});

		const runWorkflowExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "workflow ok" });

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "run_workflow",
					description: "Run workflow",
					parameters: { type: "object", properties: {}, required: [] },
					execute: runWorkflowExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.process("请运行播客精剪");

		expect(result.success).toBe(true);
		expect(runWorkflowExecute).toHaveBeenCalledTimes(2);
		expect(result.toolCalls?.[0]?.result.message).toContain("质量评分");
	});

	it("process should execute duplicate tool call ids via normalized DAG ids", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [
					{ id: "dup", name: "test_tool", arguments: { value: 1 } },
					{ id: "dup", name: "test_tool", arguments: { value: 2 } },
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "done",
				toolCalls: [],
				finishReason: "stop",
			});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const toolExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "ok",
		});

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: toolExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.process("run duplicates");

		expect(result.success).toBe(true);
		expect(toolExecute).toHaveBeenCalledTimes(2);
	});

	it("runWorkflow should stop with QUALITY_TARGET_NOT_MET when max iterations reached", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		evaluateQuality
			.mockReturnValueOnce({
				passed: false,
				overallScore: 0.45,
				timelineDurationSeconds: 95,
				targetDurationSeconds: 45,
				metrics: {
					semanticCompleteness: {
						value: 0.82,
						score: 0.82,
						passed: true,
						threshold: 0.65,
					},
					silenceRate: {
						value: 0.2,
						score: 0.8,
						passed: true,
						threshold: 0.45,
					},
					subtitleCoverage: {
						value: 0.7,
						score: 0.7,
						passed: true,
						threshold: 0.55,
					},
					durationCompliance: {
						value: 0.2,
						score: 0.2,
						passed: false,
						threshold: 0.7,
					},
				},
				reasons: ["时长未达标"],
				evaluatedAt: "2026-02-09T00:00:00.000Z",
			})
			.mockReturnValueOnce({
				passed: false,
				overallScore: 0.5,
				timelineDurationSeconds: 92,
				targetDurationSeconds: 45,
				metrics: {
					semanticCompleteness: {
						value: 0.84,
						score: 0.84,
						passed: true,
						threshold: 0.65,
					},
					silenceRate: {
						value: 0.18,
						score: 0.82,
						passed: true,
						threshold: 0.45,
					},
					subtitleCoverage: {
						value: 0.72,
						score: 0.72,
						passed: true,
						threshold: 0.55,
					},
					durationCompliance: {
						value: 0.24,
						score: 0.24,
						passed: false,
						threshold: 0.7,
					},
				},
				reasons: ["时长未达标"],
				evaluatedAt: "2026-02-09T00:00:01.000Z",
			});

		const runWorkflowExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "workflow ok" });
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "run_workflow",
					description: "Run workflow",
					parameters: { type: "object", properties: {}, required: [] },
					execute: runWorkflowExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.runWorkflow({
			workflowName: "podcast-to-clips",
			confirmRequiredSteps: true,
			qualityMaxIterations: 2,
		});

		expect(runWorkflowExecute).toHaveBeenCalledTimes(2);
		expect(result.success).toBe(false);
		expect(result.toolCalls?.[0]?.result.data).toMatchObject({
			errorCode: "QUALITY_TARGET_NOT_MET",
		});
	});

	it("runWorkflow should warn instead of failing when quality gate is non-blocking", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		evaluateQuality
			.mockReturnValueOnce({
				passed: false,
				overallScore: 0.63,
				timelineDurationSeconds: 18.15,
				targetDurationSeconds: 19.74,
				metrics: {
					semanticCompleteness: {
						value: 0.64,
						score: 0.64,
						passed: false,
						threshold: 0.65,
					},
					silenceRate: {
						value: 0.18,
						score: 0.82,
						passed: true,
						threshold: 0.45,
					},
					subtitleCoverage: {
						value: 0.58,
						score: 0.58,
						passed: true,
						threshold: 0.55,
					},
					durationCompliance: {
						value: 0.92,
						score: 0.92,
						passed: true,
						threshold: 0.7,
					},
				},
				reasons: ["语义完整性偏低"],
				evaluatedAt: "2026-02-11T00:00:00.000Z",
			})
			.mockReturnValueOnce({
				passed: false,
				overallScore: 0.63,
				timelineDurationSeconds: 18.15,
				targetDurationSeconds: 19.74,
				metrics: {
					semanticCompleteness: {
						value: 0.64,
						score: 0.64,
						passed: false,
						threshold: 0.65,
					},
					silenceRate: {
						value: 0.18,
						score: 0.82,
						passed: true,
						threshold: 0.45,
					},
					subtitleCoverage: {
						value: 0.58,
						score: 0.58,
						passed: true,
						threshold: 0.55,
					},
					durationCompliance: {
						value: 0.92,
						score: 0.92,
						passed: true,
						threshold: 0.7,
					},
				},
				reasons: ["语义完整性偏低"],
				evaluatedAt: "2026-02-11T00:00:01.000Z",
			});

		const runWorkflowExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "workflow ok" });
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "run_workflow",
					description: "Run workflow",
					parameters: { type: "object", properties: {}, required: [] },
					execute: runWorkflowExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.runWorkflow({
			workflowName: "one-click-masterpiece",
			confirmRequiredSteps: true,
			qualityMaxIterations: 2,
		});

		expect(runWorkflowExecute).toHaveBeenCalledTimes(2);
		expect(result.success).toBe(true);
		expect(result.toolCalls?.[0]?.result.data).toMatchObject({
			qualityWarningCode: "QUALITY_TARGET_NOT_MET",
		});
		expect(
			(result.toolCalls?.[0]?.result.data as Record<string, unknown>)
				.errorCode,
		).toBeUndefined();
	});

	it("should execute pending plan after confirmation", async () => {
		const provider = buildProvider();
		const toolExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "ok",
		});

		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});

		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: {
						type: "object",
						properties: {},
						required: [],
					},
					execute: toolExecute,
				},
			],
			{ planningEnabled: true },
		);

		await orchestrator.process("do it");
		const confirmResult = await orchestrator.confirmPendingPlan();

		expect(toolExecute).toHaveBeenCalledWith(
			{ value: 1 },
			expect.objectContaining({
				mode: "plan_confirmation",
				toolName: "test_tool",
				toolCallId: "call-1",
			}),
		);
		expect(confirmResult.success).toBe(true);
		expect(confirmResult.status).toBe("completed");
	});

	it("confirmPendingPlan should execute read-only DAG steps in parallel", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [
				{ id: "call-1", name: "get_alpha", arguments: {} },
				{ id: "call-2", name: "get_beta", arguments: {} },
			],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const events: AgentExecutionEvent[] = [];
		const wait = (ms: number) =>
			new Promise((resolve) => {
				setTimeout(resolve, ms);
			});
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "get_alpha",
					description: "read alpha",
					parameters: { type: "object", properties: {}, required: [] },
					execute: vi.fn(async () => {
						await wait(40);
						return { success: true, message: "alpha" };
					}),
				},
				{
					name: "get_beta",
					description: "read beta",
					parameters: { type: "object", properties: {}, required: [] },
					execute: vi.fn(async () => {
						await wait(40);
						return { success: true, message: "beta" };
					}),
				},
			],
			{
				planningEnabled: true,
				onExecutionEvent: (event) => events.push(event),
			},
		);

		await orchestrator.process("parallel reads");
		const startedAt = Date.now();
		const confirmResult = await orchestrator.confirmPendingPlan();
		const elapsedMs = Date.now() - startedAt;

		expect(confirmResult.success).toBe(true);
		expect(confirmResult.status).toBe("completed");
		expect(elapsedMs).toBeLessThan(75);

		const completionIndex = events.findIndex(
			(event) =>
				event.type === "tool_completed" && event.mode === "plan_confirmation",
		);
		const startedBeforeComplete = events.filter(
			(event, index) =>
				index < completionIndex &&
				event.type === "tool_started" &&
				event.mode === "plan_confirmation",
		).length;
		expect(startedBeforeComplete).toBeGreaterThanOrEqual(2);
	});

	it("should support updating plan step arguments before confirmation", async () => {
		const provider = buildProvider();
		const toolExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "ok",
		});

		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});

		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: {
						type: "object",
						properties: {},
						required: [],
					},
					execute: toolExecute,
				},
			],
			{ planningEnabled: true },
		);

		await orchestrator.process("do it");
		const updateResult = orchestrator.updatePendingPlanStep({
			stepId: "call-1",
			arguments: { value: 999 },
		});
		const confirmResult = await orchestrator.confirmPendingPlan();

		expect(updateResult.success).toBe(true);
		expect(confirmResult.success).toBe(true);
		expect(toolExecute).toHaveBeenCalledWith(
			{ value: 999 },
			expect.objectContaining({
				mode: "plan_confirmation",
				toolName: "test_tool",
				toolCallId: "call-1",
			}),
		);
	});

	it("should block new requests until pending plan is resolved", async () => {
		const provider = buildProvider();

		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});

		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: {
						type: "object",
						properties: {},
						required: [],
					},
					execute: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
				},
			],
			{ planningEnabled: true },
		);

		await orchestrator.process("first request");
		const secondResult = await orchestrator.process("second request");

		expect(secondResult.success).toBe(false);
		expect(secondResult.requiresConfirmation).toBe(true);
		expect(provider.chat).toHaveBeenCalledTimes(1);
	});

	it("should validate required fields when updating plan step arguments", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: {
						type: "object",
						properties: {
							value: { type: "number" },
						},
						required: ["value"],
					},
					execute: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
				},
			],
			{ planningEnabled: true },
		);

		await orchestrator.process("do it");
		const updateResult = orchestrator.updatePendingPlanStep({
			stepId: "call-1",
			arguments: {},
		});

		expect(updateResult.success).toBe(false);
		expect(updateResult.message).toContain("缺少必填参数");
	});

	it("should add cancel user marker to history", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [
					{ id: "call-1", name: "test_tool", arguments: { value: 1 } },
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "ok",
				toolCalls: [],
				finishReason: "stop",
			});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: {
						type: "object",
						properties: {},
						required: [],
					},
					execute: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
				},
			],
			{ planningEnabled: true },
		);

		await orchestrator.process("first");
		const cancelResult = orchestrator.cancelPendingPlan();
		expect(cancelResult.success).toBe(true);

		await orchestrator.process("second");
		const secondCallArgs = (provider.chat as ReturnType<typeof vi.fn>).mock
			.calls[1];
		const messages = secondCallArgs?.[0]?.messages ?? [];
		expect(
			messages.some(
				(message: { role?: string; content?: string }) =>
					message.role === "user" && message.content === "[取消执行计划]",
			),
		).toBe(true);
	});

	it("should emit execution events for tool execution flow", async () => {
		const provider = buildProvider();
		const toolExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "ok",
		});
		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [
					{ id: "call-1", name: "test_tool", arguments: { value: 1 } },
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "done",
				toolCalls: [],
				finishReason: "stop",
			});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const events: Array<{
			type: string;
			requestId: string;
			status?: string;
		}> = [];
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: toolExecute,
				},
			],
			{
				onExecutionEvent: (event) => {
					events.push({
						type: event.type,
						requestId: event.requestId,
						status: event.status,
					});
				},
			},
		);

		const result = await orchestrator.process("do it");

		expect(result.success).toBe(true);
		expect(events.map((event) => event.type)).toEqual([
			"request_started",
			"tool_started",
			"tool_completed",
			"request_completed",
		]);
		const requestIds = new Set(events.map((event) => event.requestId));
		expect(requestIds.size).toBe(1);
		expect(events[3]?.status).toBe("completed");
	});

	it("should recover NO_TRANSCRIPT by generating captions and retrying", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [
					{ id: "call-1", name: "remove_filler_words", arguments: {} },
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "done",
				toolCalls: [],
				finishReason: "stop",
			});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		let attempt = 0;
		const removeFillerExecute = vi.fn().mockImplementation(async () => {
			attempt += 1;
			if (attempt === 1) {
				return {
					success: false,
					message: "no transcript",
					data: { errorCode: "NO_TRANSCRIPT" },
				};
			}
			return { success: true, message: "removed" };
		});
		const generateCaptionsExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "captions ready" });

		const events: string[] = [];
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "remove_filler_words",
					description: "remove filler",
					parameters: { type: "object", properties: {}, required: [] },
					execute: removeFillerExecute,
				},
				{
					name: "generate_captions",
					description: "generate captions",
					parameters: { type: "object", properties: {}, required: [] },
					execute: generateCaptionsExecute,
				},
			],
			{
				onExecutionEvent: (event) => events.push(event.type),
			},
		);

		const result = await orchestrator.process("clean fillers");

		expect(result.success).toBe(true);
		expect(removeFillerExecute).toHaveBeenCalledTimes(2);
		expect(generateCaptionsExecute).toHaveBeenCalledTimes(1);
		expect(events).toContain("recovery_started");
		expect(events).toContain("recovery_prerequisite_started");
		expect(events).toContain("recovery_prerequisite_completed");
		expect(events).toContain("recovery_retrying");
	});

	it("should enforce provider retry limit and emit recovery_exhausted", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [{ id: "call-1", name: "analyze_frames", arguments: {} }],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "done",
				toolCalls: [],
				finishReason: "stop",
			});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const analyzeFramesExecute = vi.fn().mockResolvedValue({
			success: false,
			message: "provider down",
			data: { errorCode: "PROVIDER_UNAVAILABLE" },
		});
		const events: string[] = [];
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "analyze_frames",
					description: "analyze frames",
					parameters: { type: "object", properties: {}, required: [] },
					execute: analyzeFramesExecute,
				},
			],
			{
				onExecutionEvent: (event) => events.push(event.type),
			},
		);

		const result = await orchestrator.process("analyze");

		expect(result.success).toBe(false);
		expect(analyzeFramesExecute).toHaveBeenCalledTimes(3);
		expect(events).toContain("recovery_exhausted");
	});

	it("should fail when recovery prerequisite fails", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [
					{ id: "call-1", name: "remove_filler_words", arguments: {} },
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "done",
				toolCalls: [],
				finishReason: "stop",
			});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const removeFillerExecute = vi.fn().mockResolvedValue({
			success: false,
			message: "no transcript",
			data: { errorCode: "NO_TRANSCRIPT" },
		});
		const generateCaptionsExecute = vi.fn().mockResolvedValue({
			success: false,
			message: "caption failed",
			data: { errorCode: "GENERATE_CAPTIONS_FAILED" },
		});

		const orchestrator = new AgentOrchestrator([
			{
				name: "remove_filler_words",
				description: "remove filler",
				parameters: { type: "object", properties: {}, required: [] },
				execute: removeFillerExecute,
			},
			{
				name: "generate_captions",
				description: "generate captions",
				parameters: { type: "object", properties: {}, required: [] },
				execute: generateCaptionsExecute,
			},
		]);

		const result = await orchestrator.process("clean fillers");

		expect(result.success).toBe(false);
		expect(result.toolCalls?.[0]?.result.message).toContain("自动恢复失败");
	});

	it("should not emit execution events for blocked process guard", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const events: string[] = [];
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
				},
			],
			{
				planningEnabled: true,
				onExecutionEvent: (event) => events.push(event.type),
			},
		);

		await orchestrator.process("first request");
		events.length = 0;
		const secondResult = await orchestrator.process("second request");

		expect(secondResult.success).toBe(false);
		expect(secondResult.status).toBe("planned");
		expect(events).toEqual([]);
	});

	it("should not emit execution events when confirming without pending plan", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const events: string[] = [];
		const orchestrator = new AgentOrchestrator([], {
			planningEnabled: true,
			onExecutionEvent: (event) => events.push(event.type),
		});

		const result = await orchestrator.confirmPendingPlan();

		expect(result.success).toBe(false);
		expect(result.status).toBe("error");
		expect(events).toEqual([]);
	});

	it("runWorkflow should expose awaiting_confirmation response when workflow pauses", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const runWorkflowExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "工作流暂停，等待确认",
			data: {
				errorCode: "WORKFLOW_CONFIRMATION_REQUIRED",
				status: "awaiting_confirmation",
				nextStep: { id: "apply-cut", toolName: "delete_selection" },
				resumeHint: {
					workflowName: "long-to-short",
					startFromStepId: "apply-cut",
					confirmRequiredSteps: true,
					stepOverrides: [
						{
							stepId: "apply-cut",
							arguments: { addCaptions: false },
						},
					],
				},
			},
		});
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "run_workflow",
					description: "Run workflow",
					parameters: { type: "object", properties: {}, required: [] },
					execute: runWorkflowExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.runWorkflow({
			workflowName: "long-to-short",
		});

		expect(result.success).toBe(false);
		expect(result.status).toBe("awaiting_confirmation");
		expect(result.requiresConfirmation).toBe(true);
		expect(result.nextStep?.id).toBe("apply-cut");
		expect(result.resumeHint?.startFromStepId).toBe("apply-cut");
		expect(result.resumeHint?.stepOverrides).toEqual([
			{
				stepId: "apply-cut",
				arguments: { addCaptions: false },
			},
		]);
		expect(result.requestId).toBeTruthy();
	});

	it("process should expose awaiting_confirmation when tool returns REQUIRES_CONFIRMATION state", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				content: null,
				toolCalls: [
					{ id: "call-1", name: "apply_layout_suggestion", arguments: {} },
				],
				finishReason: "tool_calls",
			})
			.mockResolvedValueOnce({
				content: "should-not-reach",
				toolCalls: [],
				finishReason: "stop",
			});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "apply_layout_suggestion",
					description: "apply layout",
					parameters: { type: "object", properties: {}, required: [] },
					execute: vi.fn().mockResolvedValue({
						success: true,
						message: "需要确认",
						data: {
							stateCode: "REQUIRES_CONFIRMATION",
							confirmationReason: "LOW_CONFIDENCE",
							plannedPositionElementArgs: {
								elementId: "caption-1",
								trackId: "text-track-1",
								anchor: "bottom-center",
								marginX: 0,
								marginY: 0.08,
							},
							suggestion: {
								target: "caption",
								anchor: "bottom-center",
								marginX: 0,
								marginY: 0.08,
								confidence: 0.6,
								reason: "test",
							},
						},
					}),
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.process("应用布局");

		expect(result.success).toBe(false);
		expect(result.status).toBe("awaiting_confirmation");
		expect(result.requiresConfirmation).toBe(true);
	});

	it("executeTool should execute tool directly and return completed status", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);
		const toolExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "布局已应用",
		});
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "apply_layout_suggestion",
					description: "apply layout",
					parameters: { type: "object", properties: {}, required: [] },
					execute: toolExecute,
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.executeTool({
			toolName: "apply_layout_suggestion",
			arguments: { elementId: "caption-1", trackId: "text-track-1" },
		});

		expect(toolExecute).toHaveBeenCalledWith(
			{ elementId: "caption-1", trackId: "text-track-1" },
			expect.objectContaining({
				mode: "chat",
				toolName: "apply_layout_suggestion",
			}),
		);
		expect(result.success).toBe(true);
		expect(result.status).toBe("completed");
		expect(result.requiresConfirmation).toBe(false);
	});

	it("executeTool should return awaiting_confirmation for REQUIRES_CONFIRMATION state", async () => {
		const provider = buildProvider();
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);
		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "apply_layout_suggestion",
					description: "apply layout",
					parameters: { type: "object", properties: {}, required: [] },
					execute: vi.fn().mockResolvedValue({
						success: true,
						message: "低置信度，等待确认",
						data: {
							stateCode: "REQUIRES_CONFIRMATION",
							confirmationReason: "LOW_CONFIDENCE",
							plannedPositionElementArgs: {
								elementId: "caption-1",
								trackId: "text-track-1",
								anchor: "bottom-center",
								marginX: 0,
								marginY: 0.08,
							},
							suggestion: {
								target: "caption",
								anchor: "bottom-center",
								marginX: 0,
								marginY: 0.08,
								confidence: 0.6,
								reason: "test",
							},
						},
					}),
				},
			],
			{ planningEnabled: false },
		);

		const result = await orchestrator.executeTool({
			toolName: "apply_layout_suggestion",
			arguments: {},
		});

		expect(result.success).toBe(false);
		expect(result.status).toBe("awaiting_confirmation");
		expect(result.requiresConfirmation).toBe(true);
	});

	it("confirmPendingPlan should preserve awaiting_confirmation state", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: vi.fn().mockResolvedValue({
						success: true,
						message: "pause",
						data: {
							errorCode: "WORKFLOW_CONFIRMATION_REQUIRED",
							status: "awaiting_confirmation",
							nextStep: { id: "apply-cut", toolName: "delete_selection" },
							resumeHint: {
								workflowName: "long-to-short",
								startFromStepId: "apply-cut",
								confirmRequiredSteps: true,
							},
						},
					}),
				},
			],
			{ planningEnabled: true },
		);

		await orchestrator.process("first");
		const result = await orchestrator.confirmPendingPlan();

		expect(result.success).toBe(false);
		expect(result.status).toBe("awaiting_confirmation");
		expect(result.requiresConfirmation).toBe(true);
		expect(result.nextStep?.id).toBe("apply-cut");
	});

	it("confirmPendingPlan should stop executing remaining steps after pause", async () => {
		const provider = buildProvider();
		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [
				{ id: "call-1", name: "first_tool", arguments: { value: 1 } },
				{ id: "call-2", name: "second_tool", arguments: { value: 2 } },
			],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const firstExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "pause",
			data: {
				errorCode: "WORKFLOW_CONFIRMATION_REQUIRED",
				status: "awaiting_confirmation",
				nextStep: { id: "apply-cut", toolName: "delete_selection" },
				resumeHint: {
					workflowName: "long-to-short",
					startFromStepId: "apply-cut",
					confirmRequiredSteps: true,
				},
			},
		});
		const secondExecute = vi
			.fn()
			.mockResolvedValue({ success: true, message: "should not run" });

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "first_tool",
					description: "first tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: firstExecute,
				},
				{
					name: "second_tool",
					description: "second tool",
					parameters: { type: "object", properties: {}, required: [] },
					execute: secondExecute,
				},
			],
			{ planningEnabled: true },
		);

		await orchestrator.process("prepare plan");
		const result = await orchestrator.confirmPendingPlan();

		expect(firstExecute).toHaveBeenCalledTimes(1);
		expect(secondExecute).not.toHaveBeenCalled();
		expect(result.status).toBe("awaiting_confirmation");
		expect(result.requiresConfirmation).toBe(true);
	});

	it("should prevent duplicate confirm while a plan is executing", async () => {
		const provider = buildProvider();
		let resolveTool:
			| ((value: { success: boolean; message: string }) => void)
			| null = null;
		const toolExecute = vi.fn(
			() =>
				new Promise<{ success: boolean; message: string }>((resolve) => {
					resolveTool = resolve;
				}),
		);

		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});
		(createRoutedProvider as ReturnType<typeof vi.fn>).mockReturnValue(
			provider,
		);

		const orchestrator = new AgentOrchestrator(
			[
				{
					name: "test_tool",
					description: "test tool",
					parameters: {
						type: "object",
						properties: {},
						required: [],
					},
					execute: toolExecute,
				},
			],
			{ planningEnabled: true },
		);

		await orchestrator.process("do it");
		const firstConfirmPromise = orchestrator.confirmPendingPlan();
		const secondConfirmResult = await orchestrator.confirmPendingPlan();

		expect(secondConfirmResult.success).toBe(false);
		expect(secondConfirmResult.message).toContain("计划正在执行中");

		if (!resolveTool) {
			throw new Error("Resolver not initialized");
		}
		(resolveTool as (value: { success: boolean; message: string }) => void)({
			success: true,
			message: "ok",
		});
		const firstConfirmResult = await firstConfirmPromise;
		expect(firstConfirmResult.success).toBe(true);
	});
});
