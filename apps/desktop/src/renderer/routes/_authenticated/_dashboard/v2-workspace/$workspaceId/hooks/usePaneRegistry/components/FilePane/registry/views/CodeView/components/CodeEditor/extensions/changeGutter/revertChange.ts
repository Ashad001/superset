import type { ChangeHunk } from "./lineDiff";

/** The slice of CodeMirror's Text that computing a revert needs. */
export interface RevertDoc {
	lines: number;
	line(number: number): { from: number; to: number };
}

export interface RevertChange {
	from: number;
	to: number;
	insert: string;
}

/**
 * Document edit that restores a hunk's committed text.
 *
 * Split out from the dispatch so the line arithmetic — the part that can
 * silently mangle a file — is testable without an editor.
 */
export function computeRevertChange(
	doc: RevertDoc,
	hunk: ChangeHunk,
): RevertChange {
	const original = hunk.originalLines.join("\n");

	if (hunk.kind === "removed") {
		// Nothing occupies these lines now; put the committed text back above
		// whatever took their place.
		const at = doc.line(Math.min(hunk.fromLine, doc.lines)).from;
		return { from: at, to: at, insert: `${original}\n` };
	}

	const fromLine = doc.line(hunk.fromLine);
	const toLine = doc.line(Math.min(hunk.toLine, doc.lines));

	if (hunk.kind === "added") {
		// Reverting an insertion removes the lines outright, so the range has to
		// swallow a line break as well — otherwise blank lines are left behind.
		// Prefer the trailing one; at the end of the document take the leading.
		const isLastLine = hunk.toLine >= doc.lines;
		return isLastLine
			? {
					from: hunk.fromLine > 1 ? doc.line(hunk.fromLine - 1).to : 0,
					to: toLine.to,
					insert: "",
				}
			: { from: fromLine.from, to: doc.line(hunk.toLine + 1).from, insert: "" };
	}

	return { from: fromLine.from, to: toLine.to, insert: original };
}
