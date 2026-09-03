export type LocalTaskStatus = "todo" | "in_progress" | "done";

export const TASK_COLUMNS: { status: LocalTaskStatus; label: string }[] = [
	{ status: "todo", label: "Remaining" },
	{ status: "in_progress", label: "In progress" },
	{ status: "done", label: "Done" },
];

/** Project id standing in for "every project" in the picker. */
export const ALL_PROJECTS = "__all__";
