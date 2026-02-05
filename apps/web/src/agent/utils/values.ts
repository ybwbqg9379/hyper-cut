export function parseEnvNumber(envVar: string | undefined): number | undefined {
	if (!envVar) return undefined;
	const value = Number(envVar);
	return Number.isFinite(value) ? value : undefined;
}

export function toNumberOrDefault(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toBooleanOrDefault(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

export function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}
