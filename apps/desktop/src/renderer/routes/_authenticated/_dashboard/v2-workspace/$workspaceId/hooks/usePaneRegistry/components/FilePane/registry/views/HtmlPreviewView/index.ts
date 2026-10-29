import { msg } from "@lingui/core/macro";
import { isHtmlFile } from "shared/file-types";
import type { FileView } from "../../types";
import { HtmlPreviewView } from "./HtmlPreviewView";

export const htmlPreviewView: FileView = {
	id: "html-preview",
	label: msg({ message: "Preview" }),
	match: (filePath) => isHtmlFile(filePath),
	priority: "option",
	documentKind: "text",
	Renderer: HtmlPreviewView,
};
