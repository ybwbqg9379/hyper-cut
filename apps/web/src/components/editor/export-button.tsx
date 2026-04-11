"use client";

import { useState } from "react";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";
import {
	getExportMimeType,
	getExportFileExtension,
	downloadBuffer,
} from "@/lib/export";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportFormat,
	type ExportQuality,
} from "@/lib/export";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/hooks/use-editor";
import { DEFAULT_EXPORT_OPTIONS } from "@/constants/export-constants";

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

export function ExportButton() {
	const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const hasProject = !!activeProject;

	const handlePopoverOpenChange = ({ open }: { open: boolean }) => {
		if (!open) {
			editor.project.cancelExport();
			editor.project.clearExportState();
		}
		setIsExportPopoverOpen(open);
	};

	return (
		<Popover
			open={isExportPopoverOpen}
			onOpenChange={(open) => handlePopoverOpenChange({ open })}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"group relative flex items-center gap-2 overflow-hidden rounded-full px-5 py-1.5 transition-all duration-300 active:scale-95",
						"bg-gradient-to-r from-[#2567EC] to-[#38BDF8] hover:from-[#38BDF8] hover:to-[#2567EC]",
						"shadow-[0_4px_14px_rgba(37,103,236,0.3)] hover:shadow-[0_6px_20px_rgba(56,189,248,0.4)]",
						"hover:scale-[1.02] transform-gpu",
						!hasProject && "cursor-not-allowed opacity-50",
						"text-white",
					)}
					onClick={hasProject ? () => setIsExportPopoverOpen(true) : undefined}
					disabled={!hasProject}
				>
					<HugeiconsIcon
						icon={TransitionTopIcon}
						className="relative z-10 size-4 transition-transform duration-300 group-hover:-translate-y-1"
					/>
					<span className="relative z-10 text-[0.9rem] font-semibold tracking-wide">
						Export
					</span>
					{/* Ripple Glossy Overlay */}
					<div className="absolute inset-0 z-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
				</button>
			</PopoverTrigger>
			{hasProject && <ExportPopover onOpenChange={setIsExportPopoverOpen} />}
		</Popover>
	);
}

function ExportPopover({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const exportState = useEditor((e) => e.project.getExportState());
	const { isExporting, progress, result: exportResult } = exportState;
	const [format, setFormat] = useState<ExportFormat>(
		DEFAULT_EXPORT_OPTIONS.format,
	);
	const [quality, setQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_OPTIONS.quality,
	);
	const [shouldIncludeAudio, setShouldIncludeAudio] = useState<boolean>(
		DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	);

	const handleExport = async () => {
		if (!activeProject) return;

		const result = await editor.project.export({
			options: {
				format,
				quality,
				fps: activeProject.settings.fps,
				includeAudio: shouldIncludeAudio,
			},
		});

		if (result.cancelled) {
			editor.project.clearExportState();
			return;
		}

		if (result.success && result.buffer) {
			downloadBuffer({
				buffer: result.buffer,
				filename: `${activeProject.metadata.name}${getExportFileExtension({ format })}`,
				mimeType: getExportMimeType({ format }),
			});

			editor.project.clearExportState();
			onOpenChange(false);
		}
	};

	const handleCancel = () => {
		editor.project.cancelExport();
	};

	return (
		<PopoverContent className="bg-background mr-4 flex w-80 flex-col p-0">
			{exportResult && !exportResult.success ? (
				<ExportError
					error={exportResult.error || "Unknown error occurred"}
					onRetry={handleExport}
				/>
			) : (
				<>
					<div className="flex items-center justify-between p-3 border-b">
						<h3 className="font-medium text-sm">
							{isExporting ? "Exporting project" : "Export project"}
						</h3>
					</div>

					<div className="flex flex-col gap-0">
						{!isExporting && (
							<>
								<div className="flex flex-col">
									<Section
										collapsible
										defaultOpen={true}
										showTopBorder={false}
										className="border-none"
									>
										<SectionHeader className="py-2.5 px-4 hover:bg-accent/30 transition-colors">
											<SectionTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
												Format
											</SectionTitle>
										</SectionHeader>
										<SectionContent className="px-4 pb-4">
											<RadioGroup
												value={format}
												onValueChange={(value) => {
													if (isExportFormat(value)) {
														setFormat(value);
													}
												}}
												className="gap-3"
											>
												<div className="flex items-center space-x-3 p-2 rounded-md hover:bg-accent/20 transition-colors cursor-pointer group">
													<RadioGroupItem
														value="mp4"
														id="mp4"
														className="border-primary/50"
													/>
													<Label
														htmlFor="mp4"
														className="text-sm font-normal cursor-pointer flex-1"
													>
														MP4 (H.264)
														<span className="block text-[10px] text-muted-foreground mt-0.5">
															Better compatibility for sharing
														</span>
													</Label>
												</div>
												<div className="flex items-center space-x-3 p-2 rounded-md hover:bg-accent/20 transition-colors cursor-pointer group">
													<RadioGroupItem
														value="webm"
														id="webm"
														className="border-primary/50"
													/>
													<Label
														htmlFor="webm"
														className="text-sm font-normal cursor-pointer flex-1"
													>
														WebM (VP9)
														<span className="block text-[10px] text-muted-foreground mt-0.5">
															Optimized for web performance
														</span>
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section
										collapsible
										defaultOpen={true}
										className="border-t border-border/40"
									>
										<SectionHeader className="py-2.5 px-4 hover:bg-accent/30 transition-colors">
											<SectionTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
												Quality
											</SectionTitle>
										</SectionHeader>
										<SectionContent className="px-4 pb-4">
											<RadioGroup
												value={quality}
												onValueChange={(value) => {
													if (isExportQuality(value)) {
														setQuality(value);
													}
												}}
												className="grid grid-cols-2 gap-2"
											>
												{["low", "medium", "high", "very_high"].map((q) => (
													<div key={q} className="relative">
														<RadioGroupItem
															value={q}
															id={`q-${q}`}
															className="sr-only"
														/>
														<Label
															htmlFor={`q-${q}`}
															className={cn(
																"flex h-9 items-center justify-center rounded-md border text-xs font-medium cursor-pointer transition-all",
																quality === q
																	? "bg-primary/10 border-primary text-primary shadow-sm"
																	: "bg-transparent border-border/60 text-muted-foreground hover:border-border hover:bg-accent/30",
															)}
														>
															{q.replace("_", " ").toUpperCase()}
														</Label>
													</div>
												))}
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section
										collapsible
										defaultOpen={false}
										className="border-t border-border/40"
									>
										<SectionHeader className="py-2.5 px-4 hover:bg-accent/30 transition-colors">
											<SectionTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
												Audio
											</SectionTitle>
										</SectionHeader>
										<SectionContent className="px-4 pb-4">
											<div className="flex items-center justify-between p-2 rounded-md bg-accent/20">
												<Label
													htmlFor="include-audio"
													className="text-sm cursor-pointer"
												>
													Include audio track
												</Label>
												<Checkbox
													id="include-audio"
													checked={shouldIncludeAudio}
													onCheckedChange={(checked) =>
														setShouldIncludeAudio(!!checked)
													}
												/>
											</div>
										</SectionContent>
									</Section>
								</div>

								<div className="p-4 border-t border-border/40 bg-accent/5">
									<Button
										onClick={handleExport}
										className="w-full gap-2 h-10 bg-linear-to-r from-[#2567EC] to-[#38BDF8] hover:opacity-90 transition-opacity"
									>
										<Download className="size-4" />
										Start Rendering
									</Button>
								</div>
							</>
						)}

						{isExporting && (
							<div className="space-y-4 p-3">
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-center">
										<p className="text-muted-foreground text-sm">
											{Math.round(progress * 100)}%
										</p>
										<p className="text-muted-foreground text-sm">100%</p>
									</div>
									<Progress value={progress * 100} className="w-full" />
								</div>

								<Button
									variant="outline"
									className="w-full rounded-md"
									onClick={handleCancel}
								>
									Cancel
								</Button>
							</div>
						)}
					</div>
				</>
			)}
		</PopoverContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<div className="space-y-4 p-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-destructive text-sm font-medium">Export failed</p>
				<p className="text-muted-foreground text-xs">{error}</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					Copy
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw />
					Retry
				</Button>
			</div>
		</div>
	);
}
