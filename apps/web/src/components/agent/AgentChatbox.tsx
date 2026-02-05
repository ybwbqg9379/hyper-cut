"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import type { AgentExecutionPlan, AgentResponse } from "@/agent";
import { useAgent } from "@/hooks/use-agent";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
	const [activeView, setActiveView] = useState<"chat" | "transcript">("chat");

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const {
		sendMessage,
		confirmPlan,
		cancelPlan,
		updatePlanStep,
		removePlanStep,
		clearHistory,
		checkProvider,
		isProcessing,
		error,
	} = useAgent();

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

	const inputDisabled =
		activeView !== "chat" || isProcessing || Boolean(pendingPlanId);

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
			) : (
				<div className="flex-1 min-h-0">
					<TranscriptPanel />
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
						{message.toolCalls.map((tc) => (
							<div
								key={`${tc.name}-${tc.result.success}-${tc.result.message}`}
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
