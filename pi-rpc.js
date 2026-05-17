import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function createPiRpcManager({
	piBin,
	sshBin,
	env,
	broadcast,
	getActive,
	logger = console,
}) {
	function shellQuote(value) {
		return `'${String(value).replaceAll("'", "'\\''")}'`;
	}

	function buildPiAuthSyncScript() {
		const agentDir = join(env.HOME || "", ".pi", "agent");
		const files = [
			{ name: "auth.json", mode: "600" },
			{ name: "models.json", mode: "600" },
		];
		const installs = [];

		for (const file of files) {
			const path = join(agentDir, file.name);
			if (!existsSync(path)) continue;

			const payload = readFileSync(path).toString("base64");
			installs.push(
				[
					`target="$agent_dir/${file.name}"`,
					`tmp="$target.tmp.$$"`,
					`printf %s ${shellQuote(payload)} | base64 -d > "$tmp"`,
					`chmod ${file.mode} "$tmp"`,
					`mv "$tmp" "$target"`,
				].join("\n"),
			);
		}

		if (installs.length === 0) return null;

		return [
			"set -eu",
			'agent_dir="$HOME/.pi/agent"',
			'mkdir -p "$agent_dir"',
			"umask 077",
			...installs,
			"exit 0",
		].join("\n");
	}

	function syncRemotePiAuth(ws) {
		const script = buildPiAuthSyncScript();
		if (!script) return;

		const result = spawnSync(
			sshBin,
			[
				"-T",
				"-o",
				"StrictHostKeyChecking=accept-new",
				"-o",
				"ServerAliveInterval=30",
				"-o",
				"ServerAliveCountMax=3",
				`${ws.sshUser}@${ws.sshHost}`,
				"sh",
				"-s",
			],
			{
				input: script,
				encoding: "utf8",
				timeout: 15000,
				env: { ...env },
			},
		);

		if (result.status !== 0) {
			const message = (
				result.stderr ||
				result.error?.message ||
				"unknown error"
			)
				.trim()
				.slice(0, 200);
			logger.log(`  pi auth sync failed [${ws.name}]: ${message}`);
		}
	}

	function setPiHealth(ws, connected) {
		const changed = ws.piConnected !== connected;
		ws.piConnected = connected;
		if (changed) {
			broadcast({
				type: "pi_health",
				connected,
				busy: ws.busy,
				workspace: ws.name,
			});
			logger.log(
				`  pi health [${ws.name}]: ${connected ? "CONNECTED" : "DISCONNECTED"}`,
			);
		}
	}

	function startPiHeartbeat(ws) {
		if (ws.piHealthInterval) clearInterval(ws.piHealthInterval);
		ws.piHealthInterval = setInterval(() => {
			if (!ws.piProc || ws.piProc.killed) {
				setPiHealth(ws, false);
			}
		}, 10000);
	}

	function ensurePi(ws) {
		ws = ws || getActive();
		if (ws.piProc && !ws.piProc.killed) return;

		// Build spawn command: for SSH-mode workspaces, tunnel pi over SSH.
		// Local:  spawn("pi", ["--mode", "rpc"])
		// SSH:    spawn("ssh", ["alex@10.10.10.30", "cd '/repo' && exec pi --mode rpc"])
		let spawnBin, spawnArgs, spawnCwd;
		if (ws.mode === "ssh" && ws.sshHost) {
			syncRemotePiAuth(ws);

			const remoteCwd = ws.cwd || ".";
			const remoteCommand = [
				`cd ${shellQuote(remoteCwd)}`,
				"&& exec env",
				"PI_TELEMETRY=0",
				"PI_SKIP_VERSION_CHECK=1",
				"NPM_CONFIG_PREFIX=$HOME/.pi/npm-global",
				"PATH=$HOME/.pi/npm-global/bin:$PATH",
				"NODE_PATH=$HOME/.pi/npm-global/lib/node_modules",
				"pi --mode rpc",
			].join(" ");

			spawnBin = sshBin;
			spawnArgs = [
				"-T", // no PTY
				"-o",
				"StrictHostKeyChecking=accept-new",
				"-o",
				"ServerAliveInterval=30",
				"-o",
				"ServerAliveCountMax=3",
				`${ws.sshUser}@${ws.sshHost}`,
				remoteCommand,
			];
			// The local cwd only applies to the ssh client. The remote pi process
			// starts in ws.cwd via the command above.
			spawnCwd = env.HOME || "/tmp";
		} else {
			spawnBin = piBin;
			spawnArgs = ["--mode", "rpc"];
			spawnCwd = ws.cwd;
		}

		logger.log(
			`→ spawning ${spawnBin} ${spawnArgs.join(" ")} [workspace: ${ws.name}]`,
		);
		setPiHealth(ws, false);
		ws.piProc = spawn(spawnBin, spawnArgs, {
			cwd: spawnCwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...env },
		});

		logger.log(`  pi PID: ${ws.piProc.pid}`);

		// Capture ws in closure for the event handlers
		const procWs = ws;

		procWs.piProc.on("error", (err) => {
			logger.log(
				`  pi spawn error [${ws.name}]: ${err.message} code=${err.code} path=${err.path} spawnBin=${spawnBin}`,
			);
			logger.log(
				`  [DEBUG] existsSync(spawnBin)=${existsSync(spawnBin)} spawnCwd=${spawnCwd}`,
			);
			setPiHealth(procWs, false);
			procWs.piConnected = false;
		});

		procWs.piProc.stdout.on("data", (chunk) => {
			procWs.lineBuffer += chunk.toString();
			const lines = procWs.lineBuffer.split("\n");
			procWs.lineBuffer = lines.pop();
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const data = JSON.parse(line);
					handleRpcEvent(procWs, data);
				} catch (e) {
					logger.log("  pi stdout:", line.substring(0, 120));
				}
			}
		});

		procWs.piProc.stderr.on("data", (chunk) => {
			const text = chunk.toString().trim();
			if (text)
				logger.log(`  pi stderr [${procWs.name}]:`, text.substring(0, 200));
		});

		procWs.piProc.on("error", (err) => {
			logger.error(`  pi spawn error [${procWs.name}]:`, err.message);
			broadcast({
				type: "error",
				message: `Pi failed to start: ${err.message}. Click ↻ to retry.`,
				workspace: procWs.name,
			});
		});

		// Debug: log when stdout closes
		procWs.piProc.stdout.on("end", () => {
			logger.log(`  [DEBUG] pi stdout ended [${procWs.name}]`);
		});

		procWs.piProc.stdin.on("error", (err) => {
			logger.error(`  [DEBUG] pi stdin error [${procWs.name}]:`, err.message);
		});

		// Request initial state once pi is ready
		setTimeout(() => {
			if (procWs.piProc && !procWs.piProc.killed) {
				logger.log(`  requesting initial state from pi [${procWs.name}]...`);
				setPiHealth(procWs, true);
				startPiHeartbeat(procWs);
				sendRpc(procWs, "get_commands", {});
				sendRpc(procWs, "get_state", {});
				sendRpc(procWs, "get_available_models", {});
			} else {
				setPiHealth(procWs, false);
				if (!procWs.restarting)
					broadcast({
						type: "error",
						message: "Pi exited immediately. Click Restart to retry.",
						workspace: procWs.name,
					});
			}
		}, 1500);

		procWs.piProc.on("close", (code, signal) => {
			logger.log(
				`→ pi exited [${procWs.name}] (code ${code}, signal ${signal})`,
			);
			procWs.piProc = null;
			procWs.busy = false;
			setPiHealth(procWs, false);
			broadcast({
				type: "status",
				busy: false,
				connected: false,
				workspace: procWs.name,
			});
			setTimeout(() => {
				// Only auto-restart if this is still the active workspace
				if (!procWs.piProc && procWs === getActive()) ensurePi(procWs);
			}, 3000);
		});
	}

	function sendRpc(ws, command, params) {
		if (!ws.piProc || ws.piProc.killed) return;
		const id = `${++ws.requestId}`;
		const msg = JSON.stringify({ id, type: command, ...params }) + "\n";
		ws.piProc.stdin.write(msg);
	}

	function handleRpcEvent(ws, data) {
		// RPC responses (have id)
		if (data.id) {
			if (data.type === "response") {
				if (data.command === "prompt" && !data.success) {
					broadcast({ type: "error", message: data.error || "Prompt failed" });
					ws.busy = false;
					broadcast({ type: "status", busy: false, workspace: ws.name });
				}

				if (
					data.command === "get_messages" &&
					data.success &&
					data.data?.messages
				) {
					if (ws.historyLoadPending) {
						ws.historyLoadPending = false;
						broadcast({ type: "history", messages: data.data.messages });
					}
					const pending = ws.pendingRequests.get("export");
					if (pending) {
						pending.resolve(data.data.messages);
						ws.pendingRequests.delete("export");
					}
				}

				if (
					data.command === "get_commands" &&
					data.success &&
					data.data?.commands
				) {
					ws.cachedCommands = data.data.commands;
					broadcast({ type: "commands", commands: ws.cachedCommands });
				}

				if (data.command === "get_state" && data.success && data.data) {
					ws.currentSessionFile = data.data.sessionFile || null;
					ws.currentSessionId = data.data.sessionId || null;
					ws.currentModel = data.data.model || ws.currentModel;
					ws.currentThinkingLevel =
						data.data.thinkingLevel || ws.currentThinkingLevel;
					broadcast({
						type: "session_state",
						sessionFile: ws.currentSessionFile,
						sessionId: ws.currentSessionId,
						sessionName: data.data.sessionName,
						model: ws.currentModel,
						thinkingLevel: ws.currentThinkingLevel,
					});
				}

				if (data.command === "set_model" && data.success) {
					sendRpc(ws, "get_state", {});
				}
				if (
					data.command === "cycle_model" &&
					data.success &&
					data.data?.model
				) {
					ws.currentModel = data.data.model;
					broadcast({
						type: "model_state",
						model: ws.currentModel,
						thinkingLevel: ws.currentThinkingLevel,
					});
				}
				if (data.command === "set_thinking_level" && data.success) {
					sendRpc(ws, "get_state", {});
				}
				if (
					data.command === "cycle_thinking_level" &&
					data.success &&
					data.data?.level
				) {
					ws.currentThinkingLevel = data.data.level;
					broadcast({
						type: "model_state",
						model: ws.currentModel,
						thinkingLevel: ws.currentThinkingLevel,
					});
				}
				if (data.command === "get_session_stats" && data.success && data.data) {
					broadcast({ type: "session_stats", stats: data.data });
				}
				if (
					data.command === "get_available_models" &&
					data.success &&
					data.data?.models
				) {
					broadcast({ type: "available_models", models: data.data.models });
				}

				if (data.command === "switch_session" && data.success) {
					const cancelled = data.data?.cancelled;
					// Load messages for the newly switched session (or re-load if same session)
					ws.historyLoadPending = true;
					sendRpc(ws, "get_messages", {});
					sendRpc(ws, "get_state", {});
					if (!cancelled) broadcast({ type: "session_switched" });
					ws.pendingRequests.delete("switch_session_path");
				}

				if (
					data.command === "new_session" &&
					data.success &&
					!data.data?.cancelled
				) {
					// get_state already scheduled via handleClientMessage timeout
				}
			}
			return;
		}

		// RPC events (no id)
		switch (data.type) {
			case "agent_start":
				broadcast(data);
				break;

			case "agent_end":
				ws.busy = false;
				broadcast({ type: "status", busy: false, workspace: ws.name });
				broadcast(data);
				sendRpc(ws, "get_state", {});
				sendRpc(ws, "get_session_stats", {});
				break;

			case "message_start":
			case "message_update":
			case "message_end":
				broadcast(data);
				break;

			case "turn_start":
			case "turn_end":
				broadcast(data);
				break;

			case "tool_execution_start":
			case "tool_execution_update":
			case "tool_execution_end":
				broadcast(data);
				break;

			case "compaction_start":
			case "compaction_end":
				broadcast(data);
				break;

			default:
				broadcast(data);
		}
	}

	function stopPi(ws, signal = "SIGTERM") {
		if (ws.piProc && !ws.piProc.killed) {
			ws.piProc.kill(signal);
			ws.piProc = null;
		}
	}

	function stopPiHeartbeat(ws) {
		if (ws.piHealthInterval) {
			clearInterval(ws.piHealthInterval);
			ws.piHealthInterval = null;
		}
	}

	return {
		ensurePi,
		sendRpc,
		setPiHealth,
		stopPi,
		stopPiHeartbeat,
	};
}
