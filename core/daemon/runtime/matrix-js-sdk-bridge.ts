import { ClientEvent, type MatrixClient, type MatrixEvent, MemoryStore, SyncState, createClient } from "matrix-js-sdk";
import type { MatrixBridge, MatrixIdentity, MatrixTextEvent } from "../contracts/matrix.js";
import { enforceMapLimit, pruneExpiredEntries } from "../ordered-cache.js";

interface ClientEntry {
	identity: MatrixIdentity;
	client: MatrixClient;
}

export interface MatrixJsSdkBridgeOptions {
	identities: readonly MatrixIdentity[];
	initialSyncLimit?: number;
}

const SEEN_EVENT_TTL_MS = 10 * 60 * 1000;
const MAX_SEEN_EVENT_IDS = 10_000;
const NOOP = () => {};

export class MatrixJsSdkBridge implements MatrixBridge {
	private readonly options: MatrixJsSdkBridgeOptions;
	private readonly clients = new Map<string, ClientEntry>();
	private readonly seenEventIds = new Map<string, number>();
	private onTextEventHandler: (identityId: string, event: MatrixTextEvent) => void = NOOP;

	constructor(options: MatrixJsSdkBridgeOptions) {
		this.options = options;
	}

	onTextEvent(handler: (identityId: string, event: MatrixTextEvent) => void): void {
		this.onTextEventHandler = handler;
	}

	async start(): Promise<void> {
		for (const identity of this.options.identities) {
			const client = createClient({
				baseUrl: identity.homeserver,
				accessToken: identity.accessToken,
				userId: identity.userId,
				store: new MemoryStore({ localStorage: undefined }),
			});
			this.clients.set(identity.id, { identity, client });
			this.attachEventHandlers(identity, client);
			try {
				await this.startClient(client);
			} catch (error) {
				this.clients.delete(identity.id);
				client.stopClient();
				throw error;
			}
		}
	}

	stop(): void {
		for (const entry of this.clients.values()) {
			entry.client.stopClient();
		}
		this.clients.clear();
	}

	async sendText(identityId: string, roomId: string, text: string): Promise<void> {
		const entry = this.requireClient(identityId);
		await entry.client.sendHtmlMessage(roomId, text, renderMatrixHtml(text));
	}

	async setTyping(identityId: string, roomId: string, typing: boolean, timeoutMs = 30_000): Promise<void> {
		const entry = this.requireClient(identityId);
		await entry.client.sendTyping(roomId, typing, timeoutMs);
	}

	async getRoomAlias(identityId: string, roomId: string): Promise<string> {
		const entry = this.requireClient(identityId);
		const room = entry.client.getRoom(roomId);
		const canonicalAlias = room?.getCanonicalAlias();
		if (canonicalAlias) return canonicalAlias;

		const altAlias = room?.getAltAliases()[0];
		if (altAlias) return altAlias;

		try {
			const { aliases } = await entry.client.getLocalAliases(roomId);
			return aliases[0] ?? roomId;
		} catch {
			return roomId;
		}
	}

	private requireClient(identityId: string): ClientEntry {
		const entry = this.clients.get(identityId);
		if (!entry) throw new Error(`Unknown Matrix identity: ${identityId}`);
		return entry;
	}

	private attachEventHandlers(identity: MatrixIdentity, client: MatrixClient): void {
		client.on(ClientEvent.Event, (event: MatrixEvent) => {
			void this.handleMatrixEvent(identity, client, event);
		});
	}

	private async startClient(client: MatrixClient): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const onSync = (state: SyncState, _prevState: SyncState | null, data?: { error?: Error }) => {
				if (state === SyncState.Prepared || state === SyncState.Syncing) {
					client.off(ClientEvent.Sync, onSync);
					client.off(ClientEvent.SyncUnexpectedError, onUnexpectedError);
					resolve();
					return;
				}
				if (state === SyncState.Error) {
					client.off(ClientEvent.Sync, onSync);
					client.off(ClientEvent.SyncUnexpectedError, onUnexpectedError);
					reject(data?.error ?? new Error("Matrix client failed initial sync"));
				}
			};

			const onUnexpectedError = (error: Error) => {
				client.off(ClientEvent.Sync, onSync);
				client.off(ClientEvent.SyncUnexpectedError, onUnexpectedError);
				reject(error);
			};

			client.on(ClientEvent.Sync, onSync);
			client.on(ClientEvent.SyncUnexpectedError, onUnexpectedError);
			void client.startClient({
				initialSyncLimit: this.options.initialSyncLimit ?? 8,
			});
		});
	}

	private async handleMatrixEvent(identity: MatrixIdentity, client: MatrixClient, event: MatrixEvent): Promise<void> {
		if (await this.tryAutojoin(identity, client, event)) return;

		if (event.getType() !== "m.room.message") return;

		const roomId = event.getRoomId();
		const senderUserId = event.getSender();
		if (!roomId || !senderUserId || senderUserId === identity.userId) return;
		if (!/^@[a-zA-Z0-9._=\-/]+:[a-zA-Z0-9.-]+$/.test(senderUserId)) return;

		const content = event.getContent() as { msgtype?: string; body?: string };
		if (content.msgtype !== "m.text" || !content.body) return;

		const eventId = event.getId() ?? "unknown";
		const timestamp = event.getTs();
		this.pruneSeenEventIds(timestamp);
		if (this.seenEventIds.has(eventId)) return;
		this.seenEventIds.set(eventId, timestamp);

		this.onTextEventHandler(identity.id, {
			roomId,
			eventId,
			senderUserId,
			body: content.body,
			timestamp,
		});
	}

	private async tryAutojoin(identity: MatrixIdentity, client: MatrixClient, event: MatrixEvent): Promise<boolean> {
		if (!identity.autojoin) return false;
		if (event.getType() !== "m.room.member") return false;

		const rawEvent = event.event as { state_key?: string; content?: { membership?: string }; room_id?: string };
		if (rawEvent.state_key !== identity.userId) return false;
		if (rawEvent.content?.membership !== "invite") return false;
		if (!rawEvent.room_id) return false;

		await client.joinRoom(rawEvent.room_id);
		return true;
	}

	private pruneSeenEventIds(now: number): void {
		pruneExpiredEntries(this.seenEventIds, now, (timestamp) => timestamp, SEEN_EVENT_TTL_MS);
		enforceMapLimit(this.seenEventIds, MAX_SEEN_EVENT_IDS - 1);
	}
}

function renderMatrixHtml(text: string): string {
	const normalized = text.replace(/\r\n/g, "\n").trim();
	if (!normalized) return "<p></p>";

	const lines = normalized.split("\n");
	const parts: string[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		if (!line.trim()) {
			index += 1;
			continue;
		}

		if (line.startsWith("```")) {
			const fence = line.slice(3).trim();
			const codeLines: string[] = [];
			index += 1;
			while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
				codeLines.push(lines[index] ?? "");
				index += 1;
			}
			if (index < lines.length) index += 1;
			const classAttr = fence ? ` class="language-${escapeHtmlAttribute(fence)}"` : "";
			parts.push(`<pre><code${classAttr}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
			continue;
		}

		const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			const level = headingMatch[1]?.length ?? 1;
			const content = headingMatch[2] ?? "";
			parts.push(`<h${level}>${renderInlineMarkdown(content)}</h${level}>`);
			index += 1;
			continue;
		}

		if (line.startsWith(">")) {
			const quoteLines: string[] = [];
			while (index < lines.length) {
				const current = lines[index] ?? "";
				if (!current.trim()) {
					index += 1;
					break;
				}
				if (!current.startsWith(">")) break;
				quoteLines.push(current.replace(/^>\s?/, ""));
				index += 1;
			}
			parts.push(`<blockquote>${quoteLines.map((entry) => `<p>${renderInlineMarkdown(entry)}</p>`).join("")}</blockquote>`);
			continue;
		}

		const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
		if (unorderedMatch) {
			const items: string[] = [];
			while (index < lines.length) {
				const current = lines[index] ?? "";
				const match = current.match(/^(\s*)[-*+]\s+(.+)$/);
				if (!match) break;
				items.push(`<li>${renderInlineMarkdown(match[2] ?? "")}</li>`);
				index += 1;
			}
			parts.push(`<ul>${items.join("")}</ul>`);
			continue;
		}

		const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
		if (orderedMatch) {
			const items: string[] = [];
			while (index < lines.length) {
				const current = lines[index] ?? "";
				const match = current.match(/^\s*\d+[.)]\s+(.+)$/);
				if (!match) break;
				items.push(`<li>${renderInlineMarkdown(match[1] ?? "")}</li>`);
				index += 1;
			}
			parts.push(`<ol>${items.join("")}</ol>`);
			continue;
		}

		const paragraphLines: string[] = [];
		while (index < lines.length) {
			const current = lines[index] ?? "";
			if (!current.trim()) {
				index += 1;
				break;
			}
			if (
				current.startsWith("```") ||
				current.startsWith(">") ||
				/^#{1,6}\s+/.test(current) ||
				/^(\s*)[-*+]\s+/.test(current) ||
				/^\s*\d+[.)]\s+/.test(current)
			) {
				break;
			}
			paragraphLines.push(current);
			index += 1;
		}
		parts.push(`<p>${renderInlineMarkdown(paragraphLines.join("\n"))}</p>`);
	}

	return parts.join("");
}

function renderInlineMarkdown(text: string): string {
	let html = escapeHtml(text);

	html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
	html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
	html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
	html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
	html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
	html = html.replace(/\n/g, "<br>");

	return html;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
	return escapeHtml(value).replaceAll('"', "&quot;");
}
