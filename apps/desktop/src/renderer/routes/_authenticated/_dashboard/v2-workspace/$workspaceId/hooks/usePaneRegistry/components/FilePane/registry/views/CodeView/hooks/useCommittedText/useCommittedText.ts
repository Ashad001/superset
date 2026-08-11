import { workspaceTrpc } from "@superset/workspace-client";

/**
 * The committed (HEAD) text of an open file, for the editor's change gutter.
 * Null while unknown — untracked file, remote workspace, or still loading —
 * which the gutter reads as "draw nothing".
 */
export function useCommittedText(
	workspaceId: string,
	filePath: string,
): string | null {
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath ?? null;
	const relativePath = toRepoRelativePath(worktreePath, filePath);

	// `staged` is the only category whose "old" side is HEAD (it compares HEAD
	// against the index). We ignore its "new" side and diff HEAD against the
	// live editor document instead, so unsaved edits show up in the gutter.
	const diffQuery = workspaceTrpc.git.getDiff.useQuery(
		{
			workspaceId,
			path: relativePath ?? "",
			category: "staged",
		},
		{ enabled: relativePath !== null },
	);

	return diffQuery.data?.oldFile.contents ?? null;
}

/** Path relative to the worktree root, or null if it sits outside. */
export function toRepoRelativePath(
	worktreePath: string | null,
	filePath: string,
): string | null {
	if (!worktreePath) return null;
	const root = worktreePath.endsWith("/") ? worktreePath : `${worktreePath}/`;
	if (!filePath.startsWith(root)) return null;
	return filePath.slice(root.length);
}
