"use client";

import type { AgentExecutionEvent } from "@/agent";
import { cn } from "@/utils/ui";

function formatExecutionMode(
	mode: AgentExecutionEvent["mode"] | undefined,
): string {
	if (mode === "workflow") return "工作流";
	if (mode === "plan_confirmation") return "计划确认执行";
	return "聊天请求";
}

function formatExecutionStatus(
	status: AgentExecutionEvent["status"] | undefined,
): string {
	if (status === "completed") return "完成";
	if (status === "planned") return "待确认";
	if (status === "running") return "执行中";
	if (status === "awaiting_confirmation") return "等待确认";
	if (status === "cancelled") return "已取消";
	return "失败";
}

export function ExecutionTimeline({
	events,
}: {
	events: AgentExecutionEvent[];
}) {
	return (
		<div className="space-y-1">
			{events.map((event, index) => {
				let text = "";
				if (event.type === "request_started") {
					text = `开始${formatExecutionMode(event.mode)}`;
				} else if (event.type === "plan_created") {
					text = `已生成计划（${event.plan?.steps.length ?? 0} 步）`;
				} else if (event.type === "tool_started") {
					text = `开始执行 ${event.toolName ?? "unknown_tool"}`;
				} else if (event.type === "tool_progress") {
					text =
						event.message ??
						`${event.toolName ?? "unknown_tool"} 执行中 (${event.stepIndex ?? "?"}/${event.totalSteps ?? "?"})`;
				} else if (event.type === "recovery_started") {
					text = event.message ?? "已启动自动恢复";
				} else if (event.type === "recovery_prerequisite_started") {
					text = event.message ?? "正在执行恢复前置步骤";
				} else if (event.type === "recovery_prerequisite_completed") {
					text = event.message ?? "恢复前置步骤已完成";
				} else if (event.type === "recovery_retrying") {
					text = event.message ?? "正在重试";
				} else if (event.type === "recovery_exhausted") {
					text = event.message ?? "恢复重试已耗尽";
				} else if (event.type === "tool_completed") {
					const resultText = event.result?.success ? "成功" : "失败";
					text = `${event.toolName ?? "unknown_tool"} ${resultText}`;
				} else {
					text = `请求结束：${formatExecutionStatus(event.status)}`;
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
