import type { Workflow } from "./types";

export const WORKFLOWS: Workflow[] = [
	{
		name: "auto-caption-cleanup",
		description: "自动生成字幕并删除静音区间。Auto captions + silence cleanup.",
		steps: [
			{
				id: "generate-captions",
				toolName: "generate_captions",
				arguments: {
					source: "timeline",
				},
				summary: "为整条时间线生成字幕",
			},
			{
				id: "remove-silence",
				toolName: "remove_silence",
				arguments: {
					source: "timeline",
					threshold: 0.02,
					minDuration: 0.5,
					windowSeconds: 0.1,
				},
				summary: "检测并删除静音片段",
			},
		],
	},
	{
		name: "selection-caption-cleanup",
		description:
			"仅对当前选中内容生成字幕并删除静音区间。Selection captions + silence cleanup.",
		steps: [
			{
				id: "generate-captions-selection",
				toolName: "generate_captions",
				arguments: {
					source: "selection",
				},
				summary: "为当前选中片段生成字幕",
			},
			{
				id: "remove-silence-selection",
				toolName: "remove_silence",
				arguments: {
					source: "selection",
					threshold: 0.02,
					minDuration: 0.5,
					windowSeconds: 0.1,
				},
				summary: "删除选中片段中的静音区间",
			},
		],
	},
	{
		name: "long-to-short",
		description:
			"将长视频自动剪辑为短视频精华。Auto-cut long video into a short highlight reel.",
		steps: [
			{
				id: "score-highlights",
				toolName: "score_highlights",
				arguments: {},
				summary: "分析转录文本，为每个片段计算高光评分",
			},
			{
				id: "visual-validation",
				toolName: "validate_highlights_visual",
				arguments: {
					topN: 8,
					frameConcurrency: 2,
				},
				summary: "对候选高光片段做视觉质量验证",
			},
			{
				id: "generate-plan",
				toolName: "generate_highlight_plan",
				arguments: {
					targetDuration: 60,
				},
				summary: "生成精华剪辑计划",
			},
			{
				id: "apply-cut",
				toolName: "apply_highlight_cut",
				arguments: {
					addCaptions: true,
					removeSilence: true,
				},
				summary: "应用剪辑计划到时间线",
				requiresConfirmation: true,
			},
		],
	},
	{
		name: "filler-word-cleanup",
		description:
			"检测并删除填充词（嗯/啊/um/uh/like等）。Detect and remove filler words.",
		steps: [
			{
				id: "detect-fillers",
				toolName: "detect_filler_words",
				arguments: {
					minConfidence: 0.5,
				},
				summary: "扫描转录文本中的填充词",
			},
			{
				id: "remove-fillers",
				toolName: "remove_filler_words",
				arguments: {
					minConfidence: 0.7,
				},
				summary: "删除检测到的填充词并收缩间隙",
				requiresConfirmation: true,
			},
		],
	},
	{
		name: "quick-social-clip",
		description:
			"自动从长视频提取60秒社交媒体精华片段并添加字幕。Auto-extract a 60s social clip with captions.",
		steps: [
			{
				id: "score-highlights",
				toolName: "score_highlights",
				arguments: {},
				summary: "分析视频内容并评分",
			},
			{
				id: "visual-validation",
				toolName: "validate_highlights_visual",
				arguments: {
					topN: 5,
					frameConcurrency: 2,
				},
				summary: "视觉质量验证",
			},
			{
				id: "generate-plan",
				toolName: "generate_highlight_plan",
				arguments: {
					targetDuration: 60,
				},
				summary: "生成60秒精华计划",
			},
			{
				id: "apply-cut",
				toolName: "apply_highlight_cut",
				arguments: {
					addCaptions: false,
					removeSilence: true,
				},
				summary: "应用社交媒体剪辑",
				requiresConfirmation: true,
			},
			{
				id: "add-captions",
				toolName: "generate_captions",
				arguments: {
					source: "timeline",
				},
				summary: "为剪辑结果添加字幕",
			},
		],
	},
	{
		name: "full-cleanup",
		description:
			"全面清理：删除填充词 + 删除静音 + 生成字幕。Full cleanup: remove fillers + silence + add captions.",
		steps: [
			{
				id: "detect-fillers",
				toolName: "detect_filler_words",
				arguments: {
					minConfidence: 0.5,
				},
				summary: "扫描填充词",
			},
			{
				id: "remove-fillers",
				toolName: "remove_filler_words",
				arguments: {
					minConfidence: 0.7,
				},
				summary: "删除填充词",
				requiresConfirmation: true,
			},
			{
				id: "remove-silence",
				toolName: "remove_silence",
				arguments: {
					source: "timeline",
					threshold: 0.02,
					minDuration: 0.5,
					windowSeconds: 0.1,
				},
				summary: "删除静音区间",
			},
			{
				id: "generate-captions",
				toolName: "generate_captions",
				arguments: {
					source: "timeline",
				},
				summary: "生成字幕",
			},
		],
	},
];
