import { describe, expect, it } from "bun:test";
import type { IBuffer, IBufferLine } from "@xterm/xterm";
import { countPlaceholdersBefore } from "./image-placeholder-detector";

function fakeBuffer(lines: string[]): IBuffer {
	return {
		getLine: (index: number): IBufferLine | undefined => {
			const text = lines[index];
			if (text === undefined) return undefined;
			return {
				translateToString: () => text,
			} as unknown as IBufferLine;
		},
	} as unknown as IBuffer;
}

describe("countPlaceholdersBefore", () => {
	it("counts placeholders on earlier lines", () => {
		const buffer = fakeBuffer([
			"> here is [Image #190]",
			"and another [Image #191]",
			"third [Image #192]",
		]);
		// The ordinal indexes pastes, so the third placeholder is image 2 even
		// though the agent numbered it #192.
		expect(countPlaceholdersBefore(buffer, 2, 6, 80)).toBe(2);
	});

	it("counts earlier placeholders on the same line", () => {
		const buffer = fakeBuffer(["[Image #1] and [Image #2]"]);
		expect(countPlaceholdersBefore(buffer, 0, 0, 80)).toBe(0);
		expect(countPlaceholdersBefore(buffer, 0, 15, 80)).toBe(1);
	});

	it("ignores lines without placeholders", () => {
		const buffer = fakeBuffer(["$ ls", "README.md", "> [Image #7]"]);
		expect(countPlaceholdersBefore(buffer, 2, 2, 80)).toBe(0);
	});

	it("matches the formats other agents print", () => {
		const buffer = fakeBuffer(["[image 1]", "[Image #2]", "[ image #3 ]"]);
		expect(countPlaceholdersBefore(buffer, 2, 0, 80)).toBe(2);
	});
});
