export const SPATIAL_ANCHORS = [
	"top-left",
	"top-center",
	"top-right",
	"center-left",
	"center",
	"center-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
] as const;

export type SpatialAnchor = (typeof SPATIAL_ANCHORS)[number];
export const SPATIAL_LAYOUT_TARGETS = ["caption", "logo", "sticker"] as const;
export type SpatialLayoutTarget = (typeof SPATIAL_LAYOUT_TARGETS)[number];

export const MAX_SPATIAL_MARGIN_RATIO = 0.5;

const ANCHOR_VECTORS: Record<SpatialAnchor, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> =
	{
		"top-left": { x: -1, y: -1 },
		"top-center": { x: 0, y: -1 },
		"top-right": { x: 1, y: -1 },
		"center-left": { x: -1, y: 0 },
		center: { x: 0, y: 0 },
		"center-right": { x: 1, y: 0 },
		"bottom-left": { x: -1, y: 1 },
		"bottom-center": { x: 0, y: 1 },
		"bottom-right": { x: 1, y: 1 },
	};

interface LayoutCandidate {
	anchor: SpatialAnchor;
	marginX: number;
	marginY: number;
	baseScore: number;
	reason: string;
}

interface SpatialOccupancyProfile {
	topOccupied: boolean;
	bottomOccupied: boolean;
	leftOccupied: boolean;
	rightOccupied: boolean;
	centerBusy: boolean;
	textDense: boolean;
	peopleCount: number;
}

const TARGET_CANDIDATES: Record<SpatialLayoutTarget, LayoutCandidate[]> = {
	caption: [
		{
			anchor: "bottom-center",
			marginX: 0,
			marginY: 0.08,
			baseScore: 1,
			reason: "字幕优先放在底部中间，阅读路径最稳定",
		},
		{
			anchor: "top-center",
			marginX: 0,
			marginY: 0.08,
			baseScore: 0.86,
			reason: "顶部中间可作为底部拥挤时的回退位",
		},
		{
			anchor: "center-left",
			marginX: 0.08,
			marginY: 0,
			baseScore: 0.72,
			reason: "左侧中部可避开上下文字密集区",
		},
		{
			anchor: "center-right",
			marginX: 0.08,
			marginY: 0,
			baseScore: 0.7,
			reason: "右侧中部用于与主体区分离的替代位",
		},
	],
	logo: [
		{
			anchor: "top-right",
			marginX: 0.06,
			marginY: 0.06,
			baseScore: 1,
			reason: "Logo 常驻右上角，识别度高且不遮挡主体",
		},
		{
			anchor: "top-left",
			marginX: 0.06,
			marginY: 0.06,
			baseScore: 0.92,
			reason: "左上角可作为右上角占用时的回退位",
		},
		{
			anchor: "bottom-right",
			marginX: 0.06,
			marginY: 0.06,
			baseScore: 0.75,
			reason: "底部角落适合避开顶部标题区",
		},
		{
			anchor: "bottom-left",
			marginX: 0.06,
			marginY: 0.06,
			baseScore: 0.7,
			reason: "底部左角为低干扰备选位置",
		},
	],
	sticker: [
		{
			anchor: "center-right",
			marginX: 0.08,
			marginY: 0,
			baseScore: 1,
			reason: "贴纸放在右侧中部更容易与主体形成视觉分层",
		},
		{
			anchor: "center-left",
			marginX: 0.08,
			marginY: 0,
			baseScore: 0.95,
			reason: "左侧中部适合作为贴纸次优位置",
		},
		{
			anchor: "top-right",
			marginX: 0.08,
			marginY: 0.08,
			baseScore: 0.82,
			reason: "右上角适合轻量装饰贴纸",
		},
		{
			anchor: "top-left",
			marginX: 0.08,
			marginY: 0.08,
			baseScore: 0.78,
			reason: "左上角可避开底部字幕区",
		},
	],
};

function roundTo3(value: number): number {
	return Number(value.toFixed(3));
}

export function isSpatialAnchor(value: unknown): value is SpatialAnchor {
	return (
		typeof value === "string" &&
		(SPATIAL_ANCHORS as readonly string[]).includes(value)
	);
}

export function isSpatialLayoutTarget(
	value: unknown,
): value is SpatialLayoutTarget {
	return (
		typeof value === "string" &&
		(SPATIAL_LAYOUT_TARGETS as readonly string[]).includes(value)
	);
}

export interface SpatialObservation {
	description?: string;
	sceneType?: string;
	mood?: string;
	people?: string[];
	textOnScreen?: string[];
	changes?: string;
}

export interface SpatialLayoutSuggestion {
	target: SpatialLayoutTarget;
	anchor: SpatialAnchor;
	marginX: number;
	marginY: number;
	confidence: number;
	reason: string;
	positionElementArgs: {
		anchor: SpatialAnchor;
		marginX: number;
		marginY: number;
	};
}

export function resolveAnchorToPixels({
	anchor,
	canvasSize,
	marginX = 0,
	marginY = 0,
}: {
	anchor: SpatialAnchor;
	canvasSize: { width: number; height: number };
	marginX?: number;
	marginY?: number;
}): { x: number; y: number } {
	const vector = ANCHOR_VECTORS[anchor];
	const halfWidth = canvasSize.width / 2;
	const halfHeight = canvasSize.height / 2;

	const x = vector.x * halfWidth - vector.x * marginX * canvasSize.width;
	const y = vector.y * halfHeight - vector.y * marginY * canvasSize.height;

	return {
		x: roundTo3(x),
		y: roundTo3(y),
	};
}

function toNormalizedText(value: string): string {
	return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesAnyEnglishKeyword(text: string, keywords: string[]): boolean {
	return keywords.some((keyword) => {
		const pattern = new RegExp(`\\b${escapeRegex(keyword.toLowerCase())}\\b`, "i");
		return pattern.test(text);
	});
}

function includesAnyChineseKeyword(text: string, keywords: string[]): boolean {
	return keywords.some((keyword) => text.includes(keyword));
}

function includesAnyKeyword({
	text,
	english = [],
	chinese = [],
}: {
	text: string;
	english?: string[];
	chinese?: string[];
}): boolean {
	return (
		includesAnyEnglishKeyword(text, english) ||
		includesAnyChineseKeyword(text, chinese)
	);
}

function getCenterPenalty(anchor: SpatialAnchor): number {
	if (anchor === "center") return 0.45;
	if (
		anchor === "top-center" ||
		anchor === "bottom-center" ||
		anchor === "center-left" ||
		anchor === "center-right"
	) {
		return 0.2;
	}
	return 0;
}

function buildOccupancyProfile(
	observations: SpatialObservation[],
): SpatialOccupancyProfile {
	const mergedText = observations
		.flatMap((item) => [
			typeof item.description === "string" ? item.description : "",
			typeof item.sceneType === "string" ? item.sceneType : "",
			typeof item.mood === "string" ? item.mood : "",
			typeof item.changes === "string" ? item.changes : "",
			...(Array.isArray(item.textOnScreen) ? item.textOnScreen : []),
		])
		.join(" ")
		.trim();
	const normalizedText = toNormalizedText(mergedText);
	const peopleCount = observations.reduce((count, item) => {
		const size = Array.isArray(item.people) ? item.people.length : 0;
		return count + size;
	}, 0);
	const textOnScreenCount = observations.reduce((count, item) => {
		const size = Array.isArray(item.textOnScreen) ? item.textOnScreen.length : 0;
		return count + size;
	}, 0);

	const topOccupied = includesAnyKeyword({
		text: normalizedText,
		english: ["top", "upper", "header"],
		chinese: ["上方", "顶部", "标题"],
	});
	const bottomHint = includesAnyKeyword({
		text: normalizedText,
		english: [
			"bottom",
			"lower",
			"subtitle",
			"subtitles",
			"caption",
			"captions",
			"lower third",
			"lower-third",
		],
		chinese: ["下方", "底部", "字幕"],
	});
	const leftOccupied = includesAnyKeyword({
		text: normalizedText,
		english: ["left"],
		chinese: ["左侧", "左边"],
	});
	const rightOccupied = includesAnyKeyword({
		text: normalizedText,
		english: ["right"],
		chinese: ["右侧", "右边"],
	});
	const centerHint = includesAnyKeyword({
		text: normalizedText,
		english: ["center", "middle", "subject", "portrait", "face"],
		chinese: ["人物", "人像", "主体", "中间", "中央"],
	});
	const textDense =
		textOnScreenCount >= 2 ||
		includesAnyKeyword({
			text: normalizedText,
			english: ["text"],
			chinese: ["文字"],
		});
	const centerBusy = peopleCount > 0 || centerHint;

	return {
		topOccupied,
		bottomOccupied: bottomHint || textDense,
		leftOccupied,
		rightOccupied,
		centerBusy,
		textDense,
		peopleCount,
	};
}

function scoreCandidate({
	target,
	candidate,
	profile,
}: {
	target: SpatialLayoutTarget;
	candidate: LayoutCandidate;
	profile: SpatialOccupancyProfile;
}): number {
	let score = candidate.baseScore;

	if (candidate.anchor.startsWith("top") && profile.topOccupied) {
		score -= 0.35;
	}
	if (candidate.anchor.startsWith("bottom") && profile.bottomOccupied) {
		score -= 0.35;
	}
	if (candidate.anchor.endsWith("left") && profile.leftOccupied) {
		score -= 0.22;
	}
	if (candidate.anchor.endsWith("right") && profile.rightOccupied) {
		score -= 0.22;
	}
	if (profile.centerBusy) {
		score -= getCenterPenalty(candidate.anchor);
	}
	if (target === "logo" && profile.textDense && candidate.anchor.startsWith("top")) {
		score -= 0.08;
	}
	if (target === "sticker" && profile.peopleCount >= 2) {
		score -= getCenterPenalty(candidate.anchor) * 0.6;
	}

	return score;
}

function formatReason({
	candidate,
	profile,
}: {
	candidate: LayoutCandidate;
	profile: SpatialOccupancyProfile;
}): string {
	const constraints: string[] = [];
	if (profile.centerBusy) constraints.push("检测到主体集中在中心区域");
	if (profile.bottomOccupied) constraints.push("检测到底部已有文字或信息密集");
	if (profile.topOccupied) constraints.push("检测到顶部存在标题/叠字");
	if (constraints.length === 0) {
		return candidate.reason;
	}
	return `${candidate.reason}；${constraints.join("，")}，已自动做避让`;
}

function clampConfidence(value: number): number {
	return roundTo3(Math.max(0.55, Math.min(0.95, value)));
}

export function buildLayoutSuggestionsFromObservations(
	observations: SpatialObservation[],
): SpatialLayoutSuggestion[] {
	const profile = buildOccupancyProfile(observations);
	return SPATIAL_LAYOUT_TARGETS.map((target) => {
		const candidates = TARGET_CANDIDATES[target];
		const ranked = candidates
			.map((candidate) => ({
				candidate,
				score: scoreCandidate({ target, candidate, profile }),
			}))
			.sort((a, b) => b.score - a.score);
		const best = ranked[0];
		const secondScore = ranked[1]?.score ?? best.score - 0.3;
		const confidence = clampConfidence(0.6 + Math.max(0, best.score - secondScore));
		const marginX = roundTo3(best.candidate.marginX);
		const marginY = roundTo3(best.candidate.marginY);
		return {
			target,
			anchor: best.candidate.anchor,
			marginX,
			marginY,
			confidence,
			reason: formatReason({ candidate: best.candidate, profile }),
			positionElementArgs: {
				anchor: best.candidate.anchor,
				marginX,
				marginY,
			},
		};
	});
}
