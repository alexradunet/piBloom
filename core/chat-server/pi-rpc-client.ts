import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { AgentEvent } from "@mariozechner/pi-agent-core";

export interface RpcClientLike {
	start(): Promise<void>;
	stop(): Promise<void>;
	newSession(): Promise<{ cancelled: boolean }>;
	onEvent(listener: (event: AgentEvent) => void): () => void;
	prompt(message: string): Promise<void>;
}

interface RpcClientConstructor {
	new (options: { cliPath?: string; cwd?: string }): RpcClientLike;
}

let rpcClientConstructorPromise: Promise<RpcClientConstructor> | null = null;

async function loadRpcClientConstructor(): Promise<RpcClientConstructor> {
	if (!rpcClientConstructorPromise) {
		rpcClientConstructorPromise = (async () => {
			const require = createRequire(import.meta.url);
			const packageJsonPath = require.resolve("@mariozechner/pi-coding-agent/package.json");
			const packageRoot = path.dirname(packageJsonPath);
			const moduleUrl = pathToFileURL(
				path.join(packageRoot, "dist/modes/index.js"),
			).href;
			const mod = (await import(moduleUrl)) as { RpcClient: RpcClientConstructor };
			return mod.RpcClient;
		})();
	}

	return rpcClientConstructorPromise;
}

export async function createRpcClient(options: {
	cliPath: string;
	cwd: string;
}): Promise<RpcClientLike> {
	const RpcClient = await loadRpcClientConstructor();
	return new RpcClient(options);
}
