import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
	aggregate,
	type ClaudeUsageSnapshot,
	type UsageEntry,
	WEEK_MS,
} from "./aggregate";

// Claude Code appends one JSON object per line to
// ~/.claude/projects/<slugified-cwd>/<session>.jsonl, and every assistant
// message carries its own token usage. Reading those files is the only way to
// get usage without an API key, and it works offline.
const PROJECTS_DIR = path.join(homedir(), ".claude", "projects");

function parseLine(line: string, fallbackProject: string): UsageEntry | null {
	if (!line.includes('"usage"')) return null;
	try {
		const record = JSON.parse(line);
		const usage = record?.message?.usage;
		if (!usage) return null;
		const timestamp = Date.parse(record.timestamp);
		if (Number.isNaN(timestamp)) return null;
		return {
			timestamp,
			model: record.message.model ?? "unknown",
			// The record carries the real cwd. The directory name can't be used:
			// it's the path with separators replaced by dashes, so a project whose
			// own name contains one is indistinguishable from a path segment.
			project: record.cwd ? path.basename(record.cwd) : fallbackProject,
			requestId: record.requestId ?? record.message?.id ?? null,
			inputTokens: usage.input_tokens ?? 0,
			outputTokens: usage.output_tokens ?? 0,
			cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
			cacheReadTokens: usage.cache_read_input_tokens ?? 0,
		};
	} catch {
		// A transcript being written to can end mid-line; skip it.
		return null;
	}
}

function readEntries(since: number): UsageEntry[] {
	let projectDirs: fs.Dirent[];
	try {
		projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
	} catch {
		// No Claude Code on this machine.
		return [];
	}

	const entries: UsageEntry[] = [];
	for (const dir of projectDirs) {
		if (!dir.isDirectory()) continue;
		const dirPath = path.join(PROJECTS_DIR, dir.name);
		let files: string[];
		try {
			files = fs.readdirSync(dirPath);
		} catch {
			continue;
		}

		for (const file of files) {
			if (!file.endsWith(".jsonl")) continue;
			const filePath = path.join(dirPath, file);
			try {
				// Transcripts are append-only, so a file untouched since the cutoff
				// can't hold an entry inside the window. Skipping on mtime keeps a
				// months-old history from being parsed on every open.
				if (fs.statSync(filePath).mtimeMs < since) continue;
				const contents = fs.readFileSync(filePath, "utf8");
				for (const line of contents.split("\n")) {
					const entry = parseLine(line, dir.name);
					if (entry && entry.timestamp >= since) entries.push(entry);
				}
			} catch {
				// Unreadable or deleted mid-scan; the rest of the data still stands.
			}
		}
	}
	return entries;
}

// Scanning a week of transcripts takes ~1s on a heavy history, and it runs on
// the main thread. The panel polls while open, so serve a recent scan instead
// of repeating it — usage doesn't move fast enough to notice.
const CACHE_TTL_MS = 60_000;
let cached: { at: number; snapshot: ClaudeUsageSnapshot } | null = null;

/**
 * Usage for the last 7 days, bucketed into the current 5-hour rate-limit
 * window plus weekly / per-model / per-project totals.
 */
export function collectClaudeUsage(now = Date.now()): ClaudeUsageSnapshot {
	if (cached && now - cached.at < CACHE_TTL_MS) return cached.snapshot;
	const snapshot = aggregate(readEntries(now - WEEK_MS), now);
	cached = { at: now, snapshot };
	return snapshot;
}
