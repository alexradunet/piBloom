import path from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../core/lib/exec.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("ovh-vps host configuration", () => {
	it("evaluates with SSH password authentication enabled for bootstrap access", async () => {
		const result = await run(
			"nix",
			["eval", ".#nixosConfigurations.ovh-vps.config.services.openssh.settings.PasswordAuthentication", "--json"],
			undefined,
			repoRoot,
		);

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toBe(true);
	});
});
