import type { ActionResult as SharedActionResult } from "../../../lib/utils.js";

export type ActionResult<TDetails extends object = Record<string, unknown>> = SharedActionResult<TDetails>;

export const PAGE_TYPES = [
	"source",
	"concept",
	"entity",
	"synthesis",
	"analysis",
	"evolution",
	"procedure",
	"decision",
	"identity",
] as const;
export type WikiPageType = (typeof PAGE_TYPES)[number];

export const CANONICAL_PAGE_TYPES = [
	"concept",
	"entity",
	"synthesis",
	"analysis",
	"evolution",
	"procedure",
	"decision",
	"identity",
] as const;
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

export interface SourcePageFrontmatter {
	type: "source";
	source_id: string;
	title: string;
	kind: string;
	status: "captured" | "integrated" | "superseded";
	captured_at: string;
	origin_type: "text" | "file" | "url";
	origin_value: string;
	aliases: string[];
	tags: string[];
	source_ids: string[];
	summary: string;
}

export interface CanonicalPageFrontmatter {
	type: CanonicalPageType;
	title: string;
	aliases: string[];
	tags: string[];
	status: "draft" | "active" | "contested" | "superseded" | "archived";
	updated: string;
	source_ids: string[];
	summary: string;
}

export type WikiFrontmatter = SourcePageFrontmatter | CanonicalPageFrontmatter;

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

export interface WikiMetaArtifacts {
	registry: RegistryData;
	backlinks: BacklinksData;
	index: string;
	log: string;
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

export interface CaptureDetails {
	sourceId: string;
	packetDir: string;
	sourcePagePath: string;
	title: string;
	status: "captured";
}

export interface EnsurePageConflictDetails {
	resolved: false;
	created: false;
	conflict: true;
	candidates: Array<{ path: string; title: string }>;
}

export interface EnsurePageResolvedDetails {
	resolved: true;
	created: boolean;
	conflict: false;
	path: string;
	title: string;
	type: WikiPageType;
}

export type EnsurePageDetails = EnsurePageConflictDetails | EnsurePageResolvedDetails;

export interface WikiStatusDetails {
	initialized: boolean;
	total?: number;
	source?: number;
	canonical?: number;
	captured?: number;
	integrated?: number;
}

export interface LintDetails {
	counts: LintRun["counts"];
	issues: LintIssue[];
}
