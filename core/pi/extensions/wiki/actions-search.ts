import { ok } from "../../../lib/utils.js";
import { SEARCH_FIELD_WEIGHTS } from "./rules.js";
import type { ActionResult, RegistryData, RegistryEntry, WikiPageType } from "./types.js";

export interface SearchMatch {
	type: string;
	path: string;
	title: string;
	summary: string;
	score: number;
}

export interface SearchResult {
	query: string;
	matches: SearchMatch[];
}

function tokenize(input: string): string[] {
	return [...new Set(input.split(/[^a-z0-9]+/).filter(Boolean))];
}

function includesAny(values: string[], query: string): boolean {
	return values.some((value) => value.includes(query));
}

function scoreExactMatches(
	normalized: string,
	fields: {
		title: string;
		aliases: string[];
		summary: string;
		sourceIds: string[];
		path: string;
		headings: string[];
	},
): number {
	let score = 0;
	if (fields.title === normalized) score += SEARCH_FIELD_WEIGHTS.exactTitle;
	if (fields.aliases.includes(normalized)) score += SEARCH_FIELD_WEIGHTS.exactAlias;
	if (fields.summary.includes(normalized)) score += SEARCH_FIELD_WEIGHTS.exactSummary;
	if (fields.sourceIds.includes(normalized)) score += SEARCH_FIELD_WEIGHTS.exactSourceId;
	if (fields.path.includes(normalized)) score += SEARCH_FIELD_WEIGHTS.exactPath;
	if (includesAny(fields.headings, normalized)) score += SEARCH_FIELD_WEIGHTS.exactHeading;
	return score;
}

function scoreTokenMatches(
	tokens: string[],
	fields: {
		title: string;
		aliases: string[];
		summary: string;
		headings: string[];
		tags: string[];
		sourceIds: string[];
		path: string;
	},
): number {
	let score = 0;
	for (const token of tokens) {
		if (fields.title.includes(token)) score += SEARCH_FIELD_WEIGHTS.tokenTitle;
		if (includesAny(fields.aliases, token)) score += SEARCH_FIELD_WEIGHTS.tokenAlias;
		if (fields.summary.includes(token)) score += SEARCH_FIELD_WEIGHTS.tokenSummary;
		if (includesAny(fields.headings, token)) score += SEARCH_FIELD_WEIGHTS.tokenHeading;
		if (includesAny(fields.tags, token)) score += SEARCH_FIELD_WEIGHTS.tokenTag;
		if (includesAny(fields.sourceIds, token)) score += SEARCH_FIELD_WEIGHTS.tokenSourceId;
		if (fields.path.includes(token)) score += SEARCH_FIELD_WEIGHTS.tokenPath;
	}
	return score;
}

function scoreEntry(entry: RegistryEntry, normalized: string, tokens: string[]): number {
	const normalizedFields = {
		title: entry.title.toLowerCase(),
		aliases: entry.aliases.map((alias) => alias.toLowerCase()),
		summary: entry.summary.toLowerCase(),
		headings: entry.headings.map((heading) => heading.toLowerCase()),
		tags: entry.tags.map((tag) => tag.toLowerCase()),
		sourceIds: entry.sourceIds.map((sourceId) => sourceId.toLowerCase()),
		path: entry.path.toLowerCase(),
	};

	return scoreExactMatches(normalized, normalizedFields) + scoreTokenMatches(tokens, normalizedFields);
}

export function searchRegistry(
	registry: RegistryData,
	query: string,
	type?: WikiPageType | string,
	limit = 10,
): SearchResult {
	const normalized = query.trim().toLowerCase();
	const tokens = tokenize(normalized);
	const matches = registry.pages
		.filter((e) => !type || e.type === type)
		.map((e) => ({ entry: e, score: scoreEntry(e, normalized, tokens) }))
		.filter((m) => m.score > 0)
		.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
		.slice(0, limit)
		.map(({ entry, score }) => ({
			type: entry.type,
			path: entry.path,
			title: entry.title,
			summary: entry.summary,
			score,
		}));
	return { query, matches };
}

export function handleWikiSearch(
	registry: RegistryData,
	query: string,
	type?: string,
	limit?: number,
): ActionResult<SearchResult> {
	const result = searchRegistry(registry, query, type as WikiPageType | undefined, limit);
	if (result.matches.length === 0) {
		return ok({ text: `No wiki matches for: ${query}`, details: { query, matches: [] } });
	}
	const lines = [
		`Top matches for: ${query}`,
		...result.matches.map((m) => `- [${m.score}] ${m.title} (${m.type}) — ${m.path}`),
	];
	return ok({ text: lines.join("\n"), details: result });
}
