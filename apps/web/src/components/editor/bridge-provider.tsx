"use client";

import { useEffect } from "react";
import { ALLOWED_BRIDGE_ORIGINS } from "@/constants/site-constants";

export function BridgeProvider() {
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			// Validate origin
			if (!ALLOWED_BRIDGE_ORIGINS.includes(event.origin)) {
				return;
			}

			const { type } = event.data || {};

			if (!type) return;

			// Handle specific bridge messages
			switch (type) {
				case "hypercut:sync-assets":
					// Logic to sync assets from Parent
					break;
				case "hypercut:ping":
					event.source?.postMessage(
						{ type: "hypercut:pong", payload: { version: "0.4.0" } },
						{ targetOrigin: event.origin },
					);
					break;
				default:
					break;
			}
		};

		window.addEventListener("message", handleMessage);

		// Notify parent that bridge is ready
		if (window.parent !== window) {
			window.parent.postMessage({ type: "hypercut:ready" }, "*");
		}

		return () => {
			window.removeEventListener("message", handleMessage);
		};
	}, []);

	return null;
}
