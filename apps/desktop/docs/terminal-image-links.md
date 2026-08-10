# Terminal image links

How an image pasted into a terminal becomes clickable, and what clicking it does.

## The problem

Pasting an image into an agent CLI running in a terminal pane prints a
placeholder — `[Image #190]` from Claude Code, `[image 1]` from others — and
nothing more. There is no file to open and no path on screen, because
`terminal-image-paste-fallback.ts` deliberately forwards the paste to the agent
as raw `^V` (`terminal.input("\x16")`) and lets the CLI read the clipboard
itself. That behavior is load-bearing: TUIs key off `^V`, and xterm's bracketed
paste sends empty markers for file payloads (#3582).

So the user can see that *an* image was attached but never what it was.

## The flow

```
paste (⌘V)
  │
  ├─ terminal-image-paste-fallback.ts
  │     isNonTextPaste()  → files present, no text/plain
  │     snapshot event.clipboardData.files   (valid only during dispatch)
  │     terminal.input("\x16")               → agent reads the clipboard, unchanged
  │     onPaste(files)
  │
  ├─ pasted-image-store.ts  ·  stagePastedImages(terminalId, files)
  │     filter to images ≤ 10MB
  │     external.writeTempFile  →  $TMPDIR/superset-pasted/<name>
  │     append path to stagedByTerminal[terminalId]        (paste order)
  │
  ▼
agent prints "[Image #190]"
  │
  ├─ image-placeholder-detector.ts  (xterm ILinkProvider)
  │     matches /\[\s*image\s*#?\s*\d+\s*\]/gi on the hovered line
  │     link.activate → countPlaceholdersBefore(buffer, line, x, cols)
  │
  ▼
TerminalPane · onImageLinkClick(event, ordinal)
      imagePolicy.getAction(event)        ← Settings → Links → Image links
      getStagedImage(terminalId, ordinal)
        ├─ "pane"     → onOpenFile(path)          in-app tab, ImageView
        ├─ "newTab"   → onOpenFile(path, true)
        ├─ "external" → external.openPath(path)   macOS Preview
        └─ missing    → toast "No preview available for this image"
```

## Why the ordinal, not the number

The number inside the placeholder belongs to the agent. Claude Code's counter is
session-wide and starts nowhere near 1 (`#190` in the original report), and every
CLI formats it differently. Each paste appends exactly one placeholder, so the
**k-th placeholder in the buffer is the k-th image staged for that terminal** —
`countPlaceholdersBefore` computes k by scanning earlier lines.

Consequence: if the agent shows an image that never came through a paste we saw
— a drag-drop, or output replayed from a resumed session — the ordinal doesn't
line up. That resolves to nothing and the user gets a toast, rather than the
wrong image opening.

## Settings

`imageLinks` joins `fileLinks` / `urlLinks` / `sidebarFileLinks` as a
`LinkTierMap` on v2 user preferences, with a **Image links** block in
Settings → Links driven by the same `LinkTierMapper`.

Defaults differ from file links on purpose — a placeholder has no path to read,
so requiring a modifier nobody would guess makes the feature undiscoverable:

| Tier | Action | Label |
|---|---|---|
| Click | `pane` | Open in tab |
| ⇧ Click | `newTab` | Open in new tab |
| ⌘ Click | `pane` | Open in tab |
| ⌘⇧ Click | `external` | Open in default app |

`external` reads "Open in default app" on this surface rather than "Open in
editor" — a pasted screenshot has no editor worth opening it in.

## Lifecycle

- Staged paths live in a module-level `Map` keyed by terminal id, cleared in
  `disposeRuntime` only when the persisted buffer is cleared too. A preserved
  buffer still shows the placeholders, so its images must outlive the runtime.
- The temp files themselves are left to the OS to reap. They sit under
  `$TMPDIR/superset-pasted/`, and unlinking on dispose would break a placeholder
  in a buffer that was preserved.
- Staging failures are swallowed (logged only). The paste already reached the
  agent by then; a missing preview copy must not interrupt typing.

## Files

| File | Role |
|---|---|
| `lib/terminal/terminal-image-paste-fallback.ts` | forwards `^V`, then hands the files to a listener |
| `lib/terminal/pasted-image-store.ts` | stages copies, per-terminal ordered list |
| `lib/terminal/links/image-placeholder-detector.ts` | xterm link provider + ordinal counting |
| `lib/terminal/terminal-link-manager.ts` | registers it above the word detector, so `[Image #3]` isn't read as a filename |
| `lib/clickPolicy/*` | `image` surface, labels, `useTerminalImagePolicy` |
| `settings/links/*` | the Image links block and its search entry |
| `trpc/routers/external/index.ts` | `writeTempFile`, `openPath` |

## Known limits

- **Couples to text agent CLIs own.** The regex matches what Claude Code, Codex
  and opencode print today. A format change silently stops matching — the
  placeholder just stops being a link.
- **v2 terminal panes only.** The v1 terminal has its own link path.
- **`external.openPath` also exists on the `feat/open-in-default-app` branch.**
  Whichever lands second needs that hunk resolved.
