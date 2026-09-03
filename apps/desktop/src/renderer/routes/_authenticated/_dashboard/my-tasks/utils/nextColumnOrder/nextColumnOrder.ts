import { arrayMove } from "@dnd-kit/sortable";
import type { LocalTaskStatus } from "../../constants";

interface Orderable {
	id: string;
	status: LocalTaskStatus;
}

/**
 * The ids of `target`'s column after `draggedId` is dropped onto `overTaskId`
 * (or onto the column's empty space, when that is null).
 *
 * Returns null when the drop is a no-op, so the caller can skip the mutation
 * rather than rewriting a column into the order it already had.
 */
export function nextColumnOrder(
	rows: Orderable[],
	draggedId: string,
	target: LocalTaskStatus,
	overTaskId: string | null,
): string[] | null {
	const dragged = rows.find((t) => t.id === draggedId);
	if (!dragged) return null;

	const column = rows.filter((t) => t.status === target);

	// Same column: a reorder. Dropping on empty space means "send it to the end".
	if (dragged.status === target) {
		const from = column.findIndex((t) => t.id === draggedId);
		const to = overTaskId
			? column.findIndex((t) => t.id === overTaskId)
			: column.length - 1;
		if (from === -1 || to === -1 || from === to) return null;
		return arrayMove(column, from, to).map((t) => t.id);
	}

	// Different column: insert above the card it was dropped on, else append.
	const at = overTaskId ? column.findIndex((t) => t.id === overTaskId) : -1;
	const next = column.map((t) => t.id);
	next.splice(at === -1 ? column.length : at, 0, draggedId);
	return next;
}
