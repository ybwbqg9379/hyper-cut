/**
 * Parent Media Bridge Hook
 *
 * Enables HyperCut (running inside an iframe) to request media assets
 * from the parent HyperCreator window via postMessage.
 *
 * Security:
 * - Validates event.source === window.parent (only accepts messages from parent)
 * - Validates event.origin matches the origin received during handshake
 * - Sends requests to the verified parent origin (not "*")
 *
 * Handshake:
 * - On mount, sends 'hypercut:bridge-ready' to parent
 * - Parent responds with 'hypercut:bridge-ack'
 * - `isBridgeAvailable` becomes true only after handshake success
 * - Library button should only be shown when isBridgeAvailable is true
 *
 * Usage:
 *   const { requestMedia, isRequesting, isBridgeAvailable } = useParentMediaBridge();
 *   if (isBridgeAvailable) { // show Library button }
 *   const result = await requestMedia({ accept: 'image/*,video/*' });
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** A media item received from the parent asset library. */
export interface ParentMediaItem {
	/** Publicly accessible download URL */
	url: string;
	/** Human-readable filename */
	name: string;
	/** MIME type, e.g. 'video/mp4', 'image/png' */
	mimeType: string;
}

/** Result of a media request to the parent. */
export type MediaRequestResult =
	| { ok: true; assets: ParentMediaItem[] }
	| { ok: false; reason: "cancelled" | "no-parent" | "timeout" | "no-bridge" };

/** Timeout for the parent to respond to a media request (ms). */
const RESPONSE_TIMEOUT_MS = 300_000; // 5 min -- user may be browsing the library

/** Timeout for the handshake ack (ms). */
const HANDSHAKE_TIMEOUT_MS = 3_000;

/** Interval to retry handshake (ms). */
const HANDSHAKE_RETRY_MS = 1_000;

export function useParentMediaBridge() {
	const [isRequesting, setIsRequesting] = useState(false);
	const [isBridgeAvailable, setIsBridgeAvailable] = useState(false);

	// Verified parent origin from handshake (only accept messages from this origin)
	const parentOriginRef = useRef<string | null>(null);

	const pendingRef = useRef<{
		resolve: (result: MediaRequestResult) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	} | null>(null);

	const isInIframe = typeof window !== "undefined" && window !== window.parent;

	// Listen for messages from the parent window
	useEffect(() => {
		if (!isInIframe) return;

		const handleMessage = (event: MessageEvent) => {
			// Security: only accept messages from the parent window
			if (event.source !== window.parent) return;

			const { data } = event;
			if (!data || typeof data !== "object" || typeof data.type !== "string")
				return;

			if (data.type === "hypercut:bridge-ack") {
				// Handshake successfully completed; record the verified parent origin
				parentOriginRef.current = event.origin;
				setIsBridgeAvailable(true);
				return;
			}

			// For all other messages, validate against the handshake-verified origin
			if (event.origin !== parentOriginRef.current) return;

			if (!pendingRef.current) return;

			if (data.type === "hypercut:media-selected") {
				const { resolve } = pendingRef.current;
				clearTimeout(pendingRef.current.timeoutId);
				pendingRef.current = null;
				setIsRequesting(false);
				resolve({ ok: true, assets: data.assets ?? [] });
			} else if (data.type === "hypercut:media-cancelled") {
				const { resolve } = pendingRef.current;
				clearTimeout(pendingRef.current.timeoutId);
				pendingRef.current = null;
				setIsRequesting(false);
				resolve({ ok: false, reason: "cancelled" });
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [isInIframe]);

	// Handshake: send bridge-ready to parent, retry until ack or timeout
	useEffect(() => {
		if (!isInIframe) return;

		let attempts = 0;
		const maxAttempts = Math.ceil(HANDSHAKE_TIMEOUT_MS / HANDSHAKE_RETRY_MS);

		const sendReady = () => {
			if (parentOriginRef.current) return; // Already connected
			// Send to "*" only during handshake -- we don't know the parent origin yet.
			// Parent will validate our origin before responding with bridge-ack.
			window.parent.postMessage({ type: "hypercut:bridge-ready" }, "*");
			attempts += 1;
			if (attempts >= maxAttempts) {
				clearInterval(intervalId);
			}
		};

		sendReady();
		const intervalId = setInterval(sendReady, HANDSHAKE_RETRY_MS);

		return () => clearInterval(intervalId);
	}, [isInIframe]);

	// Clean up on unmount
	useEffect(() => {
		return () => {
			if (pendingRef.current) {
				clearTimeout(pendingRef.current.timeoutId);
				pendingRef.current = null;
			}
		};
	}, []);

	const requestMedia = useCallback(
		({ accept }: { accept: string }): Promise<MediaRequestResult> => {
			// Must be running inside an iframe with a verified parent
			if (!isInIframe) {
				return Promise.resolve({ ok: false, reason: "no-parent" as const });
			}

			if (!parentOriginRef.current) {
				return Promise.resolve({ ok: false, reason: "no-bridge" as const });
			}

			// Cancel any existing pending request
			if (pendingRef.current) {
				const { resolve, timeoutId } = pendingRef.current;
				clearTimeout(timeoutId);
				resolve({ ok: false, reason: "cancelled" });
				pendingRef.current = null;
			}

			setIsRequesting(true);

			const verifiedOrigin = parentOriginRef.current;

			return new Promise<MediaRequestResult>((resolve) => {
				const timeoutId = setTimeout(() => {
					pendingRef.current = null;
					setIsRequesting(false);
					resolve({ ok: false, reason: "timeout" });
				}, RESPONSE_TIMEOUT_MS);

				pendingRef.current = { resolve, timeoutId };

				// Send request to the verified parent origin (not "*")
				window.parent.postMessage(
					{ type: "hypercut:request-media", accept },
					verifiedOrigin,
				);
			});
		},
		[isInIframe],
	);

	return { requestMedia, isRequesting, isBridgeAvailable };
}
