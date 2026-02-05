import type {
	CaptionMetadata,
	TextElement,
	TextElementMetadata,
} from "@/types/timeline";

const LEGACY_CAPTION_PREFIX = "caption";

export function createCaptionMetadata({
	origin,
	segmentIndex,
	language,
	modelId,
}: {
	origin: CaptionMetadata["origin"];
	segmentIndex: number;
	language?: string;
	modelId?: string;
}): TextElementMetadata {
	return {
		kind: "caption",
		caption: {
			version: 1,
			source: "whisper",
			origin,
			segmentIndex,
			...(language ? { language } : {}),
			...(modelId ? { modelId } : {}),
		},
	};
}

export function isCaptionTextElement(element: TextElement): boolean {
	if (element.metadata?.kind === "caption") {
		return true;
	}
	return element.name.trim().toLowerCase().startsWith(LEGACY_CAPTION_PREFIX);
}
