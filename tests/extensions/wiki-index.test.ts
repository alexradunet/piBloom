import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockExtensionAPI } from "../helpers/mock-extension-api.js";

const state = vi.hoisted(() => ({
	wikiRoot: "/tmp/wiki-root",
	digest: "",
	rebuildCalls: [] as string[],
	captureCalls: [] as Array<{ wikiRoot: string; value: string }>,
	ensureCalls: [] as Array<{ wikiRoot: string; title: string }>,
}));

vi.mock("../../core/pi/extensions/wiki/paths.js", () => ({
	getWikiRoot: () => state.wikiRoot,
	isProtectedPath: () => false,
	isWikiPagePath: () => false,
}));

vi.mock("../../core/pi/extensions/wiki/actions-meta.js", () => ({
	buildWikiDigest: () => state.digest,
	handleWikiStatus: () => ({ isErr: () => false, value: { text: "ok", details: {} } }),
	loadRegistry: () => ({ version: 1, generatedAt: "now", pages: [] }),
	rebuildAllMeta: (wikiRoot: string) => {
		state.rebuildCalls.push(wikiRoot);
		return {
			registry: { version: 1, generatedAt: "now", pages: [] },
			backlinks: { version: 1, generatedAt: "now", byPath: {} },
		};
	},
}));

vi.mock("../../core/pi/extensions/wiki/actions-capture.js", () => ({
	captureText: (wikiRoot: string, value: string) => {
		state.captureCalls.push({ wikiRoot, value });
		return { isErr: () => false, isOk: () => true, value: { text: "captured", details: {} } };
	},
	captureFile: () => ({ isErr: () => true, isOk: () => false, error: "missing file" }),
}));

vi.mock("../../core/pi/extensions/wiki/actions-pages.js", () => ({
	handleEnsurePage: (wikiRoot: string, params: { title: string }) => {
		state.ensureCalls.push({ wikiRoot, title: params.title });
		return { isErr: () => false, isOk: () => true, value: { text: "created", details: {} } };
	},
}));

vi.mock("../../core/pi/extensions/wiki/actions-lint.js", () => ({
	handleWikiLint: () => ({ isErr: () => false, isOk: () => true, value: { text: "lint", details: {} } }),
}));

vi.mock("../../core/pi/extensions/wiki/actions-search.js", () => ({
	handleWikiSearch: () => ({ isErr: () => false, isOk: () => true, value: { text: "search", details: {} } }),
}));

describe("wiki index mutation flow", () => {
	beforeEach(() => {
		state.wikiRoot = path.join("/tmp", "wiki-index-test");
		state.digest = "";
		state.rebuildCalls = [];
		state.captureCalls = [];
		state.ensureCalls = [];
	});

	afterEach(() => {
		vi.resetModules();
	});

	async function loadTool(name: string) {
		const api = createMockExtensionAPI();
		const mod = await import("../../core/pi/extensions/wiki/index.js");
		mod.default(api as never);
		const tool = api._registeredTools.find((entry) => entry.name === name);
		if (!tool || typeof tool.execute !== "function") {
			throw new Error(`Tool ${name} not found`);
		}
		return tool.execute as (
			toolCallId: string,
			params: Record<string, unknown>,
			signal?: AbortSignal,
		) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
	}

	it("rebuilds metadata once after successful wiki capture", async () => {
		const execute = await loadTool("wiki_capture");

		const result = await execute("tool-call", { input_type: "text", value: "hello world" });

		expect(result.isError).toBeUndefined();
		expect(state.captureCalls).toEqual([{ wikiRoot: state.wikiRoot, value: "hello world" }]);
		expect(state.rebuildCalls).toEqual([state.wikiRoot]);
	});

	it("does not rebuild metadata when wiki capture fails", async () => {
		const execute = await loadTool("wiki_capture");

		const result = await execute("tool-call", { input_type: "file", value: "/missing.txt" });

		expect(result.isError).toBe(true);
		expect(state.rebuildCalls).toEqual([]);
	});

	it("rebuilds metadata once after ensure page creates or resolves a page", async () => {
		const execute = await loadTool("wiki_ensure_page");

		const result = await execute("tool-call", { type: "concept", title: "AI Alignment" });

		expect(result.isError).toBeUndefined();
		expect(state.ensureCalls).toEqual([{ wikiRoot: state.wikiRoot, title: "AI Alignment" }]);
		expect(state.rebuildCalls).toEqual([state.wikiRoot]);
	});

	it("injects the wiki memory digest before agent start", async () => {
		state.digest = "\n\n[WIKI MEMORY DIGEST]\n- TypeScript Style (concept)";
		const api = createMockExtensionAPI();
		const mod = await import("../../core/pi/extensions/wiki/index.js");
		mod.default(api as never);

		const result = (await api.fireEvent("before_agent_start", {
			systemPrompt: "BASE",
		})) as { systemPrompt: string };

		expect(result.systemPrompt).toContain("BASE");
		expect(result.systemPrompt).toContain("[WIKI MEMORY DIGEST]");
		expect(result.systemPrompt).toContain("TypeScript Style (concept)");
	});
});
