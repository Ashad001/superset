import { describe, expect, it } from "bun:test";
import {
	formatCountdown,
	formatModel,
	formatTokens,
	windowFillRatio,
} from "./formatUsage";

describe("formatTokens", () => {
	it("keeps small counts exact", () => {
		expect(formatTokens(812)).toBe("812");
	});

	it("abbreviates thousands and millions", () => {
		expect(formatTokens(940_400)).toBe("940k");
		expect(formatTokens(1_240_000)).toBe("1.2M");
	});

	it("drops the decimal past ten million", () => {
		expect(formatTokens(59_555_632)).toBe("60M");
	});
});

describe("formatCountdown", () => {
	const now = Date.parse("2026-08-10T12:00:00.000Z");

	it("shows hours and minutes", () => {
		expect(formatCountdown(now + 2 * 3_600_000 + 14 * 60_000, now)).toBe(
			"2h 14m",
		);
	});

	it("drops the hour once under one", () => {
		expect(formatCountdown(now + 9 * 60_000, now)).toBe("9m");
	});

	it("reads 'now' for a window that has already reset", () => {
		expect(formatCountdown(now - 1, now)).toBe("now");
	});
});

describe("windowFillRatio", () => {
	it("scales against the recorded peak", () => {
		expect(windowFillRatio(500, 1_000)).toBe(0.5);
	});

	it("clamps a new record to full", () => {
		expect(windowFillRatio(2_000, 1_000)).toBe(1);
	});

	it("reads empty with no history to compare against", () => {
		expect(windowFillRatio(500, 0)).toBe(0);
	});
});

describe("formatModel", () => {
	it("strips the vendor prefix", () => {
		expect(formatModel("claude-opus-5")).toBe("Opus 5");
	});

	it("rejoins a dashed version number", () => {
		expect(formatModel("claude-opus-4-8")).toBe("Opus 4.8");
	});

	it("strips a dated suffix", () => {
		expect(formatModel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
	});
});
