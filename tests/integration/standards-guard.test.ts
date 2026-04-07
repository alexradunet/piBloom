import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const packageJsonPath = path.join(repoRoot, "package.json");
const ttydModulePath = path.join(repoRoot, "core/os/modules/ttyd.nix");
const rebuildPullScriptPath = path.join(repoRoot, "core/scripts/nixpi-rebuild-pull.sh");
const selfEvolutionSkillPath = path.join(repoRoot, "core/pi/skills/self-evolution/SKILL.md");

describe("repo standards guards", () => {
	it("configures VitePress for GitHub Project Pages", () => {
		const vitePressConfig = readFileSync(path.join(repoRoot, "docs/.vitepress/config.ts"), "utf8");

		expect(vitePressConfig).toContain('base: "/NixPI/"');
	});

	it("declares compatible Pi peer dependency ranges and CI checks", () => {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
			peerDependencies?: Record<string, string>;
			scripts?: Record<string, string>;
		};

		expect(packageJson.peerDependencies).toMatchObject({
			"@mariozechner/pi-ai": "^0.60.0",
			"@mariozechner/pi-coding-agent": "^0.60.0",
		});
		expect(packageJson.scripts?.["check:ci"]).toBe("biome ci .");
	});

	it("keeps the browser terminal writable for operator input", () => {
		const ttydModule = readFileSync(ttydModulePath, "utf8");

		expect(ttydModule).toContain("--writable");
		expect(ttydModule).toContain("--port 7681");
	});

	it("documents the canonical /srv/nixpi rebuild workflow and pull wrapper", () => {
		const rebuildPullScript = readFileSync(rebuildPullScriptPath, "utf8");
		const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
		const bootstrapScript = readFileSync(path.join(repoRoot, "core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh"), "utf8");
		const osSystemUpdate = readFileSync(path.join(repoRoot, "core/os/system-update.ts"), "utf8");
		const osActions = readFileSync(path.join(repoRoot, "core/pi/extensions/os/actions.ts"), "utf8");
		const selfEvolutionSkill = readFileSync(selfEvolutionSkillPath, "utf8");

		expect(rebuildPullScript).toContain('REPO_DIR="/srv/nixpi"');
		expect(rebuildPullScript).toContain('TARGET_REF="${1:-main}"');
		expect(rebuildPullScript).toContain('git -C "$REPO_DIR" fetch origin');
		expect(rebuildPullScript).toContain('git -C "$REPO_DIR" reset --hard "origin/$TARGET_REF"');
		expect(rebuildPullScript).toContain('exec nixos-rebuild switch --flake /etc/nixos#nixos --impure');

		expect(readme).toContain("/srv/nixpi");
		expect(readme).toContain("nixpi-rebuild-pull");

		expect(bootstrapScript).toContain("/srv/nixpi");
		expect(bootstrapScript).toContain("nixpi-rebuild-pull");

		expect(osSystemUpdate).toContain("/srv/nixpi");
		expect(osSystemUpdate).toContain("nixpi-rebuild-pull");

		expect(osActions).toContain("/srv/nixpi");
		expect(osActions).toContain("nixpi-rebuild-pull");

		expect(selfEvolutionSkill).toContain("/srv/nixpi");
		expect(selfEvolutionSkill).toContain("nixpi-rebuild-pull");
	});
});
