/**
 * nixpi — Web UI for Pi Coding Agent
 *
 * Spawns `pi --mode rpc` as a subprocess and bridges JSON-RPC
 * to browser clients over WebSocket.
 *
 * Supports multiple named workspaces, each with its own CWD and pi
 * subprocess. Only the active workspace's pi runs; others are lazily
 * killed after an idle timeout.
 *
 * Usage:
 *   bun server.js                           # defaults
 *   NIXPI_PORT=8080 NIXPI_CWD=/path bun server.js
 *   NIXPI_WORKSPACES_CONFIG=/path/to/workspaces.json bun server.js
 */

import { Buffer } from "node:buffer";
import { existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	archiveSession,
	deleteSession,
	parseArchivedSessions,
	parseSessions,
	restoreSession,
} from "./sessions.js";
import { createPiRpcManager } from "./pi-rpc.js";
import { createWorkspaceManager } from "./workspaces.js";

// ── Config ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.NIXPI_PORT || "4815", 10);
const HOST = process.env.NIXPI_HOST || "0.0.0.0";
const CWD = process.env.NIXPI_CWD || process.env.HOME;
const PI_BIN = process.env.NIXPI_PI_BIN || "pi";
const SSH_BIN = process.env.NIXPI_SSH_BIN || "ssh";

console.log(
	`[DEBUG] SSH_BIN=${SSH_BIN} NIXPI_SSH_BIN=${process.env.NIXPI_SSH_BIN} PATH=${process.env.PATH?.split(":").length} entries`,
);
const WORKSPACES_CONFIG = process.env.NIXPI_WORKSPACES_CONFIG || "";
const IDLE_TIMEOUT_MS = parseInt(
	process.env.NIXPI_IDLE_TIMEOUT_MS || "300000",
	10,
); // 5 min default
const __dirname = dirname(fileURLToPath(import.meta.url));

let piRpc;
function ensurePi(ws) {
	return piRpc.ensurePi(ws);
}
function sendRpc(ws, command, params) {
	return piRpc.sendRpc(ws, command, params);
}
function setPiHealth(ws, connected) {
	return piRpc.setPiHealth(ws, connected);
}
function stopPi(ws, signal) {
	return piRpc.stopPi(ws, signal);
}
function stopPiHeartbeat(ws) {
	return piRpc.stopPiHeartbeat(ws);
}

// ── Workspaces ──────────────────────────────────────────────────────────
// Workspace config is loaded from workspaces.json (Nix-managed).
// Each workspace has: name, cwd, mode ("local"|"ssh"), context, and
// optional sshHost/sshUser for remote workspaces.
const workspaceManager = createWorkspaceManager({
	workspaceConfigPath: WORKSPACES_CONFIG,
	cwd: CWD,
	idleTimeoutMs: IDLE_TIMEOUT_MS,
	broadcast,
	ensurePi,
});
const {
	workspaces,
	getActive,
	clearIdleTimer,
	switchWorkspace,
	getWorkspacesInfo,
	getActiveWorkspaceName,
} = workspaceManager;

piRpc = createPiRpcManager({
	piBin: PI_BIN,
	sshBin: SSH_BIN,
	env: process.env,
	broadcast,
	getActive,
});

// ── State ───────────────────────────────────────────────────────────────
const clients = new Set();

// ── Bun HTTP/WebSocket server ───────────────────────────────────────────
const PUBLIC_DIR = join(__dirname, "public");
const ASSETS_DIR = join(PUBLIC_DIR, "assets");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

const MIME_TYPES = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".mjs", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".svg", "image/svg+xml"],
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".gif", "image/gif"],
	[".webp", "image/webp"],
	[".ico", "image/x-icon"],
	[".woff", "font/woff"],
	[".woff2", "font/woff2"],
	[".ttf", "font/ttf"],
]);

function json(data, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			...headers,
		},
	});
}

function text(body, status = 200, contentType = "text/plain; charset=utf-8") {
	return new Response(body, {
		status,
		headers: { "Content-Type": contentType },
	});
}

function notFound() {
	return text("Not found", 404);
}

async function readJson(request) {
	const body = await request.text();
	if (!body.trim()) return {};
	try {
		return JSON.parse(body);
	} catch {
		const err = new Error("Invalid JSON body");
		err.statusCode = 400;
		throw err;
	}
}

function safeResolve(root, relativePath) {
	if (!relativePath || relativePath.includes("\0")) return null;
	let decoded;
	try {
		decoded = decodeURIComponent(relativePath);
	} catch {
		return null;
	}
	const normalizedRoot = resolve(root);
	const resolved = resolve(normalizedRoot, decoded);
	if (
		resolved !== normalizedRoot &&
		!resolved.startsWith(normalizedRoot + sep)
	) {
		return null;
	}
	return resolved;
}

function fileResponse(filePath, contentType) {
	try {
		if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;
		return new Response(Bun.file(filePath), {
			headers: {
				"Content-Type":
					contentType ||
					MIME_TYPES.get(extname(filePath)) ||
					"application/octet-stream",
			},
		});
	} catch {
		return null;
	}
}

function servePublic(pathname) {
	if (pathname === "/") {
		return fileResponse(
			join(PUBLIC_DIR, "index.html"),
			"text/html; charset=utf-8",
		);
	}
	if (pathname === "/favicon.ico") {
		return text(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="24" font-size="24" fill="#6EA8DB">π</text></svg>`,
			200,
			"image/svg+xml",
		);
	}
	if (pathname.startsWith("/assets/")) {
		const assetPath = safeResolve(
			ASSETS_DIR,
			pathname.slice("/assets/".length),
		);
		return assetPath ? fileResponse(assetPath) : null;
	}
	if (
		pathname.startsWith("/api/") ||
		pathname.startsWith("/lib/") ||
		pathname.startsWith("/storybook")
	) {
		return null;
	}
	const publicPath = safeResolve(PUBLIC_DIR, pathname.slice(1));
	return publicPath ? fileResponse(publicPath) : null;
}

async function transcribe(request) {
	if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not set" }, 500);
	const body = await request.arrayBuffer();
	if (!body.byteLength) return json({ error: "No audio data" }, 400);
	if (body.byteLength > MAX_TRANSCRIBE_BYTES) {
		return json({ error: "Audio data exceeds 25 MB limit" }, 413);
	}

	try {
		const form = new FormData();
		const file = new Blob([body], { type: "audio/webm" });
		form.append("file", file, "audio.webm");
		form.append("model", "whisper-1");
		form.append("language", "en");
		form.append("response_format", "json");
		const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
			method: "POST",
			headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
			body: form,
		});
		if (!r.ok) {
			const errText = await r.text();
			console.error("Whisper error:", r.status, errText);
			return json({ error: `Whisper API error: ${r.status}` }, r.status);
		}
		const data = await r.json();
		return json({ text: data.text || "" });
	} catch (e) {
		console.error("Transcription error:", e);
		return json({ error: e.message }, 500);
	}
}

async function handleHttp(request) {
	try {
		const { pathname } = new URL(request.url);
		const method = request.method;

		if (pathname.startsWith("/storybook")) return notFound();
		if (pathname === "/manifest.json" && method === "GET") {
			return json({
				name: "nixpi-bun",
				short_name: "nixpi-bun",
				start_url: "/",
				display: "standalone",
				background_color: "#1a1a2e",
				theme_color: "#6EA8DB",
				icons: [{ src: "/favicon.ico", sizes: "any", type: "image/svg+xml" }],
			});
		}

		if (pathname === "/api/sessions" && method === "GET") {
			const ws = getActive();
			return json({
				sessions: parseSessions(ws),
				currentFile: ws.currentSessionFile,
			});
		}
		if (pathname === "/api/sessions/archived" && method === "GET") {
			return json({ sessions: parseArchivedSessions(getActive()) });
		}
		if (pathname === "/api/sessions/restore" && method === "POST") {
			const { file } = await readJson(request);
			const dest = restoreSession(file);
			return json({ ok: true, restoredTo: dest });
		}
		if (pathname === "/api/sessions/archive" && method === "POST") {
			const { file } = await readJson(request);
			const dest = archiveSession(file);
			return json({ ok: true, archivedTo: dest });
		}
		if (pathname === "/api/sessions" && method === "DELETE") {
			const { file } = await readJson(request);
			deleteSession(file);
			return json({ ok: true });
		}
		if (pathname === "/api/restart" && method === "POST") {
			const ws = getActive();
			ws.restarting = true;
			stopPi(ws);
			ws.busy = false;
			setPiHealth(ws, false);
			broadcast({
				type: "status",
				busy: false,
				piConnected: false,
				workspace: ws.name,
			});
			setTimeout(() => {
				ensurePi(ws);
				setTimeout(() => {
					ws.restarting = false;
				}, 2000);
			}, 500);
			return json({ ok: true });
		}
		if (pathname === "/api/workspaces" && method === "GET") {
			return json(getWorkspacesInfo());
		}
		if (pathname === "/api/transcribe" && method === "POST") {
			return transcribe(request);
		}

		const staticResponse =
			method === "GET" || method === "HEAD" ? servePublic(pathname) : null;
		return staticResponse || notFound();
	} catch (e) {
		return json({ error: e.message }, e.statusCode || 500);
	}
}

function sendInitialClientState(ws) {
	const active = getActive();
	ws.send(
		JSON.stringify({
			type: "status",
			busy: active.busy,
			connected: true,
			piConnected: active.piConnected,
			workspace: active.name,
			workspaces: getWorkspacesInfo(),
		}),
	);
	if (active.cachedCommands.length > 0) {
		ws.send(
			JSON.stringify({ type: "commands", commands: active.cachedCommands }),
		);
	}
	if (active.currentSessionFile || active.currentModel) {
		ws.send(
			JSON.stringify({
				type: "session_state",
				sessionFile: active.currentSessionFile,
				sessionId: active.currentSessionId,
				model: active.currentModel,
				thinkingLevel: active.currentThinkingLevel,
			}),
		);
	}
}

let server;
try {
	server = Bun.serve({
		hostname: HOST,
		port: PORT,
		maxRequestBodySize: MAX_TRANSCRIBE_BYTES + 1024 * 1024,
		fetch(request, server) {
			const { pathname } = new URL(request.url);
			if (pathname === "/ws") {
				if (server.upgrade(request)) return;
				return text("WebSocket upgrade failed", 400);
			}
			return handleHttp(request);
		},
		websocket: {
			open(ws) {
				clients.add(ws);
				sendInitialClientState(ws);
				console.log(`↔ client connected (${clients.size})`);
			},
			message(ws, raw) {
				let msg;
				try {
					const text =
						typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
					msg = JSON.parse(text);
				} catch {
					return;
				}
				handleClientMessage(ws, msg);
			},
			close(ws) {
				clients.delete(ws);
				console.log(`↔ client disconnected (${clients.size})`);
			},
		},
	});
	console.log(`✓ nixpi-bun http://${HOST}:${server.port}`);
} catch (err) {
	if (err.code === "EADDRINUSE" || String(err.message).includes("EADDRINUSE")) {
		console.error(`❌ Port ${PORT} is already in use.`);
		console.error("   Make sure no other instance of nixpi-bun is running.");
		console.error("   Stop the existing nixpi-bun process, then retry.");
		process.exit(1);
	}
	console.error("Server error:", err);
	process.exit(1);
}

function broadcast(data) {
	const s = JSON.stringify(data);
	for (const ws of clients) {
		try {
			ws.send(s);
		} catch {
			clients.delete(ws);
		}
	}
}

// ── Client message handler ─────────────────────────────────────────────
async function handleClientMessage(clientWs, msg) {
	switch (msg.type) {
		case "switch_workspace": {
			if (!msg.name) return;
			switchWorkspace(msg.name);
			// After switching, send the new active workspace's full state
			const active = getActive();
			clientWs.send(
				JSON.stringify({
					type: "status",
					busy: active.busy,
					connected: true,
					piConnected: active.piConnected,
					workspace: active.name,
					workspaces: getWorkspacesInfo(),
				}),
			);
			if (active.cachedCommands.length > 0) {
				clientWs.send(
					JSON.stringify({ type: "commands", commands: active.cachedCommands }),
				);
			}
			if (active.currentSessionFile || active.currentModel) {
				clientWs.send(
					JSON.stringify({
						type: "session_state",
						sessionFile: active.currentSessionFile,
						sessionId: active.currentSessionId,
						model: active.currentModel,
						thinkingLevel: active.currentThinkingLevel,
					}),
				);
			}
			break;
		}

		case "list_workspaces": {
			clientWs.send(
				JSON.stringify({
					type: "workspaces",
					workspaces: getWorkspacesInfo(),
					active: getActiveWorkspaceName(),
				}),
			);
			break;
		}

		case "prompt": {
			if (!msg.text?.trim()) return;
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			if (ws.busy) {
				// Pi supports queuing via streamingBehavior
				const qParams = { message: msg.text, streamingBehavior: "followUp" };
				if (msg.images?.length) qParams.images = msg.images;
				sendRpc(ws, "prompt", qParams);
			} else {
				ws.busy = true;
				broadcast({ type: "status", busy: true, workspace: ws.name });
				broadcast({ type: "agent_start" });
				const promptParams = { message: msg.text };
				if (msg.images?.length) promptParams.images = msg.images;
				sendRpc(ws, "prompt", promptParams);
			}
			break;
		}

		case "abort": {
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "abort", {});
			ws.busy = false;
			broadcast({
				type: "status",
				busy: false,
				aborted: true,
				workspace: ws.name,
			});
			broadcast({ type: "agent_end" });
			break;
		}

		case "new_session": {
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "new_session", {});
			ws.busy = false;
			broadcast({ type: "status", busy: false, workspace: ws.name });
			broadcast({ type: "session_reset" });
			setTimeout(() => {
				sendRpc(ws, "get_commands", {});
				sendRpc(ws, "get_state", {});
			}, 500);
			break;
		}

		case "switch_session": {
			if (!msg.sessionPath) return;
			const ws = getActive();
			if (ws.busy) {
				clientWs.send(
					JSON.stringify({
						type: "error",
						message: "Agent is busy. Stop before switching sessions.",
					}),
				);
				return;
			}
			clearIdleTimer(ws);
			ensurePi(ws);
			ws.pendingRequests.set("switch_session_path", msg.sessionPath);
			sendRpc(ws, "switch_session", { sessionPath: msg.sessionPath });
			break;
		}

		case "load_history": {
			const ws = getActive();
			if (ws.busy) return;
			clearIdleTimer(ws);
			ensurePi(ws);
			ws.historyLoadPending = true;
			sendRpc(ws, "get_messages", {});
			break;
		}

		case "set_session_name": {
			if (typeof msg.name !== "string") return;
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "set_session_name", { name: msg.name });
			break;
		}

		case "set_model": {
			if (!msg.provider || !msg.modelId) return;
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "set_model", {
				provider: msg.provider,
				modelId: msg.modelId,
			});
			break;
		}
		case "cycle_model": {
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "cycle_model", {});
			break;
		}
		case "set_thinking_level": {
			if (!msg.level) return;
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "set_thinking_level", { level: msg.level });
			break;
		}
		case "cycle_thinking_level": {
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "cycle_thinking_level", {});
			break;
		}
		case "get_stats": {
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "get_session_stats", {});
			break;
		}
		case "get_models": {
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "get_available_models", {});
			break;
		}
		case "export_request": {
			const ws = getActive();
			clearIdleTimer(ws);
			ensurePi(ws);
			sendRpc(ws, "get_messages", {});
			ws.pendingRequests.set("export", {
				resolve: (messages) => {
					broadcast({
						type: "export_response",
						session: {
							messages,
							exportedAt: new Date().toISOString(),
							cwd: ws.cwd,
						},
					});
				},
			});
			break;
		}
	}
}

// ── Graceful shutdown ───────────────────────────────────────────────────
function shutdown() {
	console.log("→ shutting down");
	for (const ws of workspaces.values()) {
		clearIdleTimer(ws);
		stopPiHeartbeat(ws);
		stopPi(ws);
	}
	for (const client of clients) {
		try {
			client.close();
		} catch {}
	}
	server?.stop(true);
	process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ── Boot ────────────────────────────────────────────────────────────────
if (workspaces.size === 1 && getActiveWorkspaceName() === "default") {
	// Legacy single-workspace mode
	console.log(`  CWD:   ${CWD}`);
} else {
	console.log(`  Workspaces:`);
	for (const [name, ws] of workspaces) {
		const marker = name === getActiveWorkspaceName() ? "→" : " ";
		const mode =
			ws.mode === "ssh" ? `ssh ${ws.sshUser}@${ws.sshHost}` : "local";
		console.log(
			`  ${marker} ${name}: ${ws.cwd} (${mode})${ws.context ? ` — ${ws.context}` : ""}`,
		);
	}
}
console.log(`  Port:  ${PORT}`);
ensurePi(getActive());
