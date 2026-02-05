export async function mapWithConcurrency<T, R>({
	items,
	worker,
	limit,
}: {
	items: T[];
	worker: (item: T, index: number) => Promise<R>;
	limit: number;
}): Promise<R[]> {
	if (items.length === 0) return [];
	const results = new Array<R>(items.length);
	let cursor = 0;

	async function consume(): Promise<void> {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await worker(items[index], index);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => consume()),
	);
	return results;
}
