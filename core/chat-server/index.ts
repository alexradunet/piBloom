import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RpcClientManager } from "./rpc-client-manager.js";

export interface ChatServerOptions {
	/** Path to /usr/local/share/nixpi (the deployed app share dir). */
	nixpiShareDir: string;
	/** Working directory for the Pi agent process (e.g. ~/.pi). */
	agentCwd: string;
	/** Directory containing the pre-built frontend (index.html + assets). */
	staticDir: string;
}

export function createChatServer(opts: ChatServerOptions): http.Server {
	const rpc = new RpcClientManager({ nixpiShareDir: opts.nixpiShareDir, cwd: opts.agentCwd });

	// Pre-spawn the Pi subprocess so first request latency stays low.
	rpc.start().catch((err: unknown) => {
		console.error("Failed to start Pi RPC process:", err);
	});

	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

		if (req.method === "POST" && url.pathname === "/chat") {
			let body = "";
			for await (const chunk of req) {
				body += chunk;
			}

			let parsed: { message?: string };
			try {
				parsed = JSON.parse(body) as { message?: string };
			} catch {
				res.writeHead(400).end(JSON.stringify({ error: "invalid JSON" }));
				return;
			}
			if (!parsed.message || typeof parsed.message !== "string") {
				res.writeHead(400).end(JSON.stringify({ error: "message required" }));
				return;
			}

			res.writeHead(200, {
				"Content-Type": "application/x-ndjson",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			});

			try {
				for await (const event of rpc.sendMessage(parsed.message)) {
					res.write(`${JSON.stringify(event)}\n`);
				}
			} catch (err) {
				res.write(`${JSON.stringify({ type: "error", message: String(err) })}\n`);
			}
			res.end();
			return;
		}

		// Session id in the URL is tolerated for compatibility but ignored.
		if (req.method === "DELETE" && /^\/chat\/[^/]+$/.test(url.pathname)) {
			await rpc.reset();
			res.writeHead(204).end();
			return;
		}

		if (req.method === "GET") {
			const filePath = path.join(
				opts.staticDir,
				url.pathname === "/" ? "index.html" : url.pathname,
			);
			const root = opts.staticDir.endsWith(path.sep)
				? opts.staticDir
				: opts.staticDir + path.sep;
			if (!filePath.startsWith(root)) {
				res.writeHead(403).end();
				return;
			}
			try {
				const data = fs.readFileSync(filePath);
				const ext = path.extname(filePath);
				const mime: Record<string, string> = {
					".html": "text/html",
					".js": "application/javascript",
					".css": "text/css",
					".json": "application/json",
					".ico": "image/x-icon",
				};
				res.writeHead(200, { "Content-Type": mime[ext] ?? "application/octet-stream" });
				res.end(data);
			} catch {
				res.writeHead(404).end("Not found");
			}
			return;
		}

		res.writeHead(405).end();
	});

	server.on("close", () => {
		rpc.stop().catch(() => {});
	});

	return server;
}

export function isMainModule(argv1: string | undefined, moduleUrl: string): boolean {
	if (!argv1) {
		return false;
	}

	const modulePath = fileURLToPath(moduleUrl);

	try {
		return fs.realpathSync(argv1) === fs.realpathSync(modulePath);
	} catch {
		return path.resolve(argv1) === path.resolve(modulePath);
	}
}

if (isMainModule(process.argv[1], import.meta.url)) {
	const port = parseInt(process.env.NIXPI_CHAT_PORT ?? "8080", 10);
	const nixpiShareDir = process.env.NIXPI_SHARE_DIR ?? "/usr/local/share/nixpi";
	const piDir = process.env.PI_DIR ?? `${process.env.HOME}/.pi`;
	const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "frontend/dist");

	const server = createChatServer({
		nixpiShareDir,
		agentCwd: piDir,
		staticDir,
	});

	server.listen(port, "127.0.0.1", () => {
		console.log(`nixpi-chat listening on 127.0.0.1:${port}`);
	});
}
