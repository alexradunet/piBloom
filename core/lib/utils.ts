/**
 * Pure utility functions with no side effects.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { err, ok, type Result } from "neverthrow";

/** Canonical result type for all extension action functions. */
export type ActionResult<TDetails extends object = Record<string, unknown>> = Result<
	{ text: string; details?: TDetails },
	string
>;

export { err, ok };

/** Convert an ActionResult to the tool result shape expected by pi-coding-agent. */
export function toToolResult<TDetails extends object>(result: ActionResult<TDetails>) {
	if (result.isErr()) {
		return textToolResult(result.error, {}, true);
	}
	return textToolResult(result.value.text, result.value.details ?? {});
}

export function truncate(text: string): string {
	return truncateHead(text, { maxLines: 2000, maxBytes: 50000 }).content;
}

export function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// --- Moved from extension-tools.ts ---

export type RegisteredExtensionTool = Parameters<ExtensionAPI["registerTool"]>[0];
export const EmptyToolParams = Type.Object({});

export function textToolResult<TDetails extends object>(
	text: string,
	details: TDetails = {} as TDetails,
	isError?: boolean,
) {
	return {
		content: [{ type: "text" as const, text }],
		details,
		...(isError !== undefined ? { isError } : {}),
	};
}

export function errorResult(message: string) {
	return textToolResult(message, {}, true);
}

export function registerTools(pi: ExtensionAPI, tools: readonly RegisteredExtensionTool[]): void {
	for (const tool of tools) {
		pi.registerTool(tool);
	}
}
