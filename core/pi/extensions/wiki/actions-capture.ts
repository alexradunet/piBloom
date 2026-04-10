import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "../../../lib/filesystem.js";
import { stringifyFrontmatter } from "../../../lib/frontmatter.js";
import { err, ok } from "../../../lib/utils.js";
import { appendEvent } from "./actions-meta.js";
import { makeSourceId } from "./paths.js";
import type { ActionResult, CaptureDetails, SourceManifest, SourcePageFrontmatter } from "./types.js";

function sha256(value: string | Buffer): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function listExistingSourceIds(wikiRoot: string): string[] {
	const dir = path.join(wikiRoot, "raw");
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((e) => e.isDirectory() && e.name.startsWith("SRC-"))
			.map((e) => e.name);
	} catch {
		return [];
	}
}

function scaffoldSourcePage(
	wikiRoot: string,
	sourceId: string,
	title: string,
	kind: string,
	capturedAt: string,
	originType: string,
	originValue: string,
	tags: string[],
): string {
	const fm: SourcePageFrontmatter = {
		type: "source",
		source_id: sourceId,
		title,
		kind,
		status: "captured",
		captured_at: capturedAt,
		origin_type: originType as SourcePageFrontmatter["origin_type"],
		origin_value: originValue,
		aliases: [],
		tags,
		source_ids: [sourceId],
		summary: "",
	};
	const body = [
		`# ${title}`,
		"",
		"## Source at a glance",
		`- Source ID: ${sourceId}`,
		`- Kind: ${kind}`,
		`- Captured: ${capturedAt}`,
		"",
		"## Summary",
		"",
		"## Key claims",
		"",
		"## Entities and concepts mentioned",
		"",
		"## Reliability / caveats",
		"",
		"## Integration targets",
		"",
		"## Open questions",
		"",
	].join("\n");
	const relPath = path.join("pages", "sources", `${sourceId}.md`);
	const absPath = path.join(wikiRoot, relPath);
	mkdirSync(path.dirname(absPath), { recursive: true });
	atomicWriteFile(absPath, stringifyFrontmatter(fm, body));
	return relPath.split("\\").join("/");
}

interface CaptureDescriptor {
	title: string;
	kind: string;
	origin: SourceManifest["origin"];
	extractedText: string;
	tags: string[];
	writeOriginal(absPacket: string): void;
}

function isUnsupportedCapturedFileType(ext: string): boolean {
	return ext === ".pdf";
}

function decodeUtf8FileContent(absoluteFilePath: string, ext: string): string | { error: string } {
	if (isUnsupportedCapturedFileType(ext)) {
		return { error: `Unsupported file type for wiki capture: ${ext}. Capture extracted text instead.` };
	}

	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(absoluteFilePath));
	} catch {
		return { error: `Unsupported file type for wiki capture: ${ext}. Only UTF-8 text files are supported.` };
	}
}

function createCapture(
	wikiRoot: string,
	descriptor: CaptureDescriptor,
	now = new Date(),
): ActionResult<CaptureDetails> {
	const existingIds = listExistingSourceIds(wikiRoot);
	const sourceId = makeSourceId(existingIds, now);
	const absPacket = path.join(wikiRoot, "raw", sourceId);
	mkdirSync(path.join(absPacket, "original"), { recursive: true });

	const capturedAt = now.toISOString();
	const hash = sha256(descriptor.extractedText);

	descriptor.writeOriginal(absPacket);
	atomicWriteFile(path.join(absPacket, "extracted.md"), descriptor.extractedText);

	const manifest: SourceManifest = {
		version: 1,
		sourceId,
		title: descriptor.title,
		kind: descriptor.kind,
		origin: descriptor.origin,
		capturedAt,
		hash,
		status: "captured",
	};
	atomicWriteFile(path.join(absPacket, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

	const relPacketDir = path.join("raw", sourceId).split("\\").join("/");
	const sourcePagePath = scaffoldSourcePage(
		wikiRoot,
		sourceId,
		descriptor.title,
		descriptor.kind,
		capturedAt,
		descriptor.origin.type,
		descriptor.origin.value,
		descriptor.tags,
	);

	appendEvent(wikiRoot, {
		ts: capturedAt,
		kind: "capture",
		title: `Captured ${descriptor.title}`,
		sourceIds: [sourceId],
		pagePaths: [sourcePagePath],
	});

	return ok({
		text: `Captured ${sourceId}: ${descriptor.title}`,
		details: { sourceId, packetDir: relPacketDir, sourcePagePath, title: descriptor.title, status: "captured" },
	});
}

export function captureText(
	wikiRoot: string,
	text: string,
	options?: { title?: string; kind?: string; tags?: string[] },
	now = new Date(),
): ActionResult<CaptureDetails> {
	const title =
		options?.title ??
		text
			.split("\n")
			.find((l) => l.trim())
			?.slice(0, 80) ??
		"Untitled Source";
	const kind = options?.kind ?? "note";
	return createCapture(
		wikiRoot,
		{
			title,
			kind,
			origin: { type: "text", value: "(inline)" },
			extractedText: text,
			tags: options?.tags ?? [],
			writeOriginal(absPacket) {
				writeFileSync(path.join(absPacket, "original", "source.txt"), text, "utf-8");
			},
		},
		now,
	);
}

export function captureFile(
	wikiRoot: string,
	absoluteFilePath: string,
	options?: { title?: string; kind?: string; tags?: string[] },
	now = new Date(),
): ActionResult<CaptureDetails> {
	if (!existsSync(absoluteFilePath)) return err(`File not found: ${absoluteFilePath}`);

	const ext = path.extname(absoluteFilePath) || ".bin";
	const content = decodeUtf8FileContent(absoluteFilePath, ext);
	if (typeof content !== "string") return err(content.error);
	const title = options?.title ?? path.basename(absoluteFilePath, ext);
	const kind = options?.kind ?? (ext === ".pdf" ? "pdf" : "note");

	return createCapture(
		wikiRoot,
		{
			title,
			kind,
			origin: { type: "file", value: absoluteFilePath },
			extractedText: content,
			tags: options?.tags ?? [],
			writeOriginal(absPacket) {
				copyFileSync(absoluteFilePath, path.join(absPacket, "original", `source${ext}`));
			},
		},
		now,
	);
}
