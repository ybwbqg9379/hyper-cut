import type { TextElement } from "@/types/timeline";

/**
 * Caption metadata types defined locally since TextElement does not
 * include a metadata field in the core timeline types.
 */
export interface CaptionMetadata {
	version: number;
	source: string;
	origin: "agent-tool" | "assets-panel" | "legacy-upgrade" | string;
	segmentIndex: number;
	language?: string;
	modelId?: string;
}

export interface TextElementMetadata {
	kind: "caption";
	caption: CaptionMetadata;
}

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

/**
 * Determine whether a text element is a caption.
 * Since TextElement does not have a metadata field in the type system,
 * detection is based on the element name prefix.
 */
export function isCaptionTextElement(element: TextElement): boolean {
	return element.name.trim().toLowerCase().startsWith(LEGACY_CAPTION_PREFIX);
}
