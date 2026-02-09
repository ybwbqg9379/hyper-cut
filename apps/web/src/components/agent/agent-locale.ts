import { useCallback, useEffect, useState } from "react";
import { useLocalStorage } from "@/hooks/storage/use-local-storage";

export type AgentLocale = "zh" | "en";

const AGENT_LOCALE_STORAGE_KEY = "hypercut.agent.ui.locale";

export function normalizeAgentLocale(locale: unknown): AgentLocale {
	if (typeof locale !== "string") return "en";
	return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function detectAgentLocaleFromNavigator(): AgentLocale {
	if (typeof navigator === "undefined") return "en";
	return normalizeAgentLocale(navigator.language);
}

export function useAgentLocale(): {
	locale: AgentLocale;
	setLocale: (locale: AgentLocale) => void;
} {
	const [storedLocale, setStoredLocale, isStorageReady] =
		useLocalStorage<AgentLocale | null>({
			key: AGENT_LOCALE_STORAGE_KEY,
			defaultValue: null,
		});
	const [locale, setLocaleState] = useState<AgentLocale>("en");

	useEffect(() => {
		if (!isStorageReady) return;
		const nextLocale =
			storedLocale === null
				? detectAgentLocaleFromNavigator()
				: normalizeAgentLocale(storedLocale);
		setLocaleState(nextLocale);
	}, [isStorageReady, storedLocale]);

	const setLocale = useCallback(
		(nextLocale: AgentLocale) => {
			const normalized = normalizeAgentLocale(nextLocale);
			setLocaleState(normalized);
			setStoredLocale({ value: normalized });
		},
		[setStoredLocale],
	);

	return { locale, setLocale };
}
