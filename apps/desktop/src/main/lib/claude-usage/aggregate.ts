/**
 * Aggregation for Claude Code usage, split from the file reader so the
 * windowing and streak rules can be tested without touching disk.
 */

export interface UsageEntry {
	timestamp: number;
	model: string;
	project: string;
	sessionId: string | null;
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

export interface DayBucket extends UsageBucket {
	/** Local-midnight start of the day. */
	startedAt: number;
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
	/** Since local midnight. */
	today: UsageBucket;
	/** Rolling 7 days. */
	week: UsageBucket;
	/** Everything scanned, however far back that reaches. */
	total: UsageBucket & {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		sessions: number;
	};
	/** One entry per day with activity, oldest first. */
	daily: DayBucket[];
	streak: { current: number; longest: number; activeDays: number };
	favoriteModel: string | null;
	/** Local midnight of the heaviest day. */
	mostActiveDay: number | null;
	byModel: Array<{ model: string } & UsageBucket>;
	byProject: Array<{ project: string } & UsageBucket>;
	/** Oldest entry seen, so the UI can say how far back the totals reach. */
	since: number | null;
}

export const WINDOW_MS = 5 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Claude Code attributes tool plumbing and interrupted streams to a synthetic
// model with no real usage behind it; it would otherwise show as an empty row.
const SYNTHETIC_MODEL = "<synthetic>";

/**
 * Tokens counted against a window. Cache *reads* are excluded: they run to
 * hundreds of thousands per message on a long conversation and would swamp
 * every other number on screen. They appear in the all-time breakdown instead.
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
		if (entry.model === SYNTHETIC_MODEL) return false;
		if (!entry.requestId) return true;
		if (seen.has(entry.requestId)) return false;
		seen.add(entry.requestId);
		return true;
	});
}

function startOfDay(at: number): number {
	return new Date(at).setHours(0, 0, 0, 0);
}

/**
 * Consecutive active days ending today — or yesterday, since a streak
 * shouldn't die until a full day has been missed — plus the longest run seen.
 */
export function computeStreaks(
	activeDays: number[],
	now: number,
): { current: number; longest: number; activeDays: number } {
	if (activeDays.length === 0) {
		return { current: 0, longest: 0, activeDays: 0 };
	}
	const sorted = [...activeDays].sort((a, b) => a - b);
	let longest = 1;
	let run = 1;
	for (let i = 1; i < sorted.length; i++) {
		const previous = sorted[i - 1];
		const day = sorted[i];
		if (previous === undefined || day === undefined) continue;
		run = day - previous === DAY_MS ? run + 1 : 1;
		longest = Math.max(longest, run);
	}

	const today = startOfDay(now);
	const last = sorted[sorted.length - 1] ?? 0;
	const current = last === today || last === today - DAY_MS ? run : 0;
	return { current, longest, activeDays: sorted.length };
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

function emptySnapshot(): ClaudeUsageSnapshot {
	return {
		window: null,
		today: emptyBucket(),
		week: emptyBucket(),
		total: {
			tokens: 0,
			messages: 0,
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			sessions: 0,
		},
		daily: [],
		streak: { current: 0, longest: 0, activeDays: 0 },
		favoriteModel: null,
		mostActiveDay: null,
		byModel: [],
		byProject: [],
		since: null,
	};
}

export function aggregate(
	rawEntries: UsageEntry[],
	now: number,
): ClaudeUsageSnapshot {
	const entries = dedupe(rawEntries).sort((a, b) => a.timestamp - b.timestamp);
	if (entries.length === 0) return emptySnapshot();

	const blocks = splitIntoBlocks(entries);
	const peakTokens = blocks.reduce((max, b) => Math.max(max, b.tokens), 0);
	const lastBlock = blocks[blocks.length - 1];
	const isBlockLive =
		lastBlock !== undefined && now < lastBlock.startedAt + WINDOW_MS;

	const total = emptySnapshot().total;
	const week = emptyBucket();
	const today = emptyBucket();
	const windowBucket = emptyBucket();
	const byModel = new Map<string, UsageBucket>();
	const byProject = new Map<string, UsageBucket>();
	// Keyed on local midnight so days line up with the user's calendar, not UTC.
	const days = new Map<string, UsageBucket>();
	const sessions = new Set<string>();
	const weekStart = now - WEEK_MS;
	const todayStart = startOfDay(now);

	for (const entry of entries) {
		add(total, entry);
		total.inputTokens += entry.inputTokens;
		total.outputTokens += entry.outputTokens;
		total.cacheCreationTokens += entry.cacheCreationTokens;
		total.cacheReadTokens += entry.cacheReadTokens;
		if (entry.sessionId) sessions.add(entry.sessionId);

		addTo(byModel, entry.model, entry);
		addTo(byProject, entry.project, entry);
		addTo(days, String(startOfDay(entry.timestamp)), entry);

		if (entry.timestamp >= weekStart) add(week, entry);
		if (entry.timestamp >= todayStart) add(today, entry);
		if (isBlockLive && entry.timestamp >= lastBlock.startedAt) {
			add(windowBucket, entry);
		}
	}
	total.sessions = sessions.size;

	const daily: DayBucket[] = Array.from(days, ([key, bucket]) => ({
		startedAt: Number(key),
		...bucket,
	})).sort((a, b) => a.startedAt - b.startedAt);

	const toSorted = <K extends string>(map: Map<string, UsageBucket>, key: K) =>
		Array.from(map, ([name, bucket]) => ({ [key]: name, ...bucket })).sort(
			(a, b) => b.tokens - a.tokens,
		) as Array<{ [P in K]: string } & UsageBucket>;

	const rankedModels = toSorted(byModel, "model");
	const busiestDay = daily.reduce<DayBucket | null>(
		(best, day) => (best === null || day.tokens > best.tokens ? day : best),
		null,
	);

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
		today,
		week,
		total,
		daily,
		streak: computeStreaks(
			daily.map((day) => day.startedAt),
			now,
		),
		favoriteModel: rankedModels[0]?.model ?? null,
		mostActiveDay: busiestDay?.startedAt ?? null,
		byModel: rankedModels,
		byProject: toSorted(byProject, "project"),
		since: entries[0]?.timestamp ?? null,
	};
}
