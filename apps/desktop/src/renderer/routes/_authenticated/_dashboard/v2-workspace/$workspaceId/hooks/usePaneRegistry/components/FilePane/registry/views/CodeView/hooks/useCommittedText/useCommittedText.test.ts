import { describe, expect, it } from "bun:test";
import { toRepoRelativePath } from "./useCommittedText";

describe("toRepoRelativePath", () => {
	it("strips the worktree root", () => {
		expect(toRepoRelativePath("/repo", "/repo/src/a.ts")).toBe("src/a.ts");
	});

	it("tolerates a trailing slash on the root", () => {
		expect(toRepoRelativePath("/repo/", "/repo/src/a.ts")).toBe("src/a.ts");
	});

	it("returns null for a file outside the worktree", () => {
		expect(toRepoRelativePath("/repo", "/elsewhere/a.ts")).toBeNull();
	});

	it("returns null when the worktree isn't known yet", () => {
		expect(toRepoRelativePath(null, "/repo/src/a.ts")).toBeNull();
	});

	it("does not treat a sibling directory as inside the repo", () => {
		// "/repo-other" starts with "/repo" as a string but isn't under it.
		expect(toRepoRelativePath("/repo", "/repo-other/a.ts")).toBeNull();
	});
});
