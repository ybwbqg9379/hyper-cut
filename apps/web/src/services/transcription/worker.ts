import {
	pipeline,
	type AutomaticSpeechRecognitionPipeline,
	type AutomaticSpeechRecognitionOutput,
} from "@huggingface/transformers";
import type { TranscriptionSegment, TranscriptionWord } from "@/types/transcription";
import {
	DEFAULT_CHUNK_LENGTH_SECONDS,
	DEFAULT_STRIDE_SECONDS,
} from "@/constants/transcription-constants";

export type WorkerMessage =
	| { type: "init"; modelId: string }
	| { type: "transcribe"; audio: Float32Array; language: string }
	| { type: "cancel" };

export type WorkerResponse =
	| { type: "init-progress"; progress: number }
	| { type: "init-complete" }
	| { type: "init-error"; error: string }
	| { type: "transcribe-progress"; progress: number }
	| {
			type: "transcribe-complete";
			text: string;
			segments: TranscriptionSegment[];
			words: TranscriptionWord[];
	  }
	| { type: "transcribe-error"; error: string }
	| { type: "cancelled" };

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let cancelled = false;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	switch (message.type) {
		case "init":
			await handleInit({ modelId: message.modelId });
			break;
		case "transcribe":
			await handleTranscribe({
				audio: message.audio,
				language: message.language,
			});
			break;
		case "cancel":
			cancelled = true;
			self.postMessage({ type: "cancelled" } satisfies WorkerResponse);
			break;
	}
};

async function handleInit({ modelId }: { modelId: string }) {
	lastReportedProgress = -1;
	fileBytes.clear();

	try {
		transcriber = (await pipeline("automatic-speech-recognition", modelId, {
			dtype: "q4",
			device: "auto",
			progress_callback: (progressInfo: {
				status?: string;
				file?: string;
				loaded?: number;
				total?: number;
			}) => {
				const file = progressInfo.file;
				if (!file) return;

				const loaded = progressInfo.loaded ?? 0;
				const total = progressInfo.total ?? 0;

				if (progressInfo.status === "progress" && total > 0) {
					fileBytes.set(file, { loaded, total });
				} else if (progressInfo.status === "done") {
					const existing = fileBytes.get(file);
					if (existing) {
						fileBytes.set(file, {
							loaded: existing.total,
							total: existing.total,
						});
					}
				}

				// sum all bytes
				let totalLoaded = 0;
				let totalSize = 0;
				for (const { loaded, total } of fileBytes.values()) {
					totalLoaded += loaded;
					totalSize += total;
				}

				if (totalSize === 0) return;

				const overallProgress = (totalLoaded / totalSize) * 100;
				const roundedProgress = Math.floor(overallProgress);

				if (roundedProgress !== lastReportedProgress) {
					lastReportedProgress = roundedProgress;
					self.postMessage({
						type: "init-progress",
						progress: roundedProgress,
					} satisfies WorkerResponse);
				}
			},
		})) as unknown as AutomaticSpeechRecognitionPipeline;

		self.postMessage({ type: "init-complete" } satisfies WorkerResponse);
	} catch (error) {
		self.postMessage({
			type: "init-error",
			error: error instanceof Error ? error.message : "Failed to load model",
		} satisfies WorkerResponse);
	}
}

async function handleTranscribe({
	audio,
	language,
}: {
	audio: Float32Array;
	language: string;
}) {
	if (!transcriber) {
		self.postMessage({
			type: "transcribe-error",
			error: "Model not initialized",
		} satisfies WorkerResponse);
		return;
	}

	cancelled = false;

	try {
		const result = await runTranscription({
			audio,
			language,
		});

		if (cancelled) return;

		let segments = buildSegmentsFromChunks(result);
		const words = buildWordsFromChunks(result);
		if (segments.length === 0 && words.length > 0) {
			segments = buildSegmentsFromWords(words);
		}

		self.postMessage({
			type: "transcribe-complete",
			text: result.text,
			segments,
			words,
		} satisfies WorkerResponse);
	} catch (error) {
		if (cancelled) return;
		self.postMessage({
			type: "transcribe-error",
			error: error instanceof Error ? error.message : "Transcription failed",
		} satisfies WorkerResponse);
	}
}

async function runTranscription({
	audio,
	language,
}: {
	audio: Float32Array;
	language: string;
}): Promise<AutomaticSpeechRecognitionOutput> {
	try {
		return await runTranscriptionWithTimestamps({
			audio,
			language,
			returnTimestamps: "word",
		});
	} catch (error) {
		console.warn("Word-level timestamps unavailable, fallback to segment timestamps", error);
		return runTranscriptionWithTimestamps({
			audio,
			language,
			returnTimestamps: true,
		});
	}
}

async function runTranscriptionWithTimestamps({
	audio,
	language,
	returnTimestamps,
}: {
	audio: Float32Array;
	language: string;
	returnTimestamps: boolean | "word";
}): Promise<AutomaticSpeechRecognitionOutput> {
	if (!transcriber) {
		throw new Error("Model not initialized");
	}

	const rawResult = await transcriber(audio, {
		chunk_length_s: DEFAULT_CHUNK_LENGTH_SECONDS,
		stride_length_s: DEFAULT_STRIDE_SECONDS,
		language: language === "auto" ? undefined : language,
		return_timestamps: returnTimestamps,
	});

	return Array.isArray(rawResult) ? rawResult[0] : rawResult;
}

function normalizeChunkText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function splitChunkToTokens(text: string): string[] {
	const normalized = normalizeChunkText(text);
	if (!normalized) return [];
	return normalized.split(" ").filter(Boolean);
}

function buildWordsFromChunks(result: AutomaticSpeechRecognitionOutput): TranscriptionWord[] {
	const words: TranscriptionWord[] = [];
	const chunks = result.chunks ?? [];

	for (const chunk of chunks) {
		const [rawStart, rawEnd] = chunk.timestamp;
		const start = Number.isFinite(rawStart) ? rawStart : 0;
		const end = Number.isFinite(rawEnd) ? rawEnd : start;
		const tokens = splitChunkToTokens(chunk.text);
		if (tokens.length === 0) {
			continue;
		}

		if (tokens.length === 1) {
			words.push({
				text: tokens[0],
				start,
				end: Math.max(start, end),
			});
			continue;
		}

		const duration = Math.max(0, end - start);
		const tokenDuration = duration > 0 ? duration / tokens.length : 0;

		for (let i = 0; i < tokens.length; i++) {
			const tokenStart = start + tokenDuration * i;
			const tokenEnd = i === tokens.length - 1 ? end : start + tokenDuration * (i + 1);
			words.push({
				text: tokens[i],
				start: tokenStart,
				end: Math.max(tokenStart, tokenEnd),
			});
		}
	}

	return words;
}

function buildSegmentsFromChunks(result: AutomaticSpeechRecognitionOutput): TranscriptionSegment[] {
	const segments: TranscriptionSegment[] = [];
	const chunks = result.chunks ?? [];

	for (const chunk of chunks) {
		const [rawStart, rawEnd] = chunk.timestamp;
		const start = Number.isFinite(rawStart) ? rawStart : 0;
		const end = Number.isFinite(rawEnd) ? rawEnd : start;
		const text = normalizeChunkText(chunk.text);
		if (!text) {
			continue;
		}

		segments.push({
			text,
			start,
			end: Math.max(start, end),
		});
	}

	return segments;
}

function buildSegmentsFromWords(words: TranscriptionWord[]): TranscriptionSegment[] {
	if (words.length === 0) return [];

	const segments: TranscriptionSegment[] = [];
	let currentWords: TranscriptionWord[] = [];
	const GAP_BREAK_SECONDS = 0.9;
	const MAX_SEGMENT_DURATION_SECONDS = 8;

	for (const word of words) {
		if (currentWords.length === 0) {
			currentWords.push(word);
			continue;
		}

		const lastWord = currentWords[currentWords.length - 1];
		const gap = Math.max(0, word.start - lastWord.end);
		const segmentDuration = word.end - currentWords[0].start;
		const isPunctuationBreak = /[。！？.!?]$/.test(lastWord.text);

		if (
			gap > GAP_BREAK_SECONDS ||
			segmentDuration > MAX_SEGMENT_DURATION_SECONDS ||
			isPunctuationBreak
		) {
			segments.push({
				text: currentWords.map((item) => item.text).join(" "),
				start: currentWords[0].start,
				end: currentWords[currentWords.length - 1].end,
			});
			currentWords = [word];
			continue;
		}

		currentWords.push(word);
	}

	if (currentWords.length > 0) {
		segments.push({
			text: currentWords.map((item) => item.text).join(" "),
			start: currentWords[0].start,
			end: currentWords[currentWords.length - 1].end,
		});
	}

	return segments;
}
