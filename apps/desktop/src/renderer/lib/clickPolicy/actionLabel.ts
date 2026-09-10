import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { LinkAction, Surface } from "./types";

const FILE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "Open in tab" }),
	newTab: msg({ message: "Open in new tab" }),
	external: msg({ message: "Open in editor" }),
	system: msg({ message: "Open in default app" }),
};

// "system" isn't offered for URLs — the OS handler for a URL is the default
// browser, which "external" already covers. Labelled anyway so a settings row
// carrying it (hand-edited, or a file map copied onto a URL map) still reads.
const URL_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "Open in split pane" }),
	newTab: msg({ message: "Open in new tab" }),
	external: msg({ message: "Open in external browser" }),
	system: msg({ message: "Open in external browser" }),
};

// A pasted image has no editor worth opening it in, so "external" means the OS
// handler (Preview) rather than the configured code editor.
const IMAGE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "Open in tab" }),
	newTab: msg({ message: "Open in new tab" }),
	external: msg({ message: "Open in default app" }),
	system: msg({ message: "Open in default app" }),
};

export function actionLabel(action: LinkAction, surface: Surface): string {
	if (surface === "image") return i18n._(IMAGE_LABELS[action]);
	return i18n._(surface === "file" ? FILE_LABELS[action] : URL_LABELS[action]);
}

export function actionLabelOrNone(
	action: LinkAction | null,
	surface: Surface,
): string {
	return action === null
		? i18n._(msg({ message: "Do nothing" }))
		: actionLabel(action, surface);
}

/** Short verb form used inside the per-row hint tooltip. */
const SHORT_FILE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "open" }),
	newTab: msg({ message: "new tab" }),
	external: msg({ message: "editor" }),
	system: msg({ message: "default app" }),
};

const SHORT_URL_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "split pane" }),
	newTab: msg({ message: "new tab" }),
	external: msg({ message: "external browser" }),
	system: msg({ message: "external browser" }),
};

const SHORT_IMAGE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "open" }),
	newTab: msg({ message: "new tab" }),
	external: msg({ message: "default app" }),
	system: msg({ message: "default app" }),
};

export function shortActionLabel(action: LinkAction, surface: Surface): string {
	if (surface === "image") return i18n._(SHORT_IMAGE_LABELS[action]);
	return i18n._(
		surface === "file" ? SHORT_FILE_LABELS[action] : SHORT_URL_LABELS[action],
	);
}
