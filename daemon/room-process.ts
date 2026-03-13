/**
 * Room process — manages a single pi --mode rpc subprocess + socket transport.
 * Spawns pi, reads JSON events from stdout, accepts commands via send(),
 * opens a socket for terminal clients, and handles idle timeout.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer, type ListenOptions, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createLogger } from "../lib/shared.js";
import { extractResponseText, type RpcCommand, type RpcEvent } from "./rpc-protocol.js";

const log = createLogger("room-process");

export type RoomTransportConfig =
	| { kind: "unix"; path?: string }
	| { kind: "tcp"; host?: string; port?: number }
	| { kind: "none" };

export interface RoomProcessOptions {
	roomId: string;
	roomAlias: string;
	sanitizedAlias: string;
	socketDir: string;
	sessionDir: string;
	idleTimeoutMs: number;
	onAgentEnd: (text: string) => void;
	onEvent: (event: RpcEvent) => void;
	onExit: (code: number | null) => void;
	transport?: RoomTransportConfig;
}

export class RoomProcess {
	private proc: ChildProcess | null = null;
	private server: Server | null = null;
	private clients: Set<Socket> = new Set();
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private streaming = false;
	private disposing = false;
	private writeQueue: Promise<void> = Promise.resolve();
	private readonly opts: RoomProcessOptions;
	private readonly transport: RoomTransportConfig;

	constructor(opts: RoomProcessOptions) {
		this.opts = opts;
		this.transport = opts.transport ?? { kind: "unix", path: join(opts.socketDir, `room-${opts.sanitizedAlias}.sock`) };
	}

	get alive(): boolean {
		return this.proc !== null && this.proc.exitCode === null;
	}

	get isStreaming(): boolean {
		return this.streaming;
	}

	async spawn(): Promise<void> {
		if (!existsSync(this.opts.sessionDir)) {
			mkdirSync(this.opts.sessionDir, { recursive: true });
		}

		this.proc = spawn("pi", ["--mode", "rpc"], {
			cwd: this.opts.sessionDir,
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Read JSON lines from stdout
		if (this.proc.stdout) {
			const rl = createInterface({ input: this.proc.stdout });
			rl.on("line", (line) => this.handleLine(line));
		}

		// Log stderr
		if (this.proc.stderr) {
			const rl = createInterface({ input: this.proc.stderr });
			rl.on("line", (line) => log.warn("pi stderr", { room: this.opts.sanitizedAlias, line }));
		}

		this.proc.on("exit", (code) => {
			log.info("pi process exited", { room: this.opts.sanitizedAlias, code });
			this.proc = null;
			// Only fire onExit for unexpected exits, not intentional dispose
			if (!this.disposing) {
				this.opts.onExit(code);
			}
		});

		this.proc.on("error", (err) => {
			log.error("failed to spawn pi process", { room: this.opts.sanitizedAlias, error: err.message });
		});

		try {
			await this.startSocket();
			this.resetIdleTimer();
		} catch (err) {
			this.dispose();
			throw err;
		}

		log.info("spawned pi process", { room: this.opts.sanitizedAlias, pid: this.proc.pid });
	}

	/** Send a command to pi's stdin. Serialized to prevent interleaved writes. */
	send(cmd: RpcCommand): void {
		this.writeQueue = this.writeQueue.then(() => {
			return new Promise<void>((resolve) => {
				if (!this.proc?.stdin?.writable) {
					resolve();
					return;
				}
				this.proc.stdin.write(`${JSON.stringify(cmd)}\n`, () => resolve());
			});
		});
		this.resetIdleTimer();
	}

	/** Send a message, choosing prompt vs follow_up based on streaming state. */
	sendMessage(text: string): void {
		if (this.streaming) {
			this.send({ type: "follow_up", message: text });
		} else {
			this.send({ type: "prompt", message: text });
		}
	}

	dispose(): void {
		this.disposing = true;

		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}

		for (const client of this.clients) {
			client.destroy();
		}
		this.clients.clear();

		if (this.server) {
			this.server.close();
			this.server = null;
		}

		if (this.proc) {
			this.proc.kill("SIGTERM");
			this.proc = null;
		}

		this.cleanupSocket();
	}

	private handleLine(line: string): void {
		let event: RpcEvent;
		try {
			event = JSON.parse(line) as RpcEvent;
		} catch {
			log.warn("unparseable stdout line", { room: this.opts.sanitizedAlias, line });
			return;
		}

		// Track streaming state
		if (event.type === "agent_start") {
			this.streaming = true;
		} else if (event.type === "agent_end") {
			this.streaming = false;
			const messages = (event as { messages?: readonly Record<string, unknown>[] }).messages;
			if (messages) {
				const text = extractResponseText(messages);
				if (text) this.opts.onAgentEnd(text);
			}
		}

		// Fan out to all socket clients
		const jsonLine = `${JSON.stringify(event)}\n`;
		for (const client of this.clients) {
			client.write(jsonLine);
		}

		// Forward to daemon event handler
		this.opts.onEvent(event);
	}

	private startSocket(): Promise<void> {
		if (this.transport.kind === "none") {
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			this.cleanupSocket();

			this.server = createServer((client) => {
				this.clients.add(client);
				log.info("terminal client connected", { room: this.opts.sanitizedAlias });

				// Read commands from terminal client
				const rl = createInterface({ input: client });
				rl.on("line", (line) => {
					try {
						const cmd = JSON.parse(line) as RpcCommand;
						// Route prompt commands through sendMessage for streaming-aware dispatch
						if (cmd.type === "prompt") {
							this.sendMessage(cmd.message);
						} else {
							this.send(cmd);
						}
						this.resetIdleTimer();
					} catch {
						log.warn("bad command from terminal client", { line });
					}
				});

				client.on("close", () => {
					this.clients.delete(client);
					log.info("terminal client disconnected", { room: this.opts.sanitizedAlias });
				});

				client.on("error", () => {
					this.clients.delete(client);
				});
			});

			this.server.on("error", reject);

			let listenTarget: ListenOptions | string;
			if (this.transport.kind === "unix") {
				listenTarget = this.transport.path ?? join(this.opts.socketDir, `room-${this.opts.sanitizedAlias}.sock`);
			} else if (this.transport.kind === "tcp") {
				listenTarget = {
					host: this.transport.host ?? "127.0.0.1",
					port: this.transport.port ?? 0,
				};
			} else {
				resolve();
				return;
			}
			this.server.listen(listenTarget, () => resolve());
		});
	}

	private cleanupSocket(): void {
		if (this.transport.kind !== "unix") return;
		const socketPath = this.transport.path ?? join(this.opts.socketDir, `room-${this.opts.sanitizedAlias}.sock`);
		try {
			if (existsSync(socketPath)) unlinkSync(socketPath);
		} catch {
			/* best effort */
		}
	}

	private resetIdleTimer(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => {
			log.info("idle timeout, disposing", { room: this.opts.sanitizedAlias });
			this.dispose();
		}, this.opts.idleTimeoutMs);
		this.idleTimer.unref();
	}
}
