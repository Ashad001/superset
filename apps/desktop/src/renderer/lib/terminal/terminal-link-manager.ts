/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkManager.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager.ts
 *
 *  Manages link provider registration for a terminal instance.
 *  Handles lifecycle (dispose old providers before re-registering),
 *  resolver caching, and priority ordering.
 *--------------------------------------------------------------------------------------------*/

import type { ILinkHandler, Terminal as XTerm } from "@xterm/xterm";
import type { DetectedLink } from "./links";
import {
	fileUriToPath,
	LinkDetectorAdapter,
	LocalLinkDetector,
	type StatCallback,
	TerminalLinkResolver,
	WordLinkDetector,
} from "./links";
import { UrlLinkProvider } from "./links/url-link-provider";

export type LinkHoverInfo =
	| {
			kind: "file";
			isDirectory: boolean;
			resolvedPath?: string;
			row?: number;
			col?: number;
	  }
	| { kind: "url"; url: string }
	| { kind: "image" };

/**
 * Link handler callbacks for the v2 terminal.
 */
export interface TerminalLinkHandlers {
	/** Called when a file path link is activated (Cmd/Ctrl+click). */
	onFileLinkClick?: (event: MouseEvent, link: DetectedLink) => void;
	/** Called when a URL link is activated. */
	onUrlClick?: (event: MouseEvent, url: string) => void;
	/**
	 * Called when a `file://` hyperlink is activated — the form agents use to
	 * link an attachment they wrote to disk (Claude Code's `[Image #N]`). Kept
	 * separate from onUrlClick so it goes through the file/image click policy
	 * rather than the browser one.
	 */
	onFileUrlClick?: (event: MouseEvent, path: string) => void;
	/** Called when the mouse enters a detected link (file path or URL). */
	onLinkHover?: (event: MouseEvent, info: LinkHoverInfo) => void;
	/** Called when the mouse leaves a previously hovered link. */
	onLinkLeave?: () => void;
	/**
	 * Stat callback to validate file paths exist. Called via the host service
	 * which handles all path resolution (relative, tilde, etc.) server-side.
	 */
	stat?: StatCallback;
}

interface LinkProviderDisposable {
	dispose(): void;
}

/**
 * Manages all link providers for a single terminal instance.
 *
 * Providers are registered in priority order (xterm uses first match):
 * 1. LocalLinkDetector (file paths with validation) + styled-text fallback
 * 2. UrlLinkProvider (wrapped URL detection)
 * 3. WordLinkDetector (bare filenames like "AGENTS.md")
 */
export class TerminalLinkManager {
	private _disposables: LinkProviderDisposable[] = [];
	private _resolver: TerminalLinkResolver | null = null;
	private _handlers: TerminalLinkHandlers | null = null;
	private _oscLinkHandler: ILinkHandler | null = null;
	private _cwd: string | null = null;
	private readonly _cwdHandler: LinkProviderDisposable;

	constructor(private readonly _terminal: XTerm) {
		// Shell wrappers report the cwd with OSC 7 on every prompt. Without it a
		// relative path printed by `ls` or `git status` is resolved against the
		// workspace root, so nothing in a subdirectory is clickable.
		this._cwdHandler = _terminal.parser.registerOscHandler(7, (data) => {
			const cwd = parseOsc7Path(data);
			if (cwd && cwd !== this._cwd) {
				this._cwd = cwd;
				this._resolver?.clearCache();
			}
			return false;
		});
	}

	/**
	 * Set link handlers and register providers. Safe to call multiple times —
	 * old providers are disposed before new ones are registered. The resolver
	 * is reused to preserve the stat cache.
	 */
	setHandlers(handlers: TerminalLinkHandlers): void {
		this._handlers = handlers;
		this._register();
	}

	/**
	 * Re-register providers (e.g. after terminal is created).
	 * No-op if handlers haven't been set yet.
	 */
	ensureRegistered(): void {
		if (this._handlers) {
			this._register();
		}
	}

	dispose(): void {
		for (const d of this._disposables) d.dispose();
		this._disposables = [];
		this._cwdHandler.dispose();
		this._clearOscLinkHandler();
		this._resolver?.clearCache();
		this._resolver = null;
		this._handlers = null;
	}

	private _clearOscLinkHandler(): void {
		if (this._terminal.options.linkHandler === this._oscLinkHandler) {
			this._terminal.options.linkHandler = null;
		}
		this._oscLinkHandler = null;
	}

	private _register(): void {
		const handlers = this._handlers;
		if (!handlers?.stat) return;

		// Dispose old providers to prevent duplicates
		for (const d of this._disposables) d.dispose();
		this._disposables = [];
		this._clearOscLinkHandler();

		// Reuse resolver to preserve stat cache across re-registrations.
		if (!this._resolver) {
			const stat = handlers.stat;
			this._resolver = new TerminalLinkResolver(async (path) => {
				// cwd first, then the raw path — the host resolves that against the
				// workspace root, which is what tools printing repo-relative paths
				// mean no matter which directory the shell is in.
				const anchored = this._againstCwd(path);
				if (anchored !== path) {
					const hit = await stat(anchored);
					if (hit) return hit;
				}
				return stat(path);
			});
		}

		const onLinkHover = handlers.onLinkHover;
		const onLinkLeave = handlers.onLinkLeave;

		// 1. File path detector (highest priority)
		const detector = new LocalLinkDetector(this._resolver);
		const adapter = new LinkDetectorAdapter(
			this._terminal,
			detector,
			handlers.onFileLinkClick,
			onLinkHover
				? (event, link) =>
						onLinkHover(event, {
							kind: "file",
							isDirectory: link.isDirectory,
							resolvedPath: link.resolvedPath,
							row: link.row,
							col: link.col,
						})
				: undefined,
			onLinkLeave,
		);
		this._disposables.push(this._terminal.registerLinkProvider(adapter));

		// 2. URL link provider (handles terminal-wrapped URLs)
		if (handlers.onUrlClick) {
			const onUrlClick = handlers.onUrlClick;
			const urlProvider = new UrlLinkProvider(
				this._terminal,
				(event, uri) => {
					onUrlClick(event, uri);
				},
				onLinkHover
					? (event, uri) => onLinkHover(event, { kind: "url", url: uri })
					: undefined,
				onLinkLeave,
			);
			this._disposables.push(this._terminal.registerLinkProvider(urlProvider));

			// xterm always registers its own OSC 8 hyperlink provider first. Without
			// this, OSC 8 links use xterm's default confirm() + window.open() path,
			// which is blocked in Electron and also bypasses our link preferences.
			// file:// is allowed through (agents hyperlink attachments that way);
			// every other non-http scheme stays blocked, and activation is routed
			// by scheme so a file link never reaches the browser handler.
			const onFileUrlClick = handlers.onFileUrlClick;
			this._oscLinkHandler = {
				allowNonHttpProtocols: true,
				activate: (event, uri) => {
					const filePath = fileUriToPath(uri);
					if (filePath) {
						onFileUrlClick?.(event, filePath);
						return;
					}
					if (/^https?:\/\//i.test(uri)) onUrlClick(event, uri);
				},
				hover: onLinkHover
					? (event, uri) =>
							onLinkHover(
								event,
								fileUriToPath(uri)
									? { kind: "file", isDirectory: false }
									: { kind: "url", url: uri },
							)
					: undefined,
				leave: onLinkLeave ? () => onLinkLeave() : undefined,
			};
			this._terminal.options.linkHandler = this._oscLinkHandler;
		}

		// 3. SUPERSET ADDITION: Word link detector (lowest priority).
		// Adapted from VSCode's TerminalWordLinkDetector. VSCode opens a
		// workspace search on click; ours opens the file directly if it
		// exists (validated via stat). Catches bare filenames like
		// "AGENTS.md" that have no path separator or line suffix.
		// To disable: remove or comment out this block.
		if (handlers.onFileLinkClick) {
			const onFileClick = handlers.onFileLinkClick;
			const wordDetector = new WordLinkDetector(
				this._terminal,
				this._resolver,
				(event, resolvedPath) => {
					onFileClick(event, {
						text: resolvedPath,
						startIndex: 0,
						endIndex: 0,
						resolvedPath,
						isDirectory: false,
						row: undefined,
						col: undefined,
						rowEnd: undefined,
						colEnd: undefined,
					});
				},
				onLinkHover
					? (event, resolvedPath) =>
							onLinkHover(event, {
								kind: "file",
								isDirectory: false,
								resolvedPath,
							})
					: undefined,
				onLinkLeave,
			);
			this._disposables.push(this._terminal.registerLinkProvider(wordDetector));
		}
	}

	/** Anchor a relative candidate to the cwd the shell last reported. */
	private _againstCwd(path: string): string {
		const cwd = this._cwd;
		if (!cwd?.startsWith("/") || path.startsWith("/") || path.startsWith("~")) {
			return path;
		}
		return `${cwd.endsWith("/") ? cwd.slice(0, -1) : cwd}/${path}`;
	}
}

/** OSC 7 payload: `file://<host><absolute path>`. */
function parseOsc7Path(data: string): string | null {
	const match = /^file:\/\/[^/]*(\/.*)$/.exec(data);
	if (!match?.[1]) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
}
