import type { Result } from "neverthrow";

export type ActionResult = Result<{ text: string; details?: Record<string, unknown> }, string>;

export const PAGE_TYPES = ["source", "concept", "entity", "synthesis", "analysis", "evolution", "procedure", "decision"] as const;
export type WikiPageType = (typeof PAGE_TYPES)[number];

export const CANONICAL_PAGE_TYPES = ["concept", "entity", "synthesis", "analysis", "evolution", "procedure", "decision"] as const;
export type CanonicalPageType = (typeof CANONICAL_PAGE_TYPES)[number];

export interface SourceManifest {
	version: number;
	sourceId: string;
	title: string;
	kind: string;
	origin: { type: "url" | "file" | "text"; value: string };
	capturedAt: string;
	integratedAt?: string;
	hash: string;
	status: "captured" | "integrated" | "superseded";
}

export interface RegistryEntry {
	type: WikiPageType;
	path: string;
	title: string;
	aliases: string[];
	summary: string;
	status: "draft" | "active" | "contested" | "superseded" | "archived" | "captured" | "integrated";
	tags: string[];
	updated: string;
	sourceIds: string[];
	linksOut: string[];
	headings: string[];
	wordCount: number;
}

export interface RegistryData {
	version: number;
	generatedAt: string;
	pages: RegistryEntry[];
}

export interface BacklinksData {
	version: number;
	generatedAt: string;
	byPath: Record<string, { inbound: string[]; outbound: string[] }>;
}

export interface WikiEvent {
	ts: string;
	kind: "capture" | "integrate" | "page-create" | "lint" | "rebuild";
	title: string;
	sourceIds?: string[];
	pagePaths?: string[];
}

export interface LintIssue {
	kind: string;
	severity: "info" | "warning" | "error";
	path: string;
	message: string;
}

export interface LintRun {
	mode: string;
	counts: {
		total: number;
		brokenLinks: number;
		orphans: number;
		frontmatter: number;
		duplicates: number;
		coverage: number;
		staleness: number;
	};
	issues: LintIssue[];
}
