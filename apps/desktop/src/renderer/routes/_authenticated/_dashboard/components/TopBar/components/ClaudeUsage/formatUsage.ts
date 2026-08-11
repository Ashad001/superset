/** Compact token counts — 1.2M / 940k / 812. */
export function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1)}M`;
	}
	if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
	return String(tokens);
}

/** "2h 14m" until the window resets; "now" once it has passed. */
export function formatCountdown(resetsAt: number, now: number): string {
	const remaining = resetsAt - now;
	if (remaining <= 0) return "now";
	const hours = Math.floor(remaining / 3_600_000);
	const minutes = Math.floor((remaining % 3_600_000) / 60_000);
	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * How full the current window looks, against the heaviest window on record.
 * Anthropic doesn't publish the limit and it isn't in the transcripts, so this
 * is a self-calibrating estimate — it only means "busy compared with your own
 * heaviest session", never "% of your plan".
 */
export function windowFillRatio(tokens: number, peakTokens: number): number {
	if (peakTokens <= 0) return 0;
	return Math.min(1, tokens / peakTokens);
}

/**
 * Drop the vendor prefix and rejoin the version: claude-opus-4-8 → Opus 4.8.
 * Model ids spell the version with dashes, so a naive split reads "Opus 4 8".
 */
export function formatModel(model: string): string {
	const name = model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
	const parts = name.split("-");
	const family = parts
		.filter((part) => !/^\d+$/.test(part))
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
	const version = parts.filter((part) => /^\d+$/.test(part)).join(".");
	return version ? `${family} ${version}` : family;
}

/** "Jul 22" for the day labels. */
export function formatDay(at: number): string {
	return new Date(at).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}
