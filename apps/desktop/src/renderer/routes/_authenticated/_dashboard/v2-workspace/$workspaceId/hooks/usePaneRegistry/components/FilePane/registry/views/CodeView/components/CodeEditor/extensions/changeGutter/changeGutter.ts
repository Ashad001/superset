import { type Extension, StateEffect, StateField } from "@codemirror/state";
import {
	EditorView,
	GutterMarker,
	gutter,
	showTooltip,
	type Tooltip,
} from "@codemirror/view";
import { type ChangeHunk, computeChangeHunks } from "./lineDiff";
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

function buildPeek(view: EditorView, hunk: ChangeHunk): Tooltip {
	return {
		pos: view.state.doc.line(hunk.fromLine).from,
		above: false,
		arrow: false,
		create: () => {
			const dom = document.createElement("div");
			dom.className = "cm-changePeek";

			if (hunk.originalLines.length > 0) {
				const pre = document.createElement("pre");
				pre.className = "cm-changePeek-original";
				pre.textContent = hunk.originalLines.join("\n");
				dom.append(pre);
			} else {
				const empty = document.createElement("div");
				empty.className = "cm-changePeek-empty";
				empty.textContent = "Added — nothing here in the last commit";
				dom.append(empty);
			}

			const revert = document.createElement("button");
			revert.type = "button";
			revert.className = "cm-changePeek-action";
			revert.textContent = "Revert hunk";
			revert.addEventListener("click", () => {
				revertHunk(view, hunk);
			});
			dom.append(revert);
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
		padding: "6px",
		maxWidth: "48rem",
		maxHeight: "16rem",
		overflow: "auto",
	},
	".cm-changePeek-original": {
		margin: "0 0 6px",
		fontFamily: "inherit",
		fontSize: "90%",
		whiteSpace: "pre",
		userSelect: "text",
	},
	".cm-changePeek-empty": {
		margin: "0 0 6px",
		fontSize: "90%",
		opacity: "0.7",
	},
	".cm-changePeek-action": {
		background: "transparent",
		border: "1px solid var(--border, #333)",
		borderRadius: "4px",
		color: "inherit",
		cursor: "pointer",
		fontSize: "90%",
		padding: "2px 8px",
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
	];
}
