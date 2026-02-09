import { useEditor } from "@/hooks/use-editor";
import { buildTranscriptDocument } from "@/agent/services/transcript-document";

export function useTranscriptDocument(options?: { skipWhisper?: boolean }) {
	const editor = useEditor();
	return buildTranscriptDocument(editor, options);
}
