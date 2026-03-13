"use client";

/**
 * Translation hook for HyperCut i18n.
 *
 * Returns a `t()` function that looks up dotted keys like
 * "common.cancel" or "exportPanel.format" from the active
 * locale's message dictionary.
 *
 * Supports simple interpolation: t("scenes.selectScenes", { count: 3 })
 * replaces {count} in the template string.
 *
 * Usage:
 *   const { t, locale, setLocale } = useT();
 *   <span>{t("common.export")}</span>
 */

import { useCallback, useContext } from "react";
import { LocaleContext } from "./i18n-context";
import type { Locale, Messages, Namespace } from "./types";

type InterpolationValues = Record<string, string | number>;

/**
 * Look up a dotted key path in the messages object.
 * e.g. "common.cancel" -> messages.common.cancel
 */
function resolveKey(messages: Messages, key: string): string {
	const [namespace, field] = key.split(".", 2);
	if (!namespace || !field) return key;

	const ns = messages[namespace as Namespace];
	if (!ns) return key;

	const value = (ns as Record<string, string>)[field];
	return value ?? key;
}

/**
 * Replace {placeholder} tokens in a string with provided values.
 */
function interpolate(
	template: string,
	values?: InterpolationValues,
): string {
	if (!values) return template;
	return template.replace(
		/\{(\w+)\}/g,
		(match, key: string) => {
			const val = values[key];
			return val !== undefined ? String(val) : match;
		},
	);
}

interface UseT {
	/** Translate a dotted key, with optional interpolation. */
	t: (key: string, values?: InterpolationValues) => string;
	/** Current active locale. */
	locale: Locale;
	/** Switch locale at runtime. */
	setLocale: (locale: Locale) => void;
}

export function useT(): UseT {
	const { locale, setLocale, messages } = useContext(LocaleContext);

	const t = useCallback(
		(key: string, values?: InterpolationValues): string => {
			const resolved = resolveKey(messages, key);
			return interpolate(resolved, values);
		},
		[messages],
	);

	return { t, locale, setLocale };
}
