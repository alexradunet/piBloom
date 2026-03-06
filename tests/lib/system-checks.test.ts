import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasSubidRange } from "../../lib/system-checks.js";

describe("hasSubidRange", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "system-checks-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns true when username entry exists", () => {
		const filePath = join(tempDir, "subuid");
		writeFileSync(filePath, "root:100000:65536\nalex:165536:65536\n");
		expect(hasSubidRange(filePath, "alex")).toBe(true);
	});

	it("returns true when username is the first entry", () => {
		const filePath = join(tempDir, "subuid");
		writeFileSync(filePath, "bloom:100000:65536\nother:165536:65536\n");
		expect(hasSubidRange(filePath, "bloom")).toBe(true);
	});

	it("returns false when username is not present", () => {
		const filePath = join(tempDir, "subuid");
		writeFileSync(filePath, "root:100000:65536\nother:165536:65536\n");
		expect(hasSubidRange(filePath, "alex")).toBe(false);
	});

	it("returns false for nonexistent file path", () => {
		const filePath = join(tempDir, "does-not-exist");
		expect(hasSubidRange(filePath, "alex")).toBe(false);
	});

	it("returns false for empty file", () => {
		const filePath = join(tempDir, "subuid");
		writeFileSync(filePath, "");
		expect(hasSubidRange(filePath, "alex")).toBe(false);
	});

	it("does not match partial username prefixes", () => {
		const filePath = join(tempDir, "subuid");
		writeFileSync(filePath, "alexander:100000:65536\n");
		expect(hasSubidRange(filePath, "alex")).toBe(false);
	});

	it("handles lines with leading whitespace", () => {
		const filePath = join(tempDir, "subuid");
		writeFileSync(filePath, "  alex:100000:65536\n");
		expect(hasSubidRange(filePath, "alex")).toBe(true);
	});
});
