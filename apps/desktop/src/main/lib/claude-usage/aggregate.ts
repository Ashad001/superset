/**
 * Aggregation for Claude Code usage, split from the file reader so the
 * windowing rules can be tested without touching disk.
 */

export interface UsageEntry {
	timestamp: number;
	model: string;
	project: string;
	/** Dedupe key — Claude re-writes an entry into every resumed transcript. */
	requestId: string | null;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
}

export interface UsageBucket {
	tokens: number;
	messages: number;
}

export interface ClaudeUsageSnapshot {
	/** The 5-hour rate-limit block in progress, or null when idle. */
	window:
		| (UsageBucket & {
				startedAt: number;
				resetsAt: number;
				/** Largest block ever recorded, the meter's estimated ceiling. */
				peakTokens: number;
		  })
		| null;
	/** Rolling 7 days. */
	week: UsageBucket;
	byModel: Array<{ model: string } & UsageBucket>;
	byProject: Array<{ project: string } & UsageBucket>;
}

export const WINDOW_MS = 5 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Tokens counted against a window. Cache *reads* are excluded: they run to
 * hundreds of thousands per message on a long conversation and would swamp
 * every other number on screen.
 */
function billableTokens(entry: UsageEntry): number {
	return entry.inputTokens + entry.outputTokens + entry.cacheCreationTokens;
}

function emptyBucket(): UsageBucket {
	return { tokens: 0, messages: 0 };
}

function add(bucket: UsageBucket, entry: UsageEntry): void {
	bucket.tokens += billableTokens(entry);
	bucket.messages += 1;
}

function addTo(
	map: Map<string, UsageBucket>,
	key: string,
	entry: UsageEntry,
): void {
	const bucket = map.get(key) ?? emptyBucket();
	add(bucket, entry);
	map.set(key, bucket);
}

export function dedupe(entries: UsageEntry[]): UsageEntry[] {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		if (!entry.requestId) return true;
		if (seen.has(entry.requestId)) return false;
		seen.add(entry.requestId);
		return true;
	});
}

/**
 * Split entries into 5-hour rate-limit blocks. A block opens at the first
 * entry after a gap, floored to the hour (matching how the limit window is
 * reported in Claude Code), and runs for five hours.
 */
export function splitIntoBlocks(
	entries: UsageEntry[],
): Array<{ startedAt: number; tokens: number }> {
	const blocks: Array<{ startedAt: number; tokens: number }> = [];
	let current: { startedAt: number; tokens: number } | null = null;

	for (const entry of entries) {
		if (current === null || entry.timestamp >= current.startedAt + WINDOW_MS) {
			current = {
				startedAt: Math.floor(entry.timestamp / HOUR_MS) * HOUR_MS,
				tokens: 0,
			};
			blocks.push(current);
		}
		current.tokens += billableTokens(entry);
	}

	return blocks;
}

export function aggregate(
	rawEntries: UsageEntry[],
	now: number,
): ClaudeUsageSnapshot {
	const entries = dedupe(rawEntries).sort((a, b) => a.timestamp - b.timestamp);
	if (entries.length === 0) {
		return { window: null, week: emptyBucket(), byModel: [], byProject: [] };
	}

	const blocks = splitIntoBlocks(entries);
	const peakTokens = blocks.reduce((max, b) => Math.max(max, b.tokens), 0);
	const lastBlock = blocks[blocks.length - 1];
	const isBlockLive =
		lastBlock !== undefined && now < lastBlock.startedAt + WINDOW_MS;

	const week = emptyBucket();
	const windowBucket = emptyBucket();
	const byModel = new Map<string, UsageBucket>();
	const byProject = new Map<string, UsageBucket>();
	const weekStart = now - WEEK_MS;

	for (const entry of entries) {
		if (entry.timestamp < weekStart) continue;
		add(week, entry);
		addTo(byModel, entry.model, entry);
		addTo(byProject, entry.project, entry);
		if (isBlockLive && entry.timestamp >= lastBlock.startedAt) {
			add(windowBucket, entry);
		}
	}

	const toSorted = <K extends string>(map: Map<string, UsageBucket>, key: K) =>
		Array.from(map, ([name, bucket]) => ({ [key]: name, ...bucket })).sort(
			(a, b) => b.tokens - a.tokens,
		) as Array<{ [P in K]: string } & UsageBucket>;

	return {
		window:
			isBlockLive && lastBlock
				? {
						...windowBucket,
						startedAt: lastBlock.startedAt,
						resetsAt: lastBlock.startedAt + WINDOW_MS,
						peakTokens,
					}
				: null,
		week,
		byModel: toSorted(byModel, "model"),
		byProject: toSorted(byProject, "project"),
	};
}
