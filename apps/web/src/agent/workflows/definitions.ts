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
];
