import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempNixPi, type TempNixPi } from "../helpers/temp-nixpi.js";

let temp: TempNixPi;
let wikiRoot: string;

beforeEach(() => {
	temp = createTempNixPi();
	wikiRoot = path.join(temp.nixPiDir, "Wiki");
	mkdirSync(path.join(wikiRoot, "raw"), { recursive: true });
	mkdirSync(path.join(wikiRoot, "pages", "sources"), { recursive: true });
	mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
});

afterEach(() => {
	temp.cleanup();
});

describe("wiki lifecycle", () => {
	it("capture -> ensure -> search -> lint end-to-end", async () => {
		const { captureText } = await import("../../core/pi/extensions/wiki/actions-capture.js");
		const { handleEnsurePage } = await import("../../core/pi/extensions/wiki/actions-pages.js");
		const { handleWikiLint } = await import("../../core/pi/extensions/wiki/actions-lint.js");
		const { handleWikiSearch } = await import("../../core/pi/extensions/wiki/actions-search.js");
		const { loadRegistry, rebuildAllMeta } = await import("../../core/pi/extensions/wiki/actions-meta.js");

		const capture = captureText(
			wikiRoot,
			"AI alignment is the problem of ensuring AI systems act according to human values.",
			{ title: "AI Alignment Note" },
		);
		expect(capture.isOk()).toBe(true);

		const ensure = handleEnsurePage(wikiRoot, {
			type: "concept",
			title: "AI Alignment",
			summary: "Ensuring AI systems act according to human values.",
			tags: ["ai"],
		});
		expect(ensure.isOk()).toBe(true);

		if (ensure.isOk()) {
			if (!ensure.value.details?.resolved || ensure.value.details.conflict) {
				throw new Error("Expected ensure page to create or resolve a concrete page path");
			}
			const pagePath = path.join(wikiRoot, ensure.value.details.path);
			const sourceId = capture.isOk() ? (capture.value.details?.sourceId as string) : "";
			const content = readFileSync(pagePath, "utf-8")
				.replace("source_ids: []", `source_ids:\n  - ${sourceId}`)
				.replace("## Evidence\n", `## Evidence\n\nSee [[sources/${sourceId}|${sourceId}]].\n`);
			writeFileSync(pagePath, content, "utf-8");
		}

		rebuildAllMeta(wikiRoot);
		const registry = loadRegistry(wikiRoot);

		const search = handleWikiSearch(registry, "alignment");
		expect(search.isOk()).toBe(true);
		if (search.isOk()) {
			const matches = (search.value.details as { matches: Array<{ title: string }> }).matches;
			expect(matches.some((match) => match.title === "AI Alignment")).toBe(true);
		}

		const lint = handleWikiLint(wikiRoot, "all");
		expect(lint.isOk()).toBe(true);
		if (lint.isOk()) {
			expect((lint.value.details?.counts as { frontmatter: number }).frontmatter).toBe(0);
			expect((lint.value.details?.counts as { brokenLinks: number }).brokenLinks).toBe(0);
		}

		const eventsRaw = readFileSync(path.join(wikiRoot, "meta", "events.jsonl"), "utf-8");
		const events = eventsRaw
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as { kind: string });
		expect(events.length).toBeGreaterThanOrEqual(2);
		expect(events.some((event) => event.kind === "capture")).toBe(true);
		expect(events.some((event) => event.kind === "page-create")).toBe(true);
	});
});
