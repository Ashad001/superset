import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { LinkAction, Surface } from "./types";

const FILE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.file.pane", message: "Open in tab" }),
	newTab: msg({ id: "clickPolicy.file.newTab", message: "Open in new tab" }),
	external: msg({ id: "clickPolicy.file.external", message: "Open in editor" }),
	system: msg({
		id: "clickPolicy.file.system",
		message: "Open in default app",
	}),
};

// "system" isn't offered for URLs — the OS handler for a URL is the default
// browser, which "external" already covers. Labelled anyway so a settings row
// carrying it (hand-edited, or a file map copied onto a URL map) still reads.
const URL_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.url.pane", message: "Open in in-app browser" }),
	newTab: msg({
		id: "clickPolicy.url.newTab",
		message: "Open in new browser tab",
	}),
	external: msg({
		id: "clickPolicy.url.external",
		message: "Open in default browser",
	}),
	system: msg({
		id: "clickPolicy.url.system",
		message: "Open in default browser",
	}),
};

// A pasted image has no editor worth opening it in, so "external" means the OS
// handler (Preview) rather than the configured code editor.
const IMAGE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.image.pane", message: "Open in tab" }),
	newTab: msg({ id: "clickPolicy.image.newTab", message: "Open in new tab" }),
	external: msg({
		id: "clickPolicy.image.external",
		message: "Open in default app",
	}),
	system: msg({
		id: "clickPolicy.image.system",
		message: "Open in default app",
	}),
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
		? i18n._({ id: "clickPolicy.action.none", message: "Do nothing" })
		: actionLabel(action, surface);
}

/** Short verb form used inside the per-row hint tooltip. */
const SHORT_FILE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.short.file.pane", message: "open" }),
	newTab: msg({ id: "clickPolicy.short.file.newTab", message: "new tab" }),
	external: msg({ id: "clickPolicy.short.file.external", message: "editor" }),
	system: msg({ id: "clickPolicy.short.file.system", message: "default app" }),
};

const SHORT_URL_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.short.url.pane", message: "in-app browser" }),
	newTab: msg({ id: "clickPolicy.short.url.newTab", message: "new tab" }),
	external: msg({
		id: "clickPolicy.short.url.external",
		message: "default browser",
	}),
	system: msg({
		id: "clickPolicy.short.url.system",
		message: "default browser",
	}),
};

const SHORT_IMAGE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.short.image.pane", message: "open" }),
	newTab: msg({ id: "clickPolicy.short.image.newTab", message: "new tab" }),
	external: msg({
		id: "clickPolicy.short.image.external",
		message: "default app",
	}),
	system: msg({
		id: "clickPolicy.short.image.system",
		message: "default app",
	}),
};

export function shortActionLabel(action: LinkAction, surface: Surface): string {
	if (surface === "image") return i18n._(SHORT_IMAGE_LABELS[action]);
	return i18n._(
		surface === "file" ? SHORT_FILE_LABELS[action] : SHORT_URL_LABELS[action],
	);
}
