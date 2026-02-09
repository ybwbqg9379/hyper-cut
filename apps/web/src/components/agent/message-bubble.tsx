"use client";

import type {
	AgentExecutionEvent,
	AgentExecutionPlan,
	AgentResponse,
	ToolResult,
	WorkflowNextStep,
	WorkflowResumeHint,
} from "@/agent";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import { Ban, Check, Pencil, Play, X } from "lucide-react";
import { ExecutionTimeline } from "./execution-timeline";

interface OperationDiffPayload {
	affectedElements: {
		added: string[];
		removed: string[];
		moved: string[];
	};
	duration: {
		beforeSeconds: number;
		afterSeconds: number;
		deltaSeconds: number;
	};
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function asOperationDiffPayload(data: unknown): OperationDiffPayload | null {
	const record = asObjectRecord(data);
	if (!record) return null;

	const affected = asObjectRecord(record.affectedElements);
	const duration = asObjectRecord(record.duration);
	if (!affected || !duration) return null;

	const toStringArray = (value: unknown): string[] | null => {
		if (!Array.isArray(value)) return null;
		const normalized = value.filter(
			(item): item is string => typeof item === "string",
		);
		return normalized.length === value.length ? normalized : null;
	};

	const added = toStringArray(affected.added);
	const removed = toStringArray(affected.removed);
	const moved = toStringArray(affected.moved);

	const beforeSeconds =
		typeof duration.beforeSeconds === "number" &&
		Number.isFinite(duration.beforeSeconds)
			? duration.beforeSeconds
			: null;
	const afterSeconds =
		typeof duration.afterSeconds === "number" &&
		Number.isFinite(duration.afterSeconds)
			? duration.afterSeconds
			: null;
	const deltaSeconds =
		typeof duration.deltaSeconds === "number" &&
		Number.isFinite(duration.deltaSeconds)
			? duration.deltaSeconds
			: null;

	if (
		!added ||
		!removed ||
		!moved ||
		beforeSeconds === null ||
		afterSeconds === null ||
		deltaSeconds === null
	) {
		return null;
	}

	return {
		affectedElements: { added, removed, moved },
		duration: {
			beforeSeconds,
			afterSeconds,
			deltaSeconds,
		},
	};
}

export interface AgentChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
	requestId?: string;
	status?: AgentResponse["status"];
	nextStep?: WorkflowNextStep;
	resumeHint?: WorkflowResumeHint;
	toolCalls?: Array<{
		name: string;
		result: ToolResult;
	}>;
	plan?: AgentExecutionPlan;
	requiresConfirmation?: boolean;
}

interface MessageBubbleProps {
	message: AgentChatMessage;
	executionEvents?: AgentExecutionEvent[];
	isActivePlan: boolean;
	stepDrafts: Record<string, string>;
	stepErrors: Record<string, string>;
	onStepDraftChange: (stepId: string, value: string) => void;
	onUpdateStep: (stepId: string) => void;
	onRemoveStep: (stepId: string) => void;
	onConfirmPlan: () => void;
	onCancelPlan: () => void;
	onResumeWorkflow: (resumeHint: WorkflowResumeHint) => void;
	controlsDisabled: boolean;
	resumeDisabled: boolean;
}

export function MessageBubble({
	message,
	executionEvents,
	isActivePlan,
	stepDrafts,
	stepErrors,
	onStepDraftChange,
	onUpdateStep,
	onRemoveStep,
	onConfirmPlan,
	onCancelPlan,
	onResumeWorkflow,
	controlsDisabled,
	resumeDisabled,
}: MessageBubbleProps) {
	const isUser = message.role === "user";

	return (
		<div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
			<div
				className={cn(
					"max-w-[90%] rounded-md px-3 py-2 text-sm",
					isUser
						? "bg-primary text-primary-foreground"
						: "bg-accent text-foreground",
				)}
			>
				<p className="whitespace-pre-wrap break-words">{message.content}</p>

				{message.plan && (
					<div className="mt-3 rounded-md border border-border/50 bg-background/60 p-2 space-y-3">
						<div className="text-xs font-medium">
							执行计划（{message.plan.steps.length} 步）
						</div>

						{message.plan.steps.map((step) => (
							<div
								key={step.id}
								className="rounded-md border border-border/60 p-2 space-y-2"
							>
								<div className="flex items-center justify-between gap-2">
									<div className="text-xs font-mono">{step.toolName}</div>
									{isActivePlan && (
										<Button
											variant="text"
											size="sm"
											onClick={() => onRemoveStep(step.id)}
											className="h-6 px-2 text-xs"
											disabled={controlsDisabled}
										>
											<X className="size-3 mr-1" />
											移除
										</Button>
									)}
								</div>

								<p className="text-xs text-muted-foreground">{step.summary}</p>

								<textarea
									value={
										stepDrafts[step.id] ??
										JSON.stringify(step.arguments ?? {}, null, 2)
									}
									onChange={(e) => onStepDraftChange(step.id, e.target.value)}
									disabled={!isActivePlan}
									readOnly={controlsDisabled}
									className={cn(
										"w-full min-h-[92px] resize-y rounded-md border border-border bg-background px-2 py-1.5",
										"font-mono text-xs",
										"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
										"disabled:opacity-50",
									)}
								/>

								{stepErrors[step.id] ? (
									<p className="text-xs text-destructive">
										{stepErrors[step.id]}
									</p>
								) : null}

								{isActivePlan && (
									<Button
										variant="secondary"
										size="sm"
										onClick={() => onUpdateStep(step.id)}
										className="h-7 px-2 text-xs"
										disabled={controlsDisabled}
									>
										<Pencil className="size-3 mr-1" />
										更新步骤参数
									</Button>
								)}
							</div>
						))}

						{isActivePlan && (
							<div className="flex items-center gap-2">
								<Button
									size="sm"
									onClick={onConfirmPlan}
									className="h-7 px-2 text-xs"
									disabled={controlsDisabled}
								>
									<Play className="size-3 mr-1" />
									确认执行
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={onCancelPlan}
									className="h-7 px-2 text-xs"
									disabled={controlsDisabled}
								>
									<Ban className="size-3 mr-1" />
									取消计划
								</Button>
							</div>
						)}
					</div>
				)}

				{executionEvents && executionEvents.length > 0 ? (
					<div className="mt-2 rounded-md border border-border/50 bg-background/60 px-2 py-2">
						<div className="mb-1 text-xs font-medium">执行轨迹</div>
						<ExecutionTimeline events={executionEvents} />
					</div>
				) : null}

				{message.resumeHint ? (
					<div className="mt-2 rounded-md border border-border/50 bg-background/60 px-2 py-2 space-y-2">
						<div className="text-xs text-muted-foreground">
							当前流程在步骤{" "}
							<span className="font-mono">
								{message.resumeHint.startFromStepId}
							</span>{" "}
							等待确认。
						</div>
						<Button
							size="sm"
							variant="secondary"
							onClick={() => {
								const resumeHint = message.resumeHint;
								if (!resumeHint) return;
								onResumeWorkflow(resumeHint);
							}}
							disabled={resumeDisabled}
							className="h-7 px-2 text-xs"
						>
							<Play className="size-3 mr-1" />
							继续执行确认步骤
						</Button>
					</div>
				) : null}

				{message.toolCalls && message.toolCalls.length > 0 && (
					<div className="mt-2 pt-2 border-t border-border/20 space-y-1">
						{message.toolCalls.map((tc, index) => (
							<div
								key={`${message.id}-tool-${index}-${tc.name}`}
								className={cn(
									"text-xs flex items-center gap-1.5 px-2 py-1 rounded-sm",
									tc.result.success
										? "bg-constructive/10 text-constructive"
										: "bg-destructive/10 text-destructive",
								)}
							>
								{tc.result.success ? (
									<Check className="size-3" />
								) : (
									<X className="size-3" />
								)}
								<span className="font-mono">{tc.name}</span>
								{(() => {
									const dataRecord = asObjectRecord(tc.result.data);
									const diff = asOperationDiffPayload(dataRecord?.diff);
									if (!diff) return null;
									return (
										<span className="text-[10px] opacity-80">
											Δ{diff.duration.deltaSeconds.toFixed(2)}s · 删除
											{diff.affectedElements.removed.length} · 移动
											{diff.affectedElements.moved.length}
										</span>
									);
								})()}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
