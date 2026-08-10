import type { IBuffer, ILink, ILinkProvider, Terminal } from "@xterm/xterm";

/**
 * Agent CLIs print a placeholder for an image attached from the clipboard —
 * `[Image #12]` (Claude Code), `[image 1]` (others) — with no path in it,
 * because the bytes went straight from the clipboard to the agent. The
 * placeholder is all the user has to click, so match it and resolve it against
 * the images staged for this terminal (see pasted-image-store).
 */
const PLACEHOLDER = /\[\s*image\s*#?\s*\d+\s*\]/gi;

const MAX_LINE_LENGTH = 2000;

function matchesOnLine(text: string): Array<{ start: number; end: number }> {
	if (!text || text.length > MAX_LINE_LENGTH) return [];
	return Array.from(text.matchAll(PLACEHOLDER), (match) => ({
		start: match.index,
		end: match.index + match[0].length,
	}));
}

/**
 * How many placeholders precede the one at (lineIndex, startX). Pastes append
 * exactly one placeholder each, so this ordinal indexes the staged-image list
 * without trusting the number the CLI printed.
 */
export function countPlaceholdersBefore(
	buffer: IBuffer,
	lineIndex: number,
	startX: number,
	cols: number,
): number {
	let count = 0;
	for (let i = 0; i < lineIndex; i++) {
		const line = buffer.getLine(i);
		if (!line) continue;
		count += matchesOnLine(line.translateToString(true, 0, cols)).length;
	}
	const current = buffer.getLine(lineIndex);
	if (current) {
		count += matchesOnLine(current.translateToString(true, 0, cols)).filter(
			(match) => match.start < startX,
		).length;
	}
	return count;
}

export class ImagePlaceholderDetector implements ILinkProvider {
	constructor(
		private readonly _terminal: Terminal,
		private readonly _onActivate: (event: MouseEvent, ordinal: number) => void,
		private readonly _onHover?: (event: MouseEvent) => void,
		private readonly _onLeave?: () => void,
	) {}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		const buffer = this._terminal.buffer.active;
		const lineIndex = bufferLineNumber - 1;
		const line = buffer.getLine(lineIndex);
		if (!line) {
			callback(undefined);
			return;
		}

		const cols = this._terminal.cols;
		const text = line.translateToString(true, 0, cols);
		const matches = matchesOnLine(text);
		if (matches.length === 0) {
			callback(undefined);
			return;
		}

		const links = matches.map<ILink>((match) => ({
			range: {
				start: { x: match.start + 1, y: bufferLineNumber },
				end: { x: match.end, y: bufferLineNumber },
			},
			text: text.slice(match.start, match.end),
			activate: (event) => {
				this._onActivate(
					event,
					countPlaceholdersBefore(buffer, lineIndex, match.start, cols),
				);
			},
			// Only activate needs the ordinal; counting on hover would rescan the
			// buffer on every mouse move over a placeholder.
			hover: (event) => this._onHover?.(event),
			leave: () => this._onLeave?.(),
		}));
		callback(links);
	}
}
