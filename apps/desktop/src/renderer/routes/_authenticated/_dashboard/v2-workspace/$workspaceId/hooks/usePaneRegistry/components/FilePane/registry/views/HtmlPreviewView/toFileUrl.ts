/**
 * `file://` URL for an absolute path, POSIX or Windows.
 *
 * The URL path setter is what escapes spaces and `#`/`?` while leaving a
 * Windows drive colon alone; hand-rolled encoding gets one of the two wrong.
 */
export function toFileUrl(absolutePath: string): string {
	const slashed = absolutePath.replaceAll("\\", "/");
	const url = new URL("file:///");
	url.pathname = slashed.startsWith("/") ? slashed : `/${slashed}`;
	return url.href;
}
