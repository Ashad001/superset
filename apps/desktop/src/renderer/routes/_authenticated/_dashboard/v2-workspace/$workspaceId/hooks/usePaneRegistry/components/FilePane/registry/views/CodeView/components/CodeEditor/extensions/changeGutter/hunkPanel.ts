import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { ChangeHunk } from "./lineDiff";
import { computeRevertChange } from "./revertChange";

/**
 * The expanded diff for one hunk, drawn inline above the changed lines rather
 * than floating over them: a block widget takes real vertical space, so the
 * code moves down instead of being covered — the way JetBrains and VS Code's
 * inline diff behave.
 */

/** Document line the open panel is anchored to, or null when closed. */
export const openHunkPanel = StateEffect.define<number>();
export const closeHunkPanel = StateEffect.define<null>();

export const openPanelLine = StateField.define<number | null>({
	create: () => null,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(closeHunkPanel)) return null;
			if (effect.is(openHunkPanel)) return effect.value;
		}
		// An edit re-flows the hunks the panel was describing.
		if (transaction.docChanged) return null;
		return value;
	},
});

function iconButton(label: string, title: string): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "cm-hunkPanel-button";
	button.textContent = label;
	button.title = title;
	return button;
}

function diffRow(
	kind: "removed" | "added",
	lineNumber: number | null,
	text: string,
): HTMLElement {
	const row = document.createElement("div");
	row.className = `cm-hunkPanel-row cm-hunkPanel-row-${kind}`;

	const oldNumber = document.createElement("span");
	oldNumber.className = "cm-hunkPanel-num";
	const newNumber = document.createElement("span");
	newNumber.className = "cm-hunkPanel-num";
	// Committed lines number on the left, working-tree lines on the right, so
	// the two sides stay readable against the editor's own gutter.
	if (kind === "removed") {
		oldNumber.textContent = lineNumber === null ? "" : String(lineNumber);
	} else {
		newNumber.textContent = lineNumber === null ? "" : String(lineNumber);
	}

	const content = document.createElement("span");
	content.className = "cm-hunkPanel-text";
	content.textContent = text.length > 0 ? text : " ";

	row.append(oldNumber, newNumber, content);
	return row;
}

class HunkPanelWidget extends WidgetType {
	constructor(
		private readonly hunk: ChangeHunk,
		private readonly index: number,
		private readonly total: number,
		private readonly currentLines: string[],
		private readonly hunksField: StateField<ChangeHunk[]>,
	) {
		super();
	}

	override eq(other: HunkPanelWidget): boolean {
		return (
			other.hunk.fromLine === this.hunk.fromLine &&
			other.hunk.toLine === this.hunk.toLine &&
			other.index === this.index &&
			other.total === this.total &&
			other.currentLines.join("\n") === this.currentLines.join("\n") &&
			other.hunk.originalLines.join("\n") === this.hunk.originalLines.join("\n")
		);
	}

	override toDOM(view: EditorView): HTMLElement {
		const panel = document.createElement("div");
		panel.className = "cm-hunkPanel";

		const header = document.createElement("div");
		header.className = "cm-hunkPanel-header";
		const title = document.createElement("span");
		title.className = "cm-hunkPanel-title";
		title.textContent = `Git local changes (working tree) — ${this.index + 1} of ${this.total} change${this.total === 1 ? "" : "s"}`;

		const actions = document.createElement("div");
		actions.className = "cm-hunkPanel-actions";
		const revert = iconButton("⟲", "Revert this hunk");
		revert.addEventListener("mousedown", (event) => {
			event.preventDefault();
			view.dispatch({
				changes: computeRevertChange(view.state.doc, this.hunk),
				effects: closeHunkPanel.of(null),
			});
		});
		const previous = iconButton("↑", "Previous change");
		previous.addEventListener("mousedown", (event) => {
			event.preventDefault();
			view.dispatch({
				effects: stepEffect(view, this.hunksField, this.index, -1),
			});
		});
		const next = iconButton("↓", "Next change");
		next.addEventListener("mousedown", (event) => {
			event.preventDefault();
			view.dispatch({
				effects: stepEffect(view, this.hunksField, this.index, 1),
			});
		});
		const close = iconButton("✕", "Close");
		close.addEventListener("mousedown", (event) => {
			event.preventDefault();
			view.dispatch({ effects: closeHunkPanel.of(null) });
		});
		actions.append(revert, previous, next, close);
		header.append(title, actions);

		const body = document.createElement("div");
		body.className = "cm-hunkPanel-body";
		this.hunk.originalLines.forEach((text, offset) => {
			body.append(
				diffRow("removed", this.hunk.originalFromLine + offset, text),
			);
		});
		this.currentLines.forEach((text, offset) => {
			body.append(diffRow("added", this.hunk.fromLine + offset, text));
		});

		panel.append(header, body);
		return panel;
	}

	/** Let clicks inside the panel behave normally instead of moving the cursor. */
	override ignoreEvent(): boolean {
		return true;
	}
}

/** Effect that moves the panel to the hunk `step` positions away. */
function stepEffect(
	view: EditorView,
	hunksField: StateField<ChangeHunk[]>,
	index: number,
	step: number,
) {
	const hunks = view.state.field(hunksField);
	const nextIndex = Math.min(Math.max(index + step, 0), hunks.length - 1);
	const target = hunks[nextIndex];
	if (!target) return closeHunkPanel.of(null);
	return openHunkPanel.of(target.fromLine);
}

export function hunkPanelDecorations(
	hunksField: StateField<ChangeHunk[]>,
): Extension {
	return EditorView.decorations.compute(
		[openPanelLine, hunksField, "doc"],
		(state) => {
			const line = state.field(openPanelLine);
			if (line === null) return Decoration.none;
			const hunks = state.field(hunksField);
			const index = hunks.findIndex((hunk) => hunk.fromLine === line);
			const hunk = hunks[index];
			if (!hunk) return Decoration.none;

			const anchorLine = Math.min(hunk.fromLine, state.doc.lines);
			const currentLines: string[] = [];
			if (hunk.kind !== "removed") {
				const last = Math.min(hunk.toLine, state.doc.lines);
				for (let n = hunk.fromLine; n <= last; n++) {
					currentLines.push(state.doc.line(n).text);
				}
			}

			return Decoration.set([
				Decoration.widget({
					widget: new HunkPanelWidget(
						hunk,
						index,
						hunks.length,
						currentLines,
						hunksField,
					),
					block: true,
					side: -1,
				}).range(state.doc.line(anchorLine).from),
			]);
		},
	);
}

export const hunkPanelTheme = EditorView.baseTheme({
	".cm-hunkPanel": {
		border: "1px solid var(--diff-panel-border, #c07a2c)",
		borderLeft: "none",
		borderRight: "none",
		background: "var(--background, #1a1a1a)",
		fontFamily: "inherit",
	},
	".cm-hunkPanel-header": {
		alignItems: "center",
		background: "var(--muted, #232323)",
		display: "flex",
		fontSize: "85%",
		justifyContent: "space-between",
		padding: "2px 8px",
	},
	".cm-hunkPanel-title": { opacity: "0.8" },
	".cm-hunkPanel-actions": { display: "flex", gap: "2px" },
	".cm-hunkPanel-button": {
		background: "transparent",
		border: "none",
		borderRadius: "3px",
		color: "inherit",
		cursor: "pointer",
		fontSize: "100%",
		lineHeight: "1",
		padding: "3px 6px",
	},
	".cm-hunkPanel-button:hover": {
		background: "var(--accent, rgba(255,255,255,0.1))",
	},
	".cm-hunkPanel-body": { maxHeight: "24rem", overflow: "auto" },
	".cm-hunkPanel-row": {
		display: "flex",
		gap: "8px",
		paddingRight: "8px",
		whiteSpace: "pre",
	},
	".cm-hunkPanel-row-removed": {
		backgroundColor: "var(--diff-removed-bg, rgba(120, 30, 40, 0.45))",
	},
	".cm-hunkPanel-row-added": {
		backgroundColor: "var(--diff-added-bg, rgba(30, 90, 45, 0.45))",
	},
	".cm-hunkPanel-num": {
		display: "inline-block",
		minWidth: "2.5em",
		opacity: "0.45",
		textAlign: "right",
		userSelect: "none",
	},
	".cm-hunkPanel-text": { flex: "1", userSelect: "text" },
});
