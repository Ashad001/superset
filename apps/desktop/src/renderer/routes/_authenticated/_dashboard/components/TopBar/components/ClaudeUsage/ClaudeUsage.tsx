import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiOutlineSparkles } from "react-icons/hi2";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DailyActivity } from "./components/DailyActivity";
import { CLAUDE_ORANGE, UsageBar } from "./components/UsageBar";
import { UsageRow } from "./components/UsageRow";
import {
	formatCountdown,
	formatDay,
	formatModel,
	formatTokens,
	windowFillRatio,
} from "./formatUsage";

// Usage is derived from Claude Code's own transcripts on disk, which only move
// when a session writes. Polling faster than the main-process scan cache would
// just re-serve the same snapshot.
const REFETCH_INTERVAL_MS = 60_000;

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="truncate text-[11px] text-muted-foreground">{label}</div>
			<div className="truncate text-xs tabular-nums select-text cursor-text">
				{value}
			</div>
		</div>
	);
}

export function ClaudeUsage({ className }: { className?: string }) {
	const [open, setOpen] = useState(false);
	const { preferences } = useV2UserPreferences();
	const enabled = preferences.showClaudeUsage;

	// Runs on mount, not on open: the first scan of a full history takes several
	// seconds (it yields between files, so nothing blocks), and the badge needs
	// the figures anyway. Later scans reuse the per-file memo and are instant.
	const { data: snapshot, isPending } =
		electronTrpc.claudeUsage.getSnapshot.useQuery(undefined, {
			enabled,
			refetchInterval: open ? REFETCH_INTERVAL_MS : false,
			// Keep the last figures on screen while a refetch runs, so the badge
			// doesn't blank out every minute.
			placeholderData: (previous) => previous,
		});

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
							<HiOutlineSparkles
								className="size-3.5 shrink-0"
								style={{ color: CLAUDE_ORANGE }}
							/>
							<span className="tabular-nums">{badgeLabel}</span>
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Claude usage</TooltipContent>
			</Tooltip>

			<PopoverContent align="start" className="w-80 p-0">
				<div className="max-h-[32rem] space-y-3 overflow-y-auto p-3">
					{isPending ? (
						<p className="text-xs text-muted-foreground">Reading usage…</p>
					) : null}
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

					<div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3">
						<Stat
							label="Today"
							value={`${formatTokens(snapshot?.today.tokens ?? 0)} · ${snapshot?.today.messages ?? 0} msgs`}
						/>
						<Stat
							label="Last 7 days"
							value={`${formatTokens(snapshot?.week.tokens ?? 0)} · ${snapshot?.week.messages ?? 0} msgs`}
						/>
					</div>

					{snapshot && snapshot.daily.length > 0 ? (
						<div className="border-t pt-3">
							<div className="flex items-baseline justify-between">
								<span className="text-xs font-medium">Activity</span>
								<span className="text-[11px] text-muted-foreground">
									last 30 days
								</span>
							</div>
							<div className="mt-2">
								<DailyActivity daily={snapshot.daily} />
							</div>
						</div>
					) : null}

					{snapshot && snapshot.total.messages > 0 ? (
						<div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3">
							<Stat
								label="Current streak"
								value={`${snapshot.streak.current} days`}
							/>
							<Stat
								label="Longest streak"
								value={`${snapshot.streak.longest} days`}
							/>
							<Stat label="Sessions" value={String(snapshot.total.sessions)} />
							<Stat
								label="Active days"
								value={String(snapshot.streak.activeDays)}
							/>
							<Stat
								label="Favorite model"
								value={
									snapshot.favoriteModel
										? formatModel(snapshot.favoriteModel)
										: "—"
								}
							/>
							<Stat
								label="Busiest day"
								value={
									snapshot.mostActiveDay
										? formatDay(snapshot.mostActiveDay)
										: "—"
								}
							/>
						</div>
					) : null}

					{snapshot && snapshot.total.messages > 0 ? (
						<div className="border-t pt-3">
							<div className="flex items-baseline justify-between">
								<span className="text-xs font-medium">All time</span>
								<span className="text-[11px] text-muted-foreground">
									{snapshot.since ? `since ${formatDay(snapshot.since)}` : null}
								</span>
							</div>
							<div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground select-text cursor-text">
								<span>Input {formatTokens(snapshot.total.inputTokens)}</span>
								<span>Output {formatTokens(snapshot.total.outputTokens)}</span>
								<span>
									Cache write {formatTokens(snapshot.total.cacheCreationTokens)}
								</span>
								<span>
									Cache read {formatTokens(snapshot.total.cacheReadTokens)}
								</span>
							</div>
						</div>
					) : null}

					{snapshot && snapshot.byModel.length > 0 ? (
						<div className="border-t pt-3">
							<span className="text-xs font-medium">By model</span>
							<div className="mt-1.5 space-y-1">
								{snapshot.byModel.map((row) => (
									<UsageRow
										key={row.model}
										label={formatModel(row.model)}
										tokens={row.tokens}
										total={snapshot.total.tokens}
									/>
								))}
							</div>
						</div>
					) : null}

					{snapshot && snapshot.byProject.length > 0 ? (
						<div className="border-t pt-3">
							<span className="text-xs font-medium">By project</span>
							<div className="mt-1.5 space-y-1">
								{snapshot.byProject.slice(0, 8).map((row) => (
									<UsageRow
										key={row.project}
										label={row.project}
										tokens={row.tokens}
										total={snapshot.total.tokens}
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
