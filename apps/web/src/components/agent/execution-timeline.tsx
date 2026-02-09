"use client";

import type { AgentExecutionEvent } from "@/agent";
import { cn } from "@/utils/ui";
import type { AgentLocale } from "./agent-locale";

function formatExecutionMode(
	mode: AgentExecutionEvent["mode"] | undefined,
	locale: AgentLocale,
): string {
	if (locale === "zh") {
		if (mode === "workflow") return "工作流";
		if (mode === "plan_confirmation") return "计划确认执行";
		return "聊天请求";
	}
	if (mode === "workflow") return "Workflow";
	if (mode === "plan_confirmation") return "Plan Confirmation";
	return "Chat Request";
}

function formatExecutionStatus(
	status: AgentExecutionEvent["status"] | undefined,
	locale: AgentLocale,
): string {
	if (locale === "zh") {
		if (status === "completed") return "完成";
		if (status === "planned") return "待确认";
		if (status === "running") return "执行中";
		if (status === "awaiting_confirmation") return "等待确认";
		if (status === "cancelled") return "已取消";
		return "失败";
	}
	if (status === "completed") return "Completed";
	if (status === "planned") return "Pending Confirmation";
	if (status === "running") return "Running";
	if (status === "awaiting_confirmation") return "Awaiting Confirmation";
	if (status === "cancelled") return "Cancelled";
	return "Failed";
}

export function ExecutionTimeline({
	events,
	locale = "zh",
}: {
	events: AgentExecutionEvent[];
	locale?: AgentLocale;
}) {
	return (
		<div className="space-y-1">
			{events.map((event, index) => {
				let text = "";
				if (event.type === "request_started") {
					text =
						locale === "zh"
							? `开始${formatExecutionMode(event.mode, locale)}`
							: `Start ${formatExecutionMode(event.mode, locale)}`;
				} else if (event.type === "plan_created") {
					text =
						locale === "zh"
							? `已生成计划（${event.plan?.steps.length ?? 0} 步）`
							: `Plan created (${event.plan?.steps.length ?? 0} steps)`;
				} else if (event.type === "tool_started") {
					text =
						locale === "zh"
							? `开始执行 ${event.toolName ?? "unknown_tool"}`
							: `Start ${event.toolName ?? "unknown_tool"}`;
				} else if (event.type === "tool_progress") {
					text =
						event.message ??
						(locale === "zh"
							? `${event.toolName ?? "unknown_tool"} 执行中 (${event.stepIndex ?? "?"}/${event.totalSteps ?? "?"})`
							: `${event.toolName ?? "unknown_tool"} running (${event.stepIndex ?? "?"}/${event.totalSteps ?? "?"})`);
				} else if (event.type === "recovery_started") {
					text =
						event.message ??
						(locale === "zh" ? "已启动自动恢复" : "Recovery started");
				} else if (event.type === "recovery_prerequisite_started") {
					text =
						event.message ??
						(locale === "zh"
							? "正在执行恢复前置步骤"
							: "Running recovery prerequisites");
				} else if (event.type === "recovery_prerequisite_completed") {
					text =
						event.message ??
						(locale === "zh"
							? "恢复前置步骤已完成"
							: "Recovery prerequisites completed");
				} else if (event.type === "recovery_retrying") {
					text = event.message ?? (locale === "zh" ? "正在重试" : "Retrying");
				} else if (event.type === "recovery_exhausted") {
					text =
						event.message ??
						(locale === "zh" ? "恢复重试已耗尽" : "Recovery retries exhausted");
				} else if (event.type === "tool_completed") {
					const resultText =
						locale === "zh"
							? event.result?.success
								? "成功"
								: "失败"
							: event.result?.success
								? "Success"
								: "Failed";
					text = `${event.toolName ?? "unknown_tool"} ${resultText}`;
				} else {
					text =
						locale === "zh"
							? `请求结束：${formatExecutionStatus(event.status, locale)}`
							: `Request finished: ${formatExecutionStatus(event.status, locale)}`;
				}

				const isErrorEvent =
					event.type === "tool_completed" ||
					event.type === "recovery_prerequisite_completed"
						? event.result?.success === false
						: event.type === "recovery_exhausted"
							? true
							: event.type === "request_completed"
								? event.status === "error"
								: false;

				return (
					<div
						key={`${event.requestId}-${event.type}-${event.toolCallId ?? "no-tool"}-${index}`}
						className={cn(
							"rounded-sm px-2 py-1 text-xs",
							isErrorEvent
								? "bg-destructive/10 text-destructive"
								: "bg-muted/60 text-muted-foreground",
						)}
					>
						{text}
					</div>
				);
			})}
		</div>
	);
}
