"use client";

import { useMemo, useState, useCallback } from "react";
import { AgentOrchestrator, getAllTools, type AgentResponse } from "@/agent";

/**
 * React hook for using the Agent Orchestrator
 * Provides access to the agent and manages conversation state
 */
export function useAgent() {
	const [isProcessing, setIsProcessing] = useState(false);
	const [lastResponse, setLastResponse] = useState<AgentResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

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
		return new AgentOrchestrator(tools, {
			systemPrompt,
			toolTimeoutMs,
			planningEnabled,
		});
	}, []);

	// Process a user message
	const sendMessage = useCallback(
		async (message: string): Promise<AgentResponse> => {
			setIsProcessing(true);
			setError(null);

			try {
				const response = await agent.process(message);
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

	// Clear conversation history
	const clearHistory = useCallback(() => {
		agent.clearHistory();
		setLastResponse(null);
		setError(null);
	}, [agent]);

	// Check provider availability
	const checkProvider = useCallback(async () => {
		return agent.checkProviderStatus();
	}, [agent]);

	return {
		sendMessage,
		confirmPlan,
		cancelPlan,
		updatePlanStep,
		removePlanStep,
		clearHistory,
		checkProvider,
		isProcessing,
		lastResponse,
		error,
	};
}
