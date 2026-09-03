import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuTrash2 } from "react-icons/lu";

export interface TaskCardTask {
	id: string;
	title: string;
	projectName: string | null;
}

interface TaskCardProps {
	task: TaskCardTask;
	/** Shown only on the All board, where one column mixes projects. */
	showProject: boolean;
	onRename: (title: string) => void;
	onRemove: () => void;
}

export function TaskCard({
	task,
	showProject,
	onRename,
	onRemove,
}: TaskCardProps) {
	const [draft, setDraft] = useState<string | null>(null);
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: task.id, data: { type: "task" } });

	const commit = () => {
		const next = draft?.trim();
		if (next && next !== task.title) onRename(next);
		setDraft(null);
	};

	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn(
				"group relative rounded-md border border-border bg-background px-2.5 py-2",
				"hover:border-border-hover",
				isDragging && "opacity-50",
			)}
			{...attributes}
			{...listeners}
		>
			{draft === null ? (
				<button
					type="button"
					className="w-full text-left text-[13px] leading-snug"
					onDoubleClick={() => setDraft(task.title)}
				>
					{task.title}
				</button>
			) : (
				<input
					// biome-ignore lint/a11y/noAutofocus: double-click to edit implies focus
					autoFocus
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") setDraft(null);
					}}
					className="w-full bg-transparent text-[13px] leading-snug outline-none"
				/>
			)}

			{showProject && task.projectName && (
				<span className="mt-1 block truncate text-[11px] text-muted-foreground">
					{task.projectName}
				</span>
			)}

			<button
				type="button"
				aria-label="Delete task"
				onClick={onRemove}
				className="absolute right-1.5 top-1.5 hidden rounded p-1 text-muted-foreground hover:bg-fill-hover hover:text-foreground group-hover:block"
			>
				<LuTrash2 className="size-3" />
			</button>
		</div>
	);
}
