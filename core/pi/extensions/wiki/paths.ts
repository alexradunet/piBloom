import path from "node:path";
import { getNixPiDir } from "../../../lib/filesystem.js";

export function getWikiRoot(): string {
	return path.join(getNixPiDir(), "Wiki");
}

export function slugifyTitle(title: string): string {
	return (
		title
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.replace(/-{2,}/g, "-") || "untitled"
	);
}

export function todayStamp(date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

export function makeSourceId(existingIds: string[], now = new Date()): string {
	const stamp = todayStamp(now);
	const prefix = `SRC-${stamp}-`;
	const used = existingIds
		.filter((id) => id.startsWith(prefix))
		.map((id) => Number.parseInt(id.slice(prefix.length), 10))
		.filter((v) => Number.isFinite(v));
	const next = (used.length === 0 ? 0 : Math.max(...used)) + 1;
	return `${prefix}${String(next).padStart(3, "0")}`;
}

export function dedupeSlug(baseSlug: string, existingSlugs: string[]): string {
	const seen = new Set(existingSlugs);
	if (!seen.has(baseSlug)) return baseSlug;
	let i = 2;
	while (seen.has(`${baseSlug}-${i}`)) i += 1;
	return `${baseSlug}-${i}`;
}

function startsWithDir(rel: string, dir: string): boolean {
	return rel === dir || rel.startsWith(`${dir}${path.sep}`);
}

export function isProtectedPath(wikiRoot: string, absolutePath: string): boolean {
	const rel = path.relative(wikiRoot, absolutePath);
	if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
	return startsWithDir(rel, "raw") || startsWithDir(rel, "meta");
}

export function isWikiPagePath(wikiRoot: string, absolutePath: string): boolean {
	const rel = path.relative(wikiRoot, absolutePath);
	if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
	return startsWithDir(rel, "pages");
}

export function normalizeWikiLink(target: string): string | undefined {
	const clean = target.trim().replace(/\\/g, "/").replace(/\.md$/i, "");
	if (!clean) return undefined;
	if (clean.startsWith("sources/")) return `pages/${clean}.md`;
	if (clean.startsWith("pages/")) return `${clean}.md`;
	return `pages/${clean}.md`;
}

export function extractWikiLinks(markdown: string): string[] {
	const links: string[] = [];
	const regex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
	for (const match of markdown.matchAll(regex)) {
		links.push(match[1].trim());
	}
	return links;
}

export function extractHeadings(markdown: string): string[] {
	const headings: string[] = [];
	for (const match of markdown.matchAll(/^#{1,6}\s+(.+)$/gm)) {
		headings.push(match[1].trim());
	}
	return headings;
}

export function countWords(text: string): number {
	return text.trim().match(/\S+/g)?.length ?? 0;
}
