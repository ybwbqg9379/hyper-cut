"use client";

/**
 * Locale Context for HyperCut i18n.
 *
 * Reads the initial locale from:
 * 1. `?locale=` query parameter (set by HyperCreator launch)
 * 2. `navigator.language` prefix ("zh" variants -> "zh", else "en")
 * 3. Falls back to DEFAULT_LOCALE ("en")
 *
 * The resolved locale is stored in localStorage so standalone
 * access (non-iframe) remembers the preference across sessions.
 */

import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { DEFAULT_LOCALE, type Locale, type Messages } from "./types";
import en from "./messages/en.json";
import zh from "./messages/zh.json";

const LOCALE_STORAGE_KEY = "hypercut-locale";

const MESSAGES_MAP: Record<Locale, Messages> = { en, zh } as Record<
	Locale,
	Messages
>;

function isValidLocale(value: string): value is Locale {
	return value === "en" || value === "zh";
}

/**
 * Detect locale from multiple sources, in priority order.
 * Runs only on the client side.
 */
function detectLocale(): Locale {
	if (typeof window === "undefined") return DEFAULT_LOCALE;

	// 1. URL query parameter (highest priority, set by HyperCreator)
	const params = new URLSearchParams(window.location.search);
	const fromUrl = params.get("locale");
	if (fromUrl && isValidLocale(fromUrl)) return fromUrl;

	// 2. localStorage (returning user preference)
	try {
		const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
		if (stored && isValidLocale(stored)) return stored;
	} catch {
		// localStorage may be unavailable (private browsing)
	}

	// 3. Browser language
	const browserLang = navigator.language.toLowerCase();
	if (browserLang.startsWith("zh")) return "zh";

	return DEFAULT_LOCALE;
}

interface LocaleContextValue {
	/** Current active locale. */
	locale: Locale;
	/** Switch locale at runtime. */
	setLocale: (locale: Locale) => void;
	/** Current locale's translation messages. */
	messages: Messages;
}

export const LocaleContext = createContext<LocaleContextValue>({
	locale: DEFAULT_LOCALE,
	setLocale: () => {},
	messages: en as Messages,
});

/**
 * Wrap the application with LocaleProvider to enable i18n.
 * Place in layout.tsx inside any theme/tooltip providers.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

	// Detect locale on mount (client-side only)
	useEffect(() => {
		setLocaleState(detectLocale());
	}, []);

	const setLocale = useCallback((newLocale: Locale) => {
		setLocaleState(newLocale);
		try {
			localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
		} catch {
			// localStorage may be unavailable
		}
	}, []);

	const messages = useMemo(() => MESSAGES_MAP[locale], [locale]);

	const contextValue = useMemo<LocaleContextValue>(
		() => ({ locale, setLocale, messages }),
		[locale, setLocale, messages],
	);

	return (
		<LocaleContext.Provider value={contextValue}>
			{children}
		</LocaleContext.Provider>
	);
}
