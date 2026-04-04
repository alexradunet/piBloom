import { spawn } from "node:child_process";
import fs from "node:fs";
import type http from "node:http";

/** Paths that bypass the setup redirect gate unconditionally. */
export const SETUP_EXEMPT_PREFIXES = ["/setup", "/terminal", "/api/setup"];

/** Returns true if the system-ready marker file exists. */
export function isSystemReady(systemReadyFile: string): boolean {
	try {
		fs.accessSync(systemReadyFile);
		return true;
	} catch {
		return false;
	}
}

/**
 * Returns true if the request at `pathname` should be redirected to /setup.
 * Exempt paths: anything under /setup, /terminal, or /api/setup.
 */
export function shouldRedirectToSetup(pathname: string, systemReadyFile: string): boolean {
	if (SETUP_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
		return false;
	}

	return !isSystemReady(systemReadyFile);
}

export interface ApplyPayload {
	name: string;
	email: string;
	username: string;
	password: string;
	claudeApiKey: string;
	netbirdKey: string;
}

/** Serves the wizard HTML page for GET /setup. */
export function serveSetupPage(res: http.ServerResponse): void {
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(getSetupHtml());
}

/**
 * Handles POST /api/setup/apply.
 * Reads the JSON payload, validates it, then spawns the apply script
 * and streams its output as SSE lines until it exits.
 */
export async function handleSetupApply(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	opts: { applyScript: string },
): Promise<void> {
	let body = "";
	for await (const chunk of req) body += chunk;

	let payload: ApplyPayload;
	try {
		payload = JSON.parse(body) as ApplyPayload;
	} catch {
		res.writeHead(400).end(JSON.stringify({ error: "invalid JSON" }));
		return;
	}

	for (const field of ["name", "email", "username", "password"] as const) {
		if (!payload[field] || typeof payload[field] !== "string") {
			res.writeHead(400).end(JSON.stringify({ error: `${field} is required` }));
			return;
		}
	}

	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});

	const send = (line: string) => {
		res.write(`data: ${line}\n\n`);
	};

	const child = spawn(opts.applyScript, [], {
		env: {
			...process.env,
			SETUP_NAME: payload.name,
			SETUP_EMAIL: payload.email,
			SETUP_USERNAME: payload.username,
			SETUP_PASSWORD: payload.password,
			SETUP_CLAUDE_API_KEY: payload.claudeApiKey ?? "",
			SETUP_NETBIRD_KEY: payload.netbirdKey ?? "",
		},
	});

	child.stdout?.on("data", (chunk: Buffer) => {
		for (const line of chunk.toString().split("\n")) {
			if (line) send(line);
		}
	});

	child.stderr?.on("data", (chunk: Buffer) => {
		for (const line of chunk.toString().split("\n")) {
			if (line) send(`[err] ${line}`);
		}
	});

	await new Promise<void>((resolve) => {
		child.on("close", (code) => {
			send(code === 0 ? "SETUP_COMPLETE" : `SETUP_FAILED:${code}`);
			res.end();
			resolve();
		});
	});
}

function getSetupHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NixPI Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ui-monospace, monospace; background: #10161d; color: #e6edf3; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 2rem; width: 100%; max-width: 480px; }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    .subtitle { color: #8b949e; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; color: #8b949e; margin-bottom: 0.25rem; margin-top: 1rem; }
    input { width: 100%; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; color: #e6edf3; padding: 0.5rem 0.75rem; font-family: inherit; font-size: 0.875rem; }
    input:focus { outline: none; border-color: #58a6ff; }
    .optional { color: #8b949e; font-size: 0.75rem; margin-left: 0.25rem; }
    button { margin-top: 1.5rem; width: 100%; background: #238636; border: none; border-radius: 4px; color: #fff; cursor: pointer; font-family: inherit; font-size: 0.875rem; padding: 0.625rem; }
    button:hover { background: #2ea043; }
    button:disabled { background: #21262d; color: #8b949e; cursor: not-allowed; }
    .step { display: none; }
    .step.active { display: block; }
    .progress { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; font-size: 0.75rem; height: 12rem; margin-top: 1rem; overflow-y: auto; padding: 0.75rem; white-space: pre-wrap; }
    .error { color: #f85149; font-size: 0.875rem; margin-top: 0.75rem; }
  </style>
</head>
<body>
<div class="card">
  <h1>NixPI Setup</h1>
  <p class="subtitle">Configure your machine before first use.</p>

  <div id="step-identity" class="step active">
    <label>Full name</label>
    <input id="name" type="text" placeholder="Alex Smith" autocomplete="name">
    <label>Email</label>
    <input id="email" type="email" placeholder="alex@example.com" autocomplete="email">
    <label>Username</label>
    <input id="username" type="text" placeholder="alex" autocomplete="username">
    <label>Password</label>
    <input id="password" type="password" autocomplete="new-password">
    <button id="btn-next-identity">Continue</button>
    <p class="error" id="err-identity"></p>
  </div>

  <div id="step-keys" class="step">
    <label>Claude API key <span class="optional">(optional)</span></label>
    <input id="claude-api-key" type="password" placeholder="sk-ant-...">
    <label>Netbird setup key <span class="optional">(optional)</span></label>
    <input id="netbird-key" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
    <button id="btn-apply">Apply configuration</button>
    <p class="error" id="err-keys"></p>
  </div>

  <div id="step-progress" class="step">
    <p class="subtitle">Applying configuration — this will take a few minutes.</p>
    <div class="progress" id="progress-log"></div>
  </div>
</div>

<script>
  function show(id) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  document.getElementById('btn-next-identity').addEventListener('click', () => {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const err = document.getElementById('err-identity');
    if (!name || !email || !username || !password) {
      err.textContent = 'All fields are required.'; return;
    }
    err.textContent = '';
    show('step-keys');
  });

  document.getElementById('btn-apply').addEventListener('click', async () => {
    const btn = document.getElementById('btn-apply');
    btn.disabled = true;
    document.getElementById('err-keys').textContent = '';
    show('step-progress');

    const log = document.getElementById('progress-log');
    const append = (text) => { log.textContent += text + '\\n'; log.scrollTop = log.scrollHeight; };

    const payload = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value,
      claudeApiKey: document.getElementById('claude-api-key').value.trim(),
      netbirdKey: document.getElementById('netbird-key').value.trim(),
    };

    try {
      const res = await fetch('/api/setup/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n\\n');
        buffer = lines.pop() ?? '';
        for (const block of lines) {
          const data = block.replace(/^data: /, '');
          if (data === 'SETUP_COMPLETE') {
            append('Setup complete! Redirecting...');
            setTimeout(() => { window.location.href = '/'; }, 2000);
            return;
          } else if (data.startsWith('SETUP_FAILED')) {
            append('Setup failed. Check the log above.');
            btn.disabled = false;
          } else {
            append(data);
          }
        }
      }
    } catch (e) {
      append('Network error: ' + e.message);
      btn.disabled = false;
    }
  });
</script>
</body>
</html>`;
}
