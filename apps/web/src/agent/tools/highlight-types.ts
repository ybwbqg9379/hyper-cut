export interface TranscriptSegment {
	startTime: number;
	endTime: number;
	text: string;
}

export interface TranscriptWord {
	startTime: number;
	endTime: number;
	text: string;
}

export interface TranscriptContext {
	segments: TranscriptSegment[];
	words: TranscriptWord[];
	source: "whisper" | "captions" | "mixed" | "none";
}

/** 转录文本语义分段 */
export interface TranscriptChunk {
	index: number;
	startTime: number;
	endTime: number;
	text: string;
	wordCount: number;
}

/** 规则引擎评分明细 */
export interface RuleScores {
	speakingRate: number;
	contentDensity: number;
	engagementMarkers: number;
	silenceRatio: number;
}

/** LLM 语义评分明细 */
export interface SemanticScores {
	importance: number;
	emotionalIntensity: number;
	hookPotential: number;
	standalone: number;
}

/** 视觉评分明细 */
export interface VisualScores {
	frameQuality: number;
	visualInterest: number;
	hasValidFrame: boolean;
}

/** 带评分的分段 */
export interface ScoredSegment {
	chunk: TranscriptChunk;
	ruleScores: RuleScores;
	semanticScores: SemanticScores | null;
	visualScores: VisualScores | null;
	combinedScore: number;
	rank: number;
	thumbnailDataUrl?: string;
}

/** 选中的段 */
export interface SelectedSegment {
	chunk: TranscriptChunk;
	combinedScore: number;
	reason: string;
	thumbnailDataUrl?: string;
}

/** 精华计划 */
export interface HighlightPlan {
	targetDuration: number;
	actualDuration: number;
	segments: SelectedSegment[];
	totalSegments: number;
	coveragePercent: number;
}

/** 评分权重配置 */
export interface ScoringWeights {
	rule: number;
	semantic: number;
	visual: number;
}

export interface LLMScoringDiagnostics {
	totalBlocks: number;
	failedBlocks: number;
	failedSamples: string[];
	allFailed: boolean;
}

export interface LLMScoringResult {
	scores: Map<number, SemanticScores>;
	diagnostics: LLMScoringDiagnostics;
}
