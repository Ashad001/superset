import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@superset/ui/utils";
import type { LocalTaskStatus } from "../../../../constants";
import { TaskCard, type TaskCardTask } from "../TaskCard";

interface TaskColumnProps {
	status: LocalTaskStatus;
	label: string;
	tasks: TaskCardTask[];
	showProject: boolean;
	onRename: (id: string, title: string) => void;
	onRemove: (id: string) => void;
}

const DOT_COLOR: Record<LocalTaskStatus, string> = {
	todo: "bg-muted-foreground/40",
	in_progress: "bg-amber-500",
	done: "bg-emerald-500",
};

export function TaskColumn({
	status,
	label,
	tasks,
	showProject,
	onRename,
	onRemove,
}: TaskColumnProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: `column-${status}`,
		data: { type: "column", status },
	});

	return (
		<div className="flex w-[280px] min-w-[280px] shrink-0 flex-col">
			<div className="mb-1 flex items-center gap-2 px-2 py-1.5">
				<span className={cn("size-2 rounded-full", DOT_COLOR[status])} />
				<span className="truncate text-sm font-medium">{label}</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{tasks.length}
				</span>
			</div>

			<div
				ref={setNodeRef}
				className={cn(
					"flex min-h-24 flex-1 flex-col gap-1.5 rounded-md p-1.5 transition-colors",
					isOver && "bg-fill-hover",
				)}
			>
				<SortableContext
					items={tasks.map((t) => t.id)}
					strategy={verticalListSortingStrategy}
				>
					{tasks.map((task) => (
						<TaskCard
							key={task.id}
							task={task}
							showProject={showProject}
							onRename={(title) => onRename(task.id, title)}
							onRemove={() => onRemove(task.id)}
						/>
					))}
				</SortableContext>
			</div>
		</div>
	);
}
