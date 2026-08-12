/**
 * Line-level diff between the committed version of a file and what's in the
 * editor, reduced to the hunks a change gutter needs.
 *
 * Written here rather than pulled from a library: @pierre/diffs consumes a
 * unified patch instead of two texts, and nothing else installed does text →
 * hunks. It's ~60 lines and the alternative was a new dependency.
 */

export type ChangeKind = "added" | "modified" | "removed";

export interface ChangeHunk {
	kind: ChangeKind;
	/** 1-based first line in the current document. */
	fromLine: number;
	/**
	 * 1-based last line in the current document. Equals `fromLine` for a
	 * removal, which occupies no lines of its own.
	 */
	toLine: number;
	/** The committed lines this hunk replaced, for the peek view and revert. */
	originalLines: string[];
	/** 1-based line of `originalLines[0]` in the committed file. */
	originalFromLine: number;
}

// A pathological pair (a generated file rewritten wholesale) would make the
// O(n*m) table enormous. Past this many differing lines on either side, report
// one coarse hunk instead of pinpointing rows nobody will read.
const MAX_DIFF_LINES = 2_000;

/** Length of the common run at the start of both inputs. */
function commonPrefix(a: string[], b: string[]): number {
	const max = Math.min(a.length, b.length);
	let i = 0;
	while (i < max && a[i] === b[i]) i++;
	return i;
}

/** Length of the common run at the end, excluding the first `offset` lines. */
function commonSuffix(a: string[], b: string[], offset: number): number {
	const max = Math.min(a.length, b.length) - offset;
	let i = 0;
	while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
	return i;
}

/** Backtrack an LCS table into runs of equal / removed / added lines. */
function diffCore(
	original: string[],
	current: string[],
): Array<{ kind: "equal" | "removed" | "added"; line: string }> {
	const n = original.length;
	const m = current.length;
	const table: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			const row = table[i];
			const next = table[i + 1];
			if (!row || !next) continue;
			row[j] =
				original[i] === current[j]
					? (next[j + 1] ?? 0) + 1
					: Math.max(next[j] ?? 0, row[j + 1] ?? 0);
		}
	}

	const script: Array<{ kind: "equal" | "removed" | "added"; line: string }> =
		[];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (original[i] === current[j]) {
			script.push({ kind: "equal", line: current[j] ?? "" });
			i++;
			j++;
		} else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
			script.push({ kind: "removed", line: original[i] ?? "" });
			i++;
		} else {
			script.push({ kind: "added", line: current[j] ?? "" });
			j++;
		}
	}
	while (i < n) script.push({ kind: "removed", line: original[i++] ?? "" });
	while (j < m) script.push({ kind: "added", line: current[j++] ?? "" });
	return script;
}

/**
 * Hunks describing how `current` differs from `original`, positioned against
 * `current` so they can be drawn beside the editor's own lines.
 */
export function computeChangeHunks(
	original: string,
	current: string,
): ChangeHunk[] {
	if (original === current) return [];
	const originalLines = original.split("\n");
	const currentLines = current.split("\n");

	// Typical edits touch a few lines in a large file; skipping the matching
	// head and tail keeps the table proportional to the edit, not the file.
	const prefix = commonPrefix(originalLines, currentLines);
	const suffix = commonSuffix(originalLines, currentLines, prefix);
	const originalMiddle = originalLines.slice(
		prefix,
		originalLines.length - suffix,
	);
	const currentMiddle = currentLines.slice(
		prefix,
		currentLines.length - suffix,
	);

	if (
		originalMiddle.length > MAX_DIFF_LINES ||
		currentMiddle.length > MAX_DIFF_LINES
	) {
		return [
			{
				kind: currentMiddle.length === 0 ? "removed" : "modified",
				fromLine: prefix + 1,
				toLine: prefix + Math.max(currentMiddle.length, 1),
				originalLines: originalMiddle,
				originalFromLine: prefix + 1,
			},
		];
	}

	const script = diffCore(originalMiddle, currentMiddle);
	const hunks: ChangeHunk[] = [];
	let line = prefix + 1;
	// Walks the committed file in step with `line`, so a hunk can report where
	// its "before" text lived — the left-hand numbers in the expanded panel.
	let originalLine = prefix + 1;
	let index = 0;

	while (index < script.length) {
		const step = script[index];
		if (!step || step.kind === "equal") {
			index++;
			line++;
			originalLine++;
			continue;
		}

		// Collect the whole run of adjacent changes: a replacement shows up as
		// removals followed by additions, and reads as one "modified" block.
		const removed: string[] = [];
		let added = 0;
		while (index < script.length) {
			const entry = script[index];
			if (!entry || entry.kind === "equal") break;
			if (entry.kind === "removed") removed.push(entry.line);
			else added++;
			index++;
		}

		const kind: ChangeKind =
			removed.length === 0 ? "added" : added === 0 ? "removed" : "modified";
		hunks.push({
			kind,
			fromLine: line,
			toLine: added === 0 ? line : line + added - 1,
			originalLines: removed,
			originalFromLine: originalLine,
		});
		line += added;
		originalLine += removed.length;
	}

	return hunks;
}
