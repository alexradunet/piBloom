import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

export type ChatEvent =
	| { type: "text"; content: string }
	| { type: "tool_call"; name: string; input: string }
	| { type: "tool_result"; name: string; output: string }
	| { type: "done" }
	| { type: "error"; message: string };

export interface PiSessionBridgeOptions {
	cwd: string;
}

type MessageContentBlock = { type?: string; text?: string };

type MessageUpdateEvent = {
	type: "message_update";
	assistantMessageEvent?: { type?: string; delta?: string };
	message?: { content?: MessageContentBlock[] };
};

type ToolStartEvent = {
	type: "tool_execution_start";
	toolName?: string;
	args?: unknown;
};

type ToolEndEvent = {
	type: "tool_execution_end";
	toolName?: string;
	result?: unknown;
};

type AgentBoundaryEvent = { type: "agent_start" | "agent_end" };

type SessionEvent = MessageUpdateEvent | ToolStartEvent | ToolEndEvent | AgentBoundaryEvent;

type PiSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

type ResettablePiSession = PiSession & {
	newSession?: () => Promise<boolean>;
	dispose?: () => void;
};

export class PiSessionBridge {
	private sessionPromise: Promise<ResettablePiSession> | null = null;
	private readonly textCursors = new Map<number, number>();

	constructor(private readonly opts: PiSessionBridgeOptions) {}

	private async createSession(): Promise<ResettablePiSession> {
		const sessionManager = SessionManager.inMemory(this.opts.cwd);
		const { session } = await createAgentSession({
			cwd: this.opts.cwd,
			sessionManager,
		});
		return session as ResettablePiSession;
	}

	private async getSession(): Promise<ResettablePiSession> {
		if (!this.sessionPromise) {
			this.sessionPromise = this.createSessionPromise();
		}

		return this.sessionPromise;
	}

	private createSessionPromise(): Promise<ResettablePiSession> {
		const sessionPromise = this.createSession().catch((error: unknown) => {
			if (this.sessionPromise === sessionPromise) {
				this.sessionPromise = null;
			}
			throw error;
		});
		return sessionPromise;
	}

	private static stringifyToolInput(value: unknown): string {
		return JSON.stringify(value ?? {});
	}

	private static stringifyToolOutput(value: unknown): string {
		if (typeof value === "string") {
			return value;
		}

		return JSON.stringify(value ?? "");
	}

	private clearTextCursors(): void {
		this.textCursors.clear();
	}

	private enqueueToolStart(queue: ChatEvent[], event: ToolStartEvent): void {
		queue.push({
			type: "tool_call",
			name: event.toolName ?? "unknown",
			input: PiSessionBridge.stringifyToolInput(event.args),
		});
	}

	private enqueueToolEnd(queue: ChatEvent[], event: ToolEndEvent): void {
		queue.push({
			type: "tool_result",
			name: event.toolName ?? "unknown",
			output: PiSessionBridge.stringifyToolOutput(event.result),
		});
	}

	private handleSessionEvent(event: SessionEvent, queue: ChatEvent[], finish: () => void): void {
		switch (event.type) {
			case "agent_start":
				this.clearTextCursors();
				break;
			case "message_update":
				queue.push(...this.normalizeMessageUpdate(event));
				break;
			case "tool_execution_start":
				this.enqueueToolStart(queue, event);
				break;
			case "tool_execution_end":
				this.enqueueToolEnd(queue, event);
				break;
			case "agent_end":
				finish();
				break;
		}
	}

	private static shiftQueuedEvent(queue: ChatEvent[]): ChatEvent | null {
		return queue.shift() ?? null;
	}

	private normalizeMessageUpdate(event: MessageUpdateEvent): ChatEvent[] {
		if (event.assistantMessageEvent?.type === "text_delta" && event.assistantMessageEvent.delta) {
			return [{ type: "text", content: event.assistantMessageEvent.delta }];
		}

		const content = event.message?.content;
		if (!content) {
			return [];
		}

		const events: ChatEvent[] = [];
		for (const [index, block] of content.entries()) {
			if (block.type !== "text" || !block.text) {
				continue;
			}

			const previousLength = this.textCursors.get(index) ?? 0;
			const delta = block.text.slice(previousLength);
			if (!delta) {
				continue;
			}

			this.textCursors.set(index, block.text.length);
			events.push({ type: "text", content: delta });
		}

		return events;
	}

	async start(): Promise<void> {
		await this.getSession();
	}

	async reset(): Promise<void> {
		const currentSessionPromise = this.sessionPromise;
		this.clearTextCursors();
		if (!currentSessionPromise) {
			return;
		}

		const session = await currentSessionPromise;
		if (typeof session.newSession === "function") {
			await session.newSession();
			return;
		}

		this.sessionPromise = null;
		session.dispose?.();
	}

	async stop(): Promise<void> {
		const currentSessionPromise = this.sessionPromise;
		this.sessionPromise = null;
		this.clearTextCursors();
		if (!currentSessionPromise) {
			return;
		}

		const session = await currentSessionPromise;
		session.dispose?.();
	}

	async *sendMessage(text: string): AsyncGenerator<ChatEvent> {
		const session = await this.getSession();
		const queue: ChatEvent[] = [];
		let done = false;
		let notify: (() => void) | null = null;

		const wake = () => {
			notify?.();
			notify = null;
		};

		const finish = () => {
			done = true;
			wake();
		};

		const unsubscribe = session.subscribe((event) => {
			this.handleSessionEvent(event as SessionEvent, queue, finish);
			if (queue.length > 0) {
				wake();
			}
		});

		session
			.prompt(text)
			.then(() => {
				if (!done) {
					finish();
				}
			})
			.catch((error: unknown) => {
				queue.push({ type: "error", message: String(error) });
				finish();
			});

		try {
			while (!done || queue.length > 0) {
				if (queue.length === 0 && !done) {
					await new Promise<void>((resolve) => {
						notify = resolve;
					});
				}

				while (queue.length > 0) {
					const nextEvent = PiSessionBridge.shiftQueuedEvent(queue);
					if (!nextEvent) {
						continue;
					}
					yield nextEvent;
				}
			}
		} finally {
			unsubscribe();
		}

		yield { type: "done" };
	}
}
