import { describe, expect, it, mock } from "bun:test";
import type { ILink, ILinkProvider, Terminal as XTerm } from "@xterm/xterm";
import { TerminalLinkManager } from "./terminal-link-manager";

const COLS = 80;

function createMockLine(text: string) {
	return {
		translateToString: (trim?: boolean, start = 0, end = COLS) => {
			const padded = text.padEnd(COLS).substring(start, end);
			return trim ? padded.replace(/\s+$/, "") : padded;
		},
		isWrapped: false,
		length: COLS,
		getCell: (x: number) =>
			({
				getChars: () => (x < text.length ? text[x] : " "),
				getWidth: () => 1,
			}) as never,
	};
}

function createMockTerminal(lines: string[] = []) {
	const registeredProviders: ILinkProvider[] = [];
	const disposedProviders: ILinkProvider[] = [];
	const oscHandlers = new Map<number, (data: string) => boolean>();
	const bufferLines = lines.map(createMockLine);
	const terminal = {
		options: {
			linkHandler: null,
		},
		parser: {
			registerOscHandler: (id: number, handler: (data: string) => boolean) => {
				oscHandlers.set(id, handler);
				return { dispose: () => oscHandlers.delete(id) };
			},
		},
		registerLinkProvider: (provider: ILinkProvider) => {
			registeredProviders.push(provider);
			return {
				dispose: () => {
					disposedProviders.push(provider);
				},
			};
		},
		buffer: {
			active: {
				length: bufferLines.length,
				getLine: (i: number) => bufferLines[i] ?? null,
				viewportY: 0,
			},
		},
		cols: COLS,
	} as unknown as XTerm;

	return { terminal, registeredProviders, disposedProviders, oscHandlers };
}

describe("TerminalLinkManager", () => {
	it("routes OSC 8 hyperlinks through the terminal URL handler", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();
		const onLinkHover = mock();
		const onLinkLeave = mock();

		manager.setHandlers({
			stat: async () => null,
			onUrlClick,
			onLinkHover,
			onLinkLeave,
		});

		const linkHandler = terminal.options.linkHandler;
		expect(linkHandler).toBeTruthy();
		// file:// is permitted so agent attachment links activate; activation is
		// routed by scheme below.
		expect(linkHandler?.allowNonHttpProtocols).toBe(true);

		const event = {} as MouseEvent;
		linkHandler?.activate(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});
		linkHandler?.hover?.(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});
		linkHandler?.leave?.(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});

		expect(onUrlClick).toHaveBeenCalledWith(event, "https://example.com");
		expect(onLinkHover).toHaveBeenCalledWith(event, {
			kind: "url",
			url: "https://example.com",
		});
		expect(onLinkLeave).toHaveBeenCalled();
	});

	it("routes an OSC 8 file:// hyperlink to the file handler, not the browser", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();
		const onFileUrlClick = mock();
		const onLinkHover = mock();

		manager.setHandlers({
			stat: async () => null,
			onUrlClick,
			onFileUrlClick,
			onLinkHover,
		});

		const linkHandler = terminal.options.linkHandler;
		const event = {} as MouseEvent;
		const range = { start: { x: 1, y: 1 }, end: { x: 20, y: 1 } };
		const uri = "file:///Users/me/.claude/image-cache/abc/22.png";

		linkHandler?.activate(event, uri, range);
		linkHandler?.hover?.(event, uri, range);

		expect(onFileUrlClick).toHaveBeenCalledWith(
			event,
			"/Users/me/.claude/image-cache/abc/22.png",
		);
		expect(onUrlClick).not.toHaveBeenCalled();
		expect(onLinkHover).toHaveBeenCalledWith(event, {
			kind: "file",
			isDirectory: false,
		});
	});

	it("ignores an OSC 8 hyperlink with an unsupported scheme", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();
		const onFileUrlClick = mock();

		manager.setHandlers({
			stat: async () => null,
			onUrlClick,
			onFileUrlClick,
		});

		terminal.options.linkHandler?.activate({} as MouseEvent, "vbscript:evil", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});

		expect(onUrlClick).not.toHaveBeenCalled();
		expect(onFileUrlClick).not.toHaveBeenCalled();
	});

	it("clears only the OSC link handler it installed", () => {
		const { terminal, disposedProviders } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);

		manager.setHandlers({
			stat: async () => null,
			onUrlClick: mock(),
		});

		const installedHandler = terminal.options.linkHandler;
		expect(installedHandler).toBeTruthy();

		manager.dispose();

		expect(terminal.options.linkHandler).toBeNull();
		expect(disposedProviders.length).toBe(2);
	});

	it("resolves a relative path against the cwd the shell reports", async () => {
		const { terminal, registeredProviders, oscHandlers } = createMockTerminal([
			"src/App.tsx",
		]);
		const manager = new TerminalLinkManager(terminal);
		const statted: string[] = [];

		manager.setHandlers({
			stat: async (path) => {
				statted.push(path);
				return path === "/work/pkg/src/App.tsx"
					? { isDirectory: false, resolvedPath: path }
					: null;
			},
			onFileLinkClick: mock(),
		});

		expect(oscHandlers.get(7)?.("file://host/work/pkg")).toBe(false);

		const links = await new Promise<ILink[] | undefined>((resolve) => {
			registeredProviders[0]?.provideLinks(1, resolve);
		});

		expect(statted).toContain("/work/pkg/src/App.tsx");
		expect(links?.[0]?.text).toBe("src/App.tsx");
	});

	it("still links a path that only exists relative to the workspace root", async () => {
		const { terminal, registeredProviders, oscHandlers } = createMockTerminal([
			"apps/desktop/main.ts",
		]);
		const manager = new TerminalLinkManager(terminal);

		manager.setHandlers({
			// Only the unanchored path resolves — the host answers it against the
			// workspace root, as tools printing repo-relative paths expect.
			stat: async (path) =>
				path === "apps/desktop/main.ts"
					? { isDirectory: false, resolvedPath: "/work/apps/desktop/main.ts" }
					: null,
			onFileLinkClick: mock(),
		});

		oscHandlers.get(7)?.("file://host/work/apps/desktop");

		const links = await new Promise<ILink[] | undefined>((resolve) => {
			registeredProviders[0]?.provideLinks(1, resolve);
		});

		expect(links?.[0]?.text).toBe("apps/desktop/main.ts");
	});

	it("does not clear a link handler installed by another owner", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);

		manager.setHandlers({
			stat: async () => null,
			onUrlClick: mock(),
		});

		const replacementHandler = {
			activate: mock(),
		};
		terminal.options.linkHandler = replacementHandler;

		manager.dispose();

		expect(terminal.options.linkHandler).toBe(replacementHandler);
	});
});
