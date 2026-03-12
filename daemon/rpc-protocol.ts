/**
 * RPC protocol types and helpers for communicating with `pi --mode rpc`.
 * JSON-lines protocol over stdin/stdout.
 */

/** Commands sent to pi's stdin. */
export type RpcCommand =
	| { type: "prompt"; message: string }
	| { type: "follow_up"; message: string }
	| { type: "steer"; message: string }
	| { type: "abort" };

/** Event types received from pi's stdout. */
export interface RpcEvent {
	type: string;
	[key: string]: unknown;
}

/**
 * Extract text from the last assistant message in an agent_end event's messages array.
 * Works on raw JSON objects from RPC mode (same structure as SDK AgentMessage[]).
 */
export function extractResponseText(messages: readonly Record<string, unknown>[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;

		const content = msg.content;
		if (typeof content === "string") return content;

		if (Array.isArray(content)) {
			const textParts = (content as Array<{ type: string; text?: string }>)
				.filter((c) => c.type === "text" && c.text)
				.map((c) => c.text as string);
			if (textParts.length > 0) return textParts.join("\n\n");
		}
	}
	return "";
}
