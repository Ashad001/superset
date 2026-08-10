import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiOutlineSparkles } from "react-icons/hi2";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { UsageBar } from "./components/UsageBar";
import { UsageRow } from "./components/UsageRow";
import {
	formatCountdown,
	formatModel,
	formatTokens,
	windowFillRatio,
} from "./formatUsage";

// Usage is derived from Claude Code's own transcripts on disk, which only move
// when a session writes. Polling faster than the main-process scan cache would
// just re-serve the same snapshot.
const REFETCH_INTERVAL_MS = 60_000;

export function ClaudeUsage({ className }: { className?: string }) {
	const [open, setOpen] = useState(false);
	const { preferences } = useV2UserPreferences();
	const enabled = preferences.showClaudeUsage;

	const { data: snapshot } = electronTrpc.claudeUsage.getSnapshot.useQuery(
		undefined,
		{
			enabled: enabled && open,
			refetchInterval: open ? REFETCH_INTERVAL_MS : false,
			// Keep the last figures on screen while a refetch runs, so the badge
			// doesn't blank out every minute.
			placeholderData: (previous) => previous,
		},
	);

	if (!enabled) return null;

	const now = Date.now();
	const current = snapshot?.window ?? null;
	const badgeLabel = current
		? `${formatTokens(current.tokens)} · ${formatCountdown(current.resetsAt, now)}`
		: "Claude";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className={cn("h-7 gap-1.5 px-2 text-xs", className)}
						>
							<HiOutlineSparkles className="size-3.5 shrink-0" />
							<span className="tabular-nums">{badgeLabel}</span>
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Claude usage</TooltipContent>
			</Tooltip>

			<PopoverContent align="start" className="w-80 p-0">
				<div className="space-y-3 p-3">
					<div>
						<div className="flex items-baseline justify-between">
							<span className="text-xs font-medium">Current window</span>
							<span className="text-xs text-muted-foreground">
								{current
									? `resets in ${formatCountdown(current.resetsAt, now)}`
									: "idle"}
							</span>
						</div>
						<UsageBar
							ratio={
								current
									? windowFillRatio(current.tokens, current.peakTokens)
									: 0
							}
							className="mt-1.5"
						/>
						<p className="mt-1.5 text-xs text-muted-foreground select-text cursor-text">
							{current
								? `${formatTokens(current.tokens)} tokens · ${current.messages} messages`
								: "No Claude activity in the last 5 hours"}
						</p>
						{current ? (
							<p className="mt-0.5 text-[11px] text-muted-foreground/70 select-text cursor-text">
								Bar is relative to your heaviest 5-hour window (
								{formatTokens(current.peakTokens)}), not a plan limit.
							</p>
						) : null}
					</div>

					<div className="border-t pt-3">
						<div className="flex items-baseline justify-between">
							<span className="text-xs font-medium">Last 7 days</span>
							<span className="text-xs tabular-nums text-muted-foreground select-text cursor-text">
								{formatTokens(snapshot?.week.tokens ?? 0)} ·{" "}
								{snapshot?.week.messages ?? 0} messages
							</span>
						</div>
					</div>

					{snapshot && snapshot.byModel.length > 0 ? (
						<div className="border-t pt-3">
							<span className="text-xs font-medium">By model</span>
							<div className="mt-1.5 space-y-1">
								{snapshot.byModel.map((row) => (
									<UsageRow
										key={row.model}
										label={formatModel(row.model)}
										tokens={row.tokens}
										total={snapshot.week.tokens}
									/>
								))}
							</div>
						</div>
					) : null}

					{snapshot && snapshot.byProject.length > 0 ? (
						<div className="border-t pt-3">
							<span className="text-xs font-medium">By project</span>
							<div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
								{snapshot.byProject.map((row) => (
									<UsageRow
										key={row.project}
										label={row.project}
										tokens={row.tokens}
										total={snapshot.week.tokens}
									/>
								))}
							</div>
						</div>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
