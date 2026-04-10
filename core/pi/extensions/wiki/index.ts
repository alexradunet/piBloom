/**
 * wiki — Wiki memory capture, search, scaffolding, linting, and metadata rebuilds.
 *
 * @tools wiki_status, wiki_capture, wiki_search, wiki_ensure_page, wiki_lint, wiki_rebuild
 * @hooks tool_call, agent_end, before_agent_start
 * @see {@link ../../AGENTS.md#wiki} Extension reference
 */
import { StringEnum } from "@mariozechner/pi-ai";
import { type ExtensionAPI, isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import {
	type ActionResult,
	EmptyToolParams,
	ok,
	type RegisteredExtensionTool,
	registerTools,
	toToolResult,
} from "../../../lib/utils.js";
import { captureFile, captureText } from "./actions-capture.js";
import { handleWikiLint } from "./actions-lint.js";
import { buildWikiDigest, handleWikiStatus, loadRegistry, rebuildAllMeta } from "./actions-meta.js";
import { handleEnsurePage } from "./actions-pages.js";
import { handleWikiSearch } from "./actions-search.js";
import { getWikiRoot, isProtectedPath, isWikiPagePath } from "./paths.js";
import type { CanonicalPageType } from "./types.js";

const CanonicalTypeEnum = StringEnum([
	"concept",
	"entity",
	"synthesis",
	"analysis",
	"evolution",
	"procedure",
	"decision",
] as const);

const LintModeEnum = StringEnum([
	"links",
	"orphans",
	"frontmatter",
	"duplicates",
	"coverage",
	"staleness",
	"all",
] as const);

const WikiCaptureParams = Type.Object({
	input_type: StringEnum(["text", "file"] as const),
	value: Type.String({ description: "Text content or an absolute file path to capture." }),
	title: Type.Optional(Type.String({ description: "Optional title override." })),
	kind: Type.Optional(Type.String({ description: "Optional source kind, for example note or pdf." })),
	tags: Type.Optional(Type.Array(Type.String())),
});

const WikiSearchParams = Type.Object({
	query: Type.String({ description: "Search query." }),
	type: Type.Optional(CanonicalTypeEnum),
	limit: Type.Optional(Type.Number({ description: "Maximum results to return.", default: 10 })),
});

const WikiEnsurePageParams = Type.Object({
	type: CanonicalTypeEnum,
	title: Type.String({ description: "Canonical page title." }),
	aliases: Type.Optional(Type.Array(Type.String())),
	tags: Type.Optional(Type.Array(Type.String())),
	summary: Type.Optional(Type.String({ description: "Optional one-line summary." })),
});

const WikiLintParams = Type.Object({
	mode: Type.Optional(LintModeEnum),
});

async function runWikiMutation<TDetails extends object>(
	wikiRoot: string,
	operation: () => Promise<ActionResult<TDetails>>,
) {
	const actionResult = toToolResult(await operation());
	if (!actionResult.isError) {
		rebuildAllMeta(wikiRoot);
	}
	return actionResult;
}

export default function (pi: ExtensionAPI) {
	let dirty = false;

	const tools: RegisteredExtensionTool[] = [
		{
			name: "wiki_status",
			label: "Wiki Status",
			description: "Show wiki page counts and source state totals.",
			parameters: EmptyToolParams,
			async execute() {
				return toToolResult(handleWikiStatus(getWikiRoot()));
			},
		},
		{
			name: "wiki_capture",
			label: "Wiki Capture",
			description: "Capture text or a local file into a raw source packet and scaffold a source page.",
			parameters: WikiCaptureParams,
			async execute(_toolCallId, params) {
				const typed = params as Static<typeof WikiCaptureParams>;
				const wikiRoot = getWikiRoot();
				return runWikiMutation(wikiRoot, async () =>
					typed.input_type === "file"
						? captureFile(wikiRoot, typed.value, { title: typed.title, kind: typed.kind, tags: typed.tags })
						: captureText(wikiRoot, typed.value, { title: typed.title, kind: typed.kind, tags: typed.tags }),
				);
			},
		},
		{
			name: "wiki_search",
			label: "Wiki Search",
			description: "Search wiki pages by title, aliases, headings, tags, source IDs, and summary text.",
			parameters: WikiSearchParams,
			async execute(_toolCallId, params) {
				const typed = params as Static<typeof WikiSearchParams>;
				return toToolResult(handleWikiSearch(loadRegistry(getWikiRoot()), typed.query, typed.type, typed.limit));
			},
		},
		{
			name: "wiki_ensure_page",
			label: "Wiki Ensure Page",
			description: "Resolve an existing canonical page by title or alias, or create a new draft page if missing.",
			parameters: WikiEnsurePageParams,
			async execute(_toolCallId, params) {
				const typed = params as Static<typeof WikiEnsurePageParams> & { type: CanonicalPageType };
				const wikiRoot = getWikiRoot();
				return runWikiMutation(wikiRoot, async () => handleEnsurePage(wikiRoot, typed));
			},
		},
		{
			name: "wiki_lint",
			label: "Wiki Lint",
			description: "Run structural wiki checks for broken links, frontmatter, duplicates, coverage, and staleness.",
			parameters: WikiLintParams,
			async execute(_toolCallId, params) {
				const typed = params as Static<typeof WikiLintParams>;
				return toToolResult(handleWikiLint(getWikiRoot(), typed.mode));
			},
		},
		{
			name: "wiki_rebuild",
			label: "Wiki Rebuild",
			description: "Force-rebuild registry, backlinks, index, and log metadata from current wiki pages.",
			parameters: EmptyToolParams,
			async execute() {
				rebuildAllMeta(getWikiRoot());
				return toToolResult(ok({ text: "Rebuilt wiki metadata." }));
			},
		},
	];
	registerTools(pi, tools);

	function protectOrMark(pathValue: string, wikiRoot: string) {
		if (isProtectedPath(wikiRoot, pathValue)) {
			return { block: true as const, reason: "Wiki protects raw/ and meta/. Use wiki tools instead." };
		}
		if (isWikiPagePath(wikiRoot, pathValue)) {
			dirty = true;
		}
		return undefined;
	}

	pi.on("tool_call", async (event) => {
		const wikiRoot = getWikiRoot();

		if (isToolCallEventType("write", event)) {
			return protectOrMark(event.input.path, wikiRoot);
		}

		if (isToolCallEventType("edit", event)) {
			return protectOrMark(event.input.path, wikiRoot);
		}

		return undefined;
	});

	pi.on("agent_end", async () => {
		if (!dirty) return;
		dirty = false;
		rebuildAllMeta(getWikiRoot());
	});

	pi.on("before_agent_start", async (event) => {
		const digest = buildWikiDigest(getWikiRoot());
		if (!digest) return;
		return { systemPrompt: `${event.systemPrompt}${digest}` };
	});
}
