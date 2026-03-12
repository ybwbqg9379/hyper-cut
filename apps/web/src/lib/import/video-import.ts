/**
 * Video Import Utility
 *
 * Fetches remote video URLs and converts them to local File objects
 * for use with the editor's MediaManager.
 *
 * Used by the /editor/new route to auto-import videos from HyperCreator.
 */

/**
 * Fetch a remote video URL and convert it to a File object.
 *
 * @param url - Remote video URL to fetch
 * @param index - Numeric index used for fallback naming
 * @returns File object with the video data
 */
export async function fetchVideoAsFile(
	url: string,
	index: number,
): Promise<File> {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch video: ${response.status} ${response.statusText}`,
		);
	}

	const blob = await response.blob();

	// Derive filename from URL path, or use a default
	const urlPath = new URL(url).pathname;
	const segments = urlPath.split("/").filter(Boolean);
	const lastSegment = segments[segments.length - 1] ?? "";
	const fallbackName = `video-${index + 1}.mp4`;
	const name = lastSegment.includes(".") ? lastSegment : fallbackName;

	// Ensure the blob has a video MIME type
	const mimeType = blob.type.startsWith("video/")
		? blob.type
		: "video/mp4";

	return new File([blob], name, { type: mimeType });
}

/**
 * Extract video dimensions from a File object using a temporary HTMLVideoElement.
 *
 * @param file - Video file to probe
 * @returns Object with width, height, and duration
 */
export async function probeVideoMetadata(
	file: File,
): Promise<{ width: number; height: number; duration: number }> {
	return new Promise((resolve, reject) => {
		const video = document.createElement("video");
		const objectUrl = URL.createObjectURL(file);

		video.preload = "metadata";
		video.src = objectUrl;

		video.onloadedmetadata = () => {
			const result = {
				width: video.videoWidth,
				height: video.videoHeight,
				duration: video.duration,
			};
			URL.revokeObjectURL(objectUrl);
			resolve(result);
		};

		video.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			reject(new Error(`Failed to load video metadata for ${file.name}`));
		};
	});
}
