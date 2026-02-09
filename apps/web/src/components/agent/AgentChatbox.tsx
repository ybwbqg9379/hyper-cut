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
	type AgentExecutionEvent,
	type AgentResponse,
	type WorkflowResumeHint,
} from "@/agent";
import { useAgent } from "@/hooks/use-agent";
import { useEditor } from "@/hooks/use-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { TranscriptPanel } from "./TranscriptPanel";
import { MessageBubble, type AgentChatMessage } from "./message-bubble";
import { ExecutionTimeline } from "./execution-timeline";
import { useAgentLocale } from "./agent-locale";
import {
	areWorkflowValuesEqual,
	buildWorkflowArgumentsDraft,
	buildWorkflowStepDefaultArguments,
	buildWorkflowStepFieldConfigs,
	extractHighlightPlanPreviewFromToolCalls,
	extractOperationDiffFromToolCalls,
	extractTranscriptSuggestionsFromToolCalls,
	formatWorkflowScenarioLabel,
	formatWorkflowValueForHint,
	hasSuccessfulToolCall,
	parseWorkflowFieldValue,
	type WorkflowScenarioFilter,
	type WorkflowStepDrafts,
	validateWorkflowFieldValue,
} from "./agent-chatbox-utils";
import { cn } from "@/utils/ui";
import { useAgentUiStore } from "@/stores/agent-ui-store";
import { toast } from "sonner";
import {
	Bot,
	Send,
	Trash2,
	Loader2,
	AlertCircle,
	Ban,
	MessagesSquare,
	ScrollText,
	GitBranch,
} from "lucide-react";

type AgentView = "chat" | "transcript" | "workflow";

interface ParsedStepOverride {
	stepId?: string;
	index?: number;
	arguments: Record<string, unknown>;
}

const AGENT_CHATBOX_TEXT = {
	zh: {
		tabChat: "聊天",
		tabTranscript: "转录",
		tabWorkflow: "工作流",
		switchToEnglish: "切换到英文",
		switchToChinese: "切换到中文",
		clearConversation: "清空对话",
		statusOnline: "在线",
		statusOffline: "离线",
		emptyStateTitle: "输入指令来控制视频编辑",
		emptyStateExample: '例如: "在当前位置分割视频"',
		processing: "处理中...",
		cancelExecution: "取消执行",
		executionProgress: "执行进度",
		inputPlaceholderPendingPlan: "请先确认或取消当前计划...",
		inputPlaceholderDefault: "输入编辑指令...",
		workflowPanelTitle: "工作流管理",
		workflowPanelDescription:
			"选择预置工作流，按需编辑 stepOverrides 后发送到 run_workflow",
		scenarioFilter: "场景筛选",
		scenarioPlaceholder: "请选择场景",
		selectWorkflow: "选择工作流",
		workflowPlaceholder: "请选择工作流",
		workflowScenarioLabel: "场景",
		resetAllDefaults: "恢复全部默认参数",
		templateDescription: "模板说明",
		workflowTags: "标签",
		resetStepDefaults: "恢复本步骤默认",
		stepNoArgs: "此步骤无参数",
		defaultValueLabel: "默认",
		rangeLabel: "范围",
		optionsLabel: "可选",
		overridesHint:
			"仅在你修改参数时才会自动生成 stepOverrides，未改动的参数不会提交。",
		noWorkflows: "暂无可用工作流",
		sendToRunWorkflow: "发送到 run_workflow",
		workflowRequiredError: "请先选择一个工作流",
		workflowNotFoundError: "未找到所选工作流，请重新选择",
		stepFieldInvalid: "步骤 {step} 的参数 {field} 无效：{reason}",
		stepArgsTooLarge: "参数过大，请将 JSON 控制在 100000 字符以内",
		stepArgsMustBeObject: "参数必须是 JSON 对象",
		jsonParseFailed: "JSON 解析失败",
		workflowMessagePrefix: "工作流",
		resumeWorkflowPrefix: "继续工作流",
		toastHighlightPreviewTitle: "已生成精华预览",
		toastHighlightPreviewDesc:
			"时间线已标注保留/删除区间，可先预览再确认应用。",
		toastHighlightApplied: "精华剪辑已应用到时间线",
		toastSilenceRemoved: "静音删除已完成",
		toastTranscriptSuggestionTitle: "已生成文本裁剪建议",
		toastTranscriptSuggestionDesc: "请在转录面板中审阅并应用建议。",
		toastExecutionCancelled: "执行已取消",
		toastAwaitingConfirmation: "等待确认",
		toastOperationCompleted: "操作完成",
	},
	en: {
		tabChat: "Chat",
		tabTranscript: "Transcript",
		tabWorkflow: "Workflow",
		switchToEnglish: "Switch to English",
		switchToChinese: "Switch to Chinese",
		clearConversation: "Clear Conversation",
		statusOnline: "Online",
		statusOffline: "Offline",
		emptyStateTitle: "Type commands to edit your video",
		emptyStateExample: 'Example: "Split the video at current position"',
		processing: "Processing...",
		cancelExecution: "Cancel",
		executionProgress: "Execution Progress",
		inputPlaceholderPendingPlan: "Confirm or cancel the current plan first...",
		inputPlaceholderDefault: "Type an editing command...",
		workflowPanelTitle: "Workflow Manager",
		workflowPanelDescription:
			"Select a preset workflow, edit stepOverrides if needed, then send to run_workflow",
		scenarioFilter: "Scenario",
		scenarioPlaceholder: "Select a scenario",
		selectWorkflow: "Workflow",
		workflowPlaceholder: "Select a workflow",
		workflowScenarioLabel: "Scenario",
		resetAllDefaults: "Reset All Defaults",
		templateDescription: "Template",
		workflowTags: "Tags",
		resetStepDefaults: "Reset Step",
		stepNoArgs: "No arguments for this step",
		defaultValueLabel: "Default",
		rangeLabel: "Range",
		optionsLabel: "Options",
		overridesHint:
			"stepOverrides is generated only for changed fields; unchanged values are not submitted.",
		noWorkflows: "No available workflows",
		sendToRunWorkflow: "Send to run_workflow",
		workflowRequiredError: "Please select a workflow first",
		workflowNotFoundError: "Selected workflow not found, please reselect",
		stepFieldInvalid: "Invalid argument {field} for step {step}: {reason}",
		stepArgsTooLarge: "Arguments are too large. Keep JSON within 100000 chars",
		stepArgsMustBeObject: "Arguments must be a JSON object",
		jsonParseFailed: "Failed to parse JSON",
		workflowMessagePrefix: "Workflow",
		resumeWorkflowPrefix: "Resume Workflow",
		toastHighlightPreviewTitle: "Highlight preview generated",
		toastHighlightPreviewDesc:
			"Keep/delete ranges are marked on timeline. Review before applying.",
		toastHighlightApplied: "Highlight cut applied to timeline",
		toastSilenceRemoved: "Silence removal completed",
		toastTranscriptSuggestionTitle: "Transcript trim suggestions generated",
		toastTranscriptSuggestionDesc:
			"Review and apply suggestions in the transcript panel.",
		toastExecutionCancelled: "Execution cancelled",
		toastAwaitingConfirmation: "Awaiting confirmation",
		toastOperationCompleted: "Operation completed",
	},
} as const;

/**
 * AgentChatbox
 * Chat interface for AI-driven video editing commands
 * Design follows existing panel patterns (PanelBaseView, ScenesView)
 */
export function AgentChatbox() {
	const { locale, setLocale } = useAgentLocale();
	const text = AGENT_CHATBOX_TEXT[locale];
	const editor = useEditor();
	const [messages, setMessages] = useState<AgentChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [providerStatus, setProviderStatus] = useState<{
		available: boolean;
		provider: string;
	} | null>(null);
	const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
	const [stepDrafts, setStepDrafts] = useState<Record<string, string>>({});
	const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
	const [activeView, setActiveView] = useState<AgentView>("chat");
	const [selectedWorkflowScenario, setSelectedWorkflowScenario] =
		useState<WorkflowScenarioFilter>("all");
	const [selectedWorkflowName, setSelectedWorkflowName] = useState("");
	const [workflowStepDrafts, setWorkflowStepDrafts] =
		useState<WorkflowStepDrafts>({});
	const [workflowFormError, setWorkflowFormError] = useState<string | null>(
		null,
	);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const setHighlightPreviewFromPlan = useAgentUiStore(
		(state) => state.setHighlightPreviewFromPlan,
	);
	const clearHighlightPreview = useAgentUiStore(
		(state) => state.clearHighlightPreview,
	);
	const setHighlightPreviewPlaybackEnabled = useAgentUiStore(
		(state) => state.setHighlightPreviewPlaybackEnabled,
	);
	const setOperationDiffPreview = useAgentUiStore(
		(state) => state.setOperationDiffPreview,
	);
	const clearOperationDiffPreview = useAgentUiStore(
		(state) => state.clearOperationDiffPreview,
	);
	const setTranscriptEditMode = useAgentUiStore(
		(state) => state.setTranscriptEditMode,
	);
	const setTranscriptSuggestions = useAgentUiStore(
		(state) => state.setTranscriptSuggestions,
	);
	const clearTranscriptSuggestions = useAgentUiStore(
		(state) => state.clearTranscriptSuggestions,
	);

	const {
		sendMessage,
		confirmPlan,
		cancelPlan,
		cancelExecution,
		updatePlanStep,
		removePlanStep,
		runWorkflow,
		clearHistory,
		checkProvider,
		isProcessing,
		error,
		executionEvents,
		activeExecutionRequestId,
	} = useAgent();
	const workflowOptions = useMemo(() => getPresetWorkflows(), []);
	const workflowScenarioOptions = useMemo<WorkflowScenarioFilter[]>(() => {
		const scenarios = new Set<WorkflowScenarioFilter>(["all"]);
		for (const workflow of workflowOptions) {
			scenarios.add(workflow.scenario);
		}
		return Array.from(scenarios);
	}, [workflowOptions]);
	const filteredWorkflowOptions = useMemo(() => {
		if (selectedWorkflowScenario === "all") {
			return workflowOptions;
		}
		return workflowOptions.filter(
			(workflow) => workflow.scenario === selectedWorkflowScenario,
		);
	}, [workflowOptions, selectedWorkflowScenario]);
	const selectedWorkflow =
		filteredWorkflowOptions.find(
			(workflow) => workflow.name === selectedWorkflowName,
		) ?? null;
	const executionEventsByRequestId = useMemo(() => {
		const map = new Map<string, AgentExecutionEvent[]>();
		for (const event of executionEvents) {
			const requestEvents = map.get(event.requestId);
			if (requestEvents) {
				requestEvents.push(event);
				continue;
			}
			map.set(event.requestId, [event]);
		}
		return map;
	}, [executionEvents]);
	const activeExecutionEvents = useMemo(() => {
		if (!activeExecutionRequestId) return [];
		return executionEventsByRequestId.get(activeExecutionRequestId) ?? [];
	}, [activeExecutionRequestId, executionEventsByRequestId]);
	const formatStepFieldInvalidError = ({
		step,
		field,
		reason,
	}: {
		step: string;
		field: string;
		reason: string;
	}): string =>
		text.stepFieldInvalid
			.replace("{step}", step)
			.replace("{field}", field)
			.replace("{reason}", reason);

	useEffect(() => {
		if (filteredWorkflowOptions.length === 0) {
			if (selectedWorkflowName) {
				setSelectedWorkflowName("");
			}
			return;
		}
		if (
			!selectedWorkflowName ||
			!filteredWorkflowOptions.some(
				(workflow) => workflow.name === selectedWorkflowName,
			)
		) {
			setSelectedWorkflowName(filteredWorkflowOptions[0].name);
		}
	}, [selectedWorkflowName, filteredWorkflowOptions]);

	useEffect(() => {
		if (!selectedWorkflow) {
			setWorkflowStepDrafts({});
			return;
		}

		const nextDrafts: WorkflowStepDrafts = {};
		for (const step of selectedWorkflow.steps) {
			nextDrafts[step.id] = buildWorkflowArgumentsDraft(
				buildWorkflowStepDefaultArguments(step),
			);
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
		const highlightPlanPreview = extractHighlightPlanPreviewFromToolCalls(
			response.toolCalls,
		);
		const operationDiffPreview = extractOperationDiffFromToolCalls(
			response.toolCalls,
		);
		const transcriptSuggestions = extractTranscriptSuggestionsFromToolCalls(
			response.toolCalls,
		);
		const applyHighlightCutSucceeded = hasSuccessfulToolCall({
			toolCalls: response.toolCalls,
			toolName: "apply_highlight_cut",
		});
		const removeSilenceSucceeded = hasSuccessfulToolCall({
			toolCalls: response.toolCalls,
			toolName: "remove_silence",
		});

		if (highlightPlanPreview) {
			const totalDuration = editor.timeline.getTotalDuration();
			setHighlightPreviewFromPlan({
				segments: highlightPlanPreview.segments,
				targetDuration: highlightPlanPreview.targetDuration,
				actualDuration: highlightPlanPreview.actualDuration,
				totalDuration,
				sourceRequestId: response.requestId,
			});
			toast.info(text.toastHighlightPreviewTitle, {
				description: text.toastHighlightPreviewDesc,
			});
		}

		if (applyHighlightCutSucceeded) {
			setHighlightPreviewPlaybackEnabled({ enabled: false });
			clearHighlightPreview();
			toast.success(text.toastHighlightApplied);
		} else if (removeSilenceSucceeded) {
			toast.success(text.toastSilenceRemoved);
		}
		if (operationDiffPreview) {
			setOperationDiffPreview({
				toolName: operationDiffPreview.toolName,
				diff: operationDiffPreview.diff,
				sourceRequestId: response.requestId,
			});
		} else if (response.status === "completed") {
			clearOperationDiffPreview();
		}
		if (transcriptSuggestions && transcriptSuggestions.length > 0) {
			setTranscriptEditMode({ enabled: true });
			setTranscriptSuggestions({ suggestions: transcriptSuggestions });
			setActiveView("transcript");
			toast.info(text.toastTranscriptSuggestionTitle, {
				description: text.toastTranscriptSuggestionDesc,
			});
		}

		const hasDedicatedSuccessToast =
			Boolean(highlightPlanPreview) ||
			applyHighlightCutSucceeded ||
			removeSilenceSucceeded ||
			Boolean(transcriptSuggestions && transcriptSuggestions.length > 0);
		if (response.status === "error" || response.success === false) {
			toast.error(response.message);
		} else if (response.status === "cancelled") {
			toast(text.toastExecutionCancelled, {
				description: response.message,
			});
		} else if (response.status === "awaiting_confirmation") {
			toast(text.toastAwaitingConfirmation, {
				description: response.message,
			});
		} else if (response.status === "completed" && !hasDedicatedSuccessToast) {
			toast.success(text.toastOperationCompleted, {
				description: response.message,
			});
		}

		const assistantMessage: AgentChatMessage = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: response.message,
			timestamp: new Date(),
			requestId: response.requestId,
			status: response.status,
			nextStep: response.nextStep,
			resumeHint: response.resumeHint,
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

		setPendingPlanId(null);
		setStepDrafts({});
		setStepErrors({});
	};

	// Handle send message
	const handleSend = async () => {
		if (!input.trim() || isProcessing) return;

		const userMessage: AgentChatMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: input.trim(),
			timestamp: new Date(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setInput("");

		const response = await sendMessage(userMessage.content, {
			preferredResponseLanguage: locale,
		});
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

	const handleCancelExecution = () => {
		const response = cancelExecution();
		appendAssistantResponse(response);
	};

	const handleUpdateStep = (stepId: string) => {
		if (isProcessing) return;
		const source = stepDrafts[stepId] ?? "{}";
		if (source.length > 100000) {
			setStepErrors((prev) => ({
				...prev,
				[stepId]: text.stepArgsTooLarge,
			}));
			return;
		}
		let nextArguments: Record<string, unknown>;
		try {
			const parsed = JSON.parse(source);
			if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
				throw new Error(text.stepArgsMustBeObject);
			}
			nextArguments = parsed as Record<string, unknown>;
		} catch (parseError) {
			setStepErrors((prev) => ({
				...prev,
				[stepId]:
					parseError instanceof Error
						? parseError.message
						: text.jsonParseFailed,
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
		setHighlightPreviewPlaybackEnabled({ enabled: false });
		clearHighlightPreview();
		clearOperationDiffPreview();
		clearTranscriptSuggestions();
		setTranscriptEditMode({ enabled: false });
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
		const targetStep = selectedWorkflow.steps.find(
			(step) => step.id === stepId,
		);
		if (!targetStep) return;

		setWorkflowStepDrafts((prev) => ({
			...prev,
			[stepId]: buildWorkflowArgumentsDraft(
				buildWorkflowStepDefaultArguments(targetStep),
			),
		}));
		setWorkflowFormError(null);
	};

	const resetAllWorkflowDraftsToDefault = () => {
		if (isProcessing || pendingPlanId || !selectedWorkflow) return;

		const nextDrafts: WorkflowStepDrafts = {};
		for (const step of selectedWorkflow.steps) {
			nextDrafts[step.id] = buildWorkflowArgumentsDraft(
				buildWorkflowStepDefaultArguments(step),
			);
		}
		setWorkflowStepDrafts(nextDrafts);
		setWorkflowFormError(null);
	};

	const handleRunWorkflow = async () => {
		if (isProcessing || pendingPlanId) return;
		if (!selectedWorkflowName) {
			setWorkflowFormError(text.workflowRequiredError);
			return;
		}
		if (!selectedWorkflow) {
			setWorkflowFormError(text.workflowNotFoundError);
			return;
		}

		const nextStepOverrides: ParsedStepOverride[] = [];
		for (const step of selectedWorkflow.steps) {
			const draftFields = workflowStepDrafts[step.id] ?? {};
			const changedArguments: Record<string, unknown> = {};
			const fields = buildWorkflowStepFieldConfigs(step);

			for (const field of fields) {
				const draftField = draftFields[field.key];
				if (!draftField) continue;

				const parsed = parseWorkflowFieldValue(draftField, { locale });
				if (!parsed.ok) {
					setWorkflowFormError(
						formatStepFieldInvalidError({
							step: step.toolName,
							field: field.key,
							reason: parsed.message,
						}),
					);
					return;
				}

				const schemaError = validateWorkflowFieldValue({
					field,
					value: parsed.value,
					locale,
				});
				if (schemaError) {
					setWorkflowFormError(
						formatStepFieldInvalidError({
							step: step.toolName,
							field: field.key,
							reason: schemaError,
						}),
					);
					return;
				}

				if (!areWorkflowValuesEqual(parsed.value, field.defaultValue)) {
					changedArguments[field.key] = parsed.value;
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
		const userMessage: AgentChatMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: hasOverrides
				? `[${text.workflowMessagePrefix}] ${selectedWorkflowName}\nstepOverrides: ${JSON.stringify(nextStepOverrides)}`
				: `[${text.workflowMessagePrefix}] ${selectedWorkflowName}`,
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

	const handleResumeWorkflow = async (resumeHint: WorkflowResumeHint) => {
		if (isProcessing || pendingPlanId) return;
		const userMessage: AgentChatMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: `[${text.resumeWorkflowPrefix}] ${resumeHint.workflowName} @ ${resumeHint.startFromStepId}`,
			timestamp: new Date(),
		};
		setMessages((prev) => [...prev, userMessage]);
		setActiveView("chat");

		const response = await runWorkflow({
			workflowName: resumeHint.workflowName,
			startFromStepId: resumeHint.startFromStepId,
			confirmRequiredSteps: resumeHint.confirmRequiredSteps,
			...(resumeHint.stepOverrides && resumeHint.stepOverrides.length > 0
				? { stepOverrides: resumeHint.stepOverrides }
				: {}),
		});
		appendAssistantResponse(response);
	};

	const inputDisabled =
		activeView !== "chat" || isProcessing || Boolean(pendingPlanId);
	const workflowActionDisabled = isProcessing || Boolean(pendingPlanId);

	return (
		<Tabs
			value={activeView}
			onValueChange={(v) => setActiveView(v as AgentView)}
			className="flex flex-col h-full bg-panel"
		>
			{/* Header - matches PanelBaseView sticky header pattern */}
			<div className="bg-panel sticky top-0 z-10">
				<div className="flex items-center justify-between px-3 pt-3 pb-0">
					<TabsList>
						<TabsTrigger value="chat">
							<span className="mr-1 inline-flex items-center">
								<MessagesSquare className="size-3.5" />
							</span>
							{text.tabChat}
						</TabsTrigger>
						<TabsTrigger value="transcript">
							<span className="mr-1 inline-flex items-center">
								<ScrollText className="size-3.5" />
							</span>
							{text.tabTranscript}
						</TabsTrigger>
						<TabsTrigger value="workflow">
							<span className="mr-1 inline-flex items-center">
								<GitBranch className="size-3.5" />
							</span>
							{text.tabWorkflow}
						</TabsTrigger>
					</TabsList>
					<div className="flex items-center gap-1.5">
						{providerStatus && (
							<span
								className={cn(
									"size-2 rounded-full",
									providerStatus.available
										? "bg-constructive"
										: "bg-destructive",
								)}
								title={
									providerStatus.available
										? text.statusOnline
										: text.statusOffline
								}
							/>
						)}
						<Button
							variant="text"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
							title={
								locale === "zh" ? text.switchToEnglish : text.switchToChinese
							}
						>
							{locale === "zh" ? "EN" : "中"}
						</Button>
						<Button
							variant="text"
							size="icon"
							onClick={handleClear}
							disabled={messages.length === 0 || isProcessing}
							title={text.clearConversation}
						>
							<Trash2 className="size-4" />
						</Button>
					</div>
				</div>
				<Separator className="mt-3" />
			</div>

			<TabsContent value="chat" className="mt-0 flex min-h-0 flex-1 flex-col">
				{/* Messages - uses ScrollArea like PanelBaseView */}
				<ScrollArea className="flex-1">
					<div className="p-4 space-y-3">
						{messages.length === 0 && (
							<div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
								<Bot className="size-10 mb-3 opacity-20" />
								<p>{text.emptyStateTitle}</p>
								<p className="text-xs mt-1 opacity-70">
									{text.emptyStateExample}
								</p>
							</div>
						)}

						{messages.map((message) => (
							<MessageBubble
								key={message.id}
								message={message}
								executionEvents={
									message.requestId
										? (executionEventsByRequestId.get(message.requestId) ?? [])
										: undefined
								}
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
								onResumeWorkflow={handleResumeWorkflow}
								controlsDisabled={isProcessing}
								resumeDisabled={isProcessing || Boolean(pendingPlanId)}
								locale={locale}
							/>
						))}

						{isProcessing && (
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-2 text-muted-foreground text-sm px-3 py-2">
									<div className="flex items-center gap-2">
										<Loader2 className="size-4 animate-spin" />
										<span>{text.processing}</span>
									</div>
									<Button
										variant="outline"
										size="sm"
										className="h-7 px-2 text-xs"
										onClick={handleCancelExecution}
									>
										<Ban className="size-3 mr-1" />
										{text.cancelExecution}
									</Button>
								</div>
								{activeExecutionEvents.length > 0 ? (
									<div className="rounded-md border border-border/50 bg-background/60 px-3 py-2">
										<div className="text-xs font-medium mb-1">
											{text.executionProgress}
										</div>
										<ExecutionTimeline
											events={activeExecutionEvents}
											locale={locale}
										/>
									</div>
								) : null}
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
									? text.inputPlaceholderPendingPlan
									: text.inputPlaceholderDefault
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
			</TabsContent>

			<TabsContent
				value="transcript"
				className="mt-0 flex min-h-0 flex-1 flex-col"
			>
				<div className="flex-1 min-h-0">
					<TranscriptPanel locale={locale} />
				</div>
			</TabsContent>

			<TabsContent
				value="workflow"
				className="mt-0 flex min-h-0 flex-1 flex-col"
			>
				<div className="flex-1 min-h-0 flex flex-col">
					<div className="px-3 py-2 border-b border-border">
						<p className="text-xs font-medium">{text.workflowPanelTitle}</p>
						<p className="text-xs text-muted-foreground">
							{text.workflowPanelDescription}
						</p>
					</div>

					<ScrollArea className="flex-1 min-h-0">
						<div className="p-3 space-y-3">
							<div>
								<p className="mb-1 text-xs font-medium">
									{text.scenarioFilter}
								</p>
								<Select
									value={selectedWorkflowScenario}
									onValueChange={(nextValue) =>
										setSelectedWorkflowScenario(
											nextValue as WorkflowScenarioFilter,
										)
									}
									disabled={workflowActionDisabled}
								>
									<SelectTrigger className="h-8 w-full text-xs">
										<SelectValue placeholder={text.scenarioPlaceholder} />
									</SelectTrigger>
									<SelectContent>
										{workflowScenarioOptions.map((scenario) => (
											<SelectItem
												key={scenario}
												value={scenario}
												className="text-xs"
											>
												{formatWorkflowScenarioLabel(scenario, locale)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div>
								<p className="mb-1 text-xs font-medium">
									{text.selectWorkflow}
								</p>
								<Select
									value={selectedWorkflowName}
									onValueChange={setSelectedWorkflowName}
									disabled={workflowActionDisabled}
								>
									<SelectTrigger className="h-8 w-full text-xs">
										<SelectValue placeholder={text.workflowPlaceholder} />
									</SelectTrigger>
									<SelectContent>
										{filteredWorkflowOptions.map((workflow) => (
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
										<div className="space-y-1">
											<div className="text-xs font-medium">
												{selectedWorkflow.name}
											</div>
											<div className="text-[11px] text-muted-foreground">
												{text.workflowScenarioLabel}:{" "}
												{formatWorkflowScenarioLabel(
													selectedWorkflow.scenario,
													locale,
												)}
											</div>
										</div>
										<Button
											variant="text"
											size="sm"
											className="h-6 px-2 text-[11px]"
											onClick={resetAllWorkflowDraftsToDefault}
											disabled={workflowActionDisabled}
										>
											{text.resetAllDefaults}
										</Button>
									</div>
									<p className="text-xs text-muted-foreground">
										{selectedWorkflow.description}
									</p>
									{selectedWorkflow.templateDescription ? (
										<p className="text-[11px] text-muted-foreground">
											{text.templateDescription}:{" "}
											{selectedWorkflow.templateDescription}
										</p>
									) : null}
									{selectedWorkflow.tags && selectedWorkflow.tags.length > 0 ? (
										<p className="text-[11px] text-muted-foreground">
											{text.workflowTags}: {selectedWorkflow.tags.join(" / ")}
										</p>
									) : null}
									<div className="space-y-2">
										{selectedWorkflow.steps.map((step, index) => {
											const stepFields = buildWorkflowStepFieldConfigs(step);
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
															onClick={() =>
																resetWorkflowStepToDefault(step.id)
															}
															disabled={
																workflowActionDisabled ||
																stepFields.length === 0
															}
														>
															{text.resetStepDefaults}
														</Button>
													</div>
													{step.summary ? (
														<div className="text-[11px] text-muted-foreground">
															{step.summary}
														</div>
													) : null}

													<div className="space-y-2">
														{stepFields.length === 0 ? (
															<div className="text-[11px] text-muted-foreground">
																{text.stepNoArgs}
															</div>
														) : (
															stepFields.map((field) => {
																const draft =
																	workflowStepDrafts[step.id]?.[field.key] ??
																	null;
																if (!draft) return null;

																return (
																	<div
																		key={`${step.id}-${field.key}`}
																		className="space-y-1"
																	>
																		<div className="flex items-center justify-between gap-2">
																			<div className="text-[11px] font-medium">
																				{field.key}
																			</div>
																			<div className="text-[11px] text-muted-foreground truncate">
																				{text.defaultValueLabel}:{" "}
																				{formatWorkflowValueForHint(
																					field.defaultValue,
																				)}
																			</div>
																		</div>
																		{field.description ? (
																			<div className="text-[11px] text-muted-foreground">
																				{field.description}
																			</div>
																		) : null}
																		{field.min !== undefined ||
																		field.max !== undefined ? (
																			<div className="text-[11px] text-muted-foreground">
																				{text.rangeLabel}:{" "}
																				{field.min !== undefined
																					? field.min
																					: "-"}
																				~
																				{field.max !== undefined
																					? field.max
																					: "-"}
																			</div>
																		) : null}
																		{field.enum && field.enum.length > 0 ? (
																			<div className="text-[11px] text-muted-foreground">
																				{text.optionsLabel}:{" "}
																				{field.enum.join(", ")}
																			</div>
																		) : null}

																		{draft.kind === "boolean" ? (
																			<Select
																				value={draft.value}
																				onValueChange={(nextValue) =>
																					handleWorkflowFieldChange({
																						stepId: step.id,
																						fieldKey: field.key,
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
																						fieldKey: field.key,
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
																						fieldKey: field.key,
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
										{text.overridesHint}
									</p>
								</div>
							) : (
								<div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
									{text.noWorkflows}
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
							{text.sendToRunWorkflow}
						</Button>
					</div>
				</div>
			</TabsContent>
		</Tabs>
	);
}

export default AgentChatbox;
