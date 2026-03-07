# Service Stack Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Whisper with Lemonade, Syncthing with dufs, reconfigure wayvnc for NetBird mesh, and rewrite WhatsApp bridge from Baileys to whatsapp-web.js with visible browser.

**Architecture:** All services are Quadlet containers. Lemonade provides OpenAI-compatible LLM + STT API. dufs provides WebDAV file access to `$HOME`. wayvnc binds to all interfaces (NetBird provides security). WhatsApp uses Puppeteer with Wayland passthrough for a visible browser window on Sway.

**Tech Stack:** TypeScript (strict, ES2022, NodeNext), Biome (tabs, double quotes, 120 line width), Vitest, Podman Quadlet, Fedora bootc 42, Sway/Wayland

**Design doc:** `docs/plans/2026-03-07-service-stack-redesign.md`

---

## Task 1: Delete Whisper service

**Files:**
- Delete: `services/whisper/SKILL.md`
- Delete: `services/whisper/quadlet/bloom-whisper.container`
- Delete: `services/whisper/quadlet/bloom-whisper-models.volume`

**Step 1: Delete the whisper service directory**

```bash
rm -rf services/whisper/
```

**Step 2: Verify build still passes**

Run: `npm run build`
Expected: PASS (whisper is a standalone service, not imported by extensions)

**Step 3: Commit**

```bash
git add -A services/whisper/
git commit -m "refactor: remove whisper service (replaced by lemonade)"
```

---

## Task 2: Delete Syncthing service

**Files:**
- Delete: `services/syncthing/SKILL.md`
- Delete: `services/syncthing/quadlet/bloom-syncthing.container`
- Delete: `services/syncthing/quadlet/bloom-syncthing-data.volume`

**Step 1: Delete the syncthing service directory**

```bash
rm -rf services/syncthing/
```

**Step 2: Verify build still passes**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add -A services/syncthing/
git commit -m "refactor: remove syncthing service (replaced by dufs)"
```

---

## Task 3: Create Lemonade service package

**Files:**
- Create: `services/lemonade/SKILL.md`
- Create: `services/lemonade/quadlet/bloom-lemonade.container`
- Create: `services/lemonade/quadlet/bloom-lemonade-models.volume`

**Step 1: Create the volume file**

Create `services/lemonade/quadlet/bloom-lemonade-models.volume`:
```ini
[Volume]
```

**Step 2: Create the quadlet container file**

Create `services/lemonade/quadlet/bloom-lemonade.container`:
```ini
[Unit]
Description=Bloom Lemonade — Local LLM + speech-to-text (OpenAI-compatible API)
After=network-online.target
Wants=network-online.target

[Container]
Image=ghcr.io/lemonade-sdk/lemonade-server:latest
ContainerName=bloom-lemonade

# Bridge network for isolation
Network=bloom.network

# Expose OpenAI-compatible API on localhost
PublishPort=127.0.0.1:8000:8000

# Model cache persists across restarts
Volume=bloom-lemonade-models:/root/.cache/huggingface:Z

# Media files for transcription (read-only)
Volume=/var/lib/bloom/media:/media:ro,Z

Environment=LEMONADE_LLAMACPP_BACKEND=cpu
PodmanArgs=--memory=4g
HealthCmd=curl -sf http://localhost:8000/health || exit 1
HealthInterval=30s
HealthRetries=3
HealthTimeout=10s
NoNewPrivileges=true
LogDriver=journald

[Service]
Restart=on-failure
RestartSec=10
TimeoutStartSec=600
TimeoutStopSec=30

[Install]
WantedBy=default.target
```

Note: Pin the image digest at implementation time by running:
```bash
podman pull ghcr.io/lemonade-sdk/lemonade-server:latest
podman inspect ghcr.io/lemonade-sdk/lemonade-server:latest --format '{{.Digest}}'
```
Then replace `:latest` with `@sha256:<digest>` in the container file.

**Step 3: Create the SKILL.md**

Create `services/lemonade/SKILL.md`:
```markdown
---
name: lemonade
version: 0.1.0
description: Local LLM inference and speech-to-text via Lemonade (OpenAI-compatible API)
image: ghcr.io/lemonade-sdk/lemonade-server:latest
---

# Lemonade Service

Local AI server providing LLM inference (llama.cpp) and speech-to-text (whisper.cpp) behind an OpenAI-compatible API. Runs on CPU by default.

## API

OpenAI-compatible endpoint at `http://localhost:8000/api/v1`.

### Chat Completion

```bash
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "default", "messages": [{"role": "user", "content": "Hello"}]}'
```

### Transcribe Audio

```bash
curl -X POST http://localhost:8000/api/v1/audio/transcriptions \
  -F "file=@/path/to/audio.ogg" \
  -F "language=en"
```

### List Models

```bash
curl http://localhost:8000/api/v1/models
```

### Health Check

```bash
curl -sf http://localhost:8000/health
```

## Service Control

```bash
systemctl --user start bloom-lemonade.service
systemctl --user status bloom-lemonade
journalctl --user -u bloom-lemonade -f
```

## Notes

- First start downloads models — may take several minutes depending on connection
- Memory usage: ~2-4GB during inference (CPU mode)
- Audio files from WhatsApp are at `/var/lib/bloom/media/`
- Swappable with Ollama or any OpenAI-compatible server on port 8000
```

**Step 4: Commit**

```bash
git add services/lemonade/
git commit -m "feat: add lemonade service package (local LLM + STT)"
```

---

## Task 4: Create dufs service package

**Files:**
- Create: `services/dufs/SKILL.md`
- Create: `services/dufs/quadlet/bloom-dufs.container`

**Step 1: Create the quadlet container file**

Create `services/dufs/quadlet/bloom-dufs.container`:
```ini
[Unit]
Description=Bloom dufs — WebDAV file server for home directory
After=network-online.target
Wants=network-online.target

[Container]
Image=docker.io/sigoden/dufs:latest
ContainerName=bloom-dufs

# Host networking for NetBird mesh reachability
Network=host

# Serve the user's home directory
Volume=%h:/data:Z

# WebDAV with full access, auth via environment file
Exec=/data -A -p 5000 --auth admin:${BLOOM_WEBDAV_PASSWORD}@/:rw

# Auth credentials (generated by service_install)
EnvironmentFile=%h/.config/bloom/channel-tokens/dufs.env

PodmanArgs=--memory=128m
HealthCmd=curl -sf http://127.0.0.1:5000 || exit 1
HealthInterval=30s
HealthRetries=3
HealthTimeout=10s
NoNewPrivileges=true
LogDriver=journald

[Service]
Restart=on-failure
RestartSec=10
TimeoutStartSec=60

[Install]
WantedBy=default.target
```

Note: Pin the image digest at implementation time by running:
```bash
podman pull docker.io/sigoden/dufs:latest
podman inspect docker.io/sigoden/dufs:latest --format '{{.Digest}}'
```

**Step 2: Create the SKILL.md**

Create `services/dufs/SKILL.md`:
```markdown
---
name: dufs
version: 0.1.0
description: Minimal WebDAV file server for home directory access over NetBird mesh
image: docker.io/sigoden/dufs:latest
---

# dufs Service

Lightweight WebDAV file server exposing your home directory. Accessible from any device on your NetBird mesh network.

## Access

WebDAV endpoint: `http://<bloom-device>:5000`
- Requires NetBird mesh connectivity
- Authenticated with username `admin` and auto-generated password

## Client Setup

### Windows
Map network drive: `\\<bloom-device>@5000\DavWWWRoot`

### Linux
Mount: `sudo mount -t davfs http://<bloom-device>:5000 /mnt/bloom`
Or use your file manager's "Connect to Server" feature.

### Android
Use FolderSync, Solid Explorer, or any WebDAV-capable file manager.

### macOS
Finder > Go > Connect to Server > `http://<bloom-device>:5000`

## Credentials

The WebDAV password is auto-generated during installation and stored at:
`~/.config/bloom/channel-tokens/dufs.env`

View it with: `cat ~/.config/bloom/channel-tokens/dufs.env`

## Service Control

```bash
systemctl --user start bloom-dufs.service
systemctl --user status bloom-dufs
journalctl --user -u bloom-dufs -f
```

## Notes

- Only accessible via NetBird mesh — not exposed to the public internet
- Serves your entire home directory (read/write)
- Swappable with rclone (`rclone serve webdav`) or Syncthing
```

**Step 3: Commit**

```bash
git add services/dufs/
git commit -m "feat: add dufs service package (WebDAV file server)"
```

---

## Task 5: Rewrite WhatsApp transport from Baileys to whatsapp-web.js

This is the most complex task. The transport protocol (Unix socket JSON-newline) stays identical — only the WhatsApp client library changes.

**Files:**
- Modify: `services/whatsapp/package.json`
- Modify: `services/whatsapp/src/transport.ts` (full rewrite)
- Modify: `services/whatsapp/src/utils.ts:43-55` (remove makeLogger — Baileys-specific)
- Modify: `services/whatsapp/tests/utils.test.ts:84-161` (remove makeLogger tests)
- Modify: `services/whatsapp/Containerfile`
- Modify: `services/whatsapp/quadlet/bloom-whatsapp.container`
- Modify: `services/whatsapp/SKILL.md`

### Step 1: Update utils.ts — remove Baileys-specific makeLogger

Read `services/whatsapp/src/utils.ts`. Remove the `makeLogger` function (lines 43-55). Keep everything else (`MEDIA_TYPES`, `mimeToExt`, `ChannelMessage`, `isChannelMessage`).

Updated `services/whatsapp/src/utils.ts`:
```typescript
export const MEDIA_TYPES: Record<string, string> = {
	audioMessage: "audio",
	imageMessage: "image",
	videoMessage: "video",
	documentMessage: "document",
	stickerMessage: "sticker",
};

export function mimeToExt(mime: string): string {
	const map: Record<string, string> = {
		"audio/ogg": "ogg",
		"audio/ogg; codecs=opus": "ogg",
		"audio/mpeg": "mp3",
		"audio/mp4": "m4a",
		"audio/wav": "wav",
		"image/jpeg": "jpg",
		"image/png": "png",
		"image/webp": "webp",
		"image/gif": "gif",
		"video/mp4": "mp4",
		"video/3gpp": "3gp",
		"application/pdf": "pdf",
		"application/octet-stream": "bin",
	};
	return map[mime] ?? mime.split("/").pop() ?? "bin";
}

export interface ChannelMessage {
	type: string;
	to?: string;
	text?: string;
}

export function isChannelMessage(val: unknown): val is ChannelMessage {
	return (
		typeof val === "object" &&
		val !== null &&
		"type" in val &&
		typeof (val as Record<string, unknown>).type === "string"
	);
}
```

### Step 2: Update utils tests — remove makeLogger tests

Read `services/whatsapp/tests/utils.test.ts`. Remove the entire `makeLogger` describe block (lines 84-161) and the `vi` import (only used by makeLogger tests). Keep `mimeToExt`, `MEDIA_TYPES`, and `isChannelMessage` tests.

Updated imports line:
```typescript
import { describe, expect, it } from "vitest";
import { isChannelMessage, MEDIA_TYPES, mimeToExt } from "../src/utils.js";
```

### Step 3: Run tests to verify utils changes

Run: `cd services/whatsapp && npm run test`
Expected: PASS (all remaining utils tests pass, makeLogger tests removed)

### Step 4: Update package.json — swap Baileys for whatsapp-web.js

Read `services/whatsapp/package.json`. Replace dependencies:

```json
{
	"name": "bloom-whatsapp-transport",
	"version": "0.2.0",
	"description": "WhatsApp transport for Bloom via whatsapp-web.js",
	"type": "module",
	"main": "dist/transport.js",
	"scripts": {
		"build": "tsc",
		"test": "vitest run",
		"test:watch": "vitest",
		"test:coverage": "vitest run --coverage",
		"start": "node dist/transport.js"
	},
	"dependencies": {
		"whatsapp-web.js": "^1.26.0"
	},
	"devDependencies": {
		"@types/node": "^22.0.0",
		"@vitest/coverage-v8": "^4.0.18",
		"typescript": "^5.7.0",
		"vitest": "^4.0.18"
	}
}
```

Removed: `baileys`, `@hapi/boom`, `qrcode-terminal`.
Added: `whatsapp-web.js`.

Then run:
```bash
cd services/whatsapp && rm -rf node_modules package-lock.json && npm install
```

### Step 5: Rewrite transport.ts

Full rewrite of `services/whatsapp/src/transport.ts`. The channel protocol (Unix socket, JSON-newline, register/message/send/response) stays identical. Only the WhatsApp client changes.

```typescript
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createConnection, type Socket } from "node:net";
import pkg from "whatsapp-web.js";
import { isChannelMessage, MEDIA_TYPES, mimeToExt } from "./utils.js";

const { Client, LocalAuth, MessageMedia } = pkg;

const AUTH_DIR = process.env.BLOOM_AUTH_DIR ?? "/data/auth";
const CHANNELS_SOCKET = process.env.BLOOM_CHANNELS_SOCKET ?? "/run/bloom/channels.sock";
const MEDIA_DIR = process.env.BLOOM_MEDIA_DIR ?? "/media/bloom";
const CHANNEL_TOKEN = process.env.BLOOM_CHANNEL_TOKEN ?? "";

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

// TCP state
let channelSocket: Socket | null = null;
let tcpBuffer = "";
let tcpReconnectDelay = RECONNECT_BASE_MS;
let tcpReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let tcpConnecting = false;
let shuttingDown = false;
let waConnected = false;

// Track WhatsApp client
let waClient: InstanceType<typeof Client> | null = null;

function clearTcpReconnectTimer(): void {
	if (tcpReconnectTimer) {
		clearTimeout(tcpReconnectTimer);
		tcpReconnectTimer = null;
	}
}

function resetChannelSocket(): void {
	const sock = channelSocket;
	channelSocket = null;
	tcpConnecting = false;
	if (sock && !sock.destroyed) sock.destroy();
}

function scheduleTcpReconnect(): void {
	if (shuttingDown || tcpReconnectTimer) return;
	const delay = tcpReconnectDelay;
	console.log(`[tcp] disconnected. Reconnecting in ${delay}ms...`);
	tcpReconnectDelay = Math.min(tcpReconnectDelay * 2, RECONNECT_MAX_MS);
	tcpReconnectTimer = setTimeout(() => {
		tcpReconnectTimer = null;
		connectToChannels();
	}, delay);
}

// --- Health check HTTP server ---

const HEALTH_PORT = Number(process.env.BLOOM_HEALTH_PORT ?? "18801");

const healthServer = createHttpServer((req, res) => {
	if (req.url === "/health") {
		const healthy = waConnected && channelSocket?.writable === true;
		res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ wa: waConnected, channel: channelSocket?.writable === true }));
	} else {
		res.writeHead(404);
		res.end();
	}
});

healthServer.listen(HEALTH_PORT, "0.0.0.0", () => {
	console.log(`[health] listening on :${HEALTH_PORT}`);
});

// --- WhatsApp via whatsapp-web.js ---

async function startWhatsApp(): Promise<void> {
	if (shuttingDown) return;

	console.log("[wa] starting whatsapp-web.js client...");

	const client = new Client({
		authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
		puppeteer: {
			headless: false,
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--ozone-platform=wayland",
				"--enable-features=UseOzonePlatform",
			],
		},
	});

	waClient = client;

	client.on("qr", (qr) => {
		console.log("[wa] QR code displayed in browser window. Scan with WhatsApp mobile app.");
		console.log(`[wa] QR data: ${qr.slice(0, 40)}...`);
	});

	client.on("ready", () => {
		console.log("[wa] connected.");
		waConnected = true;
		tcpReconnectDelay = RECONNECT_BASE_MS;
		clearTcpReconnectTimer();
		resetChannelSocket();
		connectToChannels();
	});

	client.on("disconnected", (reason) => {
		waConnected = false;
		clearTcpReconnectTimer();
		resetChannelSocket();
		console.log(`[wa] disconnected: ${reason}`);

		if (!shuttingDown) {
			console.log("[wa] reinitializing in 5s...");
			setTimeout(startWhatsApp, 5_000);
		}
	});

	client.on("message", async (msg) => {
		// Skip own messages
		if (msg.fromMe) return;

		const from = msg.from;
		const timestamp = msg.timestamp;

		if (msg.hasMedia) {
			try {
				const media = await msg.downloadMedia();
				if (media) {
					await handleMediaMessage(from, timestamp, media, msg.body);
					return;
				}
			} catch (err) {
				console.error("[wa] media download error:", (err as Error).message);
			}
		}

		if (msg.body) {
			console.log(`[wa] message from ${from}: ${msg.body.slice(0, 80)}`);
			sendToChannels({
				type: "message",
				id: randomUUID(),
				channel: "whatsapp",
				from,
				text: msg.body,
				timestamp,
			});
		}
	});

	await client.initialize();
}

async function handleMediaMessage(
	from: string,
	timestamp: number,
	media: InstanceType<typeof MessageMedia>,
	caption?: string,
): Promise<void> {
	const mimetype = media.mimetype ?? "application/octet-stream";
	const ext = mimeToExt(mimetype);
	const id = randomBytes(6).toString("hex");
	const filename = `${timestamp}-${id}.${ext}`;
	const filepath = `${MEDIA_DIR}/${filename}`;

	await mkdir(MEDIA_DIR, { recursive: true });
	const buffer = Buffer.from(media.data, "base64");
	await writeFile(filepath, buffer);
	const size = buffer.length;
	console.log(`[wa] saved media from ${from}: ${filepath} (${size} bytes)`);

	// Determine kind from mimetype
	let kind = "unknown";
	if (mimetype.startsWith("audio/")) kind = "audio";
	else if (mimetype.startsWith("image/")) kind = "image";
	else if (mimetype.startsWith("video/")) kind = "video";
	else if (mimetype.startsWith("application/")) kind = "document";

	sendToChannels({
		type: "message",
		id: randomUUID(),
		channel: "whatsapp",
		from,
		timestamp,
		media: {
			kind,
			mimetype,
			filepath,
			size,
			caption: caption || undefined,
		},
	});
}

// --- TCP channel connection ---

function connectToChannels(): void {
	if (shuttingDown || !waConnected) return;
	if (tcpConnecting) return;
	if (channelSocket?.writable) return;

	clearTcpReconnectTimer();
	tcpConnecting = true;
	tcpBuffer = "";

	console.log(`[tcp] connecting to ${CHANNELS_SOCKET}...`);

	const sock = createConnection({ path: CHANNELS_SOCKET });
	channelSocket = sock;
	sock.setEncoding("utf8");

	sock.on("connect", () => {
		if (channelSocket !== sock) return;
		tcpConnecting = false;
		tcpReconnectDelay = RECONNECT_BASE_MS;
		console.log("[tcp] connected to bloom-channels.");

		const registration: Record<string, string> = { type: "register", channel: "whatsapp" };
		if (CHANNEL_TOKEN) registration.token = CHANNEL_TOKEN;
		sock.write(`${JSON.stringify(registration)}\n`);
	});

	sock.on("data", (data: string) => {
		if (channelSocket !== sock) return;

		tcpBuffer += data;
		const lines = tcpBuffer.split("\n");
		tcpBuffer = lines.pop() ?? "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const msg = JSON.parse(trimmed) as unknown;
				handleChannelMessage(msg);
			} catch (err) {
				console.error("[tcp] parse error:", (err as Error).message, "| raw:", trimmed.slice(0, 120));
			}
		}
	});

	sock.on("error", (err) => {
		if (channelSocket !== sock) return;
		console.error("[tcp] error:", err.message);
	});

	sock.on("close", () => {
		if (channelSocket !== sock) return;
		channelSocket = null;
		tcpConnecting = false;
		if (shuttingDown || !waConnected) return;
		scheduleTcpReconnect();
	});
}

function sendToChannels(msg: Record<string, unknown>): void {
	if (channelSocket?.writable) {
		channelSocket.write(`${JSON.stringify(msg)}\n`);
	} else {
		console.warn("[tcp] channel socket not writable, dropping message:", msg);
	}
}

// --- Incoming channel messages -> WhatsApp ---

function handleChannelMessage(raw: unknown): void {
	if (!isChannelMessage(raw)) {
		console.warn("[tcp] unexpected message shape:", raw);
		return;
	}

	const { type, to, text } = raw;

	if (type === "response" || type === "send") {
		if (!to) {
			console.warn(`[tcp] "${type}" message missing "to" field — dropping.`);
			return;
		}
		if (!text) {
			console.warn(`[tcp] "${type}" message missing "text" field — dropping.`);
			return;
		}
		if (!waClient) {
			console.warn("[tcp] WhatsApp client not ready — dropping message.");
			return;
		}
		console.log(`[wa] sending to ${to}: ${text.slice(0, 80)}`);
		waClient.sendMessage(to, text).catch((err: unknown) => {
			console.error("[wa] sendMessage error:", (err as Error).message);
		});
		return;
	}

	if (type === "ping") {
		if (channelSocket?.writable) {
			channelSocket.write(`${JSON.stringify({ type: "pong" })}\n`);
		}
		return;
	}

	if (type === "registered" || type === "pong" || type === "status") {
		return;
	}

	console.warn("[tcp] unhandled message type:", type);
}

// --- Graceful shutdown ---

function shutdown(signal: string): void {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[bloom-whatsapp] received ${signal}, shutting down...`);

	healthServer.close();
	clearTcpReconnectTimer();
	resetChannelSocket();

	if (waClient) {
		waClient.destroy().catch(() => {});
		waClient = null;
	}

	setTimeout(() => process.exit(0), 1_500);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- Entry point ---

startWhatsApp().catch((err: unknown) => {
	console.error("[bloom-whatsapp] fatal startup error:", (err as Error).message);
	process.exit(1);
});
```

### Step 6: Update Containerfile for Puppeteer/Chromium

Read `services/whatsapp/Containerfile`. Rewrite to include Chromium for Puppeteer:

```dockerfile
FROM node:22-slim

# Puppeteer needs Chromium and Wayland libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libwayland-client0 \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY dist/ ./dist/

VOLUME /data/auth

CMD ["node", "dist/transport.js"]
```

### Step 7: Update quadlet container file for Wayland passthrough

Read `services/whatsapp/quadlet/bloom-whatsapp.container`. Rewrite:

```ini
[Unit]
Description=Bloom WhatsApp Bridge (whatsapp-web.js)
After=network-online.target
Wants=network-online.target

[Container]
Image=ghcr.io/pibloom/bloom-whatsapp:0.2.0
ContainerName=bloom-whatsapp

# Use bloom network for isolation (outbound access for WhatsApp Web)
Network=bloom.network
PublishPort=127.0.0.1:18801:18801

# Wayland display passthrough — browser window visible on Sway desktop
Volume=/run/user/%U/wayland-1:/run/user/1000/wayland-1:ro
Environment=WAYLAND_DISPLAY=wayland-1
Environment=XDG_RUNTIME_DIR=/run/user/1000

# Mount channel socket directory for IPC with Pi
Volume=/run/bloom:/run/bloom:z

# Persist WhatsApp auth state across restarts
Volume=bloom-whatsapp-auth:/data/auth:Z

# Media storage
Volume=/var/lib/bloom/media:/media/bloom:Z

# Environment
Environment=BLOOM_CHANNELS_SOCKET=/run/bloom/channels.sock
Environment=BLOOM_AUTH_DIR=/data/auth
Environment=BLOOM_MEDIA_DIR=/media/bloom
Environment=NODE_ENV=production

# Channel authentication token (generated by svc-install)
EnvironmentFile=%h/.config/bloom/channel-tokens/whatsapp.env

# Resource limits (Chromium is heavier than Baileys)
PodmanArgs=--memory=512m

# Health check (verifies WA + channel connectivity)
HealthCmd=curl -sf http://localhost:18801/health
HealthInterval=30s
HealthRetries=3
HealthTimeout=10s

# Security — less restrictive than Baileys due to Chromium/Wayland needs
NoNewPrivileges=true

# Required for Wayland socket access and channel socket
SecurityLabelDisable=true

# Logging
LogDriver=journald

[Service]
Restart=on-failure
RestartSec=10
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

### Step 8: Update SKILL.md

Read `services/whatsapp/SKILL.md`. Rewrite:

```markdown
---
name: whatsapp
version: 0.2.0
description: WhatsApp messaging bridge via whatsapp-web.js — visible browser on Sway desktop
image: ghcr.io/pibloom/bloom-whatsapp:0.2.0
---

# WhatsApp Bridge

Connects WhatsApp to Bloom via the channel protocol (Unix socket at `/run/bloom/channels.sock`). Uses whatsapp-web.js to run WhatsApp Web in a visible Chromium window on the Sway desktop.

The browser window is a normal Sway window — tiled, minimizable, and movable. You can watch Pi interact with WhatsApp in real time.

## Setup

1. Install the service package
2. Start the service: `systemctl --user start bloom-whatsapp`
3. A Chromium window opens on the Sway desktop showing WhatsApp Web
4. Scan the QR code with WhatsApp mobile app
5. Verify: `systemctl --user status bloom-whatsapp`

## Sending Messages

Use the `/wa` command in Pi to send outbound WhatsApp messages.

## Troubleshooting

- **Won't start**: Check logs: `journalctl --user -u bloom-whatsapp -n 100`
- **No browser window**: Verify Wayland socket exists: `ls /run/user/$(id -u)/wayland-1`
- **Connection lost**: Restart: `systemctl --user restart bloom-whatsapp`
- **Auth expired**: Remove auth volume and re-scan QR:
  ```bash
  systemctl --user stop bloom-whatsapp
  podman volume rm bloom-whatsapp-auth
  systemctl --user start bloom-whatsapp
  ```

## Media Support

The bridge downloads audio, image, and video messages to `/var/lib/bloom/media/`.
Media metadata is forwarded to Pi via the channel protocol with file paths.
Pi can use installed services (e.g., Lemonade) to process media files.
```

### Step 9: Run tests

```bash
cd services/whatsapp && npm run build && npm run test
```

Expected: PASS (utils tests pass, transport is not unit-tested)

### Step 10: Commit

```bash
git add services/whatsapp/
git commit -m "feat: rewrite whatsapp bridge from Baileys to whatsapp-web.js

Visible Chromium window on Sway desktop via Wayland passthrough.
Same channel protocol interface (Unix socket JSON-newline).
Bumped to v0.2.0."
```

---

## Task 6: Update catalog.yaml

**Files:**
- Modify: `services/catalog.yaml`

**Step 1: Rewrite catalog.yaml**

Read `services/catalog.yaml`. Replace entirely:

```yaml
version: 1
registry_default: ghcr.io/pibloom
source_repo: https://github.com/pibloom/pi-bloom
services:
  lemonade:
    version: "0.1.0"
    category: ai
    artifact: ghcr.io/pibloom/bloom-svc-lemonade
    image: ghcr.io/lemonade-sdk/lemonade-server:latest
    optional: false
    preflight:
      commands: [oras, podman, systemctl]
  whatsapp:
    version: "0.2.0"
    category: communication
    artifact: ghcr.io/pibloom/bloom-svc-whatsapp
    image: ghcr.io/pibloom/bloom-whatsapp:0.2.0
    optional: true
    preflight:
      commands: [oras, podman, systemctl]
  netbird:
    version: "0.1.0"
    category: networking
    artifact: ghcr.io/pibloom/bloom-svc-netbird
    image: netbirdio/netbird@sha256:b3e69490e58cf255caf1b9b6a8bbfcfae4d1b2bbaa3c40a06cfdbba5b8fdc0d2
    optional: false
    preflight:
      commands: [oras, podman, systemctl]
  dufs:
    version: "0.1.0"
    category: sync
    artifact: ghcr.io/pibloom/bloom-svc-dufs
    image: docker.io/sigoden/dufs:latest
    optional: false
    preflight:
      commands: [oras, podman, systemctl]
```

**Step 2: Commit**

```bash
git add services/catalog.yaml
git commit -m "refactor: update catalog.yaml for new service stack"
```

---

## Task 7: Update tests referencing whisper/syncthing

**Files:**
- Modify: `tests/lib/manifest.test.ts:37-56` (loadManifest valid test uses whisper)
- Modify: `tests/lib/manifest.test.ts:70-97` (roundtrip test uses whisper)
- Modify: `tests/lib/manifest.test.ts:184-195` (catalog test uses whisper)
- Modify: `tests/lib/manifest.test.ts:225-236` (findLocalServicePackage test uses whisper)

**Step 1: Update test service names from whisper to lemonade**

In `tests/lib/manifest.test.ts`, replace all `whisper` references with `lemonade` and update image names accordingly. The tests are testing manifest I/O — the service name is arbitrary, but should match the new reality.

Specific changes:
- Line 45-46: `"  whisper:"` → `"  lemonade:"`; `"    image: docker.io/fedirz/faster-whisper-server:latest"` → `"    image: ghcr.io/lemonade-sdk/lemonade-server:latest"`
- Line 54-55: `manifest.services.whisper` → `manifest.services.lemonade`
- Lines 76-80: whisper service object → lemonade with image `ghcr.io/lemonade-sdk/lemonade-server:latest`
- Lines 93-95: `reloaded.services.whisper` → `reloaded.services.lemonade`
- Line 189: `"  whisper:"` → `"  lemonade:"`
- Lines 192-194: `catalog.whisper` → `catalog.lemonade`
- Lines 226-231: whisper service dir/quadlet → lemonade

**Step 2: Run tests**

Run: `npm run test -- tests/lib/manifest.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/lib/manifest.test.ts
git commit -m "test: update manifest tests from whisper to lemonade"
```

---

## Task 8: wayvnc — bind to all interfaces

**Files:**
- Modify: `os/sysconfig/sway-config:5`

**Step 1: Update sway config**

Read `os/sysconfig/sway-config`. Change line 5 from:
```
exec_always --no-startup-id sh -lc 'pkill -x wayvnc >/dev/null 2>&1 || true; wayvnc 127.0.0.1 5901'
```
to:
```
exec_always --no-startup-id sh -lc 'pkill -x wayvnc >/dev/null 2>&1 || true; wayvnc 0.0.0.0 5901'
```

Also update the comment on line 4 — replace "SSH/Tailscale tunneling" with "NetBird mesh":
```
# Bloom: expose the current sway session over VNC for NetBird mesh access.
# Accessible from any NetBird peer. Connect with any VNC client to port 5901.
```

**Step 2: Commit**

```bash
git add os/sysconfig/sway-config
git commit -m "feat: bind wayvnc to 0.0.0.0 for NetBird mesh access"
```

---

## Task 9: Update NetBird SKILL.md for cloud management

**Files:**
- Modify: `services/netbird/SKILL.md`

**Step 1: Update SKILL.md**

Read `services/netbird/SKILL.md`. Rewrite:

```markdown
---
name: netbird
version: "0.1.0"
description: Secure mesh networking via NetBird (EU-hosted cloud management)
image: netbirdio/netbird@sha256:b3e69490e58cf255caf1b9b6a8bbfcfae4d1b2bbaa3c40a06cfdbba5b8fdc0d2
---

# NetBird

EU-hosted mesh networking for secure remote access to your Bloom device. Uses NetBird cloud management (free tier, up to 5 peers).

NetBird provides the security layer for remote desktop (wayvnc) and file access (dufs).

## Setup

1. Install: `just svc-install netbird`
2. Authenticate: `podman exec bloom-netbird netbird up`
3. Follow the browser link to sign in at https://app.netbird.io
4. Check status: `podman exec bloom-netbird netbird status`

## Adding Peers

Install NetBird on your other devices (laptop, phone) from https://netbird.io/download and sign in with the same account. All devices on the same account can reach each other.

## Operations

- Logs: `journalctl --user -u bloom-netbird -n 100`
- Stop: `systemctl --user stop bloom-netbird`
- Start: `systemctl --user start bloom-netbird`
- Status: `podman exec bloom-netbird netbird status`
```

**Step 2: Commit**

```bash
git add services/netbird/SKILL.md
git commit -m "docs: update netbird SKILL.md for cloud management"
```

---

## Task 10: Update bloom-garden.ts stignore comment

**Files:**
- Modify: `extensions/bloom-garden.ts:67`

**Step 1: Update stignore comment**

Read `extensions/bloom-garden.ts`. Change line 67 from:
```typescript
const STIGNORE_CONTENT = `// Syncthing device-specific exclusions
```
to:
```typescript
const STIGNORE_CONTENT = `// Device-specific exclusions (used by sync services)
```

**Step 2: Run tests**

Run: `npm run test`
Expected: PASS

**Step 3: Commit**

```bash
git add extensions/bloom-garden.ts
git commit -m "refactor: update stignore comment (no longer syncthing-specific)"
```

---

## Task 11: Update OS greeting

**Files:**
- Modify: `os/sysconfig/bloom-greeting.sh:18-21`

**Step 1: Update service list in greeting**

Read `os/sysconfig/bloom-greeting.sh`. Replace lines 17-21:
```bash
    echo "    • Optional OCI service modules:"
    echo "      - dufs (home directory WebDAV access)"
    echo "      - WhatsApp bridge"
    echo "      - Lemonade (local LLM + speech-to-text)"
    echo "      - NetBird mesh networking"
```

**Step 2: Commit**

```bash
git add os/sysconfig/bloom-greeting.sh
git commit -m "docs: update first-boot greeting for new service stack"
```

---

## Task 12: Update extension example strings

**Files:**
- Modify: `extensions/bloom-services.ts:185,252,455` (whisper → lemonade in description examples)
- Modify: `extensions/bloom-manifest.ts:178` (whisper → lemonade in description example)

**Step 1: Update example service names in parameter descriptions**

In `extensions/bloom-services.ts`:
- Line 185: `"Service name (e.g. whisper)"` → `"Service name (e.g. lemonade)"`
- Line 252: `"Service name (e.g. whisper)"` → `"Service name (e.g. lemonade)"`
- Line 455: `"Installed service name (e.g. whisper)"` → `"Installed service name (e.g. lemonade)"`

In `extensions/bloom-manifest.ts`:
- Line 178: `"Service name (e.g. whatsapp, whisper)"` → `"Service name (e.g. whatsapp, lemonade)"`

**Step 2: Run tests**

Run: `npm run build && npm run test`
Expected: PASS

**Step 3: Commit**

```bash
git add extensions/bloom-services.ts extensions/bloom-manifest.ts
git commit -m "refactor: update example service names from whisper to lemonade"
```

---

## Task 13: Update documentation

**Files:**
- Modify: `CLAUDE.md` (services list)
- Modify: `AGENTS.md:205-217` (skill description, service table)
- Modify: `README.md` (Baileys → whatsapp-web.js, service list)
- Modify: `services/README.md` (service table)
- Modify: `docs/service-architecture.md` (diagrams, tables)
- Modify: `docs/quick_deploy.md` (wayvnc section)
- Modify: `docs/channel-protocol.md` (Baileys → whatsapp-web.js)
- Modify: `persona/SKILL.md:23` (Baileys → whatsapp-web.js)
- Modify: `skills/first-boot/SKILL.md` (syncthing/whisper → dufs/lemonade)
- Modify: `skills/service-management/SKILL.md` (service table, examples)
- Modify: `skills/recovery/SKILL.md` (syncthing → dufs, whisper → lemonade)
- Modify: `skills/self-evolution/SKILL.md:150,182` (whisper → lemonade)
- Modify: `skills/object-store/SKILL.md:71` (Syncthing → dufs)

**Step 1: Make all documentation changes**

Global replacements across all listed files:
- `Whisper` / `whisper` (service) → `Lemonade` / `lemonade`
- `Syncthing` / `syncthing` (service) → `dufs`
- `Baileys` → `whatsapp-web.js`
- Port `9000` (Whisper) → `8000` (Lemonade)
- Port `8384` (Syncthing) → `5000` (dufs)
- `faster-whisper-server` image → `lemonade-server` image
- `syncthing/syncthing` image → `sigoden/dufs` image
- `bloom-svc-whisper` → `bloom-svc-lemonade`
- `bloom-svc-syncthing` → `bloom-svc-dufs`
- Service table in `AGENTS.md` lines 214-217: replace whisper and syncthing rows with lemonade and dufs
- Service table in `CLAUDE.md`: update services list to show `(whisper → lemonade, syncthing → dufs, whatsapp, netbird)`
- `skills/first-boot/SKILL.md`: replace syncthing setup section with dufs, replace whisper with lemonade in manifest_set_service examples
- `skills/recovery/SKILL.md`: replace "Syncthing Sync Conflicts" section with "dufs WebDAV" troubleshooting
- `docs/service-architecture.md`: update mermaid diagrams (replace whisper/syncthing nodes with lemonade/dufs)
- `docs/quick_deploy.md`: update wayvnc section to mention NetBird instead of SSH tunnel

**Step 2: Run build and lint**

Run: `npm run build && npm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add CLAUDE.md AGENTS.md README.md services/README.md docs/ persona/SKILL.md skills/
git commit -m "docs: update all documentation for service stack redesign

Whisper → Lemonade, Syncthing → dufs, Baileys → whatsapp-web.js,
wayvnc over NetBird mesh, cloud-only NetBird management."
```

---

## Task 14: Final verification

**Step 1: Run full build + lint + test suite**

```bash
npm run build && npm run check && npm run test
```

Expected: all pass

**Step 2: Check for stale references**

```bash
grep -r "faster-whisper\|bloom-svc-whisper\|bloom-svc-syncthing\|syncthing/syncthing\|Baileys\|baileys" \
  --include="*.ts" --include="*.md" --include="*.yaml" --include="*.sh" --include="*.conf" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=services/whatsapp/package-lock.json
```

Expected: no matches outside of `docs/plans/` (design docs may reference old names for historical context) and `services/whatsapp/package-lock.json`

**Step 3: Verify service directories**

```bash
ls services/
```

Expected: `dufs/`, `lemonade/`, `netbird/`, `whatsapp/`, `catalog.yaml`, `README.md`
No `whisper/` or `syncthing/` directories.
