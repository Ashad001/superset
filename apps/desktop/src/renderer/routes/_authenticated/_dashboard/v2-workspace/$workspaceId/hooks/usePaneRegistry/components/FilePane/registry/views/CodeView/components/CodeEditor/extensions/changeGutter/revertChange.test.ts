import { describe, expect, it } from "bun:test";
import { computeChangeHunks } from "./lineDiff";
import { computeRevertChange, type RevertDoc } from "./revertChange";

/** Minimal stand-in for CodeMirror's Text, over a plain string. */
function makeDoc(
	text: string,
): RevertDoc & { apply(c: ReturnType<typeof computeRevertChange>): string } {
	const lines = text.split("\n");
	const starts: number[] = [];
	let offset = 0;
	for (const line of lines) {
		starts.push(offset);
		offset += line.length + 1;
	}
	return {
		lines: lines.length,
		line(number: number) {
			const from = starts[number - 1] ?? 0;
			return { from, to: from + (lines[number - 1]?.length ?? 0) };
		},
		apply(change) {
			return text.slice(0, change.from) + change.insert + text.slice(change.to);
		},
	};
}

/** Revert every hunk (last first, so earlier offsets stay valid). */
function revertAll(original: string, current: string): string {
	let text = current;
	for (const hunk of [...computeChangeHunks(original, current)].reverse()) {
		const doc = makeDoc(text);
		text = doc.apply(computeRevertChange(doc, hunk));
	}
	return text;
}

describe("computeRevertChange", () => {
	it("removes an inserted line without leaving a blank behind", () => {
		expect(revertAll("a\nc", "a\nb\nc")).toBe("a\nc");
	});

	it("removes an insertion at the end of the document", () => {
		expect(revertAll("a\nb", "a\nb\nc")).toBe("a\nb");
	});

	it("removes an insertion at the very start", () => {
		expect(revertAll("b\nc", "a\nb\nc")).toBe("b\nc");
	});

	it("restores a modified line", () => {
		expect(revertAll("a\nb\nc", "a\nB\nc")).toBe("a\nb\nc");
	});

	it("restores several modified lines at once", () => {
		expect(revertAll("a\nb\nc\nd", "a\nB\nC\nd")).toBe("a\nb\nc\nd");
	});

	it("puts a deleted line back where it was", () => {
		expect(revertAll("a\nb\nc", "a\nc")).toBe("a\nb\nc");
	});

	it("restores a file with several independent edits", () => {
		expect(revertAll("a\nb\nc\nd\ne", "A\nb\nc\nd\nE")).toBe("a\nb\nc\nd\ne");
	});
});
