export interface EncodedJpegFrame {
	dataUrl: string;
	base64: string;
	width: number;
	height: number;
}

function isHTMLCanvasElement(
	canvas: HTMLCanvasElement | OffscreenCanvas,
): canvas is HTMLCanvasElement {
	return (
		typeof HTMLCanvasElement !== "undefined" &&
		canvas instanceof HTMLCanvasElement
	);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			const result = reader.result;
			if (typeof result === "string") {
				resolve(result);
				return;
			}
			reject(new Error("Failed to convert blob to data URL"));
		});
		reader.addEventListener("error", () => {
			reject(reader.error ?? new Error("Failed to read blob"));
		});
		reader.readAsDataURL(blob);
	});
}

export function extractBase64FromDataUrl(dataUrl: string): string {
	const base64Marker = ";base64,";
	const markerIndex = dataUrl.indexOf(base64Marker);
	if (markerIndex < 0) {
		throw new Error("Invalid data URL: missing base64 marker");
	}
	return dataUrl.slice(markerIndex + base64Marker.length);
}

export async function canvasToJpegDataUrl({
	canvas,
	quality = 0.8,
}: {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	quality?: number;
}): Promise<string> {
	if (isHTMLCanvasElement(canvas)) {
		return canvas.toDataURL("image/jpeg", quality);
	}

	if (typeof canvas.convertToBlob === "function") {
		const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
		return blobToDataUrl(blob);
	}

	if ("toDataURL" in canvas && typeof canvas.toDataURL === "function") {
		return canvas.toDataURL("image/jpeg", quality);
	}

	throw new Error("Canvas does not support JPEG encoding");
}

export async function encodeCanvasAsJpeg({
	canvas,
	quality = 0.8,
}: {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	quality?: number;
}): Promise<EncodedJpegFrame> {
	const dataUrl = await canvasToJpegDataUrl({ canvas, quality });
	return {
		dataUrl,
		base64: extractBase64FromDataUrl(dataUrl),
		width: canvas.width,
		height: canvas.height,
	};
}
