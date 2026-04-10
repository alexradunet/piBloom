import path from "node:path";
import { atomicWriteFile } from "../../../lib/filesystem.js";
import { ok } from "../../../lib/utils.js";
import { buildBacklinks, buildRegistry, scanPages } from "./actions-meta.js";
import { normalizeWikiLink } from "./paths.js";
import { type LintMode, REQUIRED_FRONTMATTER_FIELDS } from "./rules.js";
import type { ActionResult, BacklinksData, LintDetails, LintIssue, RegistryData } from "./types.js";

function lintLinks(pages: ReturnType<typeof scanPages>, registry: RegistryData): LintIssue[] {
	const known = new Set(registry.pages.map((page) => page.path));
	const issues: LintIssue[] = [];
	for (const page of pages) {
		for (const raw of page.rawLinks) {
			const normalized = normalizeWikiLink(raw);
			if (!normalized || !known.has(normalized)) {
				issues.push({
					kind: "broken-link",
					severity: "warning",
					path: page.relativePath,
					message: `Broken link: [[${raw}]]`,
				});
			}
		}
	}
	return issues;
}

function lintOrphans(registry: RegistryData, backlinks: BacklinksData): LintIssue[] {
	return registry.pages
		.filter((page) => page.type !== "source")
		.filter((page) => {
			const record = backlinks.byPath[page.path];
			return record && record.inbound.length === 0 && record.outbound.length === 0;
		})
		.map((page) => ({
			kind: "orphan",
			severity: "warning" as const,
			path: page.path,
			message: "No inbound or outbound wiki links.",
		}));
}

function lintFrontmatter(pages: ReturnType<typeof scanPages>): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const page of pages) {
		const type = page.frontmatter.type === "source" ? "source" : "concept";
		const required = REQUIRED_FRONTMATTER_FIELDS[type];
		for (const field of required) {
			if (!(field in page.frontmatter)) {
				issues.push({
					kind: "frontmatter",
					severity: "error",
					path: page.relativePath,
					message: `Missing: ${field}`,
				});
			}
		}
	}
	return issues;
}

function lintDuplicates(registry: RegistryData): LintIssue[] {
	const seen = new Map<string, string>();
	const issues: LintIssue[] = [];
	for (const page of registry.pages.filter((entry) => entry.type !== "source")) {
		const normalizedTitle = page.title.trim().toLowerCase();
		const previousPath = seen.get(normalizedTitle);
		if (previousPath) {
			issues.push({
				kind: "duplicate",
				severity: "warning",
				path: page.path,
				message: `Duplicate title with ${previousPath}`,
			});
			continue;
		}
		seen.set(normalizedTitle, page.path);
	}
	return issues;
}

function lintCoverage(registry: RegistryData, backlinks: BacklinksData): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const page of registry.pages) {
		if (page.type === "source") {
			const inbound = backlinks.byPath[page.path]?.inbound ?? [];
			if (inbound.filter((pathValue) => !pathValue.includes("/sources/")).length === 0) {
				issues.push({
					kind: "coverage",
					severity: "info",
					path: page.path,
					message: "Source not cited by any canonical page.",
				});
			}
			continue;
		}

		if (page.sourceIds.length === 0) {
			issues.push({
				kind: "coverage",
				severity: "warning",
				path: page.path,
				message: "No source_ids listed.",
			});
		}
	}
	return issues;
}

function lintStaleness(registry: RegistryData): LintIssue[] {
	return registry.pages
		.filter((page) => page.type === "source" && page.status === "captured")
		.map((page) => ({
			kind: "staleness",
			severity: "info" as const,
			path: page.path,
			message: "Source still in captured state.",
		}));
}

function buildCounts(issues: LintIssue[]) {
	return {
		total: issues.length,
		brokenLinks: issues.filter((issue) => issue.kind === "broken-link").length,
		orphans: issues.filter((issue) => issue.kind === "orphan").length,
		frontmatter: issues.filter((issue) => issue.kind === "frontmatter").length,
		duplicates: issues.filter((issue) => issue.kind === "duplicate").length,
		coverage: issues.filter((issue) => issue.kind === "coverage").length,
		staleness: issues.filter((issue) => issue.kind === "staleness").length,
	};
}

function renderReport(mode: string, issues: LintIssue[], counts: ReturnType<typeof buildCounts>): string {
	const lines = ["# Lint Report", "", `Mode: ${mode}`, `Total: ${counts.total}`, ""];
	for (const issue of issues) {
		lines.push(`- **${issue.severity}** [${issue.kind}] \`${issue.path}\` - ${issue.message}`);
	}
	lines.push("");
	return lines.join("\n");
}

const LINT_CHECKS: Record<
	Exclude<LintMode, "all">,
	(pages: ReturnType<typeof scanPages>, registry: RegistryData, backlinks: BacklinksData) => LintIssue[]
> = {
	links: (pages, registry) => lintLinks(pages, registry),
	orphans: (_pages, registry, backlinks) => lintOrphans(registry, backlinks),
	frontmatter: (pages) => lintFrontmatter(pages),
	duplicates: (_pages, registry) => lintDuplicates(registry),
	coverage: (_pages, registry, backlinks) => lintCoverage(registry, backlinks),
	staleness: (_pages, registry) => lintStaleness(registry),
};

export function handleWikiLint(wikiRoot: string, mode: LintMode = "all"): ActionResult<LintDetails> {
	const pages = scanPages(wikiRoot);
	const registry = buildRegistry(pages);
	const backlinks = buildBacklinks(registry);
	const selectedModes = mode === "all" ? (Object.keys(LINT_CHECKS) as Array<Exclude<LintMode, "all">>) : [mode];
	const issues = selectedModes.flatMap((selectedMode) => LINT_CHECKS[selectedMode](pages, registry, backlinks));

	const counts = buildCounts(issues);
	atomicWriteFile(path.join(wikiRoot, "meta", "lint-report.md"), renderReport(mode, issues, counts));

	return ok({
		text: `Lint: ${counts.total} issues (links=${counts.brokenLinks} orphans=${counts.orphans} fm=${counts.frontmatter} dup=${counts.duplicates} cov=${counts.coverage} stale=${counts.staleness})`,
		details: { counts, issues },
	});
}
