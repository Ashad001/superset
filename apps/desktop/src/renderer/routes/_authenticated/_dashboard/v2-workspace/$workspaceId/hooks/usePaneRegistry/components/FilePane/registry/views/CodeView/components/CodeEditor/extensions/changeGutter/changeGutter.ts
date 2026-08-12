import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import {
	closeHunkPanel,
	hunkPanelDecorations,
	hunkPanelTheme,
	openHunkPanel,
	openPanelLine,
} from "./hunkPanel";
import { type ChangeHunk, computeChangeHunks } from "./lineDiff";
import { overviewRuler } from "./overviewRuler";

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
});

export function changeGutter(): Extension {
	return [
		committedTextField,
		hunksField,
		openPanelLine,
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
					// Clicking the open hunk's marker again collapses the panel.
					const isOpen = view.state.field(openPanelLine) === hunk.fromLine;
					view.dispatch({
						effects: isOpen
							? closeHunkPanel.of(null)
							: openHunkPanel.of(hunk.fromLine),
					});
					return true;
				},
			},
		}),
		changeGutterTheme,
		hunkPanelDecorations(hunksField),
		hunkPanelTheme,
		overviewRuler(hunksField),
	];
}
