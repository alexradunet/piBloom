import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createLogger, getGardenDir, truncate } from "./shared.js";

const log = createLogger("bloom-audit");

const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SENSITIVE_KEY = /(token|secret|password|authorization|api[_-]?key|cookie)/i;

interface AuditEntry {
	ts: string;
	event: "tool_call" | "tool_result";
	tool: string;
	toolCallId: string;
	input?: unknown;
	isError?: boolean;
}

function auditDir(): string {
	return join(getGardenDir(), "Bloom", "audit");
}

function dayStamp(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function ensureAuditDir(): string {
	const dir = auditDir();
	mkdirSync(dir, { recursive: true });
	return dir;
}

function sanitize(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (Array.isArray(value)) return value.map((v) => sanitize(v));
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
			out[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize(val);
		}
		return out;
	}
	if (typeof value === "string" && value.length > 4000) {
		return `${value.slice(0, 4000)}…`;
	}
	return value;
}

function appendAudit(entry: AuditEntry): void {
	try {
		const file = join(ensureAuditDir(), `${dayStamp(new Date())}.jsonl`);
		appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf-8");
	} catch (err) {
		log.error("failed to append audit entry", { error: (err as Error).message });
	}
}

function rotateAudit(now = new Date()): void {
	const dir = ensureAuditDir();
	const cutoff = now.getTime() - RETENTION_DAYS * DAY_MS;

	for (const name of readdirSync(dir)) {
		if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
		const dayTs = Date.parse(`${name.slice(0, 10)}T00:00:00Z`);
		if (Number.isNaN(dayTs)) continue;
		if (dayTs < cutoff) {
			try {
				unlinkSync(join(dir, name));
			} catch (err) {
				log.warn("failed to remove old audit file", { file: name, error: (err as Error).message });
			}
		}
	}
}

function readEntries(days: number): AuditEntry[] {
	const dir = auditDir();
	if (!existsSync(dir)) return [];

	const entries: AuditEntry[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const date = new Date(Date.now() - i * DAY_MS);
		const file = join(dir, `${dayStamp(date)}.jsonl`);
		if (!existsSync(file)) continue;

		try {
			const lines = readFileSync(file, "utf-8").split("\n").filter(Boolean);
			for (const line of lines) {
				try {
					entries.push(JSON.parse(line) as AuditEntry);
				} catch {
					// Skip malformed lines.
				}
			}
		} catch (err) {
			log.warn("failed to read audit file", { file, error: (err as Error).message });
		}
	}

	return entries;
}

function summarizeInput(input: unknown): string {
	if (input === undefined) return "";
	try {
		const text = JSON.stringify(input);
		if (!text || text === "{}") return "";
		return text.length > 160 ? `${text.slice(0, 160)}…` : text;
	} catch {
		return "<unserializable input>";
	}
}

export default function (pi: ExtensionAPI) {
	let rotated = false;

	pi.on("session_start", (_event, ctx) => {
		if (!rotated) {
			rotateAudit();
			rotated = true;
		}
		ensureAuditDir();
		if (ctx.hasUI) {
			ctx.ui.setStatus("bloom-audit", "Audit: enabled");
		}
	});

	pi.on("tool_call", (event) => {
		appendAudit({
			ts: new Date().toISOString(),
			event: "tool_call",
			tool: event.toolName,
			toolCallId: event.toolCallId,
			input: sanitize(event.input),
		});
	});

	pi.on("tool_result", (event) => {
		appendAudit({
			ts: new Date().toISOString(),
			event: "tool_result",
			tool: event.toolName,
			toolCallId: event.toolCallId,
			isError: event.isError,
		});
	});

	pi.registerTool({
		name: "audit_review",
		label: "Audit Review",
		description: "Review recent tool calls/results from the Bloom audit trail.",
		promptSnippet: "audit_review — inspect recent audited tool activity",
		promptGuidelines: [
			"Use audit_review to inspect what tools were executed recently.",
			"Filter by tool name when investigating suspicious or failing operations.",
		],
		parameters: Type.Object({
			days: Type.Optional(Type.Number({ description: "How many days to scan (1-30)", default: 1 })),
			limit: Type.Optional(Type.Number({ description: "Max entries to return (1-500)", default: 50 })),
			tool: Type.Optional(Type.String({ description: "Optional tool name filter (e.g. bash, bootc_update)" })),
			include_inputs: Type.Optional(Type.Boolean({ description: "Include sanitized input snippets", default: false })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const days = Math.max(1, Math.min(30, Math.round(params.days ?? 1)));
			const limit = Math.max(1, Math.min(500, Math.round(params.limit ?? 50)));
			const byTool = params.tool?.trim();
			const includeInputs = params.include_inputs ?? false;

			let entries = readEntries(days);
			if (byTool) {
				entries = entries.filter((e) => e.tool === byTool);
			}
			entries = entries.slice(-limit);

			if (entries.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No audit entries found for the selected range/filter." }],
					details: { days, tool: byTool ?? null, count: 0 },
				};
			}

			const lines: string[] = [];
			for (const e of entries) {
				const status = e.event === "tool_result" ? (e.isError ? "error" : "ok") : "call";
				lines.push(`- ${e.ts} ${e.tool} [${status}]`);
				if (includeInputs && e.event === "tool_call") {
					const input = summarizeInput(e.input);
					if (input) lines.push(`  input: ${input}`);
				}
			}

			return {
				content: [{ type: "text" as const, text: truncate(lines.join("\n")) }],
				details: {
					days,
					limit,
					tool: byTool ?? null,
					count: entries.length,
				},
			};
		},
	});
}
