import "@mariozechner/pi-web-ui/app.css";
import { Agent } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, Context, Model } from "@mariozechner/pi-ai";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import {
	AppStorage,
	ChatPanel,
	IndexedDBStorageBackend,
	ProviderKeysStore,
	SessionsStore,
	SettingsStore,
	setAppStorage,
} from "@mariozechner/pi-web-ui";
import { createShell } from "./shell";

type StreamFnOptions = { signal?: AbortSignal };
type TextContentPart = { type: "text"; text?: string };
type StreamEvent = { type: string; content?: string; message?: string };
type AssistantEventStream = ReturnType<typeof createAssistantMessageEventStream>;

function createStorage(): AppStorage {
	const settings = new SettingsStore();
	const providerKeys = new ProviderKeysStore();
	const sessions = new SessionsStore();

	const backend = new IndexedDBStorageBackend({
		dbName: "nixpi-chat",
		version: 1,
		stores: [settings.getConfig(), providerKeys.getConfig(), sessions.getConfig(), SessionsStore.getMetadataConfig()],
	});

	settings.setBackend(backend);
	providerKeys.setBackend(backend);
	sessions.setBackend(backend);

	return new AppStorage(settings, providerKeys, sessions, undefined, backend);
}

function extractTextPart(content: unknown): string {
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.filter(
			(part): part is TextContentPart =>
				typeof part === "object" && part !== null && (part as { type?: string }).type === "text",
		)
		.map((part) => part.text ?? "")
		.join("");
}

function extractLastUserText(context: Context): string {
	const messages = context.messages ?? [];
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const msg = messages[i];
		if (msg?.role !== "user") {
			continue;
		}

		return typeof msg.content === "string" ? msg.content : extractTextPart(msg.content);
	}

	return "";
}

function createEmptyAssistantMessage(): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "" }],
		api: "openai-completions",
		provider: "nixpi",
		model: "nixpi",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function createUpdatedPartial(partial: AssistantMessage, text: string): AssistantMessage {
	return {
		...partial,
		content: [{ type: "text", text }],
	};
}

function createStreamError(
	partial: AssistantMessage,
	text: string,
	errorMessage: string,
	reason: "error" | "aborted" = "error",
): AssistantMessage {
	return {
		...partial,
		content: [{ type: "text", text }],
		stopReason: reason,
		errorMessage,
	};
}

function handleStreamFailure(
	stream: AssistantEventStream,
	partial: AssistantMessage,
	accText: string,
	err: unknown,
): void {
	const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
	const errMsg = isAbort ? "Aborted" : String(err);
	const reason = isAbort ? "aborted" : "error";
	const errPartial = createStreamError(partial, accText || errMsg, errMsg, reason);
	stream.push({ type: "error", reason, error: errPartial });
	stream.end(errPartial);
}

function handleServerResponseError(
	stream: AssistantEventStream,
	partial: AssistantMessage,
	status: number,
): void {
	const errMsg = `Server error: ${status}`;
	const errPartial = createStreamError(partial, errMsg, errMsg);
	stream.push({ type: "error", reason: "error", error: errPartial });
	stream.end(errPartial);
}

function pushTextDelta(
	stream: AssistantEventStream,
	partial: AssistantMessage,
	accText: string,
	delta: string,
): string {
	const nextText = accText + delta;
	const updatedPartial = createUpdatedPartial(partial, nextText);
	stream.push({
		type: "text_delta",
		contentIndex: 0,
		delta,
		partial: updatedPartial,
	});
	return nextText;
}

function handleParsedStreamEvent(
	stream: AssistantEventStream,
	partial: AssistantMessage,
	accText: string,
	event: StreamEvent,
): { accText: string; stop: boolean } {
	if (event.type === "text" && event.content) {
		return {
			accText: pushTextDelta(stream, partial, accText, event.content),
			stop: false,
		};
	}

	if (event.type === "error" && event.message) {
		const errPartial = createStreamError(partial, accText, event.message);
		stream.push({ type: "error", reason: "error", error: errPartial });
		stream.end(errPartial);
		return { accText, stop: true };
	}

	return { accText, stop: false };
}

async function pumpResponseBody(
	stream: AssistantEventStream,
	partial: AssistantMessage,
	body: ReadableStream<Uint8Array>,
): Promise<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let accText = "";

	stream.push({ type: "text_start", contentIndex: 0, partial });

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			return accText;
		}

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			if (!line.trim()) {
				continue;
			}

			let event: StreamEvent;
			try {
				event = JSON.parse(line) as StreamEvent;
			} catch {
				continue;
			}

			const next = handleParsedStreamEvent(stream, partial, accText, event);
			accText = next.accText;
			if (next.stop) {
				return accText;
			}
		}
	}
}

async function streamChatResponse(
	stream: AssistantEventStream,
	partial: AssistantMessage,
	userText: string,
	signal?: AbortSignal,
): Promise<void> {
	let accText = "";

	try {
		const res = await fetch("/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message: userText }),
			signal,
		});

		if (!res.ok || !res.body) {
			handleServerResponseError(stream, partial, res.status);
			return;
		}

		accText = await pumpResponseBody(stream, partial, res.body);

		const finalPartial = createUpdatedPartial(partial, accText);
		stream.push({ type: "text_end", contentIndex: 0, content: accText, partial: finalPartial });
		stream.push({ type: "done", reason: "stop", message: finalPartial });
		stream.end(finalPartial);
	} catch (err: unknown) {
		handleStreamFailure(stream, partial, accText, err);
	}
}

// --------------------------------------------------------------------------
// Minimal AppStorage setup (no API keys needed — we use our own backend)
// --------------------------------------------------------------------------
setAppStorage(createStorage());

// --------------------------------------------------------------------------
// Custom streamFn — calls /chat and translates NDJSON to AssistantMessageEventStream
// --------------------------------------------------------------------------
function makeCustomStreamFn() {
	return function customStreamFn(_model: Model<unknown>, context: Context, options?: StreamFnOptions) {
		const stream = createAssistantMessageEventStream();
		const userText = extractLastUserText(context);
		const partial = createEmptyAssistantMessage();

		stream.push({ type: "start", partial });
		void streamChatResponse(stream, partial, userText, options?.signal);

		return stream;
	};
}

// --------------------------------------------------------------------------
// Create Agent with custom streamFn
// --------------------------------------------------------------------------
const agent = new Agent({
	initialState: {
		systemPrompt: "",
		model: {
			id: "nixpi",
			name: "Pi",
			api: "openai-completions",
			provider: "nixpi",
			baseUrl: "",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		} as Model<unknown>,
		thinkingLevel: "off",
		messages: [],
		tools: [],
	},
	streamFn: makeCustomStreamFn(),
});

// --------------------------------------------------------------------------
// Mount ChatPanel
// --------------------------------------------------------------------------
async function init() {
	const appRoot = document.getElementById("app");
	if (!appRoot) {
		throw new Error("Missing #app root");
	}

	const shell = createShell();
	appRoot.replaceChildren(shell);

	const chatPanel = new ChatPanel();

	await chatPanel.setAgent(agent, {
		onApiKeyRequired: async (_provider: string) => {
			// No API key needed — our backend handles auth
			return true;
		},
	});

	// Replace the <nixpi-chat> placeholder with the ChatPanel element
	const placeholder = shell.querySelector("nixpi-chat");
	if (!placeholder) {
		throw new Error("Missing chat placeholder");
	}
	placeholder.replaceWith(chatPanel);

	// Size the chat panel to its shell pane.
	Object.assign(chatPanel.style, {
		display: "block",
		width: "100%",
		height: "100%",
	});
}

init().catch((err) => console.error("Init failed:", err));
