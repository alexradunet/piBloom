import { describe, expect, it } from "vitest";
import {
	hostOwnedBootstrapDocCases,
	legacyFreeDocCases,
	productionGuidancePaths,
	readUtf8,
	reinstallCommandPath,
} from "./standards-guard.shared.js";

describe("repo standards docs guards", () => {
	it.each(hostOwnedBootstrapDocCases)("documents the host-owned bootstrap contract in $label", ({
		filePath,
		contains,
		absent,
	}) => {
		const doc = readUtf8(filePath);

		for (const expectedText of contains) {
			expect(doc).toContain(expectedText);
		}
		for (const unexpectedText of absent) {
			expect(doc).not.toContain(unexpectedText);
		}
	});

	it.each(legacyFreeDocCases)("keeps $label free of legacy repo-owned bootstrap terms", ({
		filePath,
		forbiddenTerms,
	}) => {
		const doc = readUtf8(filePath);

		for (const forbiddenTerm of forbiddenTerms) {
			expect(doc).not.toContain(forbiddenTerm);
		}
	});

	it("keeps the example install artifact aligned with the host-owned bootstrap flow", () => {
		const artifact = readUtf8(reinstallCommandPath);

		expect(artifact).toContain("# Day-0 base install from a local checkout");
		expect(artifact).toContain("nix run .#plain-host-deploy --");
		expect(artifact).toContain("nix run github:alexradunet/nixpi#nixpi-bootstrap-host --");
		for (const forbiddenTerm of ["nixpi-deploy-ovh", "nixpi-reinstall-ovh", "nixpi-rebuild-pull", "/srv/nixpi"]) {
			expect(artifact).not.toContain(forbiddenTerm);
		}
	});

	it("keeps production guidance free of exact legacy first-boot convergence phrases", () => {
		for (const filePath of productionGuidancePaths) {
			const doc = readUtf8(filePath);

			expect(doc).not.toContain("let first boot seed `/srv/nixpi` and `/etc/nixos/flake.nix`");
			expect(doc).not.toContain("a generated `/etc/nixos/flake.nix`");
		}
	});
});
