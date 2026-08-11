import type { Extension, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { ChangeHunk } from "./lineDiff";

/**
 * Tick marks down the right edge showing where every change sits in the file,
 * including the parts scrolled out of view — the same job as an editor's
 * overview ruler. Clicking a tick scrolls that hunk into view.
 */
export function overviewRuler(hunksField: StateField<ChangeHunk[]>): Extension {
	return [
		ViewPlugin.fromClass(
			class {
				private readonly dom: HTMLElement;
				private rendered: ChangeHunk[] = [];

				constructor(private readonly view: EditorView) {
					this.dom = document.createElement("div");
					this.dom.className = "cm-changeOverview";
					// Sits inside the editor shell, over the scrollbar's track.
					view.dom.append(this.dom);
					this.render();
				}

				update(update: ViewUpdate) {
					const hunks = update.state.field(hunksField);
					if (hunks === this.rendered) return;
					this.render();
				}

				destroy() {
					this.dom.remove();
				}

				private render() {
					const hunks = this.view.state.field(hunksField);
					this.rendered = hunks;
					this.dom.replaceChildren();
					const total = Math.max(this.view.state.doc.lines, 1);

					for (const hunk of hunks) {
						const tick = document.createElement("div");
						tick.className = `cm-changeOverview-tick cm-changeOverview-tick-${hunk.kind}`;
						const span = Math.max(hunk.toLine - hunk.fromLine + 1, 1);
						tick.style.top = `${((hunk.fromLine - 1) / total) * 100}%`;
						// Floor the height so a single-line change stays visible.
						tick.style.height = `max(3px, ${(span / total) * 100}%)`;
						tick.title = `Line ${hunk.fromLine} — ${hunk.kind}`;
						tick.addEventListener("mousedown", (event) => {
							event.preventDefault();
							const line = this.view.state.doc.line(
								Math.min(hunk.fromLine, this.view.state.doc.lines),
							);
							this.view.dispatch({
								effects: EditorView.scrollIntoView(line.from, {
									y: "center",
								}),
							});
						});
						this.dom.append(tick);
					}
				}
			},
		),
		EditorView.baseTheme({
			// The editor shell has to be a positioning context for the overlay.
			"&": { position: "relative" },
			".cm-changeOverview": {
				position: "absolute",
				top: "0",
				right: "0",
				bottom: "0",
				width: "10px",
				pointerEvents: "none",
				zIndex: "3",
			},
			".cm-changeOverview-tick": {
				position: "absolute",
				right: "2px",
				width: "6px",
				borderRadius: "1px",
				cursor: "pointer",
				pointerEvents: "auto",
			},
			".cm-changeOverview-tick-added": {
				backgroundColor: "var(--diff-added, #3fb950)",
			},
			".cm-changeOverview-tick-modified": {
				backgroundColor: "var(--diff-modified, #58a6ff)",
			},
			".cm-changeOverview-tick-removed": {
				backgroundColor: "var(--diff-removed, #f85149)",
			},
		}),
	];
}
