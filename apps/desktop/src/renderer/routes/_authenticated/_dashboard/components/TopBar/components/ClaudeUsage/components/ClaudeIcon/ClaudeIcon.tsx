import { CLAUDE_ORANGE } from "../UsageBar";

/**
 * Claude's burst mark, inlined rather than fetched: the renderer has no network
 * guarantee and a remote asset would flash or fail offline.
 */
export function ClaudeIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			className={className}
			fill={CLAUDE_ORANGE}
			aria-hidden="true"
			focusable="false"
		>
			<title>Claude</title>
			<g transform="translate(12 12)">
				{[0, 30, 60, 90, 120, 150].map((angle) => (
					<rect
						key={angle}
						x="-1.1"
						y="-9.5"
						width="2.2"
						height="19"
						rx="1.1"
						transform={`rotate(${angle})`}
					/>
				))}
			</g>
		</svg>
	);
}
