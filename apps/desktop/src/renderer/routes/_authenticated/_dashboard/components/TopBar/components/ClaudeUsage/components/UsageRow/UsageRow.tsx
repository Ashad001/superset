import { formatTokens } from "../../formatUsage";
import { UsageBar } from "../UsageBar";

/** One labelled row of the model / project breakdown. */
export function UsageRow({
	label,
	tokens,
	total,
}: {
	label: string;
	tokens: number;
	total: number;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="min-w-0 flex-1 truncate text-xs select-text cursor-text">
				{label}
			</span>
			<UsageBar
				ratio={total > 0 ? tokens / total : 0}
				className="w-16 shrink-0"
			/>
			<span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground select-text cursor-text">
				{formatTokens(tokens)}
			</span>
		</div>
	);
}
