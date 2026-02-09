import type { Workflow } from "./types";

export const WORKFLOWS: Workflow[] = [
	{
		name: "auto-caption-cleanup",
		description: "自动生成字幕并删除静音区间。Auto captions + silence cleanup.",
		scenario: "general",
		templateDescription: "适合通用素材的一键字幕与静音清理。",
		tags: ["captions", "cleanup"],
		steps: [
			{
				id: "generate-captions",
				toolName: "generate_captions",
				arguments: {
					source: "timeline",
				},
				argumentSchema: [
					{
						key: "source",
						type: "string",
						description: "字幕生成来源",
						defaultValue: "timeline",
						enum: ["selection", "timeline"],
					},
				],
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
				argumentSchema: [
					{
						key: "source",
						type: "string",
						description: "静音分析来源",
						defaultValue: "timeline",
						enum: ["selection", "timeline"],
					},
					{
						key: "threshold",
						type: "number",
						description: "静音阈值（越小越敏感）",
						defaultValue: 0.02,
						min: 0,
						max: 1,
					},
					{
						key: "minDuration",
						type: "number",
						description: "最小时长（秒）",
						defaultValue: 0.5,
						min: 0.05,
						max: 10,
					},
					{
						key: "windowSeconds",
						type: "number",
						description: "滑动窗口（秒）",
						defaultValue: 0.1,
						min: 0.02,
						max: 2,
					},
				],
				summary: "检测并删除静音片段",
			},
		],
	},
	{
		name: "selection-caption-cleanup",
		description:
			"仅对当前选中内容生成字幕并删除静音区间。Selection captions + silence cleanup.",
		scenario: "general",
		templateDescription: "只处理选中区间，适合局部返工。",
		tags: ["selection", "captions", "cleanup"],
		steps: [
			{
				id: "generate-captions-selection",
				toolName: "generate_captions",
				arguments: {
					source: "selection",
				},
				argumentSchema: [
					{
						key: "source",
						type: "string",
						description: "字幕生成来源",
						defaultValue: "selection",
						enum: ["selection", "timeline"],
					},
				],
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
				argumentSchema: [
					{
						key: "source",
						type: "string",
						description: "静音分析来源",
						defaultValue: "selection",
						enum: ["selection", "timeline"],
					},
					{
						key: "threshold",
						type: "number",
						description: "静音阈值（越小越敏感）",
						defaultValue: 0.02,
						min: 0,
						max: 1,
					},
					{
						key: "minDuration",
						type: "number",
						description: "最小时长（秒）",
						defaultValue: 0.5,
						min: 0.05,
						max: 10,
					},
					{
						key: "windowSeconds",
						type: "number",
						description: "滑动窗口（秒）",
						defaultValue: 0.1,
						min: 0.02,
						max: 2,
					},
				],
				summary: "删除选中片段中的静音区间",
			},
		],
	},
	{
		name: "timeline-diagnostics",
		description:
			"并行读取时间线诊断信息（轨道概览/总览/播放头）。Parallel timeline diagnostics reads.",
		scenario: "general",
		templateDescription: "只读诊断模板，用于排查时间线状态。",
		tags: ["diagnostics", "read-only"],
		steps: [
			{
				id: "timeline-info",
				toolName: "get_timeline_info",
				arguments: {},
				summary: "读取轨道与元素基础统计",
				operation: "read",
			},
			{
				id: "timeline-summary",
				toolName: "get_timeline_summary",
				arguments: {},
				summary: "读取时间线结构化摘要",
				operation: "read",
			},
			{
				id: "playhead",
				toolName: "get_current_time",
				arguments: {},
				summary: "读取当前播放头位置",
				operation: "read",
			},
		],
	},
	{
		name: "long-to-short",
		description:
			"将长视频自动剪辑为短视频精华。Auto-cut long video into a short highlight reel.",
		scenario: "general",
		templateDescription:
			"高光评分 + 视觉验证 + 计划应用的一体化短视频生产链路。",
		tags: ["highlights", "shorts"],
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
				argumentSchema: [
					{
						key: "topN",
						type: "number",
						description: "参与视觉验证的候选段数量",
						defaultValue: 8,
						min: 1,
						max: 30,
					},
					{
						key: "frameConcurrency",
						type: "number",
						description: "帧提取并发度",
						defaultValue: 2,
						min: 1,
						max: 8,
					},
				],
				summary: "对候选高光片段做视觉质量验证",
			},
			{
				id: "generate-plan",
				toolName: "generate_highlight_plan",
				arguments: {
					targetDuration: 60,
				},
				argumentSchema: [
					{
						key: "targetDuration",
						type: "number",
						description: "目标成片时长（秒）",
						defaultValue: 60,
						min: 10,
						max: 300,
					},
				],
				summary: "生成精华剪辑计划",
			},
			{
				id: "apply-cut",
				toolName: "apply_highlight_cut",
				arguments: {
					addCaptions: true,
					removeSilence: true,
				},
				argumentSchema: [
					{
						key: "addCaptions",
						type: "boolean",
						description: "剪辑后是否自动生成字幕",
						defaultValue: true,
					},
					{
						key: "removeSilence",
						type: "boolean",
						description: "剪辑后是否再执行静音清理",
						defaultValue: true,
					},
				],
				summary: "应用剪辑计划到时间线",
				requiresConfirmation: true,
			},
		],
	},
	{
		name: "filler-word-cleanup",
		description:
			"检测并删除填充词（嗯/啊/um/uh/like等）。Detect and remove filler words.",
		scenario: "general",
		templateDescription: "面向口语素材的填充词清理模板。",
		tags: ["filler", "cleanup"],
		steps: [
			{
				id: "detect-fillers",
				toolName: "detect_filler_words",
				arguments: {
					minConfidence: 0.5,
				},
				argumentSchema: [
					{
						key: "minConfidence",
						type: "number",
						description: "填充词检测最低置信度",
						defaultValue: 0.5,
						min: 0,
						max: 1,
					},
				],
				summary: "扫描转录文本中的填充词",
			},
			{
				id: "remove-fillers",
				toolName: "remove_filler_words",
				arguments: {
					minConfidence: 0.7,
				},
				argumentSchema: [
					{
						key: "minConfidence",
						type: "number",
						description: "填充词删除最低置信度",
						defaultValue: 0.7,
						min: 0,
						max: 1,
					},
				],
				summary: "删除检测到的填充词并收缩间隙",
				requiresConfirmation: true,
			},
		],
	},
	{
		name: "quick-social-clip",
		description:
			"自动从长视频提取60秒社交媒体精华片段并添加字幕。Auto-extract a 60s social clip with captions.",
		scenario: "general",
		templateDescription: "快速生成社媒短视频，可按目标时长调参。",
		tags: ["social", "highlights", "captions"],
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
				argumentSchema: [
					{
						key: "topN",
						type: "number",
						description: "参与视觉验证的候选段数量",
						defaultValue: 5,
						min: 1,
						max: 20,
					},
					{
						key: "frameConcurrency",
						type: "number",
						description: "帧提取并发度",
						defaultValue: 2,
						min: 1,
						max: 8,
					},
				],
				summary: "视觉质量验证",
			},
			{
				id: "generate-plan",
				toolName: "generate_highlight_plan",
				arguments: {
					targetDuration: 60,
				},
				argumentSchema: [
					{
						key: "targetDuration",
						type: "number",
						description: "目标短视频时长（秒）",
						defaultValue: 60,
						min: 15,
						max: 180,
					},
				],
				summary: "生成60秒精华计划",
			},
			{
				id: "apply-cut",
				toolName: "apply_highlight_cut",
				arguments: {
					addCaptions: false,
					removeSilence: true,
				},
				argumentSchema: [
					{
						key: "addCaptions",
						type: "boolean",
						description: "剪辑后是否自动生成字幕",
						defaultValue: false,
					},
					{
						key: "removeSilence",
						type: "boolean",
						description: "剪辑后是否再执行静音清理",
						defaultValue: true,
					},
				],
				summary: "应用社交媒体剪辑",
				requiresConfirmation: true,
			},
			{
				id: "add-captions",
				toolName: "generate_captions",
				arguments: {
					source: "timeline",
				},
				argumentSchema: [
					{
						key: "source",
						type: "string",
						description: "字幕生成来源",
						defaultValue: "timeline",
						enum: ["selection", "timeline"],
					},
				],
				summary: "为剪辑结果添加字幕",
			},
		],
	},
	{
		name: "full-cleanup",
		description:
			"全面清理：删除填充词 + 删除静音 + 生成字幕。Full cleanup: remove fillers + silence + add captions.",
		scenario: "general",
		templateDescription: "一次完成口语视频常见清理动作。",
		tags: ["cleanup", "captions", "filler"],
		steps: [
			{
				id: "detect-fillers",
				toolName: "detect_filler_words",
				arguments: {
					minConfidence: 0.5,
				},
				argumentSchema: [
					{
						key: "minConfidence",
						type: "number",
						description: "填充词检测最低置信度",
						defaultValue: 0.5,
						min: 0,
						max: 1,
					},
				],
				summary: "扫描填充词",
			},
			{
				id: "remove-fillers",
				toolName: "remove_filler_words",
				arguments: {
					minConfidence: 0.7,
				},
				argumentSchema: [
					{
						key: "minConfidence",
						type: "number",
						description: "填充词删除最低置信度",
						defaultValue: 0.7,
						min: 0,
						max: 1,
					},
				],
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
				argumentSchema: [
					{
						key: "source",
						type: "string",
						description: "静音分析来源",
						defaultValue: "timeline",
						enum: ["selection", "timeline"],
					},
					{
						key: "threshold",
						type: "number",
						description: "静音阈值（越小越敏感）",
						defaultValue: 0.02,
						min: 0,
						max: 1,
					},
					{
						key: "minDuration",
						type: "number",
						description: "最小时长（秒）",
						defaultValue: 0.5,
						min: 0.05,
						max: 10,
					},
					{
						key: "windowSeconds",
						type: "number",
						description: "滑动窗口（秒）",
						defaultValue: 0.1,
						min: 0.02,
						max: 2,
					},
				],
				summary: "删除静音区间",
			},
			{
				id: "generate-captions",
				toolName: "generate_captions",
				arguments: {
					source: "timeline",
				},
				argumentSchema: [
					{
						key: "source",
						type: "string",
						description: "字幕生成来源",
						defaultValue: "timeline",
						enum: ["selection", "timeline"],
					},
				],
				summary: "生成字幕",
			},
		],
	},
	{
		name: "podcast-to-clips",
		description:
			"播客口播自动精剪：去口头禅、去静音、生成高光短片。Podcast-focused cleanup and highlight clipping.",
		scenario: "podcast",
		templateDescription: "面向播客/访谈素材，优先提升语音连贯性并输出短片。",
		tags: ["podcast", "filler", "highlights"],
		steps: [
			{
				id: "detect-fillers",
				toolName: "detect_filler_words",
				arguments: { minConfidence: 0.5 },
				argumentSchema: [
					{
						key: "minConfidence",
						type: "number",
						description: "填充词检测最低置信度",
						defaultValue: 0.5,
						min: 0,
						max: 1,
					},
				],
				summary: "扫描播客中的填充词和重复词",
			},
			{
				id: "remove-fillers",
				toolName: "remove_filler_words",
				arguments: {
					minConfidence: 0.75,
					categories: ["filler", "hesitation", "repetition"],
				},
				argumentSchema: [
					{
						key: "minConfidence",
						type: "number",
						description: "填充词删除最低置信度",
						defaultValue: 0.75,
						min: 0,
						max: 1,
					},
					{
						key: "categories",
						type: "array",
						description: "需要删除的填充词类别",
						defaultValue: ["filler", "hesitation", "repetition"],
					},
				],
				summary: "删除口头禅与停顿",
				requiresConfirmation: true,
			},
			{
				id: "remove-silence",
				toolName: "remove_silence",
				arguments: {
					source: "timeline",
					threshold: 0.02,
					minDuration: 0.35,
					windowSeconds: 0.08,
				},
				argumentSchema: [
					{
						key: "threshold",
						type: "number",
						description: "静音阈值",
						defaultValue: 0.02,
						min: 0,
						max: 1,
					},
					{
						key: "minDuration",
						type: "number",
						description: "最短静音删除时长（秒）",
						defaultValue: 0.35,
						min: 0.05,
						max: 10,
					},
				],
				summary: "压缩播客中的静音停顿",
			},
			{
				id: "score-highlights",
				toolName: "score_highlights",
				arguments: {
					segmentMinSeconds: 12,
					segmentMaxSeconds: 45,
					useLLM: true,
				},
				argumentSchema: [
					{
						key: "segmentMinSeconds",
						type: "number",
						description: "最小分段时长（秒）",
						defaultValue: 12,
						min: 2,
						max: 120,
					},
					{
						key: "segmentMaxSeconds",
						type: "number",
						description: "最大分段时长（秒）",
						defaultValue: 45,
						min: 5,
						max: 180,
					},
					{
						key: "useLLM",
						type: "boolean",
						description: "是否启用语义评分增强",
						defaultValue: true,
					},
				],
				summary: "为播客内容评分并排序高光片段",
			},
			{
				id: "generate-plan",
				toolName: "generate_highlight_plan",
				arguments: {
					targetDuration: 45,
					tolerance: 0.2,
					includeHook: true,
				},
				argumentSchema: [
					{
						key: "targetDuration",
						type: "number",
						description: "目标片段时长（秒）",
						defaultValue: 45,
						min: 15,
						max: 180,
					},
					{
						key: "tolerance",
						type: "number",
						description: "目标时长容差",
						defaultValue: 0.2,
						min: 0,
						max: 0.5,
					},
					{
						key: "includeHook",
						type: "boolean",
						description: "是否优先保留强开场片段",
						defaultValue: true,
					},
				],
				summary: "生成播客精华短片计划",
			},
			{
				id: "apply-cut",
				toolName: "apply_highlight_cut",
				arguments: {
					addCaptions: true,
					removeSilence: false,
				},
				argumentSchema: [
					{
						key: "addCaptions",
						type: "boolean",
						description: "剪辑后是否自动生成字幕",
						defaultValue: true,
					},
					{
						key: "removeSilence",
						type: "boolean",
						description: "剪辑后是否再次静音清理",
						defaultValue: false,
					},
				],
				summary: "应用播客精华剪辑",
				requiresConfirmation: true,
			},
		],
	},
	{
		name: "talking-head-polish",
		description:
			"口播人像润色：静音压缩 + 口头禅清理 + 字幕生成。Polish talking-head footage.",
		scenario: "talking-head",
		templateDescription: "用于 vlog/讲解视频，提升节奏并完善字幕。",
		tags: ["talking-head", "cleanup", "captions"],
		steps: [
			{
				id: "remove-silence",
				toolName: "remove_silence",
				arguments: {
					source: "timeline",
					threshold: 0.018,
					minDuration: 0.28,
					windowSeconds: 0.08,
				},
				argumentSchema: [
					{
						key: "threshold",
						type: "number",
						description: "静音阈值",
						defaultValue: 0.018,
						min: 0,
						max: 1,
					},
					{
						key: "minDuration",
						type: "number",
						description: "最短静音删除时长（秒）",
						defaultValue: 0.28,
						min: 0.05,
						max: 10,
					},
				],
				summary: "先做轻量静音压缩，收紧节奏",
			},
			{
				id: "detect-fillers",
				toolName: "detect_filler_words",
				arguments: {
					minConfidence: 0.55,
				},
				argumentSchema: [
					{
						key: "minConfidence",
						type: "number",
						description: "填充词检测最低置信度",
						defaultValue: 0.55,
						min: 0,
						max: 1,
					},
				],
				summary: "定位口头禅和犹豫词",
			},
			{
				id: "remove-fillers",
				toolName: "remove_filler_words",
				arguments: {
					minConfidence: 0.75,
					categories: ["filler", "hesitation"],
				},
				argumentSchema: [
					{
						key: "minConfidence",
						type: "number",
						description: "填充词删除最低置信度",
						defaultValue: 0.75,
						min: 0,
						max: 1,
					},
					{
						key: "categories",
						type: "array",
						description: "删除类别",
						defaultValue: ["filler", "hesitation"],
					},
				],
				summary: "删除口头禅，保留有效内容",
				requiresConfirmation: true,
			},
			{
				id: "generate-captions",
				toolName: "generate_captions",
				arguments: {
					source: "timeline",
					wordsPerChunk: 10,
					minDuration: 0.9,
				},
				argumentSchema: [
					{
						key: "source",
						type: "string",
						description: "字幕生成来源",
						defaultValue: "timeline",
						enum: ["selection", "timeline"],
					},
					{
						key: "wordsPerChunk",
						type: "number",
						description: "每条字幕分词数",
						defaultValue: 10,
						min: 2,
						max: 30,
					},
					{
						key: "minDuration",
						type: "number",
						description: "字幕最小时长（秒）",
						defaultValue: 0.9,
						min: 0.2,
						max: 5,
					},
				],
				summary: "生成可读性更好的字幕",
			},
		],
	},
	{
		name: "course-chaptering",
		description:
			"课程章节化：字幕生成 + 场景检测 + 章节建议。Build chapter candidates for long course videos.",
		scenario: "course",
		templateDescription: "面向课程长视频，先结构化内容再给出章节建议。",
		tags: ["course", "chaptering", "analysis"],
		steps: [
			{
				id: "generate-captions",
				toolName: "generate_captions",
				arguments: {
					source: "timeline",
					wordsPerChunk: 14,
					minDuration: 1.1,
				},
				argumentSchema: [
					{
						key: "source",
						type: "string",
						description: "字幕生成来源",
						defaultValue: "timeline",
						enum: ["selection", "timeline"],
					},
					{
						key: "wordsPerChunk",
						type: "number",
						description: "每条字幕分词数",
						defaultValue: 14,
						min: 4,
						max: 40,
					},
					{
						key: "minDuration",
						type: "number",
						description: "字幕最小时长（秒）",
						defaultValue: 1.1,
						min: 0.2,
						max: 6,
					},
				],
				summary: "先生成稳定字幕，便于后续章节分析",
			},
			{
				id: "detect-scenes",
				toolName: "detect_scenes",
				arguments: {
					sampleInterval: 1,
					threshold: 0.3,
					maxFrames: 700,
				},
				argumentSchema: [
					{
						key: "sampleInterval",
						type: "number",
						description: "场景采样间隔（秒）",
						defaultValue: 1,
						min: 0.2,
						max: 5,
					},
					{
						key: "threshold",
						type: "number",
						description: "场景切换阈值",
						defaultValue: 0.3,
						min: 0.05,
						max: 1,
					},
					{
						key: "maxFrames",
						type: "number",
						description: "最大采样帧数",
						defaultValue: 700,
						min: 50,
						max: 2000,
					},
				],
				summary: "检测课程画面切换和关键帧",
			},
			{
				id: "suggest-edits",
				toolName: "suggest_edits",
				arguments: {
					strategy: "pacing",
				},
				argumentSchema: [
					{
						key: "strategy",
						type: "string",
						description: "章节建议策略",
						defaultValue: "pacing",
						enum: ["highlight", "cleanup", "pacing", "auto"],
					},
				],
				summary: "基于场景与字幕输出章节建议",
			},
		],
	},
];
