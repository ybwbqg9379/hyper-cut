"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { useEditor } from "@/hooks/use-editor";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils/ui";
import { toast } from "sonner";
import { invokeAction } from "@/lib/actions";
import { applyTranscriptWordDeletion } from "@/agent/services/transcript-edit-operations";
import type { TranscriptCutSuggestion } from "@/stores/agent-ui-store";
import { useAgentUiStore } from "@/stores/agent-ui-store";
import { useTranscriptDocument } from "./hooks/use-transcript-document";
import { useTranscriptWordSelection } from "./hooks/use-transcript-word-selection";

function formatTime(seconds: number): string {
	const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
	const minutes = Math.floor(safe / 60);
	const sec = Math.floor(safe % 60);
	const ms = Math.round((safe % 1) * 100);
	return `${minutes}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function clampSuggestion(
	suggestion: TranscriptCutSuggestion,
	wordsLength: number,
): TranscriptCutSuggestion | null {
	if (wordsLength <= 0) return null;
	const startWordIndex = Math.max(
		0,
		Math.min(wordsLength - 1, suggestion.startWordIndex),
	);
	const endWordIndex = Math.max(
		0,
		Math.min(wordsLength - 1, suggestion.endWordIndex),
	);
	if (!Number.isInteger(startWordIndex) || !Number.isInteger(endWordIndex)) {
		return null;
	}
	if (endWordIndex < startWordIndex) return null;
	return {
		...suggestion,
		startWordIndex,
		endWordIndex,
	};
}

export function TranscriptEditView() {
	const editor = useEditor();
	const document = useTranscriptDocument();
	const pendingSuggestions = useAgentUiStore(
		(state) => state.transcriptEditing.pendingSuggestions,
	);
	const clearTranscriptSuggestions = useAgentUiStore(
		(state) => state.clearTranscriptSuggestions,
	);
	const updateTranscriptSuggestionDecision = useAgentUiStore(
		(state) => state.updateTranscriptSuggestionDecision,
	);
	const setSelectedTranscriptWordIndices = useAgentUiStore(
		(state) => state.setSelectedTranscriptWordIndices,
	);

	const {
		selectedCount,
		isWordSelected,
		selectWord,
		selectAllWords,
		clearSelection,
		deleteSelection,
	} = useTranscriptWordSelection({ document });

	const keyboardRef = useRef<HTMLTextAreaElement | null>(null);
	const wordRefMap = useRef<Map<number, HTMLButtonElement>>(new Map());
	const currentTime = editor.playback.getCurrentTime();

	const normalizedSuggestions = useMemo(() => {
		if (!document || !pendingSuggestions || pendingSuggestions.length === 0) {
			return [];
		}
		return pendingSuggestions
			.map((suggestion) => clampSuggestion(suggestion, document.words.length))
			.filter(
				(suggestion): suggestion is TranscriptCutSuggestion =>
					suggestion !== null,
			);
	}, [document, pendingSuggestions]);

	const suggestionByWordIndex = useMemo(() => {
		const map = new Map<
			number,
			{
				id: string;
				reason: string;
				accepted: boolean;
			}
		>();
		for (const suggestion of normalizedSuggestions) {
			for (
				let wordIndex = suggestion.startWordIndex;
				wordIndex <= suggestion.endWordIndex;
				wordIndex += 1
			) {
				map.set(wordIndex, {
					id: suggestion.id,
					reason: suggestion.reason,
					accepted: suggestion.accepted,
				});
			}
		}
		return map;
	}, [normalizedSuggestions]);

	const activeWordIndex = useMemo(() => {
		if (!document || document.words.length === 0) return null;
		const words = document.words;
		for (let index = 0; index < words.length; index += 1) {
			const word = words[index];
			if (currentTime >= word.startTime && currentTime <= word.endTime) {
				return index;
			}
		}
		for (let index = words.length - 1; index >= 0; index -= 1) {
			if (words[index].startTime <= currentTime) {
				return index;
			}
		}
		return 0;
	}, [currentTime, document]);

	const estimatedSavedSeconds = useMemo(() => {
		if (!document || normalizedSuggestions.length === 0) return 0;
		return normalizedSuggestions
			.filter((suggestion) => suggestion.accepted)
			.reduce((sum, suggestion) => {
				if (
					typeof suggestion.estimatedDurationSeconds === "number" &&
					Number.isFinite(suggestion.estimatedDurationSeconds)
				) {
					return sum + Math.max(0, suggestion.estimatedDurationSeconds);
				}
				const startWord = document.words[suggestion.startWordIndex];
				const endWord = document.words[suggestion.endWordIndex];
				if (!startWord || !endWord) return sum;
				return sum + Math.max(0, endWord.endTime - startWord.startTime);
			}, 0);
	}, [document, normalizedSuggestions]);

	useEffect(() => {
		keyboardRef.current?.focus();
	}, []);

	useEffect(() => {
		if (activeWordIndex === null) return;
		const element = wordRefMap.current.get(activeWordIndex);
		element?.scrollIntoView({
			block: "center",
			inline: "center",
			behavior: "smooth",
		});
	}, [activeWordIndex]);

	const focusWord = (wordIndex: number) => {
		if (!document) return;
		const word = document.words[wordIndex];
		if (!word) return;
		editor.playback.seek({ time: word.startTime });
		editor.selection.setSelectedElements({
			elements: [
				{
					trackId: word.captionTrackId,
					elementId: word.captionElementId,
				},
			],
		});
	};

	const handleDeleteSelection = () => {
		const result = deleteSelection();
		if (!result.success) return;
		toast.success("已根据选中文字裁剪时间线");
	};

	const applyAcceptedSuggestions = () => {
		if (!document) return;
		const accepted = normalizedSuggestions.filter(
			(suggestion) => suggestion.accepted,
		);
		if (accepted.length === 0) {
			toast.info("没有可应用的建议");
			return;
		}

		const words = new Map<number, (typeof document.words)[number]>();
		for (const suggestion of accepted) {
			for (
				let wordIndex = suggestion.startWordIndex;
				wordIndex <= suggestion.endWordIndex;
				wordIndex += 1
			) {
				const word = document.words[wordIndex];
				if (word) {
					words.set(wordIndex, word);
				}
			}
		}

		const result = applyTranscriptWordDeletion({
			editor,
			wordsToDelete: [...words.values()],
		});
		if (!result.success) {
			toast.error("建议应用失败，请重试");
			return;
		}

		clearSelection();
		clearTranscriptSuggestions();
		toast.success(`已应用 ${accepted.length} 条建议`);
	};

	const handleKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		const isMeta = event.metaKey || event.ctrlKey;
		if (isMeta && event.key.toLowerCase() === "a") {
			event.preventDefault();
			selectAllWords();
			return;
		}
		if (isMeta && event.key.toLowerCase() === "z") {
			event.preventDefault();
			if (event.shiftKey) {
				invokeAction("redo");
				return;
			}
			invokeAction("undo");
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			clearSelection();
			return;
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			handleDeleteSelection();
		}
	};

	if (!document || document.words.length === 0) {
		return (
			<div className="p-3 text-xs text-muted-foreground">
				暂无可编辑词级转录，请先生成字幕或转录。
			</div>
		);
	}

	return (
		<div
			className="flex h-full min-h-0 flex-col"
			data-transcript-edit-view="true"
		>
			<div className="border-b border-border px-3 py-2">
				<div className="flex items-center justify-between gap-2">
					<div>
						<p className="text-xs font-medium">文字即剪辑</p>
						<p className="text-[11px] text-muted-foreground">
							点击选词，Shift+点击范围，Delete 删除并自动 ripple；Ctrl+A
							全选，Esc 清空
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							className="h-6 px-2 text-[11px]"
							onClick={clearSelection}
							disabled={selectedCount === 0}
						>
							清空选择
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-6 px-2 text-[11px]"
							onClick={handleDeleteSelection}
							disabled={selectedCount === 0}
						>
							删除选中 ({selectedCount})
						</Button>
					</div>
				</div>
				<div className="mt-1 text-[11px] text-muted-foreground">
					词数 {document.words.length} · 来源{" "}
					{document.source === "whisper" ? "Whisper" : "Caption 估算"}
				</div>

				{normalizedSuggestions.length > 0 ? (
					<div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
						<div className="mb-2 flex items-center justify-between gap-2">
							<p className="text-[11px] font-medium text-destructive">
								待审阅建议 {normalizedSuggestions.length} 条
							</p>
							<div className="flex items-center gap-1">
								<span className="text-[11px] text-muted-foreground">
									预计节省 {estimatedSavedSeconds.toFixed(1)}s
								</span>
								<Button
									size="sm"
									className="h-6 px-2 text-[11px]"
									onClick={applyAcceptedSuggestions}
								>
									应用已接受
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="h-6 px-2 text-[11px]"
									onClick={() => clearTranscriptSuggestions()}
								>
									清空建议
								</Button>
							</div>
						</div>
						<div className="space-y-1">
							{normalizedSuggestions.map((suggestion, index) => (
								<div
									key={suggestion.id}
									className="flex items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1"
								>
									<button
										type="button"
										className="min-w-0 flex-1 text-left"
										onClick={() => {
											const indices = [];
											for (
												let wordIndex = suggestion.startWordIndex;
												wordIndex <= suggestion.endWordIndex;
												wordIndex += 1
											) {
												indices.push(wordIndex);
											}
											setSelectedTranscriptWordIndices({ indices });
											focusWord(suggestion.startWordIndex);
										}}
									>
										<p className="truncate text-[11px]">
											{index + 1}. {suggestion.reason}
										</p>
										<p className="text-[10px] text-muted-foreground">
											词区间 {suggestion.startWordIndex}-
											{suggestion.endWordIndex}
										</p>
									</button>
									<div className="flex items-center gap-1">
										<Button
											variant={suggestion.accepted ? "default" : "outline"}
											size="sm"
											className="h-5 px-2 text-[10px]"
											onClick={() =>
												updateTranscriptSuggestionDecision({
													id: suggestion.id,
													accepted: true,
												})
											}
										>
											接受
										</Button>
										<Button
											variant={!suggestion.accepted ? "secondary" : "outline"}
											size="sm"
											className="h-5 px-2 text-[10px]"
											onClick={() =>
												updateTranscriptSuggestionDecision({
													id: suggestion.id,
													accepted: false,
												})
											}
										>
											忽略
										</Button>
									</div>
								</div>
							))}
						</div>
					</div>
				) : null}
			</div>

			<textarea
				ref={keyboardRef}
				value=""
				onChange={() => {}}
				onKeyDown={handleKeyboard}
				className="sr-only"
			/>

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-2 p-3">
					{document.segments.map((segment) => {
						const hasWords = segment.wordRange[1] >= segment.wordRange[0];
						return (
							<div
								key={`${segment.captionTrackId}:${segment.captionElementId}`}
								className="rounded-md border border-border p-2"
							>
								<div className="mb-1 text-[11px] text-muted-foreground">
									{formatTime(segment.startTime)} -{" "}
									{formatTime(segment.endTime)}
								</div>
								{hasWords ? (
									<div className="flex flex-wrap gap-1">
										{document.words
											.slice(segment.wordRange[0], segment.wordRange[1] + 1)
											.map((word) => {
												const suggestion = suggestionByWordIndex.get(
													word.index,
												);
												const isSelected = isWordSelected(word.index);
												const isActive = activeWordIndex === word.index;
												return (
													<button
														key={`${word.index}:${word.text}:${word.startTime}`}
														type="button"
														ref={(element) => {
															if (!element) {
																wordRefMap.current.delete(word.index);
																return;
															}
															wordRefMap.current.set(word.index, element);
														}}
														onMouseDown={(event) => {
															event.preventDefault();
															keyboardRef.current?.focus();
														}}
														onClick={(event) => {
															selectWord({
																index: word.index,
																shiftKey: event.shiftKey,
																additive: event.metaKey || event.ctrlKey,
															});
															focusWord(word.index);
														}}
														title={`${formatTime(word.startTime)} - ${formatTime(
															word.endTime,
														)}${suggestion ? ` · ${suggestion.reason}` : ""}`}
														className={cn(
															"rounded border px-1.5 py-0.5 text-[11px] transition-colors",
															"border-border bg-background hover:bg-accent",
															isSelected &&
																"border-primary bg-primary/15 text-primary-foreground",
															isActive &&
																!isSelected &&
																"border-constructive/60 bg-constructive/10",
															suggestion?.accepted &&
																"border-destructive/70 bg-destructive/15 text-destructive",
															suggestion &&
																!suggestion.accepted &&
																"border-border bg-muted text-muted-foreground line-through",
														)}
													>
														{word.text}
													</button>
												);
											})}
									</div>
								) : (
									<div className="text-[11px] text-muted-foreground">
										该字幕段暂无可编辑词项
									</div>
								)}
							</div>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}

export default TranscriptEditView;
