"use client";

import { Suspense } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
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
	const [status, setStatus] = useState("Creating project...");
	const [error, setError] = useState<string | null>(null);
	const hasStarted = useRef(false);

	useEffect(() => {
		if (hasStarted.current) return;
		hasStarted.current = true;

		const videoUrls = searchParams.getAll("video");
		const projectName = searchParams.get("name") || "Imported Project";

		async function createAndRedirect() {
			try {
				// Step 1: Create new project
				const projectId = await editor.project.createNewProject({
					name: projectName,
				});

				// Step 2: Import videos if any were provided
				if (videoUrls.length > 0) {
					setStatus(
						`Downloading ${videoUrls.length} video${videoUrls.length > 1 ? "s" : ""}...`,
					);

					// Fetch remote URLs as local File objects
					const fetchResults = await Promise.allSettled(
						videoUrls.map((url, index) => fetchVideoAsFile(url, index)),
					);

					const files = fetchResults
						.filter(
							(r): r is PromiseFulfilledResult<File> =>
								r.status === "fulfilled",
						)
						.map((r) => r.value);

					if (files.length > 0) {
						setStatus(
							`Processing ${files.length} video${files.length > 1 ? "s" : ""}...`,
						);

						// Use the same pipeline as the file picker (generates thumbnails + metadata)
						const processedAssets = await processMediaAssets({
							files,
							onProgress: ({ progress }) => {
								setStatus(
									`Processing videos... ${progress}%`,
								);
							},
						});

						// Add processed assets to the project
						for (const asset of processedAssets) {
							await editor.media.addMediaAsset({
								projectId,
								asset,
							});
						}
					}

					const failures = fetchResults.filter(
						(r) => r.status === "rejected",
					);
					if (failures.length > 0) {
						console.warn(
							`${failures.length} of ${videoUrls.length} videos failed to download`,
						);
					}
				}

				// Step 3: Navigate to the editor
				router.replace(`/editor/${projectId}`);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to create project",
				);
			}
		}

		createAndRedirect();
	}, [editor, router, searchParams]);

	if (error) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive text-sm">{error}</p>
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground text-sm underline"
						onClick={() => router.push("/projects")}
					>
						Go to Projects
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="bg-background flex h-screen w-screen items-center justify-center">
			<div className="flex flex-col items-center gap-4">
				<Loader2 className="text-muted-foreground size-8 animate-spin" />
				<p className="text-muted-foreground text-sm">{status}</p>
			</div>
		</div>
	);
}

export default function NewEditorPage() {
	return (
		<Suspense
			fallback={
				<div className="bg-background flex h-screen w-screen items-center justify-center">
					<div className="flex flex-col items-center gap-4">
						<Loader2 className="text-muted-foreground size-8 animate-spin" />
						<p className="text-muted-foreground text-sm">Loading...</p>
					</div>
				</div>
			}
		>
			<NewEditorPageContent />
		</Suspense>
	);
}
