import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuEraser } from "react-icons/lu";
import type { LocalTaskStatus } from "../../../../constants";
import { AddTaskInput } from "../AddTaskInput";
import { TaskCard, type TaskCardTask } from "../TaskCard";

interface TaskColumnProps {
	status: LocalTaskStatus;
	label: string;
	tasks: TaskCardTask[];
	showProject: boolean;
	disabled?: boolean;
	onAdd: (title: string) => void;
	/** Only passed for a column that can be emptied in one go (Done). */
	onClear?: () => void;
	onRename: (id: string, title: string) => void;
	onRemove: (id: string) => void;
}

const DOT_COLOR: Record<LocalTaskStatus, string> = {
	todo: "bg-muted-foreground/40",
	in_progress: "bg-amber-500",
	done: "bg-emerald-500",
};

const EMPTY_HINT: Record<LocalTaskStatus, string> = {
	todo: "Nothing queued",
	in_progress: "Drag a task here when you start it",
	done: "Finished tasks land here",
};

export function TaskColumn({
	status,
	label,
	tasks,
	showProject,
	disabled,
	onAdd,
	onClear,
	onRename,
	onRemove,
}: TaskColumnProps) {
	const [confirmingClear, setConfirmingClear] = useState(false);
	const { setNodeRef, isOver } = useDroppable({
		id: `column-${status}`,
		data: { type: "column", status },
	});

	return (
		<div className="flex min-w-[240px] flex-1 flex-col overflow-hidden rounded-lg bg-fill-hover/30">
			<div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
				<span className={cn("size-2 rounded-full", DOT_COLOR[status])} />
				<span className="truncate text-sm font-medium">{label}</span>
				<span className="rounded bg-fill-hover px-1.5 text-xs tabular-nums text-muted-foreground">
					{tasks.length}
				</span>
				{onClear && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={`Clear ${label}`}
								onClick={() => setConfirmingClear(true)}
								className="ml-auto rounded p-1 text-muted-foreground hover:bg-fill-hover hover:text-foreground"
							>
								<LuEraser className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent>Clear {label.toLowerCase()}</TooltipContent>
					</Tooltip>
				)}
			</div>

			{/* Scrolls on its own, so a long column never pushes the page — the
			    other columns and every footer stay put. */}
			<div
				ref={setNodeRef}
				className={cn(
					"flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2 transition-colors",
					isOver && "bg-fill-hover/60",
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

				{tasks.length === 0 && (
					<p className="px-1 py-6 text-center text-xs text-muted-foreground/70">
						{EMPTY_HINT[status]}
					</p>
				)}
			</div>

			<div className="shrink-0 p-2 pt-0">
				<AddTaskInput disabled={disabled} onAdd={onAdd} />
			</div>

			{/* Deleting every card in the column can't be undone, so it asks. */}
			<AlertDialog open={confirmingClear} onOpenChange={setConfirmingClear}>
				<EnterEnabledAlertDialogContent className="max-w-[360px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Clear {label.toLowerCase()}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Deletes {tasks.length} {tasks.length === 1 ? "task" : "tasks"} for
							good.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pt-2 pb-4">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setConfirmingClear(false)}
						>
							Cancel
						</Button>
						<AlertDialogAction
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => {
								onClear?.();
								setConfirmingClear(false);
							}}
						>
							Clear
						</AlertDialogAction>
					</AlertDialogFooter>
				</EnterEnabledAlertDialogContent>
			</AlertDialog>
		</div>
	);
}
