# Terminal file:// links and Image links

How an image an agent attached becomes clickable in a terminal pane, and what
clicking it does.

## The problem

Pasting an image into an agent CLI running in a terminal pane prints a
placeholder — `[Image #22]` from Claude Code — and clicking it did nothing.

The information was already there. Claude Code writes the image to
`~/.claude/image-cache/<session>/22.png` and emits an **OSC 8 hyperlink** on the
placeholder pointing at `file:///Users/…/22.png`; hovering it already showed the
path. Activation was blocked by one line in the OSC 8 handler:

```ts
this._oscLinkHandler = {
    allowNonHttpProtocols: false,   // xterm refuses to activate file://
```

So the terminal was handed a real path and threw it away.

## The flow

```
agent prints "[Image #22]"  (OSC 8 hyperlink → file:///…/image-cache/<session>/22.png)
  │
  ├─ terminal-link-manager.ts · _oscLinkHandler
  │     allowNonHttpProtocols: true
  │     activate → fileUriToPath(uri)
  │                  ├─ file://  → onFileUrlClick(event, path)
  │                  ├─ http(s)  → onUrlClick(event, uri)
  │                  └─ anything else → ignored
  │
  ▼
TerminalPane · onFileUrlClick(event, path)
      getImageMimeType(path) → image?  imagePolicy : filePolicy
      policy.getAction(event)          ← Settings → Links → Image / File links
        ├─ "pane"     → onOpenFile(path)         in-app tab (ImageView for images)
        ├─ "newTab"   → onOpenFile(path, true)
        ├─ "external" → image: external.openPath (Preview)
        │               file:  openInExternalEditor
        └─ null       → click hint, nothing opens
```

Nothing is copied or cached — the file the agent wrote is opened in place.

## Settings

`imageLinks` joins `fileLinks` / `urlLinks` / `sidebarFileLinks` as a
`LinkTierMap` on v2 user preferences, with an **Image links** block in
Settings → Links driven by the same `LinkTierMapper`.

Defaults are more eager than file links on purpose: an image placeholder is
obviously clickable, so a plain click should open it rather than requiring a
modifier nobody would guess.

| Tier | Action | Label |
|---|---|---|
| Click | `pane` | Open in tab |
| ⇧ Click | `newTab` | Open in new tab |
| ⌘ Click | `pane` | Open in tab |
| ⌘⇧ Click | `external` | Open in default app |

`external` reads "Open in default app" on this surface rather than "Open in
editor" — a screenshot has no editor worth opening it in. Non-image `file://`
links fall through to the existing File links tiers, where `external` still
means the configured editor.

## Files

| File | Role |
|---|---|
| `lib/terminal/links/file-uri.ts` | `file://` URI → path; rejects UNC and other schemes |
| `lib/terminal/terminal-link-manager.ts` | OSC 8 handler routes by scheme; new `onFileUrlClick` |
| `lib/clickPolicy/*` | `image` surface, labels, `useTerminalImagePolicy` |
| `settings/links/*` | the Image links block and its search entry |
| `trpc/routers/external/index.ts` | `openPath` (`shell.openPath`) for the default-app action |

## Notes and limits

- **Only as good as the agent's hyperlink.** A CLI that prints a placeholder
  without an OSC 8 link gets nothing — there is no path to open. Claude Code
  links them today; others vary.
- **v2 terminal panes only.** The v1 terminal has its own link path.
- **Scheme allowlist.** `allowNonHttpProtocols: true` lets xterm hand us every
  scheme, so the handler explicitly opens only `file://` and `http(s)://` and
  ignores the rest rather than forwarding them to the OS.
- **`external.openPath` also exists on the `feat/open-in-default-app` branch.**
  Whichever lands second needs that hunk resolved.
