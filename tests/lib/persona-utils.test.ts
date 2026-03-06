import { describe, expect, it } from "vitest";
import { normalizeCommand } from "../../lib/persona-utils.js";

describe("normalizeCommand", () => {
	it("collapses multiple spaces to single space", () => {
		expect(normalizeCommand("rm  -rf   /")).toBe("rm -rf /");
	});

	it("collapses tabs and newlines", () => {
		expect(normalizeCommand("rm\t-rf\n/")).toBe("rm -rf /");
	});

	it("leaves normal text unchanged", () => {
		expect(normalizeCommand("ls -la")).toBe("ls -la");
	});
});
