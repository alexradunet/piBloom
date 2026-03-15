import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, stringifyFrontmatter } from "../../lib/frontmatter.js";
import { nowIso } from "../../lib/shared.js";

export interface MemoryRecord {
	filepath: string;
	attributes: Record<string, unknown>;
	body: string;
}

export interface QueryResult {
	ref: string;
	title?: string;
	summary?: string;
	score: number;
	reasons: string[];
	filepath: string;
}

export interface ScopePreference {
	scope: string;
	value?: string;
}

export function normalizeScalar(value: unknown): string | number | boolean | null {
	if (value === null) return null;
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	return String(value);
}

function normalizeArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return [];
}

function coerceNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

function confidenceBonus(confidence: string | undefined): number {
	switch ((confidence ?? "").toLowerCase()) {
		case "high":
			return 10;
		case "medium":
			return 5;
		default:
			return 0;
	}
}

function safeTimestamp(value: unknown): number {
	if (typeof value !== "string") return 0;
	const time = Date.parse(value);
	return Number.isFinite(time) ? time : 0;
}

export function normalizeFields(fields?: Record<string, unknown>): Record<string, unknown> {
	if (!fields) return {};
	const normalized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined) continue;
		if (key === "tags" || key === "links" || key === "source") {
			normalized[key] = normalizeArray(value);
			continue;
		}
		if (key === "salience") {
			normalized[key] = coerceNumber(value, 0);
			continue;
		}
		if (key === "scope_value") {
			normalized[key] = normalizeScalar(value);
			continue;
		}
		normalized[key] = normalizeScalar(value);
	}
	return normalized;
}

function scopePreferenceBonus(
	recordScope: string,
	recordScopeValue: string,
	preferences?: ScopePreference[],
): { bonus: number; matched?: string } {
	if (!preferences || preferences.length === 0) return { bonus: 0 };
	let best = { bonus: 0, matched: undefined as string | undefined };
	for (const preference of preferences) {
		if (preference.scope !== recordScope) continue;
		if (preference.value && recordScopeValue) {
			if (preference.value === recordScopeValue) {
				if (35 > best.bonus) best = { bonus: 35, matched: `${recordScope}:${recordScopeValue}` };
				continue;
			}
		}
		if (20 > best.bonus) {
			best = { bonus: 20, matched: recordScope };
		}
	}
	return best;
}

export function defaultObjectBody(attributes: Record<string, unknown>): string {
	const title = typeof attributes.title === "string" ? attributes.title : undefined;
	return title ? `# ${title}\n` : "";
}

export function mergeObjectState(params: {
	type: string;
	slug: string;
	fields?: Record<string, unknown>;
	existing?: Record<string, unknown>;
}): Record<string, unknown> {
	const now = nowIso();
	const normalizedFields = normalizeFields(params.fields);
	const existing = params.existing ?? {};
	const merged: Record<string, unknown> = {
		...existing,
		type: params.type,
		slug: params.slug,
		origin: existing.origin ?? "pi",
		created: existing.created ?? now,
		modified: now,
		scope: existing.scope ?? "global",
		confidence: existing.confidence ?? "medium",
		status: existing.status ?? "active",
		salience: existing.salience ?? 0.5,
		...normalizedFields,
	};

	if (!merged.summary && typeof merged.title === "string") {
		merged.summary = `${merged.title}`;
	}
	if (!merged.last_accessed) merged.last_accessed = merged.modified;
	if (!merged.last_confirmed) merged.last_confirmed = merged.modified;
	return merged;
}

export function readMemoryRecord(filepath: string): MemoryRecord | null {
	try {
		if (!fs.existsSync(filepath)) return null;
		const raw = fs.readFileSync(filepath, "utf-8");
		const { attributes, body } = parseFrontmatter<Record<string, unknown>>(raw);
		return { filepath, attributes, body };
	} catch {
		return null;
	}
}

export function writeMemoryRecord(record: MemoryRecord): void {
	fs.mkdirSync(path.dirname(record.filepath), { recursive: true });
	fs.writeFileSync(record.filepath, stringifyFrontmatter(record.attributes, record.body));
}

export function formatRef(attributes: Record<string, unknown>, filepath: string): string {
	const type = String(attributes.type ?? "note");
	const slug = String(attributes.slug ?? path.basename(filepath, ".md"));
	return `${type}/${slug}`;
}

export function scoreRecord(
	record: MemoryRecord,
	params: {
		text?: string;
		type?: string;
		tags?: string[];
		scope?: string;
		scope_value?: string;
		status?: string;
		link_to?: string;
		preferred_scopes?: ScopePreference[];
	},
): QueryResult | null {
	const ref = formatRef(record.attributes, record.filepath);
	const title = typeof record.attributes.title === "string" ? record.attributes.title : undefined;
	const summary = typeof record.attributes.summary === "string" ? record.attributes.summary : undefined;
	const tags = normalizeArray(record.attributes.tags);
	const links = normalizeArray(record.attributes.links);
	const reasons: string[] = [];
	let score = 0;

	const recordType = String(record.attributes.type ?? "note");
	const recordScope = String(record.attributes.scope ?? "global");
	const recordScopeValue = String(record.attributes.scope_value ?? "");
	const recordStatus = String(record.attributes.status ?? "active");

	if (params.type) {
		if (recordType !== params.type) return null;
		score += 50;
		reasons.push("type");
	}
	if (params.scope) {
		if (recordScope !== params.scope) return null;
		score += 25;
		reasons.push("scope");
	}
	if (params.scope_value) {
		if (recordScopeValue !== params.scope_value) return null;
		score += 15;
		reasons.push("scope_value");
	}
	if (params.status) {
		if (recordStatus !== params.status) return null;
		score += 10;
		reasons.push("status");
	}
	if (params.link_to) {
		if (!links.includes(params.link_to)) return null;
		score += 15;
		reasons.push("link");
	}
	if (params.tags && params.tags.length > 0) {
		const tagMatches = params.tags.filter((tag) => tags.includes(tag));
		if (tagMatches.length === 0) return null;
		score += tagMatches.length * 30;
		reasons.push(`tags:${tagMatches.length}`);
	}

	if (params.text) {
		const text = params.text.toLowerCase();
		let matched = false;
		if (title?.toLowerCase().includes(text)) {
			score += 20;
			reasons.push("title");
			matched = true;
		}
		if (summary?.toLowerCase().includes(text)) {
			score += 15;
			reasons.push("summary");
			matched = true;
		}
		if (tags.some((tag) => tag.toLowerCase().includes(text))) {
			score += 10;
			reasons.push("tag-text");
			matched = true;
		}
		if (record.body.toLowerCase().includes(text)) {
			score += 10;
			reasons.push("body");
			matched = true;
		}
		if (!matched) return null;
	}

	score += confidenceBonus(typeof record.attributes.confidence === "string" ? record.attributes.confidence : undefined);
	score += Math.round(coerceNumber(record.attributes.salience, 0) * 10);
	const scopeBonus = scopePreferenceBonus(recordScope, recordScopeValue, params.preferred_scopes);
	score += scopeBonus.bonus;
	if (scopeBonus.matched) reasons.push(`preferred:${scopeBonus.matched}`);
	score += safeTimestamp(record.attributes.last_accessed) > 0 ? 3 : 0;
	score += safeTimestamp(record.attributes.modified) > 0 ? 2 : 0;

	return {
		ref,
		title,
		summary,
		score,
		reasons,
		filepath: record.filepath,
	};
}
