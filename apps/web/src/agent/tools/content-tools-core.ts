import { EditorCore } from "@/core";
import { DEFAULT_CANVAS_PRESETS } from "@/constants/project-constants";
import { MIN_FONT_SIZE, MAX_FONT_SIZE } from "@/constants/text-constants";
import { isCaptionTextElement } from "@/lib/transcription/caption-metadata";
import type { TextElement } from "@/types/timeline";
import { createRoutedProvider } from "../providers";
import { qualityEvaluatorService } from "../services/quality-evaluator";
import type { AgentTool, ToolResult } from "../types";
import { getWorkflowByName } from "../workflows";
import { buildTimelineOperationDiff } from "./timeline-edit-ops";
import { executeMutationWithUndoGuard } from "./execution-policy";
import { exportVideoTool } from "./project-tools";
import { scoreHighlightsTool } from "./highlight-tools-core";
import { runWorkflowTool } from "./workflow-tools";

type BriefPlatform =
	| "auto"
	| "tiktok"
	| "reels"
	| "youtube-shorts"
	| "youtube"
	| "bilibili";
type CaptionPresetId = "social-bold" | "clean-minimal" | "course-readable";
type ExportRatio = "16:9" | "9:16" | "1:1" | "4:3";
type HookStrategy = "mixed" | "question" | "emotion" | "insight";

interface EditBrief {
	goal: string;
	audience: string;
	platform: BriefPlatform;
	tone: string;
	language: string;
	targetDurationSeconds: number;
	workflowName: string;
	stepOverrides: Array<{
		stepId?: string;
		index?: number;
		arguments: Record<string, unknown>;
	}>;
	captionPreset: CaptionPresetId;
	exportRatios: ExportRatio[];
	hookVariantCount: number;
}

interface HookVariant {
	id: string;
	title: string;
	strategy: HookStrategy;
	startTime: number;
	endTime: number;
	durationSeconds: number;
	score: number;
	excerpt: string;
	reason: string;
}

const CAPTION_PRESETS: Record<
	CaptionPresetId,
	{
		label: string;
		updates: Pick<
			TextElement,
			| "fontSize"
			| "fontFamily"
			| "color"
			| "backgroundColor"
			| "fontWeight"
			| "fontStyle"
			| "textAlign"
			| "textDecoration"
		>;
	}
> = {
	"social-bold": {
		label: "社媒粗体",
		updates: {
			fontSize: 68,
			fontFamily: "Arial",
			color: "#ffffff",
			backgroundColor: "rgba(0,0,0,0.45)",
			fontWeight: "bold",
			fontStyle: "normal",
			textAlign: "center",
			textDecoration: "none",
		},
	},
	"clean-minimal": {
		label: "极简清晰",
		updates: {
			fontSize: 54,
			fontFamily: "Arial",
			color: "#ffffff",
			backgroundColor: "transparent",
			fontWeight: "normal",
			fontStyle: "normal",
			textAlign: "center",
			textDecoration: "none",
		},
	},
	"course-readable": {
		label: "课程可读",
		updates: {
			fontSize: 58,
			fontFamily: "Arial",
			color: "#ffffff",
			backgroundColor: "rgba(0,0,0,0.35)",
			fontWeight: "bold",
			fontStyle: "normal",
			textAlign: "left",
			textDecoration: "none",
		},
	},
};

const RATIO_PRESETS: Record<ExportRatio, { width: number; height: number }> = {
	"16:9": { width: 1920, height: 1080 },
	"9:16": { width: 1080, height: 1920 },
	"1:1": { width: 1080, height: 1080 },
	"4:3": { width: 1440, height: 1080 },
};

const DEFAULT_EXPORT_RATIOS: ExportRatio[] = ["9:16", "1:1", "16:9"];
const DEFAULT_HOOK_VARIANTS = 3;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 3): number {
	return Number(value.toFixed(precision));
}

function safeParseJson(content: string): unknown {
	const trimmed = content.trim();
	if (!trimmed) return null;
	const cleaned = trimmed.startsWith("```")
		? trimmed
				.replace(/^```(?:json)?/i, "")
				.replace(/```$/i, "")
				.trim()
		: trimmed;
	try {
		return JSON.parse(cleaned);
	} catch {
		const objectMatch = cleaned.match(/\{[\s\S]*\}/);
		if (!objectMatch) return null;
		try {
			return JSON.parse(objectMatch[0]);
		} catch {
			return null;
		}
	}
}

function parsePlatform(value: unknown): BriefPlatform {
	if (
		value === "auto" ||
		value === "tiktok" ||
		value === "reels" ||
		value === "youtube-shorts" ||
		value === "youtube" ||
		value === "bilibili"
	) {
		return value;
	}
	return "auto";
}

function inferPlatformFromPrompt(prompt: string): BriefPlatform {
	const lower = prompt.toLowerCase();
	if (lower.includes("tiktok") || prompt.includes("抖音")) {
		return "tiktok";
	}
	if (lower.includes("reels") || prompt.includes("小红书")) {
		return "reels";
	}
	if (
		lower.includes("shorts") ||
		prompt.includes("短视频") ||
		prompt.includes("短片")
	) {
		return "youtube-shorts";
	}
	if (lower.includes("youtube")) {
		return "youtube";
	}
	if (prompt.includes("b站") || lower.includes("bilibili")) {
		return "bilibili";
	}
	return "auto";
}

function inferWorkflowFromPrompt(prompt: string): string {
	const lower = prompt.toLowerCase();
	if (
		prompt.includes("播客") ||
		prompt.includes("访谈") ||
		lower.includes("podcast") ||
		lower.includes("interview")
	) {
		return "podcast-to-clips";
	}
	if (
		prompt.includes("课程") ||
		prompt.includes("教程") ||
		lower.includes("course") ||
		lower.includes("tutorial")
	) {
		return "course-chaptering";
	}
	if (
		prompt.includes("口播") ||
		prompt.includes("讲解") ||
		lower.includes("talking head") ||
		lower.includes("vlog")
	) {
		return "talking-head-polish";
	}
	if (
		prompt.includes("精简") ||
		prompt.includes("压缩") ||
		lower.includes("trim") ||
		lower.includes("cleanup")
	) {
		return "text-based-cleanup";
	}
	return "quick-social-clip";
}

function defaultTargetDurationByPlatform(platform: BriefPlatform): number {
	if (
		platform === "tiktok" ||
		platform === "reels" ||
		platform === "youtube-shorts"
	) {
		return 45;
	}
	if (platform === "youtube" || platform === "bilibili") {
		return 120;
	}
	return 60;
}

function defaultRatiosByPlatform(platform: BriefPlatform): ExportRatio[] {
	if (
		platform === "tiktok" ||
		platform === "reels" ||
		platform === "youtube-shorts"
	) {
		return ["9:16", "1:1", "16:9"];
	}
	if (platform === "youtube" || platform === "bilibili") {
		return ["16:9", "9:16"];
	}
	return DEFAULT_EXPORT_RATIOS;
}

function inferCaptionPreset({
	workflowName,
	platform,
}: {
	workflowName: string;
	platform: BriefPlatform;
}): CaptionPresetId {
	if (workflowName === "course-chaptering") {
		return "course-readable";
	}
	if (
		platform === "tiktok" ||
		platform === "reels" ||
		platform === "youtube-shorts"
	) {
		return "social-bold";
	}
	return "clean-minimal";
}

function buildStepOverrides({
	workflowName,
	targetDurationSeconds,
}: {
	workflowName: string;
	targetDurationSeconds: number;
}): EditBrief["stepOverrides"] {
	const workflow = getWorkflowByName(workflowName);
	if (!workflow) {
		return [];
	}

	const overrides: EditBrief["stepOverrides"] = [];
	for (const [index, step] of workflow.steps.entries()) {
		const nextArgs: Record<string, unknown> = {};
		if (step.arguments.targetDuration !== undefined) {
			nextArgs.targetDuration = targetDurationSeconds;
		}
		if (step.arguments.targetDurationSeconds !== undefined) {
			nextArgs.targetDurationSeconds = targetDurationSeconds;
		}
		if (Object.keys(nextArgs).length > 0) {
			overrides.push({
				stepId: step.id,
				index,
				arguments: nextArgs,
			});
		}
	}
	return overrides;
}

function buildFallbackEditBrief({
	prompt,
	platform,
	targetDurationSeconds,
}: {
	prompt: string;
	platform: BriefPlatform;
	targetDurationSeconds?: number;
}): EditBrief {
	const resolvedPlatform =
		platform === "auto" ? inferPlatformFromPrompt(prompt) : platform;
	const workflowName = inferWorkflowFromPrompt(prompt);
	const resolvedTarget =
		isFiniteNumber(targetDurationSeconds) && targetDurationSeconds > 0
			? clamp(Math.floor(targetDurationSeconds), 15, 600)
			: defaultTargetDurationByPlatform(resolvedPlatform);
	const captionPreset = inferCaptionPreset({
		workflowName,
		platform: resolvedPlatform,
	});

	return {
		goal: prompt.trim(),
		audience: "通用受众",
		platform: resolvedPlatform,
		tone: "清晰直接",
		language: "zh",
		targetDurationSeconds: resolvedTarget,
		workflowName,
		stepOverrides: buildStepOverrides({
			workflowName,
			targetDurationSeconds: resolvedTarget,
		}),
		captionPreset,
		exportRatios: defaultRatiosByPlatform(resolvedPlatform),
		hookVariantCount: DEFAULT_HOOK_VARIANTS,
	};
}

function normalizeExportRatios(value: unknown): ExportRatio[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const ratios: ExportRatio[] = [];
	for (const item of value) {
		if (
			item === "16:9" ||
			item === "9:16" ||
			item === "1:1" ||
			item === "4:3"
		) {
			if (!ratios.includes(item)) {
				ratios.push(item);
			}
		}
	}
	return ratios;
}

function normalizeCaptionPreset(value: unknown): CaptionPresetId | null {
	if (
		value === "social-bold" ||
		value === "clean-minimal" ||
		value === "course-readable"
	) {
		return value;
	}
	return null;
}

function normalizeBriefFromJson({
	value,
	fallback,
}: {
	value: unknown;
	fallback: EditBrief;
}): EditBrief {
	if (!isObjectRecord(value)) {
		return fallback;
	}

	const parsedPlatform = parsePlatform(value.platform);
	const candidateWorkflow = isNonEmptyString(value.workflowName)
		? value.workflowName.trim()
		: fallback.workflowName;
	const workflowName = getWorkflowByName(candidateWorkflow)
		? candidateWorkflow
		: fallback.workflowName;
	const targetDurationSeconds = isFiniteNumber(value.targetDurationSeconds)
		? clamp(Math.floor(value.targetDurationSeconds), 15, 600)
		: fallback.targetDurationSeconds;
	const stepOverrides = Array.isArray(value.stepOverrides)
		? value.stepOverrides.reduce<
				Array<{
					stepId?: string;
					index?: number;
					arguments: Record<string, unknown>;
				}>
			>((acc, item) => {
				if (!isObjectRecord(item) || !isObjectRecord(item.arguments)) {
					return acc;
				}
				acc.push({
					stepId: isNonEmptyString(item.stepId)
						? item.stepId.trim()
						: undefined,
					index: isFiniteNumber(item.index)
						? Math.floor(item.index)
						: undefined,
					arguments: item.arguments,
				});
				return acc;
			}, [])
		: buildStepOverrides({
				workflowName,
				targetDurationSeconds,
			});

	return {
		goal: isNonEmptyString(value.goal) ? value.goal.trim() : fallback.goal,
		audience: isNonEmptyString(value.audience)
			? value.audience.trim()
			: fallback.audience,
		platform: parsedPlatform,
		tone: isNonEmptyString(value.tone) ? value.tone.trim() : fallback.tone,
		language: isNonEmptyString(value.language)
			? value.language.trim()
			: fallback.language,
		targetDurationSeconds,
		workflowName,
		stepOverrides,
		captionPreset:
			normalizeCaptionPreset(value.captionPreset) ?? fallback.captionPreset,
		exportRatios:
			normalizeExportRatios(value.exportRatios).length > 0
				? normalizeExportRatios(value.exportRatios)
				: fallback.exportRatios,
		hookVariantCount: isFiniteNumber(value.hookVariantCount)
			? clamp(Math.floor(value.hookVariantCount), 1, 6)
			: fallback.hookVariantCount,
	};
}

async function buildEditBrief({
	prompt,
	platform,
	targetDurationSeconds,
}: {
	prompt: string;
	platform: BriefPlatform;
	targetDurationSeconds?: number;
}): Promise<EditBrief> {
	const fallback = buildFallbackEditBrief({
		prompt,
		platform,
		targetDurationSeconds,
	});
	const provider = createRoutedProvider({ taskType: "planning" });
	const available = await provider.isAvailable();
	if (!available) {
		return fallback;
	}

	const response = await provider.chat({
		messages: [
			{
				role: "system",
				content:
					"你是短视频制作策划助手。只输出 JSON，不要输出解释文本。必须给出 workflowName 与 targetDurationSeconds。",
			},
			{
				role: "user",
				content: [
					"请根据用户需求生成结构化剪辑 brief。",
					"可选 workflowName: quick-social-clip, podcast-to-clips, talking-head-polish, course-chaptering, text-based-cleanup, long-to-short, one-click-masterpiece",
					"输出 JSON 字段:",
					"{goal,audience,platform,tone,language,targetDurationSeconds,workflowName,stepOverrides,captionPreset,exportRatios,hookVariantCount}",
					`用户需求: ${prompt}`,
					`平台偏好: ${platform}`,
					targetDurationSeconds
						? `目标时长偏好: ${targetDurationSeconds}`
						: "目标时长偏好: auto",
				].join("\n"),
			},
		],
		tools: [],
		temperature: 0.2,
	});

	const parsed = safeParseJson(
		typeof response.content === "string" ? response.content : "",
	);
	return normalizeBriefFromJson({
		value: parsed,
		fallback,
	});
}

function makeHookTitle({
	excerpt,
	strategy,
	index,
}: {
	excerpt: string;
	strategy: HookStrategy;
	index: number;
}): string {
	const plain = excerpt
		.replace(/\s+/g, " ")
		.replace(/[。！？!?.]+$/g, "")
		.trim();
	const short = plain.length > 22 ? `${plain.slice(0, 22)}...` : plain;
	const fallback = short || `片段 ${index + 1}`;
	if (strategy === "question") {
		return `问题钩子：${fallback}`;
	}
	if (strategy === "emotion") {
		return `情绪钩子：${fallback}`;
	}
	if (strategy === "insight") {
		return `观点钩子：${fallback}`;
	}
	const mode = index % 3;
	if (mode === 0) return `开场提问：${fallback}`;
	if (mode === 1) return `高能瞬间：${fallback}`;
	return `核心观点：${fallback}`;
}

function pickHookReason({
	semanticHook,
	combinedScore,
}: {
	semanticHook: number | null;
	combinedScore: number;
}): string {
	if (semanticHook !== null && semanticHook >= 8) {
		return "语义 Hook 潜力高";
	}
	if (combinedScore >= 80) {
		return "综合评分高";
	}
	return "节奏紧凑且信息密度高";
}

function isPresetSupportedInProject({
	width,
	height,
}: {
	width: number;
	height: number;
}): boolean {
	return DEFAULT_CANVAS_PRESETS.some(
		(preset) => preset.width === width && preset.height === height,
	);
}

export const generateEditBriefTool: AgentTool = {
	name: "generate_edit_brief",
	description:
		"把一句话需求转成结构化剪辑 brief，并给出推荐 workflow 参数。Turn one-line request into structured editing brief.",
	parameters: {
		type: "object",
		properties: {
			prompt: {
				type: "string",
				description: "用户的一句话编辑需求",
			},
			platform: {
				type: "string",
				enum: [
					"auto",
					"tiktok",
					"reels",
					"youtube-shorts",
					"youtube",
					"bilibili",
				],
				description: "目标平台",
			},
			targetDurationSeconds: {
				type: "number",
				description: "目标时长（秒）",
			},
		},
		required: ["prompt"],
	},
	execute: async (params): Promise<ToolResult> => {
		if (!isNonEmptyString(params.prompt)) {
			return {
				success: false,
				message: "prompt 不能为空",
				data: { errorCode: "INVALID_PROMPT" },
			};
		}

		try {
			const targetDurationSeconds = isFiniteNumber(params.targetDurationSeconds)
				? params.targetDurationSeconds
				: undefined;
			const brief = await buildEditBrief({
				prompt: params.prompt.trim(),
				platform: parsePlatform(params.platform),
				targetDurationSeconds,
			});

			return {
				success: true,
				message: `已生成编辑 brief，推荐 workflow: ${brief.workflowName}`,
				data: {
					brief,
					workflowArgs: {
						workflowName: brief.workflowName,
						stepOverrides: brief.stepOverrides,
						qualityTargetDuration: brief.targetDurationSeconds,
					},
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `生成 brief 失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "GENERATE_EDIT_BRIEF_FAILED" },
			};
		}
	},
};

export const generateHookVariantsTool: AgentTool = {
	name: "generate_hook_variants",
	description:
		"生成多个开场 Hook 方案（时间区间+文案），用于短视频 A/B 选择。Generate multiple opening hook variants.",
	parameters: {
		type: "object",
		properties: {
			count: {
				type: "number",
				description: "生成方案数（默认 3，最大 6）",
			},
			minSeconds: {
				type: "number",
				description: "单个 Hook 最短时长（秒）",
			},
			maxSeconds: {
				type: "number",
				description: "单个 Hook 最长时长（秒）",
			},
			strategy: {
				type: "string",
				enum: ["mixed", "question", "emotion", "insight"],
				description: "标题策略",
			},
			useLLM: {
				type: "boolean",
				description: "是否启用语义评分增强",
			},
		},
		required: [],
	},
	execute: async (params, context): Promise<ToolResult> => {
		const desiredCount = isFiniteNumber(params.count)
			? clamp(Math.floor(params.count), 1, 6)
			: DEFAULT_HOOK_VARIANTS;
		const minSeconds = isFiniteNumber(params.minSeconds)
			? clamp(params.minSeconds, 1.5, 20)
			: 3;
		const maxSeconds = isFiniteNumber(params.maxSeconds)
			? clamp(params.maxSeconds, minSeconds + 0.5, 30)
			: 8;
		const strategy: HookStrategy =
			params.strategy === "question" ||
			params.strategy === "emotion" ||
			params.strategy === "insight" ||
			params.strategy === "mixed"
				? params.strategy
				: "mixed";

		const scoreResult = await scoreHighlightsTool.execute(
			{
				useLLM: params.useLLM !== false,
				segmentMinSeconds: minSeconds,
				segmentMaxSeconds: Math.max(18, maxSeconds * 2),
			},
			context,
		);
		if (!scoreResult.success) {
			return {
				success: false,
				message: scoreResult.message,
				data: scoreResult.data,
			};
		}

		const scoreData = isObjectRecord(scoreResult.data)
			? scoreResult.data
			: null;
		const segments = Array.isArray(scoreData?.segments)
			? (scoreData.segments as Array<Record<string, unknown>>)
			: [];
		if (segments.length === 0) {
			return {
				success: false,
				message: "暂无可用片段用于生成 Hook 方案",
				data: { errorCode: "NO_HOOK_CANDIDATES" },
			};
		}

		const ranked = segments
			.map((segment) => {
				const chunk = isObjectRecord(segment.chunk) ? segment.chunk : null;
				const startTime = isFiniteNumber(chunk?.startTime)
					? chunk.startTime
					: 0;
				const endTime = isFiniteNumber(chunk?.endTime) ? chunk.endTime : 0;
				const duration = Math.max(0, endTime - startTime);
				if (duration <= 0) return null;
				const semanticScores = isObjectRecord(segment.semanticScores)
					? segment.semanticScores
					: null;
				const semanticHook = isFiniteNumber(semanticScores?.hookPotential)
					? semanticScores.hookPotential
					: null;
				const combinedScore = isFiniteNumber(segment.combinedScore)
					? segment.combinedScore
					: 0;
				return {
					startTime,
					endTime,
					duration,
					text: isNonEmptyString(chunk?.text) ? chunk.text.trim() : "",
					semanticHook,
					combinedScore,
				};
			})
			.filter(
				(
					item,
				): item is {
					startTime: number;
					endTime: number;
					duration: number;
					text: string;
					semanticHook: number | null;
					combinedScore: number;
				} => item !== null,
			)
			.sort((left, right) => {
				const leftScore =
					(left.semanticHook ?? left.combinedScore / 10) * 10 +
					left.combinedScore;
				const rightScore =
					(right.semanticHook ?? right.combinedScore / 10) * 10 +
					right.combinedScore;
				return rightScore - leftScore;
			});

		const variants: HookVariant[] = [];
		for (const candidate of ranked) {
			if (variants.length >= desiredCount) {
				break;
			}

			const baseStart = candidate.startTime;
			const clippedDuration = clamp(candidate.duration, minSeconds, maxSeconds);
			const endTime = round(baseStart + clippedDuration);
			const overlapsExisting = variants.some(
				(item) => baseStart < item.endTime && endTime > item.startTime,
			);
			if (overlapsExisting) {
				continue;
			}

			const excerpt =
				candidate.text.length > 80
					? `${candidate.text.slice(0, 80)}...`
					: candidate.text;
			const score = round(
				candidate.semanticHook !== null
					? candidate.semanticHook * 10
					: candidate.combinedScore,
				2,
			);
			const variant: HookVariant = {
				id: `hook-${variants.length + 1}`,
				title: makeHookTitle({
					excerpt,
					strategy,
					index: variants.length,
				}),
				strategy,
				startTime: round(baseStart),
				endTime,
				durationSeconds: round(clippedDuration),
				score,
				excerpt,
				reason: pickHookReason({
					semanticHook: candidate.semanticHook,
					combinedScore: candidate.combinedScore,
				}),
			};
			variants.push(variant);
		}

		if (variants.length === 0) {
			return {
				success: false,
				message: "未生成可用 Hook 方案，请调整参数后重试",
				data: { errorCode: "NO_HOOK_VARIANTS" },
			};
		}

		return {
			success: true,
			message: `已生成 ${variants.length} 个 Hook 方案`,
			data: {
				variants,
				recommendedVariantId: variants[0]?.id,
			},
		};
	},
};

export const applyCaptionPresetTool: AgentTool = {
	name: "apply_caption_preset",
	description:
		"批量套用字幕样式模板，支持 dry-run 预览 diff。Apply caption styling preset in batch.",
	parameters: {
		type: "object",
		properties: {
			preset: {
				type: "string",
				enum: ["social-bold", "clean-minimal", "course-readable"],
				description: "字幕模板",
			},
			dryRun: {
				type: "boolean",
				description: "是否仅预览，不应用",
			},
		},
		required: ["preset"],
	},
	execute: async (params): Promise<ToolResult> => {
		const preset = normalizeCaptionPreset(params.preset);
		if (!preset) {
			return {
				success: false,
				message: "无效的字幕模板 preset",
				data: { errorCode: "INVALID_CAPTION_PRESET" },
			};
		}
		const dryRun = params.dryRun !== false;
		const presetConfig = CAPTION_PRESETS[preset];
		const presetFontSize = presetConfig.updates.fontSize;
		if (
			!Number.isFinite(presetFontSize) ||
			presetFontSize < MIN_FONT_SIZE ||
			presetFontSize > MAX_FONT_SIZE
		) {
			return {
				success: false,
				message:
					`字幕模板字号超出范围（${MIN_FONT_SIZE}-${MAX_FONT_SIZE}）(Caption preset fontSize is out of range)`,
				data: {
					errorCode: "INVALID_PRESET_FONT_SIZE",
					preset,
					fontSize: presetFontSize,
				},
			};
		}
		const editor = EditorCore.getInstance();
		const beforeTracks = editor.timeline.getTracks();

		let updatedCount = 0;
		const afterTracks = beforeTracks.map((track) => {
			if (track.type !== "text") {
				return track;
			}
			const nextElements = track.elements.map((element) => {
				if (element.type !== "text") {
					return element;
				}
				if (!isCaptionTextElement(element)) {
					return element;
				}
				updatedCount += 1;
				return {
					...element,
					...presetConfig.updates,
				};
			});
			return {
				...track,
				elements: nextElements,
			};
		});

		if (updatedCount === 0) {
			return {
				success: false,
				message: "当前时间线没有可更新的字幕元素",
				data: { errorCode: "NO_CAPTION_ELEMENTS" },
			};
		}

		const diff = buildTimelineOperationDiff({
			beforeTracks,
			afterTracks,
		});

		if (dryRun) {
			return {
				success: true,
				message: `[预览] 将应用字幕模板 ${presetConfig.label}，共 ${updatedCount} 个元素`,
				data: {
					preset,
					presetLabel: presetConfig.label,
					updatedCount,
					dryRun: true,
					diff,
				},
			};
		}

		await executeMutationWithUndoGuard({
			label: "apply_caption_preset",
			destructive: true,
			run: () =>
				editor.timeline.replaceTracks({
					tracks: afterTracks,
					selection: null,
				}),
		});

		return {
			success: true,
			message: `已应用字幕模板 ${presetConfig.label}，更新 ${updatedCount} 个元素`,
			data: {
				preset,
				presetLabel: presetConfig.label,
				updatedCount,
				dryRun: false,
				diff,
			},
		};
	},
};

export const exportMultiRatioTool: AgentTool = {
	name: "export_multi_ratio",
	description:
		"按多个比例导出同一项目（9:16/1:1/16:9等），自动恢复原画布设置。Export project in multiple aspect ratios.",
	parameters: {
		type: "object",
		properties: {
			ratios: {
				type: "array",
				description: '导出比例数组，如 ["9:16","1:1","16:9"]',
			},
			format: {
				type: "string",
				enum: ["mp4", "webm"],
				description: "导出格式",
			},
			quality: {
				type: "string",
				enum: ["low", "medium", "high", "very_high"],
				description: "导出质量",
			},
			includeAudio: {
				type: "boolean",
				description: "是否包含音频",
			},
			dryRun: {
				type: "boolean",
				description: "是否仅预览导出计划",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		try {
			const editor = EditorCore.getInstance();
			const activeProject = editor.project.getActive();
			if (!activeProject) {
				return {
					success: false,
					message: "当前没有活动项目 (No active project)",
					data: { errorCode: "NO_ACTIVE_PROJECT" },
				};
			}

			const dryRun = params.dryRun === true;
			const requestedRatios = normalizeExportRatios(params.ratios);
			const ratios =
				requestedRatios.length > 0 ? requestedRatios : DEFAULT_EXPORT_RATIOS;
			const plans = ratios.map((ratio) => ({
				ratio,
				canvasSize: RATIO_PRESETS[ratio],
			}));

			for (const plan of plans) {
				if (
					!isPresetSupportedInProject({
						width: plan.canvasSize.width,
						height: plan.canvasSize.height,
					})
				) {
					return {
						success: false,
						message: `比例 ${plan.ratio} 对应尺寸不在项目预设内`,
						data: { errorCode: "UNSUPPORTED_RATIO", ratio: plan.ratio },
					};
				}
			}

			if (dryRun) {
				return {
					success: true,
					message: `[预览] 将导出 ${plans.length} 个比例版本`,
					data: {
						dryRun: true,
						plans,
					},
				};
			}

			const originalCanvasSize = { ...activeProject.settings.canvasSize };
			const includeAudio =
				typeof params.includeAudio === "boolean" ? params.includeAudio : true;
			const exportResults: Array<{
				ratio: ExportRatio;
				success: boolean;
				message: string;
				data?: unknown;
			}> = [];

			try {
				for (const plan of plans) {
					await editor.project.updateSettings({
						settings: { canvasSize: plan.canvasSize },
					});

					const ratioTag = plan.ratio.replace(":", "x");
					const result = await exportVideoTool.execute({
						format: params.format,
						quality: params.quality,
						includeAudio,
						fileName: `${activeProject.metadata.name}-${ratioTag}`,
					});

					exportResults.push({
						ratio: plan.ratio,
						success: result.success,
						message: result.message,
						data: result.data,
					});
				}
			} finally {
				await editor.project.updateSettings({
					settings: { canvasSize: originalCanvasSize },
				});
			}

			const failed = exportResults.filter((item) => !item.success);
			return {
				success: failed.length === 0,
				message:
					failed.length === 0
						? `多比例导出完成，共 ${exportResults.length} 个版本`
						: `多比例导出完成，但有 ${failed.length} 个版本失败`,
				data: {
					dryRun: false,
					results: exportResults,
					restoredCanvasSize: originalCanvasSize,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `多比例导出失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "EXPORT_MULTI_RATIO_FAILED" },
			};
		}
	},
};

export const evaluateTimelineQualityTool: AgentTool = {
	name: "evaluate_timeline_quality",
	description:
		"输出结构化质量报告（语义完整度/静音率/字幕覆盖/时长达标）。Evaluate timeline quality and return report.",
	parameters: {
		type: "object",
		properties: {
			targetDurationSeconds: {
				type: "number",
				description: "目标时长（秒）",
			},
			durationToleranceRatio: {
				type: "number",
				description: "目标时长容差（0.05~0.5）",
			},
		},
		required: [],
	},
	execute: async (params): Promise<ToolResult> => {
		const report = qualityEvaluatorService.evaluate({
			targetDurationSeconds: isFiniteNumber(params.targetDurationSeconds)
				? params.targetDurationSeconds
				: undefined,
			durationToleranceRatio: isFiniteNumber(params.durationToleranceRatio)
				? params.durationToleranceRatio
				: undefined,
		});

		const reasonText =
			report.reasons.length > 0 ? `，问题: ${report.reasons.join("；")}` : "";
		return {
			success: true,
			message:
				`质量评分 ${report.overallScore.toFixed(2)}，` +
				`${report.passed ? "达标" : "未达标"}${reasonText}`,
			data: {
				report,
			},
		};
	},
};

export const autoEditFromPromptTool: AgentTool = {
	name: "auto_edit_from_prompt",
	description:
		"一句话自动生成短视频初稿：brief -> workflow -> hook 方案 -> 字幕模板 -> 质量报告（可选多比例导出）。",
	parameters: {
		type: "object",
		properties: {
			prompt: {
				type: "string",
				description: "一句话剪辑需求",
			},
			platform: {
				type: "string",
				enum: [
					"auto",
					"tiktok",
					"reels",
					"youtube-shorts",
					"youtube",
					"bilibili",
				],
				description: "目标平台",
			},
			targetDurationSeconds: {
				type: "number",
				description: "目标时长（秒）",
			},
			confirmRequiredSteps: {
				type: "boolean",
				description: "是否自动执行需确认步骤（默认 true）",
			},
			applyCaptionPreset: {
				type: "boolean",
				description: "是否自动应用字幕模板（默认 true）",
			},
			generateHooks: {
				type: "boolean",
				description: "是否生成 Hook 多版本（默认 true）",
			},
			autoExport: {
				type: "boolean",
				description: "是否自动多比例导出（默认 false）",
			},
			exportRatios: {
				type: "array",
				description: "导出比例数组",
			},
			dryRun: {
				type: "boolean",
				description: "是否仅返回执行计划",
			},
		},
		required: ["prompt"],
	},
	execute: async (params, context): Promise<ToolResult> => {
		if (!isNonEmptyString(params.prompt)) {
			return {
				success: false,
				message: "prompt 不能为空",
				data: { errorCode: "INVALID_PROMPT" },
			};
		}

		try {
			const targetDurationSeconds = isFiniteNumber(params.targetDurationSeconds)
				? params.targetDurationSeconds
				: undefined;
			const brief = await buildEditBrief({
				prompt: params.prompt.trim(),
				platform: parsePlatform(params.platform),
				targetDurationSeconds,
			});
			const dryRun = params.dryRun === true;
			if (dryRun) {
				return {
					success: true,
					message: "[预览] 已生成自动剪辑执行计划",
					data: {
						dryRun: true,
						brief,
						plan: {
							workflowName: brief.workflowName,
							stepOverrides: brief.stepOverrides,
							captionPreset: brief.captionPreset,
							exportRatios: brief.exportRatios,
						},
					},
				};
			}

			const confirmRequiredSteps =
				typeof params.confirmRequiredSteps === "boolean"
					? params.confirmRequiredSteps
					: true;
			const workflowResult = await runWorkflowTool.execute(
				{
					workflowName: brief.workflowName,
					stepOverrides: brief.stepOverrides,
					confirmRequiredSteps,
					enableQualityLoop: true,
					qualityTargetDuration: brief.targetDurationSeconds,
				},
				context,
			);
			if (!workflowResult.success) {
				return {
					success: false,
					message: `自动剪辑失败（workflow）: ${workflowResult.message}`,
					data: {
						errorCode: "AUTO_EDIT_WORKFLOW_FAILED",
						brief,
						workflowResult: workflowResult.data,
					},
				};
			}

			const workflowData = isObjectRecord(workflowResult.data)
				? workflowResult.data
				: {};
			if (
				workflowData.status === "awaiting_confirmation" ||
				workflowData.errorCode === "WORKFLOW_CONFIRMATION_REQUIRED"
			) {
				return {
					success: true,
					message: workflowResult.message,
					data: {
						...workflowData,
						brief,
					},
				};
			}

			const outputs: Record<string, unknown> = {
				brief,
				workflow: {
					message: workflowResult.message,
					data: workflowResult.data,
				},
			};
			const applyCaptionPreset = params.applyCaptionPreset !== false;
			if (applyCaptionPreset) {
				const captionResult = await applyCaptionPresetTool.execute({
					preset: brief.captionPreset,
					dryRun: false,
				});
				outputs.captionPreset = {
					success: captionResult.success,
					message: captionResult.message,
					data: captionResult.data,
				};
			}

			const generateHooks = params.generateHooks !== false;
			if (generateHooks) {
				const hookResult = await generateHookVariantsTool.execute(
					{
						count: brief.hookVariantCount,
						strategy: "mixed",
					},
					context,
				);
				outputs.hooks = {
					success: hookResult.success,
					message: hookResult.message,
					data: hookResult.data,
				};
			}

			const qualityResult = await evaluateTimelineQualityTool.execute({
				targetDurationSeconds: brief.targetDurationSeconds,
			});
			outputs.quality = qualityResult.data;

			const autoExport = params.autoExport === true;
			if (autoExport) {
				const exportRatios = normalizeExportRatios(params.exportRatios);
				const exportResult = await exportMultiRatioTool.execute({
					ratios: exportRatios.length > 0 ? exportRatios : brief.exportRatios,
					format: "mp4",
					quality: "high",
					includeAudio: true,
					dryRun: false,
				});
				outputs.export = {
					success: exportResult.success,
					message: exportResult.message,
					data: exportResult.data,
				};
			}
			const optionalFailures = [
				(outputs.captionPreset as { success?: boolean } | undefined)
					?.success === false,
				(outputs.hooks as { success?: boolean } | undefined)?.success === false,
				(outputs.export as { success?: boolean } | undefined)?.success ===
					false,
			].filter(Boolean).length;

			return {
				success: optionalFailures === 0,
				message:
					optionalFailures === 0
						? "自动剪辑已完成，已输出初稿结果与质量报告"
						: `自动剪辑主流程完成，但有 ${optionalFailures} 个后处理步骤失败`,
				data: outputs,
			};
		} catch (error) {
			return {
				success: false,
				message: `自动剪辑失败: ${error instanceof Error ? error.message : "Unknown error"}`,
				data: { errorCode: "AUTO_EDIT_FROM_PROMPT_FAILED" },
			};
		}
	},
};

export function getContentTools(): AgentTool[] {
	return [
		generateEditBriefTool,
		autoEditFromPromptTool,
		generateHookVariantsTool,
		applyCaptionPresetTool,
		exportMultiRatioTool,
		evaluateTimelineQualityTool,
	];
}
