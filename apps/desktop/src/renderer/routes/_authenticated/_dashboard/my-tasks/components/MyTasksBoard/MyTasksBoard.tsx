import {
	DndContext,
	type DragEndEvent,
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
import { AddTaskInput } from "./components/AddTaskInput";
import { TaskColumn } from "./components/TaskColumn";

interface MyTasksBoardProps {
	hostUrl: string | null;
}

export function MyTasksBoard({ hostUrl }: MyTasksBoardProps) {
	const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);
	const isAll = projectId === ALL_PROJECTS;

	const { tasks, projects, create, update, remove } = useLocalTasks(
		hostUrl,
		isAll ? null : projectId,
	);

	// Render whatever rows we already have, even while refetching.
	const rows = tasks.data ?? [];
	const projectRows = projects.data ?? [];

	const projectNameById = useMemo(
		() => new Map(projectRows.map((p) => [p.id, p.name])),
		[projectRows],
	);

	const sensors = useSensors(
		// A few pixels of slop so a click to edit isn't swallowed as a drag.
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
	);

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over) return;
		const dropped = over.data.current?.status as LocalTaskStatus | undefined;
		const target = dropped ?? rows.find((t) => t.id === over.id)?.status;
		const dragged = rows.find((t) => t.id === active.id);
		if (!target || !dragged || dragged.status === target) return;
		update.mutate({ id: dragged.id, status: target });
	};

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			{/* Window-drag leaf standing in for the hidden TopBar. */}
			<div className="drag h-10 shrink-0" />

			<div className="flex shrink-0 items-center gap-3 px-6 pb-3">
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
				<div className="ml-auto w-72">
					<AddTaskInput
						disabled={!hostUrl}
						onAdd={(title) =>
							create.mutate({
								title,
								projectId: isAll ? null : projectId,
								status: "todo",
							})
						}
					/>
				</div>
			</div>

			<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
				<div className="flex min-h-0 flex-1 gap-2 overflow-x-auto px-4 pb-4">
					{TASK_COLUMNS.map(({ status, label }) => (
						<TaskColumn
							key={status}
							status={status}
							label={label}
							showProject={isAll}
							tasks={rows
								.filter((task) => task.status === status)
								.map((task) => ({
									id: task.id,
									title: task.title,
									projectName: task.projectId
										? (projectNameById.get(task.projectId) ?? null)
										: null,
								}))}
							onRename={(id, title) => update.mutate({ id, title })}
							onRemove={(id) => remove.mutate({ id })}
						/>
					))}
				</div>
			</DndContext>
		</div>
	);
}
