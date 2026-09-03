import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { TASK_CARD_CLASS } from "./constants";

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
				TASK_CARD_CLASS,
				"group relative hover:border-border-hover",
				// The overlay copy is what the cursor carries; leave a gap behind it.
				isDragging && "opacity-40",
			)}
			{...attributes}
			{...listeners}
		>
			{draft === null ? (
				<button
					type="button"
					title="Double-click to rename"
					className="w-full pr-5 text-left text-[13px] leading-snug"
					onDoubleClick={() => setDraft(task.title)}
				>
					{task.title}
				</button>
			) : (
				<input
					// biome-ignore lint/a11y/noAutofocus: double-click to edit implies focus
					autoFocus
					value={draft}
					// The card body is the drag handle, so without this, selecting
					// text with the mouse lifts the card instead.
					onPointerDown={(e) => e.stopPropagation()}
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
				<span className="mt-1.5 inline-block max-w-full truncate rounded bg-fill-hover px-1.5 py-0.5 text-[10px] text-muted-foreground">
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
