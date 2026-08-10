import { electronTrpcClient } from "renderer/lib/trpc-client";

// An image pasted into a terminal reaches the agent as raw ^V bytes and never
// lands on disk, so the CLI's "[Image #12]" placeholder is the only trace of it
// and there is nothing for a link to open. Keep a copy per terminal, in paste
// order, so the Nth placeholder in the buffer resolves to the Nth paste.
//
// Deliberately not keyed on the number inside the placeholder: that counter
// belongs to the agent (Claude Code's runs session-wide and starts nowhere near
// 1), and every CLI formats it differently.

const MAX_STAGED_BYTES = 10 * 1024 * 1024;

const stagedByTerminal = new Map<string, string[]>();

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	// String.fromCharCode(...bytes) exceeds the argument limit on large images.
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/**
 * Copy pasted images to temp files and record them against the terminal.
 * Failures are swallowed: the paste already reached the agent, so a missing
 * preview copy must not interrupt what the user is doing.
 */
export async function stagePastedImages(
	terminalId: string,
	files: File[],
): Promise<void> {
	const images = files.filter(
		(file) => file.type.startsWith("image/") && file.size <= MAX_STAGED_BYTES,
	);

	for (const image of images) {
		try {
			const bytes = new Uint8Array(await image.arrayBuffer());
			const { path } = await electronTrpcClient.external.writeTempFile.mutate({
				filename: image.name || "pasted-image.png",
				dataBase64: toBase64(bytes),
			});
			const staged = stagedByTerminal.get(terminalId);
			if (staged) {
				staged.push(path);
			} else {
				stagedByTerminal.set(terminalId, [path]);
			}
		} catch (error) {
			console.error("Failed to stage pasted image:", error);
		}
	}
}

/** Path of the `ordinal`-th (0-based) image pasted into this terminal. */
export function getStagedImage(
	terminalId: string,
	ordinal: number,
): string | undefined {
	return stagedByTerminal.get(terminalId)?.[ordinal];
}

export function clearStagedImages(terminalId: string): void {
	stagedByTerminal.delete(terminalId);
}
