import { type Extension, StateEffect, StateField } from "@codemirror/state";
import {
	EditorView,
	GutterMarker,
	gutter,
	showTooltip,
	type Tooltip,
} from "@codemirror/view";
import { type ChangeHunk, computeChangeHunks } from "./lineDiff";
import { overviewRuler } from "./overviewRuler";
import { computeRevertChange } from "./revertChange";

/**
 * Git change markers beside the line numbers, in the shape editors have
 * settled on: a bar against added and modified lines, a wedge where lines were
 * deleted. Clicking one peeks at the committed text and offers to restore it.
 *
 * The comparison is the working document against HEAD, so unsaved edits count
 * — the marker appears as you type, not after a save.
 */

/** Committed text for the open file; null while unknown (untracked, loading). */
export const setCommittedText = StateEffect.define<string | null>();

const committedTextField = StateField.define<string | null>({
	create: () => null,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setCommittedText)) return effect.value;
		}
		return value;
	},
});

const hunksField = StateField.define<ChangeHunk[]>({
	create: () => [],
	update(value, transaction) {
		const committed = transaction.state.field(committedTextField);
		if (committed === null) return [];
		// Recompute only when something that feeds the diff moved.
		const committedChanged = transaction.effects.some((effect) =>
			effect.is(setCommittedText),
		);
		if (!transaction.docChanged && !committedChanged) return value;
		return computeChangeHunks(committed, transaction.state.doc.toString());
	},
});

class ChangeMarker extends GutterMarker {
	constructor(private readonly hunk: ChangeHunk) {
		super();
	}

	override toDOM() {
		const element = document.createElement("div");
		element.className = `cm-changeMarker cm-changeMarker-${this.hunk.kind}`;
		return element;
	}
}

function hunkAtLine(hunks: ChangeHunk[], line: number): ChangeHunk | null {
	return (
		hunks.find((hunk) => line >= hunk.fromLine && line <= hunk.toLine) ?? null
	);
}

const closePeek = StateEffect.define<null>();
/** Carries a built tooltip: only the click handler has a view to position it. */
const openPeek = StateEffect.define<Tooltip>();

/** The document's own text for a hunk — the "after" side of the comparison. */
function currentLines(view: EditorView, hunk: ChangeHunk): string[] {
	if (hunk.kind === "removed") return [];
	const doc = view.state.doc;
	const lines: string[] = [];
	const last = Math.min(hunk.toLine, doc.lines);
	for (let line = hunk.fromLine; line <= last; line++) {
		lines.push(doc.line(line).text);
	}
	return lines;
}

function buildDiffRows(
	label: "removed" | "added",
	lines: string[],
): DocumentFragment {
	const fragment = document.createDocumentFragment();
	for (const line of lines) {
		const row = document.createElement("div");
		row.className = `cm-changePeek-row cm-changePeek-row-${label}`;
		const sign = document.createElement("span");
		sign.className = "cm-changePeek-sign";
		sign.textContent = label === "removed" ? "−" : "+";
		const text = document.createElement("span");
		text.className = "cm-changePeek-text";
		// An empty line still needs height, hence the no-break space.
		text.textContent = line.length > 0 ? line : " ";
		row.append(sign, text);
		fragment.append(row);
	}
	return fragment;
}

function buildPeek(view: EditorView, hunk: ChangeHunk): Tooltip {
	return {
		pos: view.state.doc.line(hunk.fromLine).from,
		above: false,
		arrow: false,
		create: () => {
			const dom = document.createElement("div");
			dom.className = "cm-changePeek";

			const header = document.createElement("div");
			header.className = "cm-changePeek-header";
			const title = document.createElement("span");
			title.textContent =
				hunk.kind === "added"
					? "Added — uncommitted"
					: hunk.kind === "removed"
						? "Removed — uncommitted"
						: "Changed — uncommitted";
			const revert = document.createElement("button");
			revert.type = "button";
			revert.className = "cm-changePeek-action";
			revert.title = "Restore the committed version of these lines";
			revert.textContent = "Revert hunk";
			revert.addEventListener("click", () => {
				revertHunk(view, hunk);
			});
			header.append(title, revert);

			const body = document.createElement("div");
			body.className = "cm-changePeek-body";
			body.append(buildDiffRows("removed", hunk.originalLines));
			body.append(buildDiffRows("added", currentLines(view, hunk)));

			dom.append(header, body);
			return { dom };
		},
	};
}

const peekField = StateField.define<Tooltip | null>({
	create: () => null,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(closePeek)) return null;
			if (effect.is(openPeek)) return effect.value;
		}
		// Any edit invalidates the hunk the peek was describing.
		if (transaction.docChanged) return null;
		return value;
	},
	provide: (field) => showTooltip.from(field),
});

/**
 * Put the committed lines back. A plain document transaction, so the editor's
 * own undo history covers it and nothing touches git.
 */
function revertHunk(view: EditorView, hunk: ChangeHunk): void {
	view.dispatch({
		changes: computeRevertChange(view.state.doc, hunk),
		effects: closePeek.of(null),
	});
}

const changeGutterTheme = EditorView.baseTheme({
	".cm-changeGutter": {
		width: "3px",
		padding: "0",
		marginRight: "3px",
		cursor: "pointer",
	},
	".cm-changeMarker": {
		width: "3px",
		height: "100%",
		borderRadius: "1px",
	},
	".cm-changeMarker-added": { backgroundColor: "var(--diff-added, #3fb950)" },
	".cm-changeMarker-modified": {
		backgroundColor: "var(--diff-modified, #58a6ff)",
	},
	".cm-changeMarker-removed": {
		height: "0",
		borderLeft: "3px solid transparent",
		borderTop: "4px solid transparent",
		borderBottom: "4px solid transparent",
		borderLeftColor: "var(--diff-removed, #f85149)",
		borderRadius: "0",
	},
	".cm-changePeek": {
		background: "var(--popover, #1c1c1c)",
		color: "var(--popover-foreground, #e6e6e6)",
		border: "1px solid var(--border, #333)",
		borderRadius: "6px",
		overflow: "hidden",
		maxWidth: "min(64rem, 90vw)",
	},
	".cm-changePeek-header": {
		alignItems: "center",
		borderBottom: "1px solid var(--border, #333)",
		display: "flex",
		fontSize: "85%",
		gap: "12px",
		justifyContent: "space-between",
		opacity: "0.85",
		padding: "4px 8px",
	},
	".cm-changePeek-body": {
		fontFamily: "inherit",
		fontSize: "95%",
		maxHeight: "18rem",
		overflow: "auto",
		userSelect: "text",
		cursor: "text",
	},
	".cm-changePeek-row": {
		display: "flex",
		gap: "6px",
		padding: "0 8px",
		whiteSpace: "pre",
	},
	// Full-width tinted rows, the way a side-by-side diff reads.
	".cm-changePeek-row-removed": {
		backgroundColor: "var(--diff-removed-bg, rgba(248, 81, 73, 0.18))",
	},
	".cm-changePeek-row-added": {
		backgroundColor: "var(--diff-added-bg, rgba(63, 185, 80, 0.18))",
	},
	".cm-changePeek-sign": { opacity: "0.5", userSelect: "none" },
	".cm-changePeek-text": { flex: "1" },
	".cm-changePeek-action": {
		background: "transparent",
		border: "1px solid var(--border, #333)",
		borderRadius: "4px",
		color: "inherit",
		cursor: "pointer",
		flexShrink: "0",
		fontSize: "95%",
		padding: "1px 8px",
	},
});

export function changeGutter(): Extension {
	return [
		committedTextField,
		hunksField,
		peekField,
		gutter({
			class: "cm-changeGutter",
			lineMarker: (view, blockInfo) => {
				const hunks = view.state.field(hunksField);
				if (hunks.length === 0) return null;
				const line = view.state.doc.lineAt(blockInfo.from).number;
				const hunk = hunkAtLine(hunks, line);
				return hunk ? new ChangeMarker(hunk) : null;
			},
			// Repaint when the hunks change, not on every viewport scroll.
			lineMarkerChange: (update) =>
				update.startState.field(hunksField) !== update.state.field(hunksField),
			domEventHandlers: {
				mousedown: (view, blockInfo) => {
					const hunks = view.state.field(hunksField);
					const line = view.state.doc.lineAt(blockInfo.from).number;
					const hunk = hunkAtLine(hunks, line);
					if (!hunk) return false;
					const isOpen = view.state.field(peekField) !== null;
					view.dispatch({
						effects: isOpen
							? closePeek.of(null)
							: openPeek.of(buildPeek(view, hunk)),
					});
					return true;
				},
			},
		}),
		changeGutterTheme,
		overviewRuler(hunksField),
	];
}
