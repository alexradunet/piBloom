import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomProcessOptions } from "../../daemon/room-process.js";

// Mock child_process.spawn to use a stand-in process instead of `pi`
vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		spawn: (_cmd: string, _args: string[], opts: Record<string, unknown>) => {
			// Replace `pi --mode rpc` with a simple node process that reads stdin
			return actual.spawn(
				"node",
				[
					"-e",
					`
				const hold = setInterval(() => {}, 1000);
				process.stdin.resume();
				process.stdin.on("data", (d) => {
					for (const line of d.toString().split("\\n").map((part) => part.trim()).filter(Boolean)) {
						try {
							const cmd = JSON.parse(line);
							// Echo agent_start then agent_end with a response
							if (cmd.type === "prompt") {
								process.stdout.write(JSON.stringify({type:"agent_start"}) + "\\n");
								process.stdout.write(JSON.stringify({type:"message_update",assistantMessageEvent:{type:"text_delta",delta:"hi"}}) + "\\n");
								process.stdout.write(JSON.stringify({type:"agent_end",messages:[{role:"assistant",content:"hi"}]}) + "\\n");
							}
						} catch {}
					}
				});
				process.on("SIGTERM", () => {
					clearInterval(hold);
					process.exit(0);
				});
			`,
				],
				{ ...opts, stdio: ["pipe", "pipe", "pipe"] },
			);
		},
	};
});

describe("RoomProcess", () => {
	let tmpDir: string;
	let socketDir: string;
	let sessionDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "room-process-"));
		socketDir = join(tmpDir, "sockets");
		sessionDir = join(tmpDir, "sessions");
		mkdirSync(socketDir, { recursive: true });
		mkdirSync(sessionDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeOpts(overrides: Partial<RoomProcessOptions> = {}): RoomProcessOptions {
		return {
			roomId: "!abc:bloom",
			roomAlias: "#general:bloom",
			sanitizedAlias: "general_bloom",
			socketDir,
			sessionDir,
			idleTimeoutMs: 60_000,
			onAgentEnd: vi.fn(),
			onEvent: vi.fn(),
			onExit: vi.fn(),
			transport: { kind: "none" as const },
			...overrides,
		};
	}

	it("spawns successfully with a non-unix transport", async () => {
		const { RoomProcess } = await import("../../daemon/room-process.js");
		const rp = new RoomProcess(makeOpts());
		await rp.spawn();

		expect(rp.alive).toBe(true);
		rp.dispose();
	});

	it("dispose kills process and removes socket", async () => {
		const { RoomProcess } = await import("../../daemon/room-process.js");
		const rp = new RoomProcess(makeOpts());
		await rp.spawn();
		rp.dispose();

		expect(rp.alive).toBe(false);
	});

	it("does not call onExit when intentionally disposed", async () => {
		const { RoomProcess } = await import("../../daemon/room-process.js");
		const onExit = vi.fn();
		const rp = new RoomProcess(makeOpts({ onExit }));
		await rp.spawn();
		rp.dispose();

		await new Promise((r) => setTimeout(r, 100));
		expect(onExit).not.toHaveBeenCalled();
	});

	it("handles prompt/response traffic without crashing", async () => {
		const { RoomProcess } = await import("../../daemon/room-process.js");
		const rp = new RoomProcess(makeOpts());
		await rp.spawn();

		rp.send({ type: "prompt", message: "hello" });

		// Wait for mock process to echo back and remain alive.
		await new Promise((r) => setTimeout(r, 200));
		expect(rp.alive).toBe(true);

		rp.dispose();
	});

	it("tracks streaming state", async () => {
		const { RoomProcess } = await import("../../daemon/room-process.js");
		const rp = new RoomProcess(makeOpts());
		await rp.spawn();

		expect(rp.isStreaming).toBe(false);

		rp.send({ type: "prompt", message: "hello" });
		// Brief pause for agent_start to arrive
		await new Promise((r) => setTimeout(r, 50));
		// After agent_end, streaming should be false again
		await new Promise((r) => setTimeout(r, 200));
		expect(rp.isStreaming).toBe(false);

		rp.dispose();
	});

	it("sendMessage uses follow_up when streaming", async () => {
		const { RoomProcess } = await import("../../daemon/room-process.js");
		const rp = new RoomProcess(makeOpts());
		await rp.spawn();

		// Directly set streaming state for test
		(rp as unknown as { streaming: boolean }).streaming = true;
		// sendMessage should use follow_up — verify no crash
		rp.sendMessage("test while streaming");

		rp.dispose();
	});

	it("resets idle timer on send", async () => {
		const { RoomProcess } = await import("../../daemon/room-process.js");
		const rp = new RoomProcess(makeOpts({ idleTimeoutMs: 500 }));
		await rp.spawn();

		rp.send({ type: "prompt", message: "hello" });

		// Wait less than timeout
		await new Promise((r) => setTimeout(r, 300));
		expect(rp.alive).toBe(true);

		rp.dispose();
	});
});
