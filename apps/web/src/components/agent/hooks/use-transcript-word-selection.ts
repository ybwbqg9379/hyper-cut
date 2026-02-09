import { useCallback, useMemo, useRef } from "react";
import { useEditor } from "@/hooks/use-editor";
import type { TranscriptDocument } from "@/agent/services/transcript-document";
import { applyTranscriptWordDeletion } from "@/agent/services/transcript-edit-operations";
import { useAgentUiStore } from "@/stores/agent-ui-store";

export function useTranscriptWordSelection({
	document,
}: {
	document: TranscriptDocument | null;
}) {
	const editor = useEditor();
	const selectedWordIndices = useAgentUiStore(
		(state) => state.transcriptEditing.selectedWordIndices,
	);
	const setSelectedTranscriptWordIndices = useAgentUiStore(
		(state) => state.setSelectedTranscriptWordIndices,
	);
	const clearSelectedTranscriptWordIndices = useAgentUiStore(
		(state) => state.clearSelectedTranscriptWordIndices,
	);
	const clearTranscriptSuggestions = useAgentUiStore(
		(state) => state.clearTranscriptSuggestions,
	);
	const anchorRef = useRef<number | null>(null);

	const selectedIndicesSorted = useMemo(
		() => [...selectedWordIndices].sort((left, right) => left - right),
		[selectedWordIndices],
	);

	const selectedWords = useMemo(() => {
		if (!document || selectedIndicesSorted.length === 0) return [];
		return selectedIndicesSorted
			.map((index) => document.words[index])
			.filter((word) => word !== undefined);
	}, [document, selectedIndicesSorted]);

	const isWordSelected = useCallback(
		(index: number) => selectedWordIndices.has(index),
		[selectedWordIndices],
	);

	const clearSelection = useCallback(() => {
		anchorRef.current = null;
		clearSelectedTranscriptWordIndices();
	}, [clearSelectedTranscriptWordIndices]);

	const selectAllWords = useCallback(() => {
		if (!document || document.words.length === 0) return;
		setSelectedTranscriptWordIndices({
			indices: document.words.map((word) => word.index),
		});
		anchorRef.current = document.words[0]?.index ?? null;
	}, [document, setSelectedTranscriptWordIndices]);

	const selectWord = useCallback(
		({
			index,
			shiftKey,
			additive,
		}: {
			index: number;
			shiftKey: boolean;
			additive: boolean;
		}) => {
			if (!document) return;
			if (index < 0 || index >= document.words.length) return;

			if (shiftKey && anchorRef.current !== null) {
				const start = Math.min(anchorRef.current, index);
				const end = Math.max(anchorRef.current, index);
				const range = [];
				for (let value = start; value <= end; value += 1) {
					range.push(value);
				}
				setSelectedTranscriptWordIndices({ indices: range });
				return;
			}

			if (additive) {
				const next = new Set(selectedWordIndices);
				if (next.has(index)) {
					next.delete(index);
				} else {
					next.add(index);
				}
				setSelectedTranscriptWordIndices({ indices: next });
				anchorRef.current = index;
				return;
			}

			setSelectedTranscriptWordIndices({ indices: [index] });
			anchorRef.current = index;
		},
		[document, selectedWordIndices, setSelectedTranscriptWordIndices],
	);

	const deleteSelection = useCallback(() => {
		if (selectedWords.length === 0) {
			return {
				success: false,
				diff: null,
			};
		}
		const result = applyTranscriptWordDeletion({
			editor,
			wordsToDelete: selectedWords,
		});
		if (result.success) {
			anchorRef.current = null;
			clearSelectedTranscriptWordIndices();
			clearTranscriptSuggestions();
		}
		return {
			success: result.success,
			diff: result.diff,
		};
	}, [
		clearSelectedTranscriptWordIndices,
		clearTranscriptSuggestions,
		editor,
		selectedWords,
	]);

	return {
		selectedWordIndices,
		selectedIndicesSorted,
		selectedWords,
		selectedCount: selectedWordIndices.size,
		isWordSelected,
		selectWord,
		selectAllWords,
		clearSelection,
		deleteSelection,
	};
}
