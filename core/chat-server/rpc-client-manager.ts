// core/chat-server/rpc-client-manager.ts
import path from "node:path";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { createRpcClient, type RpcClientLike } from "./pi-rpc-client.js";

export type ChatEvent =
	| { type: "text"; content: string }
	| { type: "tool_call"; name: string; input: string }
	| { type: "tool_result"; name: string; output: string }
	| { type: "done" }
	| { type: "error"; message: string };

export interface RpcClientManagerOptions {
	/** Path to /usr/local/share/nixpi (the deployed app share dir). */
	nixpiShareDir: string;
	/** Working directory for the Pi agent process (e.g. ~/.pi). */
	cwd: string;
}

export class RpcClientManager {
	private readonly clientPromise: Promise<RpcClientLike>;
	/** Per-content-block text cursors; cleared on agent_start to reset each turn. */
	private readonly textCursors = new Map<number, number>();

	constructor(opts: RpcClientManagerOptions) {
		const cliPath = path.join(
			opts.nixpiShareDir,
			"node_modules/@mariozechner/pi-coding-agent/dist/cli.js",
		);
		this.clientPromise = createRpcClient({ cliPath, cwd: opts.cwd });
	}

	async start(): Promise<void> {
		const client = await this.clientPromise;
		await client.start();
	}

	async stop(): Promise<void> {
		const client = await this.clientPromise;
		await client.stop();
	}

	async reset(): Promise<void> {
		const client = await this.clientPromise;
		await client.newSession();
	}

	async *sendMessage(text: string): AsyncGenerator<ChatEvent> {
		const client = await this.clientPromise;
		const queue: ChatEvent[] = [];
		let notify: (() => void) | null = null;
		let done = false;

		const unsub = client.onEvent((event: AgentEvent) => {
			const events: ChatEvent[] = [];

			if (event.type === "agent_start") {
				this.textCursors.clear();
			} else if (event.type === "message_update") {
				const msg = (event as { message?: { content?: unknown[] } }).message;
				if (msg?.content) {
					(msg.content as { type: string; text?: string }[]).forEach((block, idx) => {
						if (block.type === "text" && block.text) {
							const prev = this.textCursors.get(idx) ?? 0;
							const delta = block.text.slice(prev);
							if (delta) {
								this.textCursors.set(idx, block.text.length);
								events.push({ type: "text", content: delta });
							}
						}
					});
				}
			} else if (event.type === "tool_execution_start") {
				const e = event as { toolName: string; args: unknown };
				events.push({ type: "tool_call", name: e.toolName, input: JSON.stringify(e.args ?? {}) });
			} else if (event.type === "tool_execution_end") {
				const e = event as { toolName: string; result: unknown };
				const output = typeof e.result === "string" ? e.result : JSON.stringify(e.result ?? "");
				events.push({ type: "tool_result", name: e.toolName, output });
			} else if (event.type === "agent_end") {
				done = true;
			}

			if (events.length > 0 || done) {
				queue.push(...events);
				notify?.();
				notify = null;
			}
		});

		client.prompt(text).catch((err: unknown) => {
			queue.push({ type: "error", message: String(err) });
			done = true;
			notify?.();
			notify = null;
		});

		try {
			while (!done || queue.length > 0) {
				if (queue.length === 0 && !done) {
					await new Promise<void>((r) => {
						notify = r;
					});
				}
				while (queue.length > 0) {
					yield queue.shift()!;
				}
			}
			yield { type: "done" };
		} finally {
			unsub();
		}
	}
}
