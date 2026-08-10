import { type ClickPolicy, usePolicy } from "./policy";

export function useTerminalImagePolicy(): ClickPolicy {
	return usePolicy("imageLinks", "image", "4-tier");
}
