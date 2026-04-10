import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	countWords,
	dedupeSlug,
	extractHeadings,
	extractWikiLinks,
	isProtectedPath,
	isWikiPagePath,
	makeSourceId,
	normalizeWikiLink,
	slugifyTitle,
} from "../../core/pi/extensions/wiki/paths.js";

const WIKI_ROOT = "/home/user/nixpi/Wiki";

// ---------------------------------------------------------------------------
// slugifyTitle
// ---------------------------------------------------------------------------
describe("slugifyTitle", () => {
	it("lowercases and kebab-cases a normal title", () => {
		expect(slugifyTitle("Hello World")).toBe("hello-world");
	});

	it("strips non-alphanumeric characters", () => {
		expect(slugifyTitle("Foo: Bar & Baz!")).toBe("foo-bar-baz");
	});

	it("collapses multiple separators into one dash", () => {
		expect(slugifyTitle("foo   ---   bar")).toBe("foo-bar");
	});

	it("strips leading and trailing dashes", () => {
		expect(slugifyTitle("  --hello--  ")).toBe("hello");
	});

	it("returns 'untitled' for empty string", () => {
		expect(slugifyTitle("")).toBe("untitled");
	});

	it("returns 'untitled' for string with only non-alphanumeric chars", () => {
		expect(slugifyTitle("!!! ???")).toBe("untitled");
	});

	it("handles accented characters via NFKD normalization", () => {
		// é normalises to e + combining accent; the combining accent is stripped, leaving e
		expect(slugifyTitle("Café")).toBe("cafe");
	});
});

// ---------------------------------------------------------------------------
// makeSourceId
// ---------------------------------------------------------------------------
describe("makeSourceId", () => {
	const fixedDate = new Date("2025-06-15T12:00:00Z");

	it("generates SRC-YYYY-MM-DD-001 with no existing IDs", () => {
		expect(makeSourceId([], fixedDate)).toBe("SRC-2025-06-15-001");
	});

	it("increments from the highest existing ID on the same day", () => {
		const existing = ["SRC-2025-06-15-001", "SRC-2025-06-15-002"];
		expect(makeSourceId(existing, fixedDate)).toBe("SRC-2025-06-15-003");
	});

	it("ignores IDs from other days", () => {
		const existing = ["SRC-2025-06-14-005"];
		expect(makeSourceId(existing, fixedDate)).toBe("SRC-2025-06-15-001");
	});

	it("pads the sequence number to 3 digits", () => {
		const existing = Array.from({ length: 9 }, (_, i) => `SRC-2025-06-15-00${i + 1}`);
		expect(makeSourceId(existing, fixedDate)).toBe("SRC-2025-06-15-010");
	});

	it("uses same day prefix as todayStamp", () => {
		const result = makeSourceId([], fixedDate);
		expect(result).toMatch(/^SRC-2025-06-15-\d{3}$/);
	});
});

// ---------------------------------------------------------------------------
// dedupeSlug
// ---------------------------------------------------------------------------
describe("dedupeSlug", () => {
	it("returns the base slug unchanged when there is no conflict", () => {
		expect(dedupeSlug("my-page", ["other-page"])).toBe("my-page");
	});

	it("appends -2 on the first conflict", () => {
		expect(dedupeSlug("my-page", ["my-page"])).toBe("my-page-2");
	});

	it("keeps incrementing past -2 when needed", () => {
		expect(dedupeSlug("my-page", ["my-page", "my-page-2", "my-page-3"])).toBe("my-page-4");
	});

	it("handles empty existing slugs", () => {
		expect(dedupeSlug("foo", [])).toBe("foo");
	});
});

// ---------------------------------------------------------------------------
// isProtectedPath
// ---------------------------------------------------------------------------
describe("isProtectedPath", () => {
	it("blocks paths under raw/", () => {
		expect(isProtectedPath(WIKI_ROOT, path.join(WIKI_ROOT, "raw", "SRC-2025-06-15-001", "manifest.json"))).toBe(true);
	});

	it("blocks paths directly in raw/", () => {
		expect(isProtectedPath(WIKI_ROOT, path.join(WIKI_ROOT, "raw", "something.txt"))).toBe(true);
	});

	it("blocks paths under meta/", () => {
		expect(isProtectedPath(WIKI_ROOT, path.join(WIKI_ROOT, "meta", "registry.json"))).toBe(true);
	});

	it("allows paths under pages/", () => {
		expect(isProtectedPath(WIKI_ROOT, path.join(WIKI_ROOT, "pages", "concepts", "foo.md"))).toBe(false);
	});

	it("allows WIKI_SCHEMA.md at the root", () => {
		expect(isProtectedPath(WIKI_ROOT, path.join(WIKI_ROOT, "WIKI_SCHEMA.md"))).toBe(false);
	});

	it("does not block paths outside the wiki root", () => {
		expect(isProtectedPath(WIKI_ROOT, "/tmp/some-other-file.txt")).toBe(false);
	});

	it("returns true for the raw/ directory itself", async () => {
		const { isProtectedPath } = await import("../../core/pi/extensions/wiki/paths.js");
		expect(isProtectedPath("/home/user/nixpi/Wiki", "/home/user/nixpi/Wiki/raw")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// isWikiPagePath
// ---------------------------------------------------------------------------
describe("isWikiPagePath", () => {
	it("returns true for pages/ paths", async () => {
		const { isWikiPagePath } = await import("../../core/pi/extensions/wiki/paths.js");
		expect(isWikiPagePath("/home/user/nixpi/Wiki", "/home/user/nixpi/Wiki/pages/my-page.md")).toBe(true);
	});

	it("returns true for the pages/ directory itself", async () => {
		const { isWikiPagePath } = await import("../../core/pi/extensions/wiki/paths.js");
		expect(isWikiPagePath("/home/user/nixpi/Wiki", "/home/user/nixpi/Wiki/pages")).toBe(true);
	});

	it("returns false for raw/ paths", async () => {
		const { isWikiPagePath } = await import("../../core/pi/extensions/wiki/paths.js");
		expect(isWikiPagePath("/home/user/nixpi/Wiki", "/home/user/nixpi/Wiki/raw/SRC-001/manifest.json")).toBe(false);
	});

	it("returns false for paths outside wiki root", async () => {
		const { isWikiPagePath } = await import("../../core/pi/extensions/wiki/paths.js");
		expect(isWikiPagePath("/home/user/nixpi/Wiki", "/home/user/other/file.md")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// normalizeWikiLink
// ---------------------------------------------------------------------------
describe("normalizeWikiLink", () => {
	it("resolves sources/ prefix to pages/sources/*.md", () => {
		expect(normalizeWikiLink("sources/SRC-2025-06-15-001")).toBe("pages/sources/SRC-2025-06-15-001.md");
	});

	it("resolves sources/ prefix even when .md is already present", () => {
		expect(normalizeWikiLink("sources/SRC-2025-06-15-001.md")).toBe("pages/sources/SRC-2025-06-15-001.md");
	});

	it("resolves bare slug to pages/*.md", () => {
		expect(normalizeWikiLink("my-concept")).toBe("pages/my-concept.md");
	});

	it("preserves existing pages/ prefix", () => {
		expect(normalizeWikiLink("pages/concepts/foo")).toBe("pages/concepts/foo.md");
	});

	it("returns undefined for empty string", () => {
		expect(normalizeWikiLink("")).toBeUndefined();
	});

	it("returns undefined for whitespace-only string", () => {
		expect(normalizeWikiLink("   ")).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// extractWikiLinks
// ---------------------------------------------------------------------------
describe("extractWikiLinks", () => {
	it("extracts a simple [[target]] link", () => {
		expect(extractWikiLinks("See [[my-concept]] for details.")).toEqual(["my-concept"]);
	});

	it("extracts the target from [[target|label]] links", () => {
		expect(extractWikiLinks("See [[my-concept|My Concept]] here.")).toEqual(["my-concept"]);
	});

	it("extracts multiple links from the same text", () => {
		const links = extractWikiLinks("[[foo]] and [[bar|Bar Label]] and [[baz]]");
		expect(links).toEqual(["foo", "bar", "baz"]);
	});

	it("ignores anchor fragments in [[target#section]] links", () => {
		expect(extractWikiLinks("See [[my-concept#intro]].")).toEqual(["my-concept"]);
	});

	it("returns empty array when there are no wiki links", () => {
		expect(extractWikiLinks("No links here.")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// extractHeadings
// ---------------------------------------------------------------------------
describe("extractHeadings", () => {
	it("extracts an h1 heading", () => {
		expect(extractHeadings("# Hello World")).toEqual(["Hello World"]);
	});

	it("extracts h1 through h6", () => {
		const md = ["# H1", "## H2", "### H3", "#### H4", "##### H5", "###### H6"].join("\n");
		expect(extractHeadings(md)).toEqual(["H1", "H2", "H3", "H4", "H5", "H6"]);
	});

	it("strips the # prefix and surrounding whitespace", () => {
		expect(extractHeadings("##  Spaced Heading  ")).toEqual(["Spaced Heading"]);
	});

	it("does not extract inline # characters", () => {
		expect(extractHeadings("Some text with # in it")).toEqual([]);
	});

	it("returns empty array for text with no headings", () => {
		expect(extractHeadings("Just a paragraph.")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// countWords
// ---------------------------------------------------------------------------
describe("countWords", () => {
	it("counts space-separated tokens", () => {
		expect(countWords("hello world foo")).toBe(3);
	});

	it("returns 0 for empty string", () => {
		expect(countWords("")).toBe(0);
	});

	it("returns 0 for whitespace-only string", () => {
		expect(countWords("   ")).toBe(0);
	});

	it("handles multiple spaces between words", () => {
		expect(countWords("one   two   three")).toBe(3);
	});

	it("counts a single word as 1", () => {
		expect(countWords("word")).toBe(1);
	});
});
