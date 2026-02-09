"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
} from "react";
import { useEditor } from "@/hooks/use-editor";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils/ui";
import { toast } from "sonner";
import { invokeAction } from "@/lib/actions";
import { applyTranscriptWordDeletion } from "@/agent/services/transcript-edit-operations";
import type { TranscriptCutSuggestion } from "@/stores/agent-ui-store";
import { useAgentUiStore } from "@/stores/agent-ui-store";
import type { AgentLocale } from "./agent-locale";
import { useTranscriptDocument } from "./hooks/use-transcript-document";
import { useTranscriptWordSelection } from "./hooks/use-transcript-word-selection";

const TRANSCRIPT_EDIT_TEXT = {
	zh: {
		toastDeleteSelectionSuccess: "已根据选中文字裁剪时间线",
		toastNoSuggestions: "没有可应用的建议",
		toastApplySuggestionsFailed: "建议应用失败，请重试",
		toastApplySuggestionsSuccess: (count: number) => `已应用 ${count} 条建议`,
		noEditableTranscript: "暂无可编辑词级转录，请先生成字幕或转录。",
		title: "文字即剪辑",
		instructions:
			"点击选词，Shift+点击范围，Delete 删除并自动 ripple；Ctrl+A 全选，Esc 清空",
		clearSelection: "清空选择",
		deleteSelection: (count: number) => `删除选中 (${count})`,
		wordCountSource: (count: number, source: string) =>
			`词数 ${count} · 来源 ${source}`,
		captionEstimatedSource: "Caption 估算",
		pendingSuggestions: (count: number) => `待审阅建议 ${count} 条`,
		estimatedSavedSeconds: (seconds: string) => `预计节省 ${seconds}s`,
		applyAccepted: "应用已接受",
		clearSuggestions: "清空建议",
		wordRange: (start: number, end: number) => `词区间 ${start}-${end}`,
		accept: "接受",
		ignore: "忽略",
		noEditableWordsInSegment: "该字幕段暂无可编辑词项",
	},
	en: {
		toastDeleteSelectionSuccess: "Timeline trimmed based on selected words",
		toastNoSuggestions: "No suggestions to apply",
		toastApplySuggestionsFailed: "Failed to apply suggestions, please retry",
		toastApplySuggestionsSuccess: (count: number) =>
			`${count} suggestions applied`,
		noEditableTranscript:
			"No editable word-level transcript yet. Generate captions or run transcription first.",
		title: "Text-Based Editing",
		instructions:
			"Click words to select, Shift+Click for range, Delete to ripple-delete, Ctrl+A select all, Esc clear.",
		clearSelection: "Clear Selection",
		deleteSelection: (count: number) => `Delete Selected (${count})`,
		wordCountSource: (count: number, source: string) =>
			`Words ${count} · Source ${source}`,
		captionEstimatedSource: "Caption Estimation",
		pendingSuggestions: (count: number) => `${count} suggestions to review`,
		estimatedSavedSeconds: (seconds: string) => `Estimated save ${seconds}s`,
		applyAccepted: "Apply Accepted",
		clearSuggestions: "Clear Suggestions",
		wordRange: (start: number, end: number) => `Word Range ${start}-${end}`,
		accept: "Accept",
		ignore: "Ignore",
		noEditableWordsInSegment: "No editable words in this caption segment",
	},
} as const;

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

interface VirtualSegmentRow {
	key: string;
	index: number;
	offsetTop: number;
	height: number;
	startWordIndex: number;
	endWordIndex: number;
	startTime: number;
	endTime: number;
}

const SEGMENT_ROW_BASE_HEIGHT = 48;
const SEGMENT_ROW_LINE_HEIGHT = 20;
const SEGMENT_ROW_WORDS_PER_LINE = 9;
const SEGMENT_OVERSCAN_PX = 640;

function lowerBoundByRowEnd(
	rows: VirtualSegmentRow[],
	targetTop: number,
): number {
	let left = 0;
	let right = rows.length;
	while (left < right) {
		const middle = Math.floor((left + right) / 2);
		const row = rows[middle];
		const rowEnd = row.offsetTop + row.height;
		if (rowEnd < targetTop) {
			left = middle + 1;
			continue;
		}
		right = middle;
	}
	return Math.max(0, Math.min(rows.length - 1, left));
}

function upperBoundByRowStart(
	rows: VirtualSegmentRow[],
	targetBottom: number,
): number {
	let left = 0;
	let right = rows.length;
	while (left < right) {
		const middle = Math.floor((left + right) / 2);
		const row = rows[middle];
		if (row.offsetTop <= targetBottom) {
			left = middle + 1;
			continue;
		}
		right = middle;
	}
	return Math.max(0, Math.min(rows.length - 1, left - 1));
}

function findActiveWordIndex({
	words,
	time,
}: {
	words: Array<{ startTime: number; endTime: number }>;
	time: number;
}): number | null {
	if (words.length === 0) return null;
	if (!Number.isFinite(time) || time <= 0) return 0;

	let left = 0;
	let right = words.length - 1;
	let candidate = 0;

	while (left <= right) {
		const middle = Math.floor((left + right) / 2);
		const word = words[middle];
		if (word.startTime <= time) {
			candidate = middle;
			left = middle + 1;
			continue;
		}
		right = middle - 1;
	}

	const candidateWord = words[candidate];
	if (time <= candidateWord.endTime) {
		return candidate;
	}

	for (
		let index = candidate + 1;
		index < words.length && words[index].startTime <= time;
		index += 1
	) {
		if (time <= words[index].endTime) {
			return index;
		}
	}

	return candidate;
}

function findRowIndexByWordIndex(
	rows: VirtualSegmentRow[],
	wordIndex: number,
): number {
	let left = 0;
	let right = rows.length - 1;
	while (left <= right) {
		const middle = Math.floor((left + right) / 2);
		const row = rows[middle];
		if (wordIndex < row.startWordIndex) {
			right = middle - 1;
			continue;
		}
		if (wordIndex > row.endWordIndex) {
			left = middle + 1;
			continue;
		}
		return middle;
	}
	return -1;
}

export function TranscriptEditView({
	locale = "zh",
}: {
	locale?: AgentLocale;
}) {
	const text = TRANSCRIPT_EDIT_TEXT[locale];
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
	const scrollAreaRef = useRef<HTMLDivElement | null>(null);
	const currentTime = editor.playback.getCurrentTime();
	const [measuredHeights, setMeasuredHeights] = useState<
		Record<string, number>
	>({});
	const [scrollMetrics, setScrollMetrics] = useState({
		scrollTop: 0,
		viewportHeight: 0,
	});

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
		return findActiveWordIndex({
			words: document.words,
			time: currentTime,
		});
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
		const container = scrollAreaRef.current;
		if (!container) return;

		let rafId = 0;
		const measure = () => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				setScrollMetrics((previous) => {
					const next = {
						scrollTop: container.scrollTop,
						viewportHeight: container.clientHeight,
					};
					if (
						Math.abs(previous.scrollTop - next.scrollTop) < 0.5 &&
						previous.viewportHeight === next.viewportHeight
					) {
						return previous;
					}
					return next;
				});
			});
		};

		measure();
		container.addEventListener("scroll", measure, { passive: true });
		window.addEventListener("resize", measure);
		return () => {
			cancelAnimationFrame(rafId);
			container.removeEventListener("scroll", measure);
			window.removeEventListener("resize", measure);
		};
	}, []);

	const virtualRows = useMemo(() => {
		if (!document) return [];
		let offsetTop = 0;
		const rows: VirtualSegmentRow[] = [];
		for (let index = 0; index < document.segments.length; index += 1) {
			const segment = document.segments[index];
			const key = `${segment.captionTrackId}:${segment.captionElementId}`;
			const wordsCount = Math.max(
				0,
				segment.wordRange[1] - segment.wordRange[0] + 1,
			);
			const estimatedHeight =
				SEGMENT_ROW_BASE_HEIGHT +
				Math.max(1, Math.ceil(wordsCount / SEGMENT_ROW_WORDS_PER_LINE)) *
					SEGMENT_ROW_LINE_HEIGHT;
			const measuredHeight = measuredHeights[key];
			const height =
				typeof measuredHeight === "number" && measuredHeight > 0
					? measuredHeight
					: estimatedHeight;
			rows.push({
				key,
				index,
				offsetTop,
				height,
				startWordIndex: segment.wordRange[0],
				endWordIndex: segment.wordRange[1],
				startTime: segment.startTime,
				endTime: segment.endTime,
			});
			offsetTop += height + 8;
		}
		return rows;
	}, [document, measuredHeights]);

	const totalVirtualHeight = useMemo(() => {
		if (virtualRows.length === 0) return 0;
		const lastRow = virtualRows[virtualRows.length - 1];
		return lastRow.offsetTop + lastRow.height;
	}, [virtualRows]);

	const visibleRange = useMemo(() => {
		if (virtualRows.length === 0) {
			return { startIndex: 0, endIndex: -1 };
		}

		const startTarget = Math.max(
			0,
			scrollMetrics.scrollTop - SEGMENT_OVERSCAN_PX,
		);
		const endTarget =
			scrollMetrics.scrollTop +
			scrollMetrics.viewportHeight +
			SEGMENT_OVERSCAN_PX;
		const startIndex = lowerBoundByRowEnd(virtualRows, startTarget);
		const endIndex = upperBoundByRowStart(virtualRows, endTarget);
		return {
			startIndex,
			endIndex: Math.max(startIndex, endIndex),
		};
	}, [scrollMetrics, virtualRows]);

	const visibleRows = useMemo(() => {
		if (visibleRange.endIndex < visibleRange.startIndex) return [];
		return virtualRows.slice(
			visibleRange.startIndex,
			visibleRange.endIndex + 1,
		);
	}, [virtualRows, visibleRange]);

	const topSpacerHeight = useMemo(() => {
		if (visibleRows.length === 0) return 0;
		return visibleRows[0]?.offsetTop ?? 0;
	}, [visibleRows]);

	const bottomSpacerHeight = useMemo(() => {
		if (visibleRows.length === 0) return 0;
		const lastVisible = visibleRows[visibleRows.length - 1];
		const renderedEnd = lastVisible.offsetTop + lastVisible.height;
		return Math.max(0, totalVirtualHeight - renderedEnd);
	}, [totalVirtualHeight, visibleRows]);

	const measureSegmentRow = useCallback(
		({ key, node }: { key: string; node: HTMLDivElement | null }) => {
			if (!node) return;
			const nextHeight = Math.ceil(node.getBoundingClientRect().height);
			if (nextHeight <= 0) return;
			setMeasuredHeights((previous) => {
				if (previous[key] === nextHeight) {
					return previous;
				}
				return { ...previous, [key]: nextHeight };
			});
		},
		[],
	);

	useEffect(() => {
		if (activeWordIndex === null) return;
		const element = wordRefMap.current.get(activeWordIndex);
		if (element) {
			element.scrollIntoView({
				block: "center",
				inline: "center",
				behavior: "smooth",
			});
			return;
		}

		const container = scrollAreaRef.current;
		if (!container || virtualRows.length === 0) return;
		const rowIndex = findRowIndexByWordIndex(virtualRows, activeWordIndex);
		if (rowIndex < 0) return;
		const activeSegmentRow = virtualRows[rowIndex];
		if (!activeSegmentRow) return;

		const targetTop = Math.max(
			0,
			activeSegmentRow.offsetTop - container.clientHeight * 0.35,
		);
		const targetBottom = targetTop + container.clientHeight;
		const rowBottom = activeSegmentRow.offsetTop + activeSegmentRow.height;
		const rowIsVisible =
			activeSegmentRow.offsetTop >= container.scrollTop &&
			rowBottom <= container.scrollTop + container.clientHeight;
		if (rowIsVisible) return;
		if (
			targetBottom <= container.scrollTop ||
			targetTop >= container.scrollTop
		) {
			container.scrollTo({
				top: targetTop,
				behavior: "smooth",
			});
		}
	}, [activeWordIndex, virtualRows]);

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
		toast.success(text.toastDeleteSelectionSuccess);
	};

	const applyAcceptedSuggestions = () => {
		if (!document) return;
		const accepted = normalizedSuggestions.filter(
			(suggestion) => suggestion.accepted,
		);
		if (accepted.length === 0) {
			toast.info(text.toastNoSuggestions);
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
			toast.error(text.toastApplySuggestionsFailed);
			return;
		}

		clearSelection();
		clearTranscriptSuggestions();
		toast.success(text.toastApplySuggestionsSuccess(accepted.length));
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
				{text.noEditableTranscript}
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
						<p className="text-xs font-medium">{text.title}</p>
						<p className="text-[11px] text-muted-foreground">
							{text.instructions}
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
							{text.clearSelection}
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-6 px-2 text-[11px]"
							onClick={handleDeleteSelection}
							disabled={selectedCount === 0}
						>
							{text.deleteSelection(selectedCount)}
						</Button>
					</div>
				</div>
				<div className="mt-1 text-[11px] text-muted-foreground">
					{text.wordCountSource(
						document.words.length,
						document.source === "whisper"
							? "Whisper"
							: text.captionEstimatedSource,
					)}
				</div>

				{normalizedSuggestions.length > 0 ? (
					<div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
						<div className="mb-2 flex items-center justify-between gap-2">
							<p className="text-[11px] font-medium text-destructive">
								{text.pendingSuggestions(normalizedSuggestions.length)}
							</p>
							<div className="flex items-center gap-1">
								<span className="text-[11px] text-muted-foreground">
									{text.estimatedSavedSeconds(estimatedSavedSeconds.toFixed(1))}
								</span>
								<Button
									size="sm"
									className="h-6 px-2 text-[11px]"
									onClick={applyAcceptedSuggestions}
								>
									{text.applyAccepted}
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="h-6 px-2 text-[11px]"
									onClick={() => clearTranscriptSuggestions()}
								>
									{text.clearSuggestions}
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
											{text.wordRange(
												suggestion.startWordIndex,
												suggestion.endWordIndex,
											)}
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
											{text.accept}
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
											{text.ignore}
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

			<ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1">
				<div
					className="p-3"
					style={{
						minHeight: `${Math.max(totalVirtualHeight, scrollMetrics.viewportHeight)}px`,
					}}
				>
					{topSpacerHeight > 0 ? (
						<div
							style={{ height: `${topSpacerHeight}px` }}
							aria-hidden="true"
						/>
					) : null}
					{visibleRows.map((row) => {
						const segment = document.segments[row.index];
						if (!segment) return null;
						const hasWords = segment.wordRange[1] >= segment.wordRange[0];
						return (
							<div
								key={row.key}
								ref={(node) => measureSegmentRow({ key: row.key, node })}
								className="mb-2 rounded-md border border-border p-2 last:mb-0"
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
										{text.noEditableWordsInSegment}
									</div>
								)}
							</div>
						);
					})}
					{bottomSpacerHeight > 0 ? (
						<div
							style={{ height: `${bottomSpacerHeight}px` }}
							aria-hidden="true"
						/>
					) : null}
				</div>
			</ScrollArea>
		</div>
	);
}

export default TranscriptEditView;
