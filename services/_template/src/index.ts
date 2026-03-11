/**
 * bloom-TEMPLATE — Entry point
 *
 * This is the main entry point for the TEMPLATE service. It sets up:
 *   1. A health-check HTTP server (configurable via BLOOM_HEALTH_PORT)
 *   2. Service-specific initialization
 *   3. Graceful shutdown on SIGTERM/SIGINT
 *
 * Customize this file:
 *   - Replace TEMPLATE with your service name everywhere
 *   - Add service-specific initialization in startService()
 */

import { createServer as createHttpServer } from "node:http";
import { connect as connectTransport } from "./transport.js";

// --- Configuration ---

const HEALTH_PORT = Number(process.env.BLOOM_HEALTH_PORT ?? "18800");

// --- State ---

let shuttingDown = false;
let serviceConnected = false;

// --- Health check HTTP server ---

const healthServer = createHttpServer((req, res) => {
	if (req.url === "/health") {
		const healthy = serviceConnected;
		res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ service: serviceConnected }));
	} else {
		res.writeHead(404);
		res.end();
	}
});

healthServer.listen(HEALTH_PORT, "0.0.0.0", () => {
	console.log(`[health] listening on :${HEALTH_PORT}`);
});

// --- Service initialization ---
// TODO: Replace this with your service-specific startup logic.

async function startService(): Promise<void> {
	if (shuttingDown) return;

	console.log("[TEMPLATE] starting service...");

	// TODO: Initialize your service client/connection here.
	await connectTransport({
		onMessage: (from: string, text: string) => {
			console.log(`[TEMPLATE] message from ${from}: ${text.slice(0, 80)}`);
		},
	});

	serviceConnected = true;
}

// --- Graceful shutdown ---

function shutdown(signal: string): void {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[bloom-TEMPLATE] received ${signal}, shutting down...`);

	healthServer.close();

	// TODO: Clean up your service-specific resources here.

	setTimeout(() => process.exit(0), 1_500);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- Entry point ---

startService().catch((err: unknown) => {
	console.error("[bloom-TEMPLATE] fatal startup error:", (err as Error).message);
	process.exit(1);
});
