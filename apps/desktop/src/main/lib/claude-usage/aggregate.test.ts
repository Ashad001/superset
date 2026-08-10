import { describe, expect, it } from "bun:test";
import {
	aggregate,
	dedupe,
	splitIntoBlocks,
	type UsageEntry,
	WINDOW_MS,
} from "./aggregate";

const HOUR = 60 * 60 * 1000;
// A round hour, so block flooring is easy to reason about.
const NOON = Date.parse("2026-08-10T12:00:00.000Z");

function entry(overrides: Partial<UsageEntry> = {}): UsageEntry {
	return {
		timestamp: NOON,
		model: "claude-opus-5",
		project: "superset",
		requestId: null,
		inputTokens: 100,
		outputTokens: 200,
		cacheCreationTokens: 700,
		cacheReadTokens: 50_000,
		...overrides,
	};
}

describe("dedupe", () => {
	it("drops entries repeated across resumed transcripts", () => {
		const entries = [
			entry({ requestId: "req_1" }),
			entry({ requestId: "req_1" }),
			entry({ requestId: "req_2" }),
		];
		expect(dedupe(entries)).toHaveLength(2);
	});

	it("keeps entries with no request id", () => {
		expect(dedupe([entry(), entry()])).toHaveLength(2);
	});
});

describe("splitIntoBlocks", () => {
	it("opens a new block once the 5-hour window has elapsed", () => {
		const blocks = splitIntoBlocks([
			entry({ timestamp: NOON }),
			entry({ timestamp: NOON + HOUR }),
			entry({ timestamp: NOON + 6 * HOUR }),
		]);
		expect(blocks).toHaveLength(2);
		expect(blocks[0]?.startedAt).toBe(NOON);
		expect(blocks[1]?.startedAt).toBe(NOON + 6 * HOUR);
	});

	it("floors a block start to the hour", () => {
		const blocks = splitIntoBlocks([entry({ timestamp: NOON + 37 * 60_000 })]);
		expect(blocks[0]?.startedAt).toBe(NOON);
	});
});

describe("aggregate", () => {
	it("counts the live window and leaves cache reads out of the total", () => {
		const snapshot = aggregate([entry({ timestamp: NOON })], NOON + HOUR);
		// 100 in + 200 out + 700 cache-creation; the 50k cache read is excluded.
		expect(snapshot.window?.tokens).toBe(1000);
		expect(snapshot.window?.resetsAt).toBe(NOON + WINDOW_MS);
	});

	it("reports no window once the last block has expired", () => {
		const snapshot = aggregate([entry({ timestamp: NOON })], NOON + 6 * HOUR);
		expect(snapshot.window).toBeNull();
		// The weekly total still includes it.
		expect(snapshot.week.tokens).toBe(1000);
	});

	it("takes the meter ceiling from the heaviest block on record", () => {
		const snapshot = aggregate(
			[
				entry({ timestamp: NOON - 48 * HOUR, outputTokens: 9_200 }),
				entry({ timestamp: NOON }),
			],
			NOON + HOUR,
		);
		expect(snapshot.window?.peakTokens).toBe(10_000);
		expect(snapshot.window?.tokens).toBe(1000);
	});

	it("excludes entries older than a week from the totals", () => {
		const snapshot = aggregate(
			[entry({ timestamp: NOON - 8 * 24 * HOUR }), entry({ timestamp: NOON })],
			NOON + HOUR,
		);
		expect(snapshot.week.messages).toBe(1);
	});

	it("ranks models and projects by tokens", () => {
		const snapshot = aggregate(
			[
				entry({ timestamp: NOON, model: "claude-sonnet-5", project: "web" }),
				entry({
					timestamp: NOON + 60_000,
					model: "claude-opus-5",
					project: "superset",
					outputTokens: 5_000,
				}),
			],
			NOON + HOUR,
		);
		expect(snapshot.byModel[0]?.model).toBe("claude-opus-5");
		expect(snapshot.byProject[0]?.project).toBe("superset");
	});

	it("returns an empty snapshot when there is no history", () => {
		const snapshot = aggregate([], NOON);
		expect(snapshot.window).toBeNull();
		expect(snapshot.week.messages).toBe(0);
	});
});
