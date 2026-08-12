import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

import { afterEach, describe, expect, it } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { changeGutter, setCommittedText } from "./changeGutter";
import { openHunkPanel } from "./hunkPanel";

/**
 * Mounts a real EditorView, because the state-level tests pass even when
 * nothing reaches the screen: block widgets and gutter click handling are
 * view-side, and that is exactly where this feature broke.
 */

let view: EditorView | null = null;

function mount(doc: string, committed: string): EditorView {
	const parent = document.createElement("div");
	document.body.append(parent);
	const editor = new EditorView({
		state: EditorState.create({ doc, extensions: [changeGutter()] }),
		parent,
	});
	editor.dispatch({ effects: setCommittedText.of(committed) });
	view = editor;
	return editor;
}

afterEach(() => {
	view?.destroy();
	view = null;
	document.body.replaceChildren();
});

describe("change gutter in a mounted editor", () => {
	it("renders a marker for each changed line", () => {
		const editor = mount("a\nB\nc", "a\nb\nc");
		expect(editor.dom.querySelectorAll(".cm-changeMarker").length).toBe(1);
	});

	it("renders no markers without a baseline", () => {
		const parent = document.createElement("div");
		document.body.append(parent);
		const editor = new EditorView({
			state: EditorState.create({ doc: "a\nb", extensions: [changeGutter()] }),
			parent,
		});
		view = editor;
		expect(editor.dom.querySelectorAll(".cm-changeMarker").length).toBe(0);
	});

	it("renders the inline panel when a hunk is opened", () => {
		const editor = mount("a\nB\nc", "a\nb\nc");
		editor.dispatch({ effects: openHunkPanel.of(2) });
		const panel = editor.dom.querySelector(".cm-hunkPanel");
		expect(panel).not.toBeNull();
	});

	it("shows the committed line beside the working-tree line", () => {
		const editor = mount("a\nB\nc", "a\nb\nc");
		editor.dispatch({ effects: openHunkPanel.of(2) });
		const removed = editor.dom.querySelector(".cm-hunkPanel-row-removed");
		const added = editor.dom.querySelector(".cm-hunkPanel-row-added");
		expect(removed?.textContent).toContain("b");
		expect(added?.textContent).toContain("B");
	});

	it("puts an overview tick on the right edge", () => {
		const editor = mount("a\nB\nc", "a\nb\nc");
		expect(editor.dom.querySelectorAll(".cm-changeOverview-tick").length).toBe(
			1,
		);
	});

	// The effect-driven tests above pass even when the gutter dispatches the
	// wrong effect, which is exactly how the panel shipped unopenable. Drive it
	// the way a user does instead.
	//
	// The change has to sit on line 1: happy-dom reports zero-height layout, so
	// CodeMirror resolves the click to whatever line is at y=0 regardless of
	// which marker the event came from.
	it("opens the panel when the gutter marker is clicked", () => {
		const editor = mount("A\nb\nc", "a\nb\nc");
		const marker = editor.dom.querySelector(".cm-changeMarker");
		expect(marker).not.toBeNull();

		marker?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

		expect(editor.dom.querySelector(".cm-hunkPanel")).not.toBeNull();
	});

	it("closes the panel when the same marker is clicked again", () => {
		const editor = mount("A\nb\nc", "a\nb\nc");
		const marker = editor.dom.querySelector(".cm-changeMarker");
		marker?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		// Re-query: opening the panel rebuilds the gutter's DOM.
		editor.dom
			.querySelector(".cm-changeMarker")
			?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

		expect(editor.dom.querySelector(".cm-hunkPanel")).toBeNull();
	});

	it("restores the committed line from the panel's revert button", () => {
		const editor = mount("a\nB\nc", "a\nb\nc");
		editor.dispatch({ effects: openHunkPanel.of(2) });
		const revert = editor.dom.querySelector<HTMLButtonElement>(
			".cm-hunkPanel-button",
		);

		revert?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

		expect(editor.state.doc.toString()).toBe("a\nb\nc");
	});
});
