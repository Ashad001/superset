import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { DayBucket } from "main/lib/claude-usage/aggregate";
import { formatDay, formatTokens } from "../../formatUsage";
import { CLAUDE_ORANGE } from "../UsageBar";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One cell per day, shaded by volume — the compact form of Claude Code's
 * contribution grid. Days with no activity are absent from `daily`, so the
 * axis is rebuilt from today backwards rather than read off the data.
 */
export function DailyActivity({
	daily,
	days = 30,
}: {
	daily: DayBucket[];
	days?: number;
}) {
	const byDay = new Map(daily.map((day) => [day.startedAt, day]));
	const busiest = daily.reduce((max, day) => Math.max(max, day.tokens), 0);
	const today = new Date().setHours(0, 0, 0, 0);

	return (
		<div className="flex gap-[3px]">
			{Array.from({ length: days }, (_, index) => {
				const startedAt = today - (days - 1 - index) * DAY_MS;
				const bucket = byDay.get(startedAt);
				// Floor the shade so a quiet day still reads as active.
				const intensity =
					bucket && busiest > 0 ? 0.25 + (bucket.tokens / busiest) * 0.75 : 0;
				return (
					<Tooltip key={startedAt}>
						<TooltipTrigger asChild>
							<div
								className="h-4 flex-1 rounded-[2px] bg-muted"
								style={
									intensity > 0
										? { backgroundColor: CLAUDE_ORANGE, opacity: intensity }
										: undefined
								}
							/>
						</TooltipTrigger>
						<TooltipContent>
							{formatDay(startedAt)} ·{" "}
							{bucket ? `${formatTokens(bucket.tokens)} tokens` : "no activity"}
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
