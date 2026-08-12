import { describe, expect, it } from "bun:test";
import { computeChangeHunks } from "./lineDiff";

const lines = (...values: string[]) => values.join("\n");

describe("computeChangeHunks", () => {
	it("reports nothing for an unchanged file", () => {
		expect(computeChangeHunks(lines("a", "b"), lines("a", "b"))).toEqual([]);
	});

	it("marks inserted lines as added", () => {
		const hunks = computeChangeHunks(lines("a", "c"), lines("a", "b", "c"));
		expect(hunks).toEqual([
			{
				kind: "added",
				fromLine: 2,
				toLine: 2,
				originalLines: [],
				originalFromLine: 2,
			},
		]);
	});

	it("marks a replaced line as modified and keeps the committed text", () => {
		const hunks = computeChangeHunks(
			lines("a", "b", "c"),
			lines("a", "B", "c"),
		);
		expect(hunks).toEqual([
			{
				kind: "modified",
				fromLine: 2,
				toLine: 2,
				originalLines: ["b"],
				originalFromLine: 2,
			},
		]);
	});

	it("marks a deletion at the line that now sits there", () => {
		const hunks = computeChangeHunks(lines("a", "b", "c"), lines("a", "c"));
		expect(hunks).toEqual([
			{
				kind: "removed",
				fromLine: 2,
				toLine: 2,
				originalLines: ["b"],
				originalFromLine: 2,
			},
		]);
	});

	it("groups adjacent edits into one hunk", () => {
		const hunks = computeChangeHunks(
			lines("a", "b", "c", "d"),
			lines("a", "B", "C", "d"),
		);
		expect(hunks).toHaveLength(1);
		expect(hunks[0]).toEqual({
			kind: "modified",
			fromLine: 2,
			toLine: 3,
			originalLines: ["b", "c"],
			originalFromLine: 2,
		});
	});

	it("keeps separate edits separate", () => {
		const hunks = computeChangeHunks(
			lines("a", "b", "c", "d", "e"),
			lines("A", "b", "c", "d", "E"),
		);
		expect(hunks.map((h) => [h.kind, h.fromLine])).toEqual([
			["modified", 1],
			["modified", 5],
		]);
	});

	it("positions a hunk correctly after an earlier insertion shifts the file", () => {
		// "x" added at the top pushes the edited line down; the marker has to
		// follow the document, not the committed line number.
		const hunks = computeChangeHunks(
			lines("a", "b", "c"),
			lines("x", "a", "B", "c"),
		);
		expect(hunks).toEqual([
			{
				kind: "added",
				fromLine: 1,
				toLine: 1,
				originalLines: [],
				originalFromLine: 1,
			},
			{
				kind: "modified",
				fromLine: 3,
				toLine: 3,
				originalLines: ["b"],
				originalFromLine: 2,
			},
		]);
	});

	it("reports where the committed text lived, for the panel's left column", () => {
		// "x" inserted at the top shifts document lines but not committed ones.
		const hunks = computeChangeHunks(
			lines("a", "b", "c"),
			lines("x", "a", "B", "c"),
		);
		expect(hunks[1]?.fromLine).toBe(3);
		expect(hunks[1]?.originalFromLine).toBe(2);
	});

	it("handles a file created from nothing", () => {
		const hunks = computeChangeHunks("", lines("a", "b"));
		expect(hunks).toHaveLength(1);
		expect(hunks[0]?.kind).toBe("modified");
	});

	it("falls back to one coarse hunk on a wholesale rewrite", () => {
		const original = Array.from({ length: 3_000 }, (_, i) => `old ${i}`).join(
			"\n",
		);
		const current = Array.from({ length: 3_000 }, (_, i) => `new ${i}`).join(
			"\n",
		);
		const hunks = computeChangeHunks(original, current);
		expect(hunks).toHaveLength(1);
		expect(hunks[0]?.fromLine).toBe(1);
	});
});
