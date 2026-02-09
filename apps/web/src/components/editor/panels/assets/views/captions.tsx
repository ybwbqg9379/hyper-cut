import { Button } from "@/components/ui/button";
import { PropertyGroup } from "@/components/editor/panels/properties/property-item";
import { PanelBaseView as BaseView } from "@/components/editor/panels/panel-base-view";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useState, useRef } from "react";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
import { useEditor } from "@/hooks/use-editor";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import { TRANSCRIPTION_LANGUAGES } from "@/constants/transcription-constants";
import type {
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@/types/transcription";
import { transcriptionService } from "@/services/transcription/service";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import { buildCaptionChunks } from "@/lib/transcription/caption";
import { createCaptionMetadata } from "@/lib/transcription/caption-metadata";
import { Spinner } from "@/components/ui/spinner";

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingStep, setProcessingStep] = useState("");
	const [error, setError] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const editor = useEditor();

	const handleProgress = (progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			setProcessingStep(`Loading model ${Math.round(progress.progress)}%`);
		} else if (progress.status === "transcribing") {
			setProcessingStep("Transcribing...");
		}
	};

	const handleGenerateTranscript = async () => {
		try {
			setIsProcessing(true);
			setError(null);
			setProcessingStep("Extracting audio...");

			const audioBlob = await extractTimelineAudio({
				tracks: editor.timeline.getTracks(),
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});

			setProcessingStep("Preparing audio...");
			const { samples, sampleRate } = await decodeAudioToFloat32({ audioBlob });

			const result = await transcriptionService.transcribe({
				audioData: samples,
				sampleRate,
				language: selectedLanguage === "auto" ? undefined : selectedLanguage,
				onProgress: handleProgress,
			});

			setProcessingStep("Generating captions...");
			const captionChunks = buildCaptionChunks({
				segments: result.segments,
				words: result.words,
				language:
					selectedLanguage === "auto" ? result.language : selectedLanguage,
			});

			const captionTrackId = editor.timeline.addTrack({
				type: "text",
				index: 0,
			});

			const canvasHeight =
				editor.project.getActive()?.settings.canvasSize.height ?? 1080;
			const captionYOffset = Math.round(canvasHeight * 0.4);
			const captionFontSize = Math.max(
				42,
				Math.min(72, Math.round(canvasHeight * 0.052)),
			);

			for (let i = 0; i < captionChunks.length; i++) {
				const caption = captionChunks[i];
				editor.timeline.insertElement({
					placement: { mode: "explicit", trackId: captionTrackId },
					element: {
						...DEFAULT_TEXT_ELEMENT,
						name: `Caption ${i + 1}`,
						content: caption.text,
						duration: caption.duration,
						startTime: caption.startTime,
						fontSize: captionFontSize,
						fontWeight: "bold",
						backgroundColor: "rgba(0, 0, 0, 0.45)",
						transform: {
							...DEFAULT_TEXT_ELEMENT.transform,
							position: {
								x: 0,
								y: captionYOffset,
							},
						},
						metadata: createCaptionMetadata({
							origin: "assets-panel",
							segmentIndex: i,
							language: result.language,
						}),
					},
				});
			}
		} catch (error) {
			console.error("Transcription failed:", error);
			setError(
				error instanceof Error ? error.message : "An unexpected error occurred",
			);
		} finally {
			setIsProcessing(false);
			setProcessingStep("");
		}
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	return (
		<BaseView
			ref={containerRef}
			className="flex h-full flex-col justify-between"
		>
			<PropertyGroup title="Language">
				<Select
					value={selectedLanguage}
					onValueChange={(value) => handleLanguageChange({ value })}
				>
					<SelectTrigger className="bg-panel-accent h-8 w-full text-xs">
						<SelectValue placeholder="Select a language" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="auto">Auto detect</SelectItem>
						{TRANSCRIPTION_LANGUAGES.map((language) => (
							<SelectItem key={language.code} value={language.code}>
								{language.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</PropertyGroup>

			<div className="flex flex-col gap-4">
				{error && (
					<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
						<p className="text-destructive text-sm">{error}</p>
					</div>
				)}

				<Button
					className="w-full"
					onClick={handleGenerateTranscript}
					disabled={isProcessing}
				>
					{isProcessing && <Spinner className="mr-1" />}
					{isProcessing ? processingStep : "Generate transcript"}
				</Button>
			</div>
		</BaseView>
	);
}
