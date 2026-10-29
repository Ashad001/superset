import { useEffect, useRef } from "react";
import type { ViewProps } from "../../types";
import { toFileUrl } from "./toFileUrl";

export function HtmlPreviewView({ document, filePath }: ViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	// Previews the file on disk, so relative stylesheets and scripts resolve.
	// Revision changes on save and on an external edit — not on a keystroke —
	// which is exactly when the preview is stale.
	const revision =
		document.content.kind === "text" ? document.content.revision : null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision is the remount trigger
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const webview = window.document.createElement(
			"webview",
		) as Electron.WebviewTag;
		// Its own in-memory session: previewed markup is untrusted and has no
		// business reading the app session's cookies.
		webview.setAttribute("partition", "superset-html-preview");
		webview.style.width = "100%";
		webview.style.height = "100%";
		webview.src = toFileUrl(filePath);
		container.appendChild(webview);
		return () => webview.remove();
	}, [filePath, revision]);

	return <div ref={containerRef} className="h-full w-full bg-background" />;
}
