/** Interaction system: pending confirm/select/input prompts, in-memory store. */
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export type InteractionKind = "confirm" | "select" | "input";
export type InteractionStatus = "pending" | "resolved" | "consumed";

export interface InteractionRecord {
	token: string;
	kind: InteractionKind;
	key: string;
	prompt: string;
	status: InteractionStatus;
	resolution?: string;
	ambiguous?: boolean;
	options?: string[];
	resumeMessage?: string;
	createdAt: string;
	updatedAt: string;
}

export interface ResolvedInteractionReply {
	record: InteractionRecord;
	value: string;
	ambiguous?: boolean;
}

type InteractionRequestResult =
	| { state: "resolved"; value: string; ambiguous?: boolean }
	| { state: "pending"; record: InteractionRecord; prompt: string };

/** Module-level in-memory store scoped to the daemon session lifetime. */
const store = new Map<string, InteractionRecord>();

function interactionNowIso(): string {
	return new Date().toISOString();
}

function generateToken(): string {
	return Math.random().toString(36).slice(2, 8);
}

function buildConfirmPrompt(record: InteractionRecord): string {
	return `Confirmation required for "${record.key}". Reply here with "confirm ${record.token}" to approve or "deny ${record.token}" to cancel.`;
}

function buildSelectPrompt(record: InteractionRecord): string {
	const options = record.options ?? [];
	const lines = [
		`${record.prompt}`,
		"",
		...options.map((option, index) => `${index + 1}. ${option}`),
		"",
		`Reply with the number or exact option text, for example "1 ${record.token}" or "${options[0] ?? ""} ${record.token}".`,
	];
	return lines.join("\n");
}

function buildInputPrompt(record: InteractionRecord): string {
	return `${record.prompt}\n\nReply with your answer followed by ${record.token} if needed to disambiguate.`;
}

function buildPrompt(record: InteractionRecord): string {
	switch (record.kind) {
		case "confirm":
			return buildConfirmPrompt(record);
		case "select":
			return buildSelectPrompt(record);
		case "input":
			return buildInputPrompt(record);
	}
}

function findLatestResolved(kind: InteractionKind, key: string): InteractionRecord | undefined {
	return [...store.values()]
		.reverse()
		.find((entry) => entry.kind === kind && entry.key === key && entry.status === "resolved");
}

function getPendingRecords(): InteractionRecord[] {
	return [...store.values()].filter((entry) => entry.status === "pending");
}

function findLatestMatchingPending(kind: InteractionKind, key: string): InteractionRecord | undefined {
	return [...store.values()]
		.reverse()
		.find((entry) => entry.kind === kind && entry.key === key && entry.status === "pending");
}

function normalizeReplyText(text: string, token?: string): string {
	const trimmed = text.trim();
	if (!token) return trimmed;
	return trimmed
		.replace(new RegExp(`\\s+${token}$`, "i"), "")
		.replace(new RegExp(`^${token}\\s+`, "i"), "")
		.trim();
}

function parseConfirmValue(text: string): "approved" | "denied" | null {
	const normalized = text.trim().toLowerCase();
	if (["confirm", "approve", "yes"].includes(normalized)) return "approved";
	if (["deny", "decline", "no"].includes(normalized)) return "denied";
	return null;
}

function parseSelectValue(text: string, options: string[]): string | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	if (/^\d+$/.test(trimmed)) {
		const index = Number(trimmed) - 1;
		return options[index] ?? null;
	}

	const lower = trimmed.toLowerCase();
	const exact = options.find((option) => option.toLowerCase() === lower);
	return exact ?? null;
}

function parseInputValue(text: string): string | null {
	const trimmed = text.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function extractTargetToken(text: string, pending: InteractionRecord[]): string | undefined {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return undefined;
	const pendingTokens = new Set(pending.map((entry) => entry.token.toLowerCase()));
	const first = words[0]?.toLowerCase();
	const last = words[words.length - 1]?.toLowerCase();
	if (first && pendingTokens.has(first)) return first;
	if (last && pendingTokens.has(last)) return last;
	return undefined;
}

function parseValue(record: InteractionRecord, text: string): string | null {
	switch (record.kind) {
		case "confirm":
			return parseConfirmValue(text);
		case "select":
			return parseSelectValue(text, record.options ?? []);
		case "input":
			return parseInputValue(text);
	}
}

function createInteractionRecord(
	request: Parameters<typeof requestInteraction>[1],
	timestamp = interactionNowIso(),
): InteractionRecord {
	return {
		token: generateToken(),
		kind: request.kind,
		key: request.key,
		prompt: request.prompt,
		status: "pending",
		...(request.options ? { options: request.options } : {}),
		...(request.resumeMessage ? { resumeMessage: request.resumeMessage } : {}),
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

function consumeResolvedInteraction(record: InteractionRecord | undefined): InteractionRequestResult | null {
	if (!record?.resolution) {
		return null;
	}

	record.status = "consumed";
	record.updatedAt = interactionNowIso();
	return { state: "resolved", value: record.resolution, ...(record.ambiguous ? { ambiguous: true } : {}) };
}

function requestNoUiConfirmation(ctx: ExtensionContext, action: string): string | null {
	const request = () =>
		requestInteraction(ctx, {
			kind: "confirm",
			key: action,
			prompt: `Allow: ${action}?`,
		});

	const first = request();
	if (!first) {
		return `Cannot perform "${action}" without interactive user confirmation.`;
	}
	if (first.state === "pending") {
		return first.prompt;
	}
	if (!first.ambiguous) {
		return first.value === "approved" ? null : `User declined: ${action}`;
	}

	const retry = request();
	if (!retry) {
		return `Cannot perform "${action}" without interactive user confirmation.`;
	}
	if (retry.state === "pending") {
		return retry.prompt;
	}
	return retry.value === "approved" ? null : `User declined: ${action}`;
}

function selectReplyTarget(
	text: string,
	pending: InteractionRecord[],
): { record: InteractionRecord; ambiguous: boolean } | null {
	const explicitToken = extractTargetToken(text, pending);
	if (explicitToken) {
		const record = pending.find((entry) => entry.token === explicitToken);
		return record ? { record, ambiguous: false } : null;
	}
	if (pending.length === 1 && pending[0]) {
		return { record: pending[0], ambiguous: false };
	}
	const record = pending[pending.length - 1];
	return record ? { record, ambiguous: true } : null;
}

function finalizeResolvedReply(record: InteractionRecord, value: string, ambiguous: boolean): ResolvedInteractionReply {
	record.status = "resolved";
	record.resolution = value;
	record.ambiguous = ambiguous || undefined;
	record.updatedAt = interactionNowIso();
	return { record, value, ...(ambiguous ? { ambiguous: true } : {}) };
}

export function requestInteraction(
	_ctx: ExtensionContext,
	request: {
		kind: InteractionKind;
		key: string;
		prompt: string;
		options?: string[];
		resumeMessage?: string;
	},
): InteractionRequestResult | null {
	const resolved = consumeResolvedInteraction(findLatestResolved(request.kind, request.key));
	if (resolved) {
		return resolved;
	}

	const existing = findLatestMatchingPending(request.kind, request.key);
	if (existing) {
		return { state: "pending", record: existing, prompt: buildPrompt(existing) };
	}

	const record = createInteractionRecord(request);
	store.set(record.token, record);
	return { state: "pending", record, prompt: buildPrompt(record) };
}

export function resolveInteractionReply(_ctx: ExtensionContext, text: string): ResolvedInteractionReply | null {
	const pending = getPendingRecords();
	if (pending.length === 0) return null;

	const target = selectReplyTarget(text, pending);
	if (!target) return null;

	const normalizedReply = normalizeReplyText(text, target.record.token);
	const value = parseValue(target.record, normalizedReply);
	if (!value) return null;

	return finalizeResolvedReply(target.record, value, target.ambiguous);
}

export function formatResumeMessage(record: InteractionRecord, value: string): string {
	const template = record.resumeMessage;
	if (template) {
		return template.replaceAll("{{value}}", value).replaceAll("{{token}}", record.token);
	}

	if (record.kind === "confirm") {
		return `The user ${value === "approved" ? "approved" : "denied"} confirmation ${record.token} for "${record.key}". Resume the blocked task if appropriate.`;
	}
	if (record.kind === "select") {
		return `The user selected "${value}" for "${record.key}". Continue the requested workflow using that choice.`;
	}
	return `The user replied "${value}" for "${record.key}". Continue the requested workflow using that input.`;
}

export function getPendingInteractions(_ctx: ExtensionContext): InteractionRecord[] {
	return getPendingRecords();
}

export async function requireConfirmation(
	ctx: ExtensionContext,
	action: string,
	options?: { requireUi?: boolean },
): Promise<string | null> {
	const requireUi = options?.requireUi ?? true;
	if (!ctx.hasUI) {
		if (!requireUi) return null;
		return requestNoUiConfirmation(ctx, action);
	}
	const confirmed = await ctx.ui.confirm("Confirm action", `Allow: ${action}?`);
	if (!confirmed) return `User declined: ${action}`;
	return null;
}

export async function requestSelection(
	ctx: ExtensionContext,
	key: string,
	title: string,
	options: string[],
	config?: { resumeMessage?: string },
): Promise<{ value: string | null; prompt?: string }> {
	if (ctx.hasUI) {
		const selected = await ctx.ui.select(title, options);
		return { value: selected ?? null };
	}

	const interaction = requestInteraction(ctx, {
		kind: "select",
		key,
		prompt: title,
		options,
		resumeMessage: config?.resumeMessage,
	});
	if (!interaction) {
		return { value: null, prompt: `Cannot complete "${title}" without interactive input.` };
	}
	if (interaction.state === "resolved") {
		return { value: interaction.value };
	}
	return { value: null, prompt: interaction.prompt };
}

export async function requestTextInput(
	ctx: ExtensionContext,
	key: string,
	title: string,
	config?: { placeholder?: string; resumeMessage?: string },
): Promise<{ value: string | null; prompt?: string }> {
	if (ctx.hasUI) {
		const entered = await ctx.ui.input(title, config?.placeholder);
		return { value: entered ?? null };
	}

	const interaction = requestInteraction(ctx, {
		kind: "input",
		key,
		prompt: config?.placeholder ? `${title}\nHint: ${config.placeholder}` : title,
		resumeMessage: config?.resumeMessage,
	});
	if (!interaction) {
		return { value: null, prompt: `Cannot complete "${title}" without interactive input.` };
	}
	if (interaction.state === "resolved") {
		return { value: interaction.value };
	}
	return { value: null, prompt: interaction.prompt };
}

/** Clear all interactions from the in-memory store (for testing). */
export function _clearInteractionStore(): void {
	store.clear();
}
