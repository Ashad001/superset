import { TASK_CARD_CLASS } from "../TaskCard/constants";

interface TaskCardPreviewProps {
	title: string;
	projectName: string | null;
}

/** What follows the cursor while dragging — rendered in dnd-kit's overlay. */
export function TaskCardPreview({ title, projectName }: TaskCardPreviewProps) {
	return (
		<div className={`${TASK_CARD_CLASS} cursor-grabbing shadow-lg`}>
			{title}
			{projectName && (
				<span className="mt-1 block truncate text-[11px] text-muted-foreground">
					{projectName}
				</span>
			)}
		</div>
	);
}
