import { describe, expect, it } from "bun:test";
import { toFileUrl } from "./toFileUrl";

describe("toFileUrl", () => {
	it("builds a file URL for a POSIX path", () => {
		expect(toFileUrl("/work/site/index.html")).toBe(
			"file:///work/site/index.html",
		);
	});

	it("escapes characters that would otherwise end the path", () => {
		expect(toFileUrl("/work/my site/a#b.html")).toBe(
			"file:///work/my%20site/a%23b.html",
		);
	});

	it("keeps a Windows drive letter intact", () => {
		expect(toFileUrl("C:\\work\\site\\index.html")).toBe(
			"file:///C:/work/site/index.html",
		);
	});
});
