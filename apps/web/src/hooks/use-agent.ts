"use client";

import { useMemo, useState, useCallback } from "react";
import {
	AgentOrchestrator,
	getAllTools,
	type AgentExecutionEvent,
	type AgentResponse,
} from "@/agent";
import { useAgentUiStore } from "@/stores/agent-ui-store";

/**
 * React hook for using the Agent Orchestrator
 * Provides access to the agent and manages conversation state
 */
export function useAgent() {
	const [isProcessing, setIsProcessing] = useState(false);
	const [lastResponse, setLastResponse] = useState<AgentResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [executionEvents, setExecutionEvents] = useState<AgentExecutionEvent[]>(
		[],
	);
	const [activeExecutionRequestId, setActiveExecutionRequestId] = useState<
		string | null
	>(null);

	const appendExecutionEvent = useCallback((event: AgentExecutionEvent) => {
		setExecutionEvents((prev) => {
			const nextEvents = [...prev, event];
			if (nextEvents.length > 200) {
				return nextEvents.slice(nextEvents.length - 200);
			}
			return nextEvents;
		});
		if (event.type === "request_started") {
			const requestMessage =
				event.mode === "workflow"
					? "正在启动工作流..."
					: event.mode === "plan_confirmation"
						? "正在执行已确认计划..."
						: "正在分析请求...";
			setActiveExecutionRequestId(event.requestId);
			useAgentUiStore.getState().setExecutionProgress({
				requestId: event.requestId,
				message: requestMessage,
				updatedAt: event.timestamp,
			});
			return;
		}
		if (event.type === "tool_started") {
			useAgentUiStore.getState().setExecutionProgress({
				requestId: event.requestId,
				message: `正在执行 ${event.toolName ?? "tool"}`,
				toolName: event.toolName,
				stepIndex: event.stepIndex,
				totalSteps: event.totalSteps,
				updatedAt: event.timestamp,
			});
			return;
		}
		if (event.type === "tool_progress") {
			useAgentUiStore.getState().setExecutionProgress({
				requestId: event.requestId,
				message: event.message ?? `${event.toolName ?? "tool"} 执行中`,
				toolName: event.toolName,
				stepIndex: event.stepIndex,
				totalSteps: event.totalSteps,
				updatedAt: event.timestamp,
			});
			return;
		}
		if (
			event.type === "recovery_started" ||
			event.type === "recovery_prerequisite_started" ||
			event.type === "recovery_retrying"
		) {
			useAgentUiStore.getState().setExecutionProgress({
				requestId: event.requestId,
				message: event.message ?? "正在自动恢复...",
				toolName: event.toolName,
				stepIndex: event.stepIndex,
				totalSteps: event.totalSteps,
				updatedAt: event.timestamp,
			});
			return;
		}
		if (event.type === "request_completed") {
			setActiveExecutionRequestId((prev) =>
				prev === event.requestId ? null : prev,
			);
			useAgentUiStore.getState().clearExecutionProgressByRequest({
				requestId: event.requestId,
			});
		}
	}, []);

	// Create agent with all tools
	const agent = useMemo(() => {
		const tools = getAllTools();
		const systemPrompt =
			process.env.NEXT_PUBLIC_AGENT_SYSTEM_PROMPT?.trim() || undefined;
		const toolTimeoutMs = process.env.NEXT_PUBLIC_AGENT_TOOL_TIMEOUT_MS
			? Number(process.env.NEXT_PUBLIC_AGENT_TOOL_TIMEOUT_MS)
			: undefined;
		const planningEnabled =
			process.env.NEXT_PUBLIC_AGENT_PLANNING_ENABLED !== "false";
		const parsedMaxToolIterations = Number(
			process.env.NEXT_PUBLIC_AGENT_MAX_TOOL_ITERATIONS,
		);
		const maxToolIterations =
			Number.isFinite(parsedMaxToolIterations) && parsedMaxToolIterations > 0
				? Math.floor(parsedMaxToolIterations)
				: undefined;
		return new AgentOrchestrator(tools, {
			systemPrompt,
			toolTimeoutMs,
			maxToolIterations,
			planningEnabled,
			onExecutionEvent: appendExecutionEvent,
		});
	}, [appendExecutionEvent]);

	// Process a user message
	const sendMessage = useCallback(
		async (
			message: string,
			options?: { preferredResponseLanguage?: "zh" | "en" },
		): Promise<AgentResponse> => {
			setIsProcessing(true);
			setError(null);

			try {
				const languageInstruction =
					options?.preferredResponseLanguage === "zh"
						? "\n\n请始终使用简体中文回复。"
						: options?.preferredResponseLanguage === "en"
							? "\n\nPlease respond in English."
							: "";
				const response = await agent.process(
					`${message}${languageInstruction}`,
				);
				setLastResponse(response);
				return response;
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				setError(errorMessage);
				return {
					message: errorMessage,
					success: false,
				};
			} finally {
				setIsProcessing(false);
			}
		},
		[agent],
	);

	const confirmPlan = useCallback(async (): Promise<AgentResponse> => {
		setIsProcessing(true);
		setError(null);
		try {
			const response = await agent.confirmPendingPlan();
			setLastResponse(response);
			return response;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			setError(errorMessage);
			return {
				message: errorMessage,
				success: false,
				status: "error",
			};
		} finally {
			setIsProcessing(false);
		}
	}, [agent]);

	const cancelPlan = useCallback((): AgentResponse => {
		const response = agent.cancelPendingPlan();
		setLastResponse(response);
		return response;
	}, [agent]);

	const cancelExecution = useCallback((): AgentResponse => {
		const response = agent.cancelActiveExecution();
		setLastResponse(response);
		return response;
	}, [agent]);

	const updatePlanStep = useCallback(
		({
			stepId,
			arguments: nextArguments,
		}: {
			stepId: string;
			arguments: Record<string, unknown>;
		}): AgentResponse => {
			const response = agent.updatePendingPlanStep({
				stepId,
				arguments: nextArguments,
			});
			setLastResponse(response);
			return response;
		},
		[agent],
	);

	const removePlanStep = useCallback(
		(stepId: string): AgentResponse => {
			const response = agent.removePendingPlanStep(stepId);
			setLastResponse(response);
			return response;
		},
		[agent],
	);

	const runWorkflow = useCallback(
		async ({
			workflowName,
			stepOverrides,
			startFromStepId,
			confirmRequiredSteps,
			enableQualityLoop,
			qualityMaxIterations,
			qualityTargetDuration,
			qualityDurationTolerance,
		}: {
			workflowName: string;
			stepOverrides?: Array<{
				stepId?: string;
				index?: number;
				arguments: Record<string, unknown>;
			}>;
			startFromStepId?: string;
			confirmRequiredSteps?: boolean;
			enableQualityLoop?: boolean;
			qualityMaxIterations?: number;
			qualityTargetDuration?: number;
			qualityDurationTolerance?: number;
		}): Promise<AgentResponse> => {
			setIsProcessing(true);
			setError(null);
			try {
				const response = await agent.runWorkflow({
					workflowName,
					stepOverrides,
					startFromStepId,
					confirmRequiredSteps,
					enableQualityLoop,
					qualityMaxIterations,
					qualityTargetDuration,
					qualityDurationTolerance,
				});
				setLastResponse(response);
				return response;
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				setError(errorMessage);
				return {
					message: errorMessage,
					success: false,
					status: "error",
				};
			} finally {
				setIsProcessing(false);
			}
		},
		[agent],
	);

	const executeTool = useCallback(
		async ({
			toolName,
			arguments: argumentsValue,
		}: {
			toolName: string;
			arguments?: Record<string, unknown>;
		}): Promise<AgentResponse> => {
			setIsProcessing(true);
			setError(null);
			try {
				const response = await agent.executeTool({
					toolName,
					arguments: argumentsValue,
				});
				setLastResponse(response);
				return response;
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				setError(errorMessage);
				return {
					message: errorMessage,
					success: false,
					status: "error",
				};
			} finally {
				setIsProcessing(false);
			}
		},
		[agent],
	);

	// Clear conversation history
	const clearHistory = useCallback(() => {
		agent.clearHistory();
		setLastResponse(null);
		setError(null);
		setExecutionEvents([]);
		setActiveExecutionRequestId(null);
		useAgentUiStore.getState().clearAllAgentUiState();
	}, [agent]);

	// Check provider availability
	const checkProvider = useCallback(async () => {
		return agent.checkProviderStatus();
	}, [agent]);

	return {
		sendMessage,
		confirmPlan,
		cancelPlan,
		cancelExecution,
		updatePlanStep,
		removePlanStep,
		runWorkflow,
		executeTool,
		clearHistory,
		checkProvider,
		isProcessing,
		lastResponse,
		error,
		executionEvents,
		activeExecutionRequestId,
	};
}
