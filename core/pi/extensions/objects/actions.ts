/**
 * Handler / business logic for objects.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getNixPiDir, safePathWithin } from "../../../lib/filesystem.js";
import { parseFrontmatter, stringifyFrontmatter } from "../../../lib/frontmatter.js";
import { type ActionResult, err, ok, truncate } from "../../../lib/utils.js";
import type { Result } from "neverthrow";
import { defaultObjectBody, mergeObjectState, readMemoryRecord, writeMemoryRecord } from "./memory.js";

type ObjectWriteParams = {
	type: string;
	slug: string;
	fields?: Record<string, unknown>;
	path?: string;
	body?: string;
};

/** Parse a `type/slug` reference string into its components. Throws if format is invalid. */
export function parseRef(ref: string): { type: string; slug: string } {
	const slash = ref.indexOf("/");
	if (slash === -1) throw new Error(`invalid reference format: '${ref}' (expected type/slug)`);
	return { type: ref.slice(0, slash), slug: ref.slice(slash + 1) };
}

/** Walk a directory recursively for .md files. */
export function walkMdFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	return fs.globSync("**/*.md", { cwd: dir }).map((f) => path.join(dir, f));
}

function objectsDir(): string {
	return path.join(getNixPiDir(), "Objects");
}

function resolveObjectPath(slug: string, filePath?: string): string {
	return filePath ? safePathWithin(os.homedir(), filePath) : safePathWithin(objectsDir(), `${slug}.md`);
}

function tryResolveObjectPath(slug: string, filePath: string | undefined, invalidMessage: string): Result<string, string> {
	try {
		return ok(resolveObjectPath(slug, filePath));
	} catch {
		return err(invalidMessage);
	}
}

function mergedAttributes(params: ObjectWriteParams, existing?: Record<string, unknown>) {
	return mergeObjectState({
		type: params.type,
		slug: params.slug,
		fields: params.fields,
		existing,
	});
}

function writeObjectRecord(filepath: string, attributes: Record<string, unknown>, body: string): void {
	writeMemoryRecord({
		filepath,
		attributes,
		body,
	});
}

function readObjectRaw(filepath: string) {
	const raw = fs.readFileSync(filepath, "utf-8");
	const { attributes, body } = parseFrontmatter<Record<string, unknown>>(raw);
	return { raw, attributes, body };
}

function appendObjectLink(filepath: string, linkRef: string): void {
	const { attributes, body } = readObjectRaw(filepath);
	const links: string[] = Array.isArray(attributes.links) ? [...(attributes.links as string[])] : [];
	if (!links.includes(linkRef)) {
		links.push(linkRef);
		attributes.links = links;
		fs.writeFileSync(filepath, stringifyFrontmatter(attributes, body));
	}
}

/** Create a new markdown object. */
export function createObject(params: ObjectWriteParams): ActionResult {
	const resolved = tryResolveObjectPath(params.slug, params.path, "Path traversal blocked: invalid path");
	if (resolved.isErr()) return err(resolved.error);
	const filepath = resolved.value;
	fs.mkdirSync(path.dirname(filepath), { recursive: true });

	const data = mergedAttributes(params);
	const body = params.body ?? defaultObjectBody(data);

	try {
		fs.writeFileSync(filepath, stringifyFrontmatter(data, body), {
			flag: "wx",
		});
	} catch (e: unknown) {
		if ((e as NodeJS.ErrnoException).code === "EEXIST") {
			return err(`object already exists: ${params.type}/${params.slug}`);
		}
		return err(`failed to create object: ${(e as Error).message}`);
	}

	return ok({ text: `created ${params.type}/${params.slug}` });
}

export function updateObject(params: ObjectWriteParams): ActionResult {
	const invalidMessage = params.path ? "Path traversal blocked: invalid path" : "Path traversal blocked: invalid slug";
	const resolved = tryResolveObjectPath(params.slug, params.path, invalidMessage);
	if (resolved.isErr()) return err(resolved.error);
	const filepath = resolved.value;
	const record = readMemoryRecord(filepath);
	if (!record) return err(`object not found: ${params.type}/${params.slug}`);
	const attributes = mergedAttributes(params, record.attributes);
	writeObjectRecord(filepath, attributes, params.body ?? record.body);
	return ok({ text: `updated ${params.type}/${params.slug}` });
}

export function upsertObject(params: ObjectWriteParams): ActionResult {
	const resolved = tryResolveObjectPath(params.slug, params.path, "Path traversal blocked: invalid path");
	if (resolved.isErr()) return err(resolved.error);
	const filepath = resolved.value;
	const existing = readMemoryRecord(filepath);
	if (!existing) {
		return createObject(params);
	}
	const attributes = mergedAttributes(params, existing.attributes);
	writeObjectRecord(filepath, attributes, params.body ?? existing.body);
	return ok({ text: `upserted ${params.type}/${params.slug}`, details: { existed: true } });
}

/** Read a markdown object. */
export function readObject(params: { type: string; slug: string; path?: string }): ActionResult {
	const invalidMessage = params.path ? "Path traversal blocked: invalid path" : "Path traversal blocked: invalid slug";
	const resolved = tryResolveObjectPath(params.slug, params.path, invalidMessage);
	if (resolved.isErr()) return err(resolved.error);
	const filepath = resolved.value;

	if (!fs.existsSync(filepath)) {
		return err(`object not found: ${params.type}/${params.slug}`);
	}
	const raw = fs.readFileSync(filepath, "utf-8");
	return ok({ text: truncate(raw) });
}

/** Add bidirectional links between two objects. */
export function linkObjects(params: { ref_a: string; ref_b: string }): ActionResult {
	const a = parseRef(params.ref_a);
	const b = parseRef(params.ref_b);
	const resolvedA = tryResolveObjectPath(a.slug, undefined, "Path traversal blocked: invalid slug");
	const resolvedB = tryResolveObjectPath(b.slug, undefined, "Path traversal blocked: invalid slug");
	if (resolvedA.isErr() || resolvedB.isErr()) {
		return err("Path traversal blocked: invalid slug");
	}
	const pathA = resolvedA.value;
	const pathB = resolvedB.value;

	if (!fs.existsSync(pathA)) return err(`object not found: ${params.ref_a}`);
	if (!fs.existsSync(pathB)) return err(`object not found: ${params.ref_b}`);

	appendObjectLink(pathA, params.ref_b);
	appendObjectLink(pathB, params.ref_a);

	return ok({ text: `linked ${params.ref_a} <-> ${params.ref_b}` });
}
