"use client";

import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { useEditor } from "@/hooks/use-editor";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { invokeAction, hasActionHandlers } from "@/lib/actions";
import type { TextElement } from "@/types/timeline";
import type { TranscriptionWord } from "@/types/transcription";
import {
	createCaptionMetadata,
	isCaptionTextElement,
} from "@/lib/transcription/caption-metadata";
import { transcriptionService } from "@/services/transcription/service";
import { cn } from "@/utils/ui";
import { Check, Trash2, Sparkles, X, Loader2 } from "lucide-react";
import { useTranscriptEditing } from "@/hooks/use-transcript-editing";
import { useAgentUiStore } from "@/stores/agent-ui-store";
import { TranscriptEditView } from "./TranscriptEditView";

interface CaptionSegment {
	trackId: string;
	elementId: string;
	startTime: number;
	endTime: number;
	content: string;
	name: string;
	metadata?: TextElement["metadata"];
	sortIndex: number;
}

interface SegmentRange {
	segment: CaptionSegment;
	start: number;
	end: number;
}

interface WordItem {
	text: string;
	startTime: number;
	endTime: number;
	source: "whisper" | "estimated";
}

const MAX_SEGMENT_TEXT_LENGTH = 5000;

function formatTime(seconds: number): string {
	const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
	const minutes = Math.floor(safe / 60);
	const sec = Math.floor(safe % 60);
	const ms = Math.round((safe % 1) * 100);
	return `${minutes}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function buildRanges(segments: CaptionSegment[]): SegmentRange[] {
	const ranges: SegmentRange[] = [];
	let cursor = 0;
	for (const segment of segments) {
		const start = cursor;
		const end = start + segment.content.length;
		ranges.push({ segment, start, end });
		cursor = end + 1;
	}
	return ranges;
}

function splitCaptionTextToTokens(text: string): string[] {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return [];
	return normalized.split(" ").filter(Boolean);
}

function estimateWordsFromSegments(segments: CaptionSegment[]): WordItem[] {
	const words: WordItem[] = [];

	for (const segment of segments) {
		const tokens = splitCaptionTextToTokens(segment.content);
		if (tokens.length === 0) continue;

		if (tokens.length === 1) {
			words.push({
				text: tokens[0],
				startTime: segment.startTime,
				endTime: segment.endTime,
				source: "estimated",
			});
			continue;
		}

		const duration = Math.max(0, segment.endTime - segment.startTime);
		const tokenDuration = duration > 0 ? duration / tokens.length : 0;

		for (let index = 0; index < tokens.length; index++) {
			const tokenStart = segment.startTime + tokenDuration * index;
			const tokenEnd =
				index === tokens.length - 1
					? segment.endTime
					: segment.startTime + tokenDuration * (index + 1);

			words.push({
				text: tokens[index],
				startTime: tokenStart,
				endTime: Math.max(tokenStart, tokenEnd),
				source: "estimated",
			});
		}
	}

	return words;
}

function normalizeWhisperWords({
	words,
	timelineDuration,
}: {
	words: TranscriptionWord[];
	timelineDuration: number;
}): WordItem[] {
	return words
		.filter(
			(word) =>
				Number.isFinite(word.start) &&
				Number.isFinite(word.end) &&
				typeof word.text === "string" &&
				word.text.trim().length > 0,
		)
		.filter((word) => word.start <= timelineDuration + 0.5)
		.map((word) => ({
			text: word.text.trim(),
			startTime: Math.max(0, word.start),
			endTime: Math.max(word.start, word.end),
			source: "whisper" as const,
		}))
		.sort((left, right) => left.startTime - right.startTime);
}

export function TranscriptPanel() {
	const editor = useEditor();
	const tracks = editor.timeline.getTracks();
	const timelineDuration = editor.timeline.getTotalDuration();
	const selectedElements = editor.selection.getSelectedElements();
	const editModeEnabled = useAgentUiStore(
		(state) => state.transcriptEditing.editModeEnabled,
	);
	const setTranscriptEditMode = useAgentUiStore(
		(state) => state.setTranscriptEditMode,
	);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
	const [showWordLevel, setShowWordLevel] = useState(false);

	// Filler detection integration
	const {
		fillers,
		isDetecting,
		detectFillers,
		removeFillerAtRange,
		removeAllFillers,
		clearFillers,
		isFillerWord,
	} = useTranscriptEditing();

	const segments = useMemo<CaptionSegment[]>(() => {
		const items: CaptionSegment[] = [];
		for (const track of tracks) {
			if (track.type !== "text") continue;
			for (const element of track.elements) {
				if (!isCaptionTextElement(element)) continue;
				items.push({
					trackId: track.id,
					elementId: element.id,
					startTime: element.startTime,
					endTime: element.startTime + element.duration,
					content: element.content,
					name: element.name,
					metadata: element.metadata,
					sortIndex: 0,
				});
			}
		}
		return items
			.sort((a, b) => a.startTime - b.startTime)
			.map((segment, index) => ({ ...segment, sortIndex: index }));
	}, [tracks]);

	const transcriptText = useMemo(
		() => segments.map((segment) => segment.content).join("\n"),
		[segments],
	);
	const ranges = useMemo(() => buildRanges(segments), [segments]);
	const wordItems = useMemo<WordItem[]>(() => {
		const lastResult = transcriptionService.getLastResult();
		const whisperWords = normalizeWhisperWords({
			words: lastResult?.words ?? [],
			timelineDuration,
		});
		if (whisperWords.length > 0) {
			return whisperWords;
		}
		return estimateWordsFromSegments(segments);
	}, [segments, timelineDuration]);
	const hasRealWordLevel = useMemo(
		() => wordItems.some((word) => word.source === "whisper"),
		[wordItems],
	);

	useEffect(() => {
		setDrafts((prev) => {
			const next: Record<string, string> = {};
			for (const segment of segments) {
				const key = `${segment.trackId}:${segment.elementId}`;
				next[key] = prev[key] ?? segment.content;
			}
			return next;
		});

		setSaveErrors((prev) => {
			const next: Record<string, string> = {};
			for (const segment of segments) {
				const key = `${segment.trackId}:${segment.elementId}`;
				if (prev[key]) {
					next[key] = prev[key];
				}
			}
			return next;
		});
	}, [segments]);

	const selectedSet = useMemo(() => {
		return new Set(
			selectedElements.map(
				(element) => `${element.trackId}:${element.elementId}`,
			),
		);
	}, [selectedElements]);

	const focusSegment = (segment: CaptionSegment) => {
		editor.playback.seek({ time: segment.startTime });
		editor.selection.setSelectedElements({
			elements: [{ trackId: segment.trackId, elementId: segment.elementId }],
		});
	};

	const deleteSegment = (segment: CaptionSegment) => {
		editor.selection.setSelectedElements({
			elements: [{ trackId: segment.trackId, elementId: segment.elementId }],
		});
		if (hasActionHandlers("delete-selected")) {
			invokeAction("delete-selected");
			return;
		}
		editor.timeline.deleteElements({
			elements: [{ trackId: segment.trackId, elementId: segment.elementId }],
		});
	};

	const focusWord = (word: WordItem) => {
		editor.playback.seek({ time: word.startTime });
		const relatedSegment = segments.find(
			(segment) =>
				word.startTime >= segment.startTime &&
				word.startTime <= segment.endTime,
		);
		if (!relatedSegment) return;
		editor.selection.setSelectedElements({
			elements: [
				{
					trackId: relatedSegment.trackId,
					elementId: relatedSegment.elementId,
				},
			],
		});
	};

	const saveSegmentContent = (segment: CaptionSegment) => {
		const key = `${segment.trackId}:${segment.elementId}`;
		const draft = drafts[key] ?? segment.content;

		if (draft.length > MAX_SEGMENT_TEXT_LENGTH) {
			setSaveErrors((prev) => ({
				...prev,
				[key]: `文本过长，请控制在 ${MAX_SEGMENT_TEXT_LENGTH} 字符以内`,
			}));
			return;
		}
		if (draft.trim().length === 0) {
			setSaveErrors((prev) => ({
				...prev,
				[key]: "字幕内容不能为空",
			}));
			return;
		}

		const hasChanges = draft !== segment.content;
		const hasMetadata = segment.metadata?.kind === "caption";
		if (!hasChanges && hasMetadata) {
			setSaveErrors((prev) => ({ ...prev, [key]: "" }));
			return;
		}

		editor.timeline.updateTextElement({
			trackId: segment.trackId,
			elementId: segment.elementId,
			updates: {
				content: draft,
				metadata:
					segment.metadata?.kind === "caption"
						? segment.metadata
						: createCaptionMetadata({
								origin: "legacy-upgrade",
								segmentIndex: segment.sortIndex,
							}),
			},
		});

		setSaveErrors((prev) => ({ ...prev, [key]: "" }));
	};

	const handleTranscriptSelect = (
		event: SyntheticEvent<HTMLTextAreaElement>,
	) => {
		const target = event.currentTarget;
		const start = target.selectionStart ?? 0;
		const end = target.selectionEnd ?? start;

		if (start === end) {
			const hit = ranges.find(
				(item) => start >= item.start && start <= item.end,
			);
			if (!hit) return;
			focusSegment(hit.segment);
			return;
		}

		const hits = ranges.filter((item) => item.end > start && item.start < end);
		if (hits.length === 0) return;
		editor.selection.setSelectedElements({
			elements: hits.map((item) => ({
				trackId: item.segment.trackId,
				elementId: item.segment.elementId,
			})),
		});
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="px-3 py-2 border-b border-border">
				<div className="flex items-start justify-between gap-2">
					<div>
						<p className="text-xs font-medium">转录面板</p>
						<p className="text-xs text-muted-foreground">
							点击文字跳转时间线，拖选文本范围联动选中片段；下方支持逐条编辑并同步到时间线
						</p>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						<Button
							variant={editModeEnabled ? "default" : "outline"}
							size="sm"
							className="h-6 px-2 text-[11px]"
							onClick={() =>
								setTranscriptEditMode({ enabled: !editModeEnabled })
							}
						>
							{editModeEnabled ? "退出编辑" : "编辑模式"}
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-6 px-2 text-[11px]"
							onClick={() => setShowWordLevel((value) => !value)}
							disabled={wordItems.length === 0 || editModeEnabled}
						>
							{showWordLevel ? "隐藏词级" : "显示词级"}
						</Button>
						<Button
							variant={fillers.length > 0 ? "destructive" : "outline"}
							size="sm"
							className="h-6 px-2 text-[11px]"
							onClick={() => {
								if (fillers.length > 0) {
									clearFillers();
								} else {
									detectFillers();
									if (!showWordLevel) setShowWordLevel(true);
								}
							}}
							disabled={
								isDetecting || wordItems.length === 0 || editModeEnabled
							}
						>
							{isDetecting ? (
								<Loader2 className="size-3 mr-1 animate-spin" />
							) : (
								<Sparkles className="size-3 mr-1" />
							)}
							{fillers.length > 0
								? `清除标记 (${fillers.length})`
								: "检测填充词"}
						</Button>
					</div>
				</div>
				{!editModeEnabled && fillers.length > 0 && (
					<div className="mt-2 flex items-center justify-between rounded-md bg-destructive/10 px-2 py-1.5">
						<span className="text-[11px] text-destructive">
							检测到 {fillers.length} 个填充词
						</span>
						<Button
							variant="destructive"
							size="sm"
							className="h-5 px-2 text-[10px]"
							onClick={removeAllFillers}
						>
							<Trash2 className="size-3 mr-1" />
							全部删除
						</Button>
					</div>
				)}
			</div>

			{editModeEnabled ? (
				<TranscriptEditView />
			) : (
				<>
					<div className="p-3 border-b border-border">
						<textarea
							value={transcriptText}
							onSelect={handleTranscriptSelect}
							onClick={handleTranscriptSelect}
							readOnly
							placeholder="尚未找到字幕片段，请先生成 captions。"
							className={cn(
								"w-full min-h-[120px] max-h-[220px] resize-y rounded-md border border-border bg-background px-2 py-1.5",
								"text-xs leading-5",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
							)}
						/>
						{showWordLevel && (
							<div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
								<div className="mb-1 text-[11px] text-muted-foreground">
									词级时间戳
									{hasRealWordLevel
										? "（来源：Whisper）"
										: "（来源：基于字幕段估算）"}
									，hover 可查看起止时间
								</div>
								{wordItems.length === 0 ? (
									<div className="text-[11px] text-muted-foreground">
										暂无词级数据，请先执行一次转录。
									</div>
								) : (
									<div className="flex flex-wrap gap-1">
										{wordItems.map((word, index) => {
											const filler = isFillerWord(word.startTime, word.endTime);
											const fillerColor = filler
												? filler.category === "filler"
													? "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"
													: filler.category === "hesitation"
														? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
														: "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400"
												: "";
											const tooltipText = filler
												? `${filler.category} (${(filler.confidence * 100).toFixed(0)}%) · ${formatTime(word.startTime)}-${formatTime(word.endTime)} · 点击删除`
												: `${formatTime(word.startTime)} - ${formatTime(word.endTime)}`;
											return (
												<button
													key={`${word.startTime}-${word.endTime}-${word.text}-${index}`}
													type="button"
													className={cn(
														"rounded border px-1.5 py-0.5 text-[11px] transition-colors",
														filler
															? cn(
																	fillerColor,
																	"border-b-2 font-medium hover:opacity-70 cursor-pointer",
																)
															: "border-border bg-background hover:bg-accent",
													)}
													title={tooltipText}
													onClick={() => {
														if (filler) {
															removeFillerAtRange(
																filler.startTime,
																filler.endTime,
															);
														} else {
															focusWord(word);
														}
													}}
												>
													{word.text}
													{filler && (
														<X className="ml-0.5 inline-block size-2.5 opacity-60" />
													)}
												</button>
											);
										})}
									</div>
								)}
							</div>
						)}
					</div>

					<ScrollArea className="flex-1 min-h-0">
						<div className="p-3 space-y-2">
							{segments.length === 0 ? (
								<div className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
									暂无可联动的字幕片段（Caption）。
								</div>
							) : (
								segments.map((segment) => {
									const key = `${segment.trackId}:${segment.elementId}`;
									const isSelected = selectedSet.has(key);
									const draft = drafts[key] ?? segment.content;
									const hasChanges = draft !== segment.content;
									const hasMetadata = segment.metadata?.kind === "caption";
									const error = saveErrors[key];
									const canSave =
										(hasChanges || !hasMetadata) &&
										draft.trim().length > 0 &&
										draft.length <= MAX_SEGMENT_TEXT_LENGTH;
									return (
										<div
											key={key}
											className={cn(
												"rounded-md border px-2 py-2 transition-colors",
												isSelected
													? "border-primary bg-primary/10"
													: "border-border hover:bg-accent",
											)}
										>
											<button
												type="button"
												onClick={() => focusSegment(segment)}
												className="w-full text-left"
											>
												<div className="text-[11px] text-muted-foreground">
													{formatTime(segment.startTime)} -{" "}
													{formatTime(segment.endTime)}
												</div>
												<div className="mt-1 text-[11px] text-muted-foreground">
													{segment.name}
													{!hasMetadata
														? "（旧字幕，保存时将补充 metadata）"
														: ""}
												</div>
											</button>

											<div className="mt-2">
												<textarea
													value={draft}
													onChange={(event) => {
														const value = event.currentTarget.value;
														setDrafts((prev) => ({ ...prev, [key]: value }));
													}}
													className={cn(
														"w-full min-h-[56px] resize-y rounded-md border border-border bg-background px-2 py-1.5",
														"text-xs leading-5",
														"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
													)}
												/>

												{error && (
													<p className="mt-1 text-[11px] text-destructive">
														{error}
													</p>
												)}

												<div className="mt-2 flex items-center justify-end gap-1">
													<Button
														variant="text"
														size="icon"
														className="size-6 shrink-0"
														onClick={() => saveSegmentContent(segment)}
														disabled={!canSave}
														title="保存字幕修改"
													>
														<Check className="size-3.5" />
													</Button>
													<Button
														variant="text"
														size="icon"
														className="size-6 shrink-0"
														onClick={() => deleteSegment(segment)}
														title="删除该字幕片段"
													>
														<Trash2 className="size-3.5" />
													</Button>
												</div>
											</div>
										</div>
									);
								})
							)}
						</div>
					</ScrollArea>
				</>
			)}
		</div>
	);
}

export default TranscriptPanel;
