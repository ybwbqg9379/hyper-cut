"use client";

import { Suspense, useCallback } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useEditor } from "@/hooks/use-editor";
import { fetchVideoAsFile } from "@/lib/import/video-import";
import { processMediaAssets } from "@/lib/media/processing";

/**
 * /editor/new - Create a new project and optionally import videos from URL params.
 *
 * Query parameters:
 *   ?video=<url>   - One or more video URLs to import (repeatable)
 *   ?name=<string> - Optional project name
 *   ?locale=<string> - Optional locale hint (reserved for future use)
 *
 * Flow:
 *   1. Create a new project
 *   2. Fetch remote videos as local File objects
 *   3. Process files through the standard media pipeline (thumbnail generation, metadata)
 *   4. Add processed assets to the project
 *   5. Redirect to /editor/[project_id]
 *
 * Videos are stored in the browser's local storage (OPFS/IndexedDB)
 * following HyperCut's privacy-first architecture.
 */

function NewEditorPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const editor = useEditor();
	const { setTheme } = useTheme();
	const [status, setStatus] = useState("Creating project...");
	const [error, setError] = useState<string | null>(null);
	const hasStarted = useRef(false);

	const initializeProject = useCallback(async () => {
		if (hasStarted.current) return;
		hasStarted.current = true;

		// Apply theme from parent (HyperCreator) if provided
		const themeParam = searchParams.get("theme");
		if (themeParam === "light" || themeParam === "dark") {
			setTheme(themeParam);
		}

		const videoUrls = searchParams.getAll("video");
		const projectName =
			searchParams.get("name") || `Project ${new Date().toLocaleDateString()}`;

		try {
			// Step 1: Create a new project
			setStatus("Creating project...");
			const projectId = await editor.project.createNewProject({
				name: projectName,
			});

			if (!projectId) {
				setError("Failed to create project");
				return;
			}

			// Step 2: Import videos if provided
			if (videoUrls.length > 0) {
				setStatus(`Importing ${videoUrls.length} video(s)...`);

				const files: File[] = [];
				for (let i = 0; i < videoUrls.length; i++) {
					setStatus(
						`Downloading video ${i + 1} of ${videoUrls.length}...`,
					);
					try {
						const file = await fetchVideoAsFile(videoUrls[i], i);
						files.push(file);
					} catch (fetchError) {
						console.error(
							`Failed to fetch video ${i + 1}:`,
							fetchError,
						);
						// Continue with other videos even if one fails
					}
				}

				if (files.length > 0) {
					setStatus("Processing media files...");
					const processedAssets = await processMediaAssets({ files });

					setStatus("Adding media to project...");
					for (const asset of processedAssets) {
						await editor.media.addMediaAsset({ projectId, asset });
					}
				}
			}

			// Step 3: Navigate to the editor
			// Preserve embed and theme params for iframe mode
			const params = new URLSearchParams();
			const embedParam = searchParams.get("embed");
			if (embedParam === "true") params.set("embed", "true");
			if (themeParam) params.set("theme", themeParam);
			const suffix = params.toString() ? `?${params.toString()}` : "";

			router.replace(`/editor/${projectId}${suffix}`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "An unexpected error occurred";
			setError(message);
			console.error("Failed to create project and import:", err);
		}
	}, [editor, router, searchParams, setTheme]);

	useEffect(() => {
		void initializeProject();
	}, [initializeProject]);

	if (error) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
				<p className="text-destructive text-lg font-medium">
					Failed to create project
				</p>
				<p className="text-muted-foreground text-sm">{error}</p>
				<button
					type="button"
					onClick={() => router.push("/projects")}
					className="text-primary underline"
				>
					Go to Projects
				</button>
			</div>
		);
	}

	return (
		<div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
			<Loader2 className="text-muted-foreground size-8 animate-spin" />
			<p className="text-muted-foreground text-sm">{status}</p>
		</div>
	);
}

export default function NewEditorPage() {
	return (
		<Suspense
			fallback={
				<div className="flex h-screen w-screen items-center justify-center bg-background">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
				</div>
			}
		>
			<NewEditorPageContent />
		</Suspense>
	);
}
