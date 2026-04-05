import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedCreateAgentSession, mockedInMemory } = vi.hoisted(() => ({
	mockedCreateAgentSession: vi.fn(),
	mockedInMemory: vi.fn(() => ({ kind: "in-memory-session-manager" })),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	createAgentSession: mockedCreateAgentSession,
	SessionManager: {
		inMemory: mockedInMemory,
	},
}));

import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { PiSessionBridge } from "../../core/chat-server/pi-session.js";

type EventListener = (event: Record<string, unknown>) => void;

function makeMockSession() {
	let listener: EventListener | null = null;
	return {
		subscribe: vi.fn((cb: EventListener) => {
			listener = cb;
			return () => {
				listener = null;
			};
		}),
		prompt: vi.fn(async (_text: string) => {
			listener?.({
				type: "message_update",
				assistantMessageEvent: { type: "text_delta", delta: "Hello" },
			});
			listener?.({
				type: "tool_execution_start",
				toolName: "read",
				args: { file: "README.md" },
			});
			listener?.({
				type: "tool_execution_end",
				toolName: "read",
				result: "# NixPI",
			});
			listener?.({ type: "agent_end" });
		}),
		newSession: vi.fn().mockResolvedValue(true),
		dispose: vi.fn(),
		emit: (event: Record<string, unknown>) => listener?.(event),
	};
}

async function collectEvents(bridge: PiSessionBridge, text: string) {
	const events = [];
	for await (const event of bridge.sendMessage(text)) {
		events.push(event);
	}
	return events;
}

describe("PiSessionBridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("normalizes SDK events into chat events", async () => {
		const session = makeMockSession();
		mockedCreateAgentSession.mockResolvedValue({ session });

		const bridge = new PiSessionBridge({ cwd: "/tmp/cwd" });
		const events = await collectEvents(bridge, "hi");

		expect(SessionManager.inMemory).toHaveBeenCalledOnce();
		expect(createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/tmp/cwd",
				sessionManager: expect.any(Object),
			}),
		);
		expect(events).toEqual([
			{ type: "text", content: "Hello" },
			{ type: "tool_call", name: "read", input: '{"file":"README.md"}' },
			{ type: "tool_result", name: "read", output: "# NixPI" },
			{ type: "done" },
		]);
	});

	it("emits an error event when prompt rejects", async () => {
		const session = makeMockSession();
		session.prompt.mockRejectedValue(new Error("Pi crashed"));
		mockedCreateAgentSession.mockResolvedValue({ session });

		const bridge = new PiSessionBridge({ cwd: "/tmp/cwd" });

		await expect(collectEvents(bridge, "hi")).resolves.toEqual([
			{ type: "error", message: "Error: Pi crashed" },
			{ type: "done" },
		]);
	});

	it("falls back to accumulated message.content text blocks", async () => {
		const session = makeMockSession();
		session.prompt.mockImplementation(async () => {
			session.emit({
				type: "message_update",
				message: { content: [{ type: "text", text: "Hello" }] },
			});
			session.emit({
				type: "message_update",
				message: { content: [{ type: "text", text: "Hello world" }] },
			});
			session.emit({ type: "agent_end" });
		});
		mockedCreateAgentSession.mockResolvedValue({ session });

		const bridge = new PiSessionBridge({ cwd: "/tmp/cwd" });

		await expect(collectEvents(bridge, "hi")).resolves.toEqual([
			{ type: "text", content: "Hello" },
			{ type: "text", content: " world" },
			{ type: "done" },
		]);
	});

	it("clears accumulated text cursors on agent_start across turns", async () => {
		const session = makeMockSession();
		session.prompt
			.mockImplementationOnce(async () => {
				session.emit({
					type: "message_update",
					message: { content: [{ type: "text", text: "First" }] },
				});
				session.emit({ type: "agent_end" });
			})
			.mockImplementationOnce(async () => {
				session.emit({ type: "agent_start" });
				session.emit({
					type: "message_update",
					message: { content: [{ type: "text", text: "Second" }] },
				});
				session.emit({ type: "agent_end" });
			});
		mockedCreateAgentSession.mockResolvedValue({ session });

		const bridge = new PiSessionBridge({ cwd: "/tmp/cwd" });
		await collectEvents(bridge, "first");
		const events = await collectEvents(bridge, "second");

		expect(events).toContainEqual({ type: "text", content: "Second" });
		expect(events).not.toContainEqual({ type: "text", content: "d" });
	});

	it("reset uses the session-level newSession API when supported", async () => {
		const session = makeMockSession();
		mockedCreateAgentSession.mockResolvedValue({ session });

		const bridge = new PiSessionBridge({ cwd: "/tmp/cwd" });
		await bridge.start();
		await bridge.reset();

		expect(session.newSession).toHaveBeenCalledOnce();
		expect(session.dispose).not.toHaveBeenCalled();
		expect(createAgentSession).toHaveBeenCalledTimes(1);
	});

	it("reset disposes and recreates lazily when session-level reset is unavailable", async () => {
		const firstSession = makeMockSession();
		const secondSession = makeMockSession();
		Reflect.deleteProperty(firstSession, "newSession");
		mockedCreateAgentSession
			.mockResolvedValueOnce({ session: firstSession })
			.mockResolvedValueOnce({ session: secondSession });

		const bridge = new PiSessionBridge({ cwd: "/tmp/cwd" });
		await bridge.start();
		await bridge.reset();
		await collectEvents(bridge, "after reset");

		expect(firstSession.dispose).toHaveBeenCalledOnce();
		expect(createAgentSession).toHaveBeenCalledTimes(2);
	});
});
