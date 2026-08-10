import { cn } from "@superset/ui/lib/utils";

/** Flat meter used for the window fill and each breakdown row. */
export function UsageBar({
	ratio,
	className,
}: {
	ratio: number;
	className?: string;
}) {
	return (
		<div className={cn("h-1.5 w-full rounded-full bg-muted", className)}>
			<div
				className="h-full rounded-full bg-foreground/70 transition-[width]"
				style={{
					width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`,
				}}
			/>
		</div>
	);
}
