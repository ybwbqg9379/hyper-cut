/**
 * Filler word dictionaries and configuration constants.
 *
 * Shared between:
 *   - FillerDetectorService (detection)
 *   - TranscriptAnalyzerService (content-density scoring)
 */

// ── English filler / hesitation words ────────────────────────────────────────
// Single-token fillers (used by both transcript-analyzer and filler-detector)
export const EN_FILLER_WORDS = new Set([
	"um",
	"uh",
	"like",
	"you",
	"know",
	"basically",
	"actually",
	"literally",
	"right",
	"so",
	"well",
]);

// Multi-word filler phrases (used by filler-detector's bigram matching)
// All entries must be lowercase — isEnglishFillerPhrase normalizes input via toLowerCase()
export const EN_FILLER_PHRASES = new Set([
	"you know",
	"i mean",
	"sort of",
	"kind of",
	"you see",
]);

// ── Chinese filler / hesitation words ────────────────────────────────────────
export const ZH_FILLER_WORDS: readonly string[] = [
	"嗯",
	"啊",
	"然后",
	"就是",
	"那个",
	"这个",
	"对吧",
	"反正",
	"就是说",
	"怎么说",
];

// ── Detection thresholds ─────────────────────────────────────────────────────
/** Minimum word duration in seconds to consider it a meaningful filler. */
export const MIN_FILLER_WORD_DURATION_SECONDS = 0.08;

/** Maximum gap (seconds) between two filler detections to merge them. */
export const FILLER_MERGE_GAP_SECONDS = 0.15;

/** Safety margin (seconds) added around each filler cut point. */
export const FILLER_CUT_MARGIN_SECONDS = 0.05;
