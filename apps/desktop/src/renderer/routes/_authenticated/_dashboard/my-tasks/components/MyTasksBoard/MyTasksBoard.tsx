import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useMemo, useState } from "react";
import {
	ALL_PROJECTS,
	type LocalTaskStatus,
	TASK_COLUMNS,
} from "../../constants";
import { useLocalTasks } from "../../hooks/useLocalTasks";
import { nextColumnOrder } from "../../utils/nextColumnOrder";
import { TaskCardPreview } from "./components/TaskCardPreview";
import { TaskColumn } from "./components/TaskColumn";

interface MyTasksBoardProps {
	hostUrl: string | null;
}

export function MyTasksBoard({ hostUrl }: MyTasksBoardProps) {
	const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const isAll = projectId === ALL_PROJECTS;

	const { tasks, projects, create, update, remove, reorder, clearStatus } =
		useLocalTasks(hostUrl);

	// Render whatever rows we already have, even while refetching.
	const allRows = tasks.data ?? [];
	const projectRows = projects.data ?? [];

	// The filter only narrows what's drawn. Drag math runs against every row,
	// because a column's positions are shared by all projects.
	const rows = useMemo(
		() => (isAll ? allRows : allRows.filter((t) => t.projectId === projectId)),
		[allRows, isAll, projectId],
	);

	const projectNameById = useMemo(
		() => new Map(projectRows.map((p) => [p.id, p.name])),
		[projectRows],
	);

	const sensors = useSensors(
		// A few pixels of slop so a click to edit isn't swallowed as a drag.
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
	);

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		setDraggingId(null);
		if (!over) return;

		// Dropping on empty column space gives the column's droppable; dropping
		// on a card gives that card, and its column is the target.
		const overTask = allRows.find((t) => t.id === over.id);
		const target =
			(over.data.current?.status as LocalTaskStatus | undefined) ??
			overTask?.status;
		if (!target) return;

		const ids = nextColumnOrder(
			allRows,
			String(active.id),
			target,
			overTask?.id ?? null,
		);
		if (ids) reorder.mutate({ status: target, ids });
	};

	const draggingTask = rows.find((t) => t.id === draggingId);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			{/* Window-drag leaf standing in for the hidden TopBar. */}
			<div className="drag h-10 shrink-0" />

			<div className="mx-auto flex w-full max-w-[1400px] shrink-0 items-center gap-3 px-6 pb-3">
				<h1 className="text-base font-semibold">My tasks</h1>
				<Select value={projectId} onValueChange={setProjectId}>
					<SelectTrigger size="sm" className="w-52">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
						{projectRows.map((project) => (
							<SelectItem key={project.id} value={project.id}>
								{project.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<span className="ml-auto text-xs tabular-nums text-muted-foreground">
					{rows.length} {rows.length === 1 ? "task" : "tasks"}
				</span>
			</div>

			<DndContext
				sensors={sensors}
				onDragStart={({ active }: DragStartEvent) =>
					setDraggingId(String(active.id))
				}
				onDragCancel={() => setDraggingId(null)}
				onDragEnd={handleDragEnd}
			>
				{/* Centred and width-capped: three columns sharing a 2560px monitor
				    read as a stretched table, not a board. */}
				<div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 gap-3 overflow-x-auto overflow-y-hidden px-6 pb-4">
					{TASK_COLUMNS.map(({ status, label }) => {
						const columnTasks = rows.filter((task) => task.status === status);
						return (
							<TaskColumn
								key={status}
								status={status}
								label={label}
								showProject={isAll}
								tasks={columnTasks.map((task) => ({
									id: task.id,
									title: task.title,
									projectName: task.projectId
										? (projectNameById.get(task.projectId) ?? null)
										: null,
								}))}
								disabled={!hostUrl}
								onAdd={(title) =>
									create.mutate({
										title,
										projectId: isAll ? null : projectId,
										status,
									})
								}
								onClear={
									status === "done" && columnTasks.length > 0
										? () =>
												clearStatus.mutate({
													status,
													projectId: isAll ? null : projectId,
												})
										: undefined
								}
								onRename={(id, title) => update.mutate({ id, title })}
								onRemove={(id) => remove.mutate({ id })}
							/>
						);
					})}
				</div>

				{/* Without an overlay the card stays in the column's scroll box and
				    gets clipped the moment it's dragged past the edge. */}
				<DragOverlay>
					{draggingTask ? (
						<TaskCardPreview
							title={draggingTask.title}
							projectName={
								isAll && draggingTask.projectId
									? (projectNameById.get(draggingTask.projectId) ?? null)
									: null
							}
						/>
					) : null}
				</DragOverlay>
			</DndContext>
		</div>
	);
}
