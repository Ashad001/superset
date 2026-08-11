import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
	aggregate,
	type ClaudeUsageSnapshot,
	type UsageEntry,
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
			sessionId: record.sessionId ?? record.session_id ?? null,
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

// Bounds the worst case for someone with a long history; the stats say how far
// back they actually reach.
const MAX_HISTORY_MS = 90 * 24 * 60 * 60 * 1000;

// Parsing a full history is CPU-bound and runs on the main thread, so yield
// between files — a few hundred ms of blocked IPC freezes the whole window.
function yieldToLoop(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

// Transcripts only ever gain lines, so a file whose mtime and size are
// unchanged parses to exactly what it did last time. Re-reading the whole
// history costs ~8s; with this, only the session being written is re-parsed.
const fileCache = new Map<
	string,
	{ mtimeMs: number; size: number; entries: UsageEntry[] }
>();

async function readEntries(since: number): Promise<UsageEntry[]> {
	let projectDirs: fs.Dirent[];
	try {
		projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
	} catch {
		// No Claude Code on this machine.
		return [];
	}

	const entries: UsageEntry[] = [];
	const seenFiles = new Set<string>();

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
				// can't hold an entry inside the window.
				const stat = fs.statSync(filePath);
				if (stat.mtimeMs < since) continue;
				seenFiles.add(filePath);

				const memo = fileCache.get(filePath);
				if (memo?.mtimeMs === stat.mtimeMs && memo.size === stat.size) {
					entries.push(...memo.entries);
					continue;
				}

				// Sync read, then yield: async readFile measured ~7x slower across a
				// full history, and one file at a time is short enough to block on.
				const contents = fs.readFileSync(filePath, "utf8");
				const parsed: UsageEntry[] = [];
				for (const line of contents.split("\n")) {
					const entry = parseLine(line, dir.name);
					if (entry && entry.timestamp >= since) parsed.push(entry);
				}
				fileCache.set(filePath, {
					mtimeMs: stat.mtimeMs,
					size: stat.size,
					entries: parsed,
				});
				entries.push(...parsed);
			} catch {
				// Unreadable or deleted mid-scan; the rest of the data still stands.
			}
			await yieldToLoop();
		}
	}

	// Drop files that aged out of the window or were deleted, so the memo can't
	// grow without bound across a long-running app session.
	for (const key of fileCache.keys()) {
		if (!seenFiles.has(key)) fileCache.delete(key);
	}
	return entries;
}

// A rescan is cheap once fileCache is warm, so this only collapses the bursts
// from a polling panel.
const CACHE_TTL_MS = 15_000;
let cached: { at: number; snapshot: ClaudeUsageSnapshot } | null = null;

/**
 * Usage history bucketed into the current 5-hour rate-limit window, today,
 * the week, and all-time stats (streaks, sessions, per-model, per-project).
 */
export async function collectClaudeUsage(
	now = Date.now(),
): Promise<ClaudeUsageSnapshot> {
	if (cached && now - cached.at < CACHE_TTL_MS) return cached.snapshot;
	const snapshot = aggregate(await readEntries(now - MAX_HISTORY_MS), now);
	cached = { at: now, snapshot };
	return snapshot;
}
