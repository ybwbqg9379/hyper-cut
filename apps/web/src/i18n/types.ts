/**
 * i18n type definitions for HyperCut.
 *
 * Supported locales and the shape of translation messages
 * are defined here to allow type-safe access via useT().
 */

import type en from "./messages/en.json";

/** Supported locale codes. */
export type Locale = "en" | "zh";

/** Default locale used when no preference is detected. */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * The shape of the translation dictionary.
 * Derived from the English source file so that both language
 * files stay structurally in sync.
 */
export type Messages = typeof en;

/** Top-level namespace keys (e.g. "common", "landing", "header"). */
export type Namespace = keyof Messages;

/**
 * Build a dotted key union from the Messages type.
 * e.g. "common.cancel" | "landing.title" | ...
 */
export type MessageKey = {
	[NS in Namespace]: `${NS}.${string & keyof Messages[NS]}`;
}[Namespace];
