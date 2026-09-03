import { describe, expect, it } from "bun:test";
import type { LocalTaskStatus } from "../../constants";
import { nextColumnOrder } from "./nextColumnOrder";

const task = (id: string, status: LocalTaskStatus) => ({ id, status });

// a, b, c sit in todo; x sits in done.
const rows = [
	task("a", "todo"),
	task("b", "todo"),
	task("c", "todo"),
	task("x", "done"),
];

describe("nextColumnOrder (same column)", () => {
	it("moves a card down onto the card it was dropped on", () => {
		expect(nextColumnOrder(rows, "a", "todo", "c")).toEqual(["b", "c", "a"]);
	});

	it("moves a card up onto the card it was dropped on", () => {
		expect(nextColumnOrder(rows, "c", "todo", "a")).toEqual(["c", "a", "b"]);
	});

	it("sends a card to the end when dropped on empty space", () => {
		expect(nextColumnOrder(rows, "a", "todo", null)).toEqual(["b", "c", "a"]);
	});

	it("skips a drop onto itself", () => {
		expect(nextColumnOrder(rows, "b", "todo", "b")).toBeNull();
	});

	it("skips a drop on empty space by the card already last", () => {
		expect(nextColumnOrder(rows, "c", "todo", null)).toBeNull();
	});
});

describe("nextColumnOrder (across columns)", () => {
	it("inserts above the card it was dropped on", () => {
		expect(nextColumnOrder(rows, "x", "todo", "b")).toEqual([
			"a",
			"x",
			"b",
			"c",
		]);
	});

	it("appends when dropped on the column's empty space", () => {
		expect(nextColumnOrder(rows, "x", "todo", null)).toEqual([
			"a",
			"b",
			"c",
			"x",
		]);
	});

	it("appends into an empty column", () => {
		expect(nextColumnOrder(rows, "a", "in_progress", null)).toEqual(["a"]);
	});
});

describe("nextColumnOrder (guards)", () => {
	it("returns null for an id that is not on the board", () => {
		expect(nextColumnOrder(rows, "ghost", "todo", "a")).toBeNull();
	});

	// The caller renumbers the column from this list, so anything left out of it
	// loses its place. Callers must pass every row, not a filtered view.
	it("returns the whole target column, not just the cards that moved", () => {
		const order = nextColumnOrder(rows, "a", "todo", "c");
		expect(order).toHaveLength(rows.filter((t) => t.status === "todo").length);
	});
});
