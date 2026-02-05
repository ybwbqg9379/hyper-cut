/**
 * AgentOrchestrator Tests
 * Verifies tool-call loop behavior and system prompt overrides
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentTool, LLMProvider } from "../types";
import { AgentOrchestrator } from "../orchestrator";

vi.mock("../providers", () => ({
	createProvider: vi.fn(),
	getConfiguredProviderType: vi.fn(() => "lm-studio"),
}));

import { createProvider } from "../providers";

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

		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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

		expect(toolExecute).toHaveBeenCalledWith({ value: 1 });
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

		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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

		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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

		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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

		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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

		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		expect(runWorkflowExecute).toHaveBeenCalledWith({
			workflowName: "auto-caption-cleanup",
		});
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

		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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

		expect(toolExecute).toHaveBeenCalledWith({ value: 1 });
		expect(confirmResult.success).toBe(true);
		expect(confirmResult.status).toBe("completed");
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

		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		expect(toolExecute).toHaveBeenCalledWith({ value: 999 });
	});

	it("should block new requests until pending plan is resolved", async () => {
		const provider = buildProvider();

		(provider.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			content: null,
			toolCalls: [{ id: "call-1", name: "test_tool", arguments: { value: 1 } }],
			finishReason: "tool_calls",
		});

		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
		(createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

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
