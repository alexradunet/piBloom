import fs from "node:fs";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isSystemReady, shouldRedirectToSetup } from "../../core/chat-server/setup.js";

let tmpDir: string;
let systemReadyFile: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-setup-test-"));
	systemReadyFile = path.join(tmpDir, "system-ready");
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("isSystemReady", () => {
	it("returns false when system-ready file is absent", () => {
		expect(isSystemReady(systemReadyFile)).toBe(false);
	});

	it("returns true when system-ready file exists", () => {
		fs.writeFileSync(systemReadyFile, "");
		expect(isSystemReady(systemReadyFile)).toBe(true);
	});
});

describe("shouldRedirectToSetup", () => {
	it("returns true for / when system is not ready", () => {
		expect(shouldRedirectToSetup("/", systemReadyFile)).toBe(true);
	});

	it("returns true for /chat when system is not ready", () => {
		expect(shouldRedirectToSetup("/chat", systemReadyFile)).toBe(true);
	});

	it("returns false for /setup when system is not ready", () => {
		expect(shouldRedirectToSetup("/setup", systemReadyFile)).toBe(false);
	});

	it("returns false for /setup/assets/foo.js when system is not ready", () => {
		expect(shouldRedirectToSetup("/setup/assets/foo.js", systemReadyFile)).toBe(false);
	});

	it("returns false for /terminal when system is not ready", () => {
		expect(shouldRedirectToSetup("/terminal", systemReadyFile)).toBe(false);
	});

	it("returns false for /terminal/ws when system is not ready", () => {
		expect(shouldRedirectToSetup("/terminal/ws", systemReadyFile)).toBe(false);
	});

	it("returns false for /api/setup/apply when system is not ready", () => {
		expect(shouldRedirectToSetup("/api/setup/apply", systemReadyFile)).toBe(false);
	});

	it("returns false for / when system is ready", () => {
		fs.writeFileSync(systemReadyFile, "");
		expect(shouldRedirectToSetup("/", systemReadyFile)).toBe(false);
	});

	it("returns false for /chat when system is ready", () => {
		fs.writeFileSync(systemReadyFile, "");
		expect(shouldRedirectToSetup("/chat", systemReadyFile)).toBe(false);
	});
});

describe("setup gate integration", () => {
	let gatelessServer: http.Server;
	let gatePort: number;

	beforeAll(async () => {
		const { createChatServer } = await import("../../core/chat-server/index.js");
		gatelessServer = createChatServer({
			nixpiShareDir: "/mock/share",
			chatSessionsDir: "/tmp/test-chat-sessions-setup",
			idleTimeoutMs: 5000,
			maxSessions: 4,
			staticDir: "/tmp/nonexistent",
			systemReadyFile: "/tmp/this-file-does-not-exist-abc123",
			applyScript: "/bin/false",
		});
		await new Promise<void>((resolve) => {
			gatelessServer.listen(0, "127.0.0.1", () => {
				gatePort = (gatelessServer.address() as { port: number }).port;
				resolve();
			});
		});
	});

	afterAll(() => {
		gatelessServer.close();
	});

	it("redirects / to /setup when system-ready is absent", async () => {
		const res = await fetch(`http://127.0.0.1:${gatePort}/`, { redirect: "manual" });
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/setup");
	});

	it("serves /setup without redirect when system-ready is absent", async () => {
		const res = await fetch(`http://127.0.0.1:${gatePort}/setup`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("NixPI Setup");
	});

	it("does not redirect /terminal when system-ready is absent", async () => {
		const res = await fetch(`http://127.0.0.1:${gatePort}/terminal`, { redirect: "manual" });
		expect(res.status).not.toBe(302);
	});

	it("returns 400 for /api/setup/apply with missing fields", async () => {
		const res = await fetch(`http://127.0.0.1:${gatePort}/api/setup/apply`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Test" }),
		});
		expect(res.status).toBe(400);
	});
});
