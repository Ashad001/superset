import { describe, expect, it } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { changeGutter, setCommittedText } from "./changeGutter";
import { closeHunkPanel, openHunkPanel } from "./hunkPanel";

/**
 * State-level coverage for the click path: gutter click → effect → field →
 * block decoration. The DOM isn't exercised, but everything that decides
 * whether a panel exists at all is.
 */

function stateWith(doc: string, committed: string | null): EditorState {
	let state = EditorState.create({ doc, extensions: [changeGutter()] });
	if (committed !== null) {
		state = state.update({ effects: setCommittedText.of(committed) }).state;
	}
	return state;
}

/** Every block widget the state currently provides. */
function blockWidgetCount(state: EditorState): number {
	let count = 0;
	for (const source of state.facet(EditorView.decorations)) {
		if (typeof source === "function") continue;
		const iter = source.iter();
		while (iter.value !== null) {
			if (iter.value.spec.block === true) count++;
			iter.next();
		}
	}
	return count;
}

describe("changeGutter state", () => {
	it("produces no panel before a baseline arrives", () => {
		const state = stateWith("a\nB\nc", null);
		expect(blockWidgetCount(state)).toBe(0);
	});

	it("opens a block panel for the clicked hunk", () => {
		const state = stateWith("a\nB\nc", "a\nb\nc");
		const opened = state.update({ effects: openHunkPanel.of(2) }).state;
		expect(blockWidgetCount(opened)).toBe(1);
	});

	it("draws nothing when the clicked line has no hunk", () => {
		const state = stateWith("a\nB\nc", "a\nb\nc");
		const opened = state.update({ effects: openHunkPanel.of(1) }).state;
		expect(blockWidgetCount(opened)).toBe(0);
	});

	it("closes on request", () => {
		const state = stateWith("a\nB\nc", "a\nb\nc");
		const opened = state.update({ effects: openHunkPanel.of(2) }).state;
		const closed = opened.update({ effects: closeHunkPanel.of(null) }).state;
		expect(blockWidgetCount(closed)).toBe(0);
	});

	it("closes when the document is edited under it", () => {
		const state = stateWith("a\nB\nc", "a\nb\nc");
		const opened = state.update({ effects: openHunkPanel.of(2) }).state;
		const edited = opened.update({
			changes: { from: 0, to: 0, insert: "x\n" },
		}).state;
		expect(blockWidgetCount(edited)).toBe(0);
	});
});
