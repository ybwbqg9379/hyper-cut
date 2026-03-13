/**
 * HyperCut i18n public API.
 *
 * Re-exports all i18n primitives from a single entry point:
 *   import { useT, LocaleProvider } from "@/i18n";
 */

export { LocaleProvider, LocaleContext } from "./i18n-context";
export { useT } from "./use-t";
export type { Locale, Messages, MessageKey, Namespace } from "./types";
export { DEFAULT_LOCALE } from "./types";
