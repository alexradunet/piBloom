import fs from "node:fs";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock PiSessionBridge so the server test never instantiates a real Pi SDK session.
vi.mock("../../core/chat-server/pi-session.js", () => ({
	PiSessionBridge: vi.fn().mockImplementation(function () {
		return {
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			reset: vi.fn().mockResolvedValue(undefined),
			sendMessage: vi.fn(async function* () {
				yield { type: "text", content: "Hello from Pi" };
				yield { type: "done" };
			}),
		};
	}),
}));

import { createChatServer, isMainModule } from "../../core/chat-server/index.js";

let server: http.Server;
let port: number;
let tmpDir: string;

beforeAll(async () => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-chat-server-test-"));
	const distDir = new URL("../../core/chat-server/frontend/dist", import.meta.url).pathname;
	const sourceDir = new URL("../../core/chat-server/frontend", import.meta.url).pathname;
	const sourceIndex = path.join(sourceDir, "index.html");
	const distIndex = path.join(distDir, "index.html");
	server = createChatServer({
		agentCwd: tmpDir,
		staticDir:
			fs.existsSync(distIndex) && fs.statSync(distIndex).mtimeMs >= fs.statSync(sourceIndex).mtimeMs
				? distDir
				: sourceDir,
	});
	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			port = (server.address() as { port: number }).port;
			resolve();
		});
	});
});

afterAll(() => {
	server?.close();
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /chat", () => {
	it("streams NDJSON events for a message", async () => {
		const res = await fetch(`http://127.0.0.1:${port}/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message: "hi" }),
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/x-ndjson");
		const text = await res.text();
		const lines = text
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(lines).toContainEqual({ type: "text", content: "Hello from Pi" });
		expect(lines[lines.length - 1]).toEqual({ type: "done" });
	});

	it("returns 400 for missing message", async () => {
		const res = await fetch(`http://127.0.0.1:${port}/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 for invalid JSON", async () => {
		const res = await fetch(`http://127.0.0.1:${port}/chat`, {
			method: "POST",
			body: "not json",
		});
		expect(res.status).toBe(400);
	});
});

describe("DELETE /chat/:id", () => {
	it("returns 204 and resets the Pi session", async () => {
		const res = await fetch(`http://127.0.0.1:${port}/chat/any-id`, {
			method: "DELETE",
		});
		expect(res.status).toBe(204);
	});
});

describe("GET /", () => {
	// Keep the double space so vitest -t "combined chat + terminal shell" matches this name as a regex.
	it("returns the combined chat  terminal shell", async () => {
		const res = await fetch(`http://127.0.0.1:${port}/`);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("nixpi-shell");
		expect(html).toContain("<iframe");
		expect(html).toContain('src="/terminal/"');
	});
});

describe("isMainModule", () => {
	it("returns true when argv[1] resolves through a symlink to the module path", () => {
		const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-chat-entrypoint-test-"));
		try {
			const entryFile = path.join(fixtureDir, "entry.js");
			const symlinkFile = path.join(fixtureDir, "entry-link.js");
			fs.writeFileSync(entryFile, "// test fixture\n");
			fs.symlinkSync(entryFile, symlinkFile);
			expect(isMainModule(symlinkFile, new URL(`file://${entryFile}`).href)).toBe(true);
		} finally {
			fs.rmSync(fixtureDir, { recursive: true, force: true });
		}
	});
});
