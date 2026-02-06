"use client";

import {
	useState,
	useRef,
	useEffect,
	useMemo,
	type KeyboardEvent,
} from "react";
import {
	listWorkflows as getPresetWorkflows,
	type AgentExecutionPlan,
	type AgentResponse,
} from "@/agent";
import { useAgent } from "@/hooks/use-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { TranscriptPanel } from "./TranscriptPanel";
import { cn } from "@/utils/ui";
import {
	Bot,
	Send,
	Trash2,
	Loader2,
	AlertCircle,
	Check,
	X,
	Pencil,
	Ban,
	Play,
	MessagesSquare,
	ScrollText,
	GitBranch,
} from "lucide-react";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
	toolCalls?: Array<{
		name: string;
		result: { success: boolean; message: string };
	}>;
	plan?: AgentExecutionPlan;
	requiresConfirmation?: boolean;
}

interface ParsedStepOverride {
	stepId?: string;
	index?: number;
	arguments: Record<string, unknown>;
}

type WorkflowFieldKind = "string" | "number" | "boolean" | "json";

interface WorkflowFieldDraft {
	kind: WorkflowFieldKind;
	value: string;
}

type WorkflowStepDrafts = Record<string, Record<string, WorkflowFieldDraft>>;

function buildWorkflowArgumentsDraft(
	argumentsValue: Record<string, unknown> | undefined,
): Record<string, WorkflowFieldDraft> {
	const nextDraft: Record<string, WorkflowFieldDraft> = {};
	for (const [key, value] of Object.entries(argumentsValue ?? {})) {
		const kind = detectWorkflowFieldKind(value);
		nextDraft[key] = {
			kind,
			value: serializeWorkflowFieldValue(value, kind),
		};
	}
	return nextDraft;
}

function detectWorkflowFieldKind(value: unknown): WorkflowFieldKind {
	if (typeof value === "number") return "number";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "string") return "string";
	return "json";
}

function serializeWorkflowFieldValue(
	value: unknown,
	kind: WorkflowFieldKind,
): string {
	if (kind === "json") {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return "null";
		}
	}
	return String(value);
}

function parseWorkflowFieldValue(
	draft: WorkflowFieldDraft,
): { ok: true; value: unknown } | { ok: false; message: string } {
	if (draft.kind === "string") {
		return { ok: true, value: draft.value };
	}

	if (draft.kind === "number") {
		if (draft.value.trim().length === 0) {
			return { ok: false, message: "数字不能为空" };
		}
		const parsed = Number(draft.value);
		if (!Number.isFinite(parsed)) {
			return { ok: false, message: "请输入有效数字" };
		}
		return { ok: true, value: parsed };
	}

	if (draft.kind === "boolean") {
		if (draft.value !== "true" && draft.value !== "false") {
			return { ok: false, message: "布尔值必须为 true 或 false" };
		}
		return { ok: true, value: draft.value === "true" };
	}

	try {
		return { ok: true, value: JSON.parse(draft.value) };
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : "JSON 解析失败",
		};
	}
}

function areWorkflowValuesEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	try {
		return JSON.stringify(left) === JSON.stringify(right);
	} catch {
		return false;
	}
}

function formatWorkflowValueForHint(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/**
 * AgentChatbox
 * Chat interface for AI-driven video editing commands
 * Design follows existing panel patterns (PanelBaseView, ScenesView)
 */
export function AgentChatbox() {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [providerStatus, setProviderStatus] = useState<{
		available: boolean;
		provider: string;
	} | null>(null);
	const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
	const [stepDrafts, setStepDrafts] = useState<Record<string, string>>({});
	const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
	const [activeView, setActiveView] = useState<
		"chat" | "transcript" | "workflow"
	>("chat");
	const [selectedWorkflowName, setSelectedWorkflowName] = useState("");
	const [workflowStepDrafts, setWorkflowStepDrafts] =
		useState<WorkflowStepDrafts>({});
	const [workflowFormError, setWorkflowFormError] = useState<string | null>(
		null,
	);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const {
		sendMessage,
		confirmPlan,
		cancelPlan,
		updatePlanStep,
		removePlanStep,
		runWorkflow,
		clearHistory,
		checkProvider,
		isProcessing,
		error,
	} = useAgent();
	const workflowOptions = useMemo(() => getPresetWorkflows(), []);
	const selectedWorkflow =
		workflowOptions.find(
			(workflow) => workflow.name === selectedWorkflowName,
		) ?? null;

	useEffect(() => {
		if (!selectedWorkflowName && workflowOptions.length > 0) {
			setSelectedWorkflowName(workflowOptions[0].name);
		}
	}, [selectedWorkflowName, workflowOptions]);

	useEffect(() => {
		if (!selectedWorkflow) {
			setWorkflowStepDrafts({});
			return;
		}

		const nextDrafts: WorkflowStepDrafts = {};
		for (const step of selectedWorkflow.steps) {
			nextDrafts[step.id] = buildWorkflowArgumentsDraft(step.arguments);
		}

		setWorkflowStepDrafts(nextDrafts);
		setWorkflowFormError(null);
	}, [selectedWorkflow]);

	// Check provider status on mount
	useEffect(() => {
		checkProvider().then(setProviderStatus);
	}, [checkProvider]);

	// Scroll to bottom when messages change
	const messageCount = messages.length;
	useEffect(() => {
		void messageCount;
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messageCount]);

	const appendAssistantResponse = (response: AgentResponse) => {
		const assistantMessage: Message = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: response.message,
			timestamp: new Date(),
			toolCalls: response.toolCalls,
			plan: response.plan,
			requiresConfirmation: response.requiresConfirmation,
		};
		setMessages((prev) => [...prev, assistantMessage]);

		if (response.requiresConfirmation && response.plan) {
			setPendingPlanId(response.plan.id);
			const nextDrafts: Record<string, string> = {};
			for (const step of response.plan.steps) {
				nextDrafts[step.id] = JSON.stringify(step.arguments ?? {}, null, 2);
			}
			setStepDrafts(nextDrafts);
			setStepErrors({});
			return;
		}

		if (response.status === "completed" || response.status === "cancelled") {
			setPendingPlanId(null);
			setStepErrors({});
		}
	};

	// Handle send message
	const handleSend = async () => {
		if (!input.trim() || isProcessing) return;

		const userMessage: Message = {
			id: crypto.randomUUID(),
			role: "user",
			content: input.trim(),
			timestamp: new Date(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setInput("");

		const response = await sendMessage(userMessage.content);
		appendAssistantResponse(response);
	};

	const handleConfirmPlan = async () => {
		if (isProcessing) return;
		const response = await confirmPlan();
		appendAssistantResponse(response);
	};

	const handleCancelPlan = () => {
		if (isProcessing) return;
		const response = cancelPlan();
		appendAssistantResponse(response);
	};

	const handleUpdateStep = (stepId: string) => {
		if (isProcessing) return;
		const source = stepDrafts[stepId] ?? "{}";
		if (source.length > 100000) {
			setStepErrors((prev) => ({
				...prev,
				[stepId]: "参数过大，请将 JSON 控制在 100000 字符以内",
			}));
			return;
		}
		let nextArguments: Record<string, unknown>;
		try {
			const parsed = JSON.parse(source);
			if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
				throw new Error("参数必须是 JSON 对象");
			}
			nextArguments = parsed as Record<string, unknown>;
		} catch (parseError) {
			setStepErrors((prev) => ({
				...prev,
				[stepId]:
					parseError instanceof Error ? parseError.message : "JSON 解析失败",
			}));
			return;
		}

		setStepErrors((prev) => ({ ...prev, [stepId]: "" }));
		const response = updatePlanStep({ stepId, arguments: nextArguments });
		appendAssistantResponse(response);
	};

	const handleRemoveStep = (stepId: string) => {
		if (isProcessing) return;
		const response = removePlanStep(stepId);
		appendAssistantResponse(response);
	};

	// Handle keyboard submit
	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	// Handle clear
	const handleClear = () => {
		if (isProcessing) return;
		setMessages([]);
		setPendingPlanId(null);
		setStepDrafts({});
		setStepErrors({});
		clearHistory();
	};

	const handleWorkflowFieldChange = ({
		stepId,
		fieldKey,
		value,
	}: {
		stepId: string;
		fieldKey: string;
		value: string;
	}) => {
		setWorkflowStepDrafts((prev) => {
			const stepDraft = prev[stepId];
			if (!stepDraft || !stepDraft[fieldKey]) return prev;
			return {
				...prev,
				[stepId]: {
					...stepDraft,
					[fieldKey]: {
						...stepDraft[fieldKey],
						value,
					},
				},
			};
		});
	};

	const resetWorkflowStepToDefault = (stepId: string) => {
		if (isProcessing || pendingPlanId || !selectedWorkflow) return;
		const targetStep = selectedWorkflow.steps.find((step) => step.id === stepId);
		if (!targetStep) return;

		setWorkflowStepDrafts((prev) => ({
			...prev,
			[stepId]: buildWorkflowArgumentsDraft(targetStep.arguments),
		}));
		setWorkflowFormError(null);
	};

	const resetAllWorkflowDraftsToDefault = () => {
		if (isProcessing || pendingPlanId || !selectedWorkflow) return;

		const nextDrafts: WorkflowStepDrafts = {};
		for (const step of selectedWorkflow.steps) {
			nextDrafts[step.id] = buildWorkflowArgumentsDraft(step.arguments);
		}
		setWorkflowStepDrafts(nextDrafts);
		setWorkflowFormError(null);
	};

	const handleRunWorkflow = async () => {
		if (isProcessing || pendingPlanId) return;
		if (!selectedWorkflowName) {
			setWorkflowFormError("请先选择一个工作流");
			return;
		}
		if (!selectedWorkflow) {
			setWorkflowFormError("未找到所选工作流，请重新选择");
			return;
		}

		const nextStepOverrides: ParsedStepOverride[] = [];
		for (const step of selectedWorkflow.steps) {
			const draftFields = workflowStepDrafts[step.id] ?? {};
			const changedArguments: Record<string, unknown> = {};

			for (const [fieldKey, defaultValue] of Object.entries(
				step.arguments ?? {},
			)) {
				const draftField = draftFields[fieldKey];
				if (!draftField) continue;

				const parsed = parseWorkflowFieldValue(draftField);
				if (!parsed.ok) {
					setWorkflowFormError(
						`步骤 ${step.toolName} 的参数 ${fieldKey} 无效：${parsed.message}`,
					);
					return;
				}

				if (!areWorkflowValuesEqual(parsed.value, defaultValue)) {
					changedArguments[fieldKey] = parsed.value;
				}
			}

			if (Object.keys(changedArguments).length > 0) {
				nextStepOverrides.push({
					stepId: step.id,
					arguments: changedArguments,
				});
			}
		}

		setWorkflowFormError(null);
		const hasOverrides = nextStepOverrides.length > 0;
		const userMessage: Message = {
			id: crypto.randomUUID(),
			role: "user",
			content: hasOverrides
				? `[工作流] ${selectedWorkflowName}\nstepOverrides: ${JSON.stringify(nextStepOverrides)}`
				: `[工作流] ${selectedWorkflowName}`,
			timestamp: new Date(),
		};
		setMessages((prev) => [...prev, userMessage]);
		setActiveView("chat");

		const response = await runWorkflow({
			workflowName: selectedWorkflowName,
			...(hasOverrides ? { stepOverrides: nextStepOverrides } : {}),
		});
		appendAssistantResponse(response);
	};

	const inputDisabled =
		activeView !== "chat" || isProcessing || Boolean(pendingPlanId);
	const workflowActionDisabled = isProcessing || Boolean(pendingPlanId);

	return (
		<div className="flex flex-col h-full bg-panel">
			{/* Header - matches PanelBaseView sticky header pattern */}
			<div className="bg-panel sticky top-0 z-10">
				<div className="flex items-center justify-between px-4 py-3">
					<div className="flex items-center gap-2">
						<Bot className="size-4 text-primary" />
						<span className="font-medium text-sm">AI 助手</span>
						<div className="ml-1 flex items-center rounded-md border border-border p-0.5">
							<Button
								variant="text"
								size="sm"
								className={cn(
									"h-6 px-2 text-xs",
									activeView === "chat"
										? "bg-accent text-foreground"
										: "text-muted-foreground",
								)}
								onClick={() => setActiveView("chat")}
								title="聊天视图"
							>
								<MessagesSquare className="size-3 mr-1" />
								聊天
							</Button>
							<Button
								variant="text"
								size="sm"
								className={cn(
									"h-6 px-2 text-xs",
									activeView === "transcript"
										? "bg-accent text-foreground"
										: "text-muted-foreground",
								)}
								onClick={() => setActiveView("transcript")}
								title="转录联动视图"
							>
								<ScrollText className="size-3 mr-1" />
								转录
							</Button>
							<Button
								variant="text"
								size="sm"
								className={cn(
									"h-6 px-2 text-xs",
									activeView === "workflow"
										? "bg-accent text-foreground"
										: "text-muted-foreground",
								)}
								onClick={() => setActiveView("workflow")}
								title="工作流管理视图"
							>
								<GitBranch className="size-3 mr-1" />
								工作流
							</Button>
						</div>
						{providerStatus && (
							<span
								className={cn(
									"text-xs px-1.5 py-0.5 rounded-sm",
									providerStatus.available
										? "bg-constructive/10 text-constructive"
										: "bg-destructive/10 text-destructive",
								)}
							>
								{providerStatus.available ? "Online" : "Offline"}
							</span>
						)}
					</div>
					<Button
						variant="text"
						size="icon"
						onClick={handleClear}
						disabled={messages.length === 0 || isProcessing}
						title="清空对话"
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
				<Separator />
			</div>

			{activeView === "chat" ? (
				<>
					{/* Messages - uses ScrollArea like PanelBaseView */}
					<ScrollArea className="flex-1">
						<div className="p-4 space-y-3">
							{messages.length === 0 && (
								<div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
									<Bot className="size-10 mb-3 opacity-20" />
									<p>输入指令来控制视频编辑</p>
									<p className="text-xs mt-1 opacity-70">
										例如: "在当前位置分割视频"
									</p>
								</div>
							)}

							{messages.map((message) => (
								<MessageBubble
									key={message.id}
									message={message}
									isActivePlan={message.plan?.id === pendingPlanId}
									stepDrafts={stepDrafts}
									stepErrors={stepErrors}
									onStepDraftChange={(stepId, value) => {
										setStepDrafts((prev) => ({ ...prev, [stepId]: value }));
									}}
									onUpdateStep={handleUpdateStep}
									onRemoveStep={handleRemoveStep}
									onConfirmPlan={handleConfirmPlan}
									onCancelPlan={handleCancelPlan}
									controlsDisabled={isProcessing}
								/>
							))}

							{isProcessing && (
								<div className="flex items-center gap-2 text-muted-foreground text-sm px-3 py-2">
									<Loader2 className="size-4 animate-spin" />
									<span>处理中...</span>
								</div>
							)}

							{error && (
								<div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
									<AlertCircle className="size-4" />
									<span>{error}</span>
								</div>
							)}

							<div ref={messagesEndRef} />
						</div>
					</ScrollArea>

					{/* Input - follows consistent spacing and border patterns */}
					<div className="bg-panel border-t border-border p-3">
						<div className="flex gap-2">
							<textarea
								ref={inputRef}
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={
									pendingPlanId
										? "请先确认或取消当前计划..."
										: "输入编辑指令..."
								}
								disabled={inputDisabled}
								className={cn(
									"flex-1 min-h-[38px] max-h-[100px] resize-none rounded-md",
									"bg-background border border-border px-3 py-2 text-sm",
									"placeholder:text-muted-foreground",
									"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary",
									"disabled:opacity-50 disabled:cursor-not-allowed",
								)}
								rows={1}
							/>
							<Button
								onClick={handleSend}
								disabled={!input.trim() || inputDisabled}
								size="icon"
								className="shrink-0 size-[38px]"
							>
								<Send className="size-4" />
							</Button>
						</div>
					</div>
				</>
			) : activeView === "transcript" ? (
				<div className="flex-1 min-h-0">
					<TranscriptPanel />
				</div>
			) : (
				<div className="flex-1 min-h-0 flex flex-col">
					<div className="px-3 py-2 border-b border-border">
						<p className="text-xs font-medium">工作流管理</p>
						<p className="text-xs text-muted-foreground">
							选择预置工作流，按需编辑 stepOverrides 后发送到 run_workflow
						</p>
					</div>

					<ScrollArea className="flex-1 min-h-0">
						<div className="p-3 space-y-3">
							<div>
								<p className="mb-1 text-xs font-medium">选择工作流</p>
								<Select
									value={selectedWorkflowName}
									onValueChange={setSelectedWorkflowName}
									disabled={workflowActionDisabled}
								>
									<SelectTrigger className="h-8 w-full text-xs">
										<SelectValue placeholder="请选择工作流" />
									</SelectTrigger>
									<SelectContent>
										{workflowOptions.map((workflow) => (
											<SelectItem
												key={workflow.name}
												value={workflow.name}
												className="text-xs"
											>
												{workflow.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{selectedWorkflow ? (
								<div className="rounded-md border border-border p-2 space-y-2">
									<div className="flex items-center justify-between gap-2">
										<div className="text-xs font-medium">
											{selectedWorkflow.name}
										</div>
										<Button
											variant="text"
											size="sm"
											className="h-6 px-2 text-[11px]"
											onClick={resetAllWorkflowDraftsToDefault}
											disabled={workflowActionDisabled}
										>
											恢复全部默认参数
										</Button>
									</div>
									<p className="text-xs text-muted-foreground">
										{selectedWorkflow.description}
									</p>
									<div className="space-y-2">
										{selectedWorkflow.steps.map((step, index) => {
											const stepArguments = Object.entries(step.arguments ?? {});
											return (
												<div
													key={`${selectedWorkflow.name}-${step.id}`}
													className="rounded-sm border border-border/60 bg-background/60 px-2 py-2 space-y-2"
												>
													<div className="flex items-center justify-between gap-2">
														<div className="text-[11px] font-mono">
															{index + 1}. {step.toolName}
														</div>
														<Button
															variant="text"
															size="sm"
															className="h-6 px-2 text-[11px]"
															onClick={() => resetWorkflowStepToDefault(step.id)}
															disabled={
																workflowActionDisabled ||
																stepArguments.length === 0
															}
														>
															恢复本步骤默认
														</Button>
													</div>
													{step.summary ? (
														<div className="text-[11px] text-muted-foreground">
															{step.summary}
														</div>
													) : null}

													<div className="space-y-2">
														{stepArguments.length === 0 ? (
															<div className="text-[11px] text-muted-foreground">
																此步骤无参数
															</div>
														) : (
															stepArguments.map(([fieldKey, defaultValue]) => {
																const draft =
																	workflowStepDrafts[step.id]?.[fieldKey] ??
																	null;
																if (!draft) return null;

																return (
																	<div
																		key={`${step.id}-${fieldKey}`}
																		className="space-y-1"
																	>
																		<div className="flex items-center justify-between gap-2">
																			<div className="text-[11px] font-medium">
																				{fieldKey}
																			</div>
																			<div className="text-[11px] text-muted-foreground truncate">
																				默认:{" "}
																				{formatWorkflowValueForHint(
																					defaultValue,
																				)}
																			</div>
																		</div>

																		{draft.kind === "boolean" ? (
																			<Select
																				value={draft.value}
																				onValueChange={(nextValue) =>
																					handleWorkflowFieldChange({
																						stepId: step.id,
																						fieldKey,
																						value: nextValue,
																					})
																				}
																				disabled={workflowActionDisabled}
																			>
																				<SelectTrigger className="h-8 w-full text-xs">
																					<SelectValue />
																				</SelectTrigger>
																				<SelectContent>
																					<SelectItem value="true">
																						true
																					</SelectItem>
																					<SelectItem value="false">
																						false
																					</SelectItem>
																				</SelectContent>
																			</Select>
																		) : draft.kind === "json" ? (
																			<textarea
																				value={draft.value}
																				onChange={(event) =>
																					handleWorkflowFieldChange({
																						stepId: step.id,
																						fieldKey,
																						value: event.target.value,
																					})
																				}
																				disabled={workflowActionDisabled}
																				className={cn(
																					"w-full min-h-[80px] resize-y rounded-md border border-border bg-background px-2 py-1.5",
																					"font-mono text-xs",
																					"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
																					"disabled:opacity-50",
																				)}
																			/>
																		) : (
																			<Input
																				type={
																					draft.kind === "number"
																						? "number"
																						: "text"
																				}
																				size="sm"
																				value={draft.value}
																				onChange={(event) =>
																					handleWorkflowFieldChange({
																						stepId: step.id,
																						fieldKey,
																						value: event.target.value,
																					})
																				}
																				disabled={workflowActionDisabled}
																			/>
																		)}
																	</div>
																);
															})
														)}
													</div>
												</div>
											);
										})}
									</div>
									<p className="text-[11px] text-muted-foreground">
										仅在你修改参数时才会自动生成
										stepOverrides，未改动的参数不会提交。
									</p>
								</div>
							) : (
								<div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
									暂无可用工作流
								</div>
							)}

							{workflowFormError ? (
								<div className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
									{workflowFormError}
								</div>
							) : null}
						</div>
					</ScrollArea>

					<div className="border-t border-border p-3">
						<Button
							onClick={handleRunWorkflow}
							disabled={!selectedWorkflowName || workflowActionDisabled}
							className="w-full"
						>
							发送到 run_workflow
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

interface MessageBubbleProps {
	message: Message;
	isActivePlan: boolean;
	stepDrafts: Record<string, string>;
	stepErrors: Record<string, string>;
	onStepDraftChange: (stepId: string, value: string) => void;
	onUpdateStep: (stepId: string) => void;
	onRemoveStep: (stepId: string) => void;
	onConfirmPlan: () => void;
	onCancelPlan: () => void;
	controlsDisabled: boolean;
}

/**
 * Message Bubble Component
 * Uses semantic colors from design system
 */
function MessageBubble({
	message,
	isActivePlan,
	stepDrafts,
	stepErrors,
	onStepDraftChange,
	onUpdateStep,
	onRemoveStep,
	onConfirmPlan,
	onCancelPlan,
	controlsDisabled,
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
									// Prevent editing while plan execution is in progress.
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

				{/* Tool calls display */}
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
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

export default AgentChatbox;
