import { readFileSync } from "node:fs";
import path from "node:path";

export const repoRoot = path.resolve(import.meta.dirname, "../..");
export const flakePath = path.join(repoRoot, "flake.nix");
export const nixPkgsPath = path.join(repoRoot, "nix/pkgs.nix");
export const nixHostsPath = path.join(repoRoot, "nix/hosts.nix");
export const packageJsonPath = path.join(repoRoot, "package.json");
export const bootstrapHostScriptPath = path.join(repoRoot, "core/scripts/nixpi-bootstrap-host.sh");
export const bootstrapHostPackagePath = path.join(repoRoot, "core/os/pkgs/nixpi-bootstrap-host/default.nix");
export const bootstrapHostTestPath = path.join(repoRoot, "tests/integration/nixpi-bootstrap-host.test.ts");
export const appModulePath = path.join(repoRoot, "core/os/modules/app.nix");
export const piPackagePath = path.join(repoRoot, "core/os/pkgs/pi/default.nix");
export const shellModulePath = path.join(repoRoot, "core/os/modules/shell.nix");
export const vpsHostPath = path.join(repoRoot, "core/os/hosts/vps.nix");
export const runtimeFlowsPath = path.join(repoRoot, "docs/architecture/runtime-flows.md");
export const daemonArchitecturePath = path.join(repoRoot, "docs/reference/daemon-architecture.md");
export const serviceArchitecturePath = path.join(repoRoot, "docs/reference/service-architecture.md");
export const personaSkillPath = path.join(repoRoot, "core/pi/persona/SKILL.md");
export const recoverySkillPath = path.join(repoRoot, "core/pi/skills/recovery/SKILL.md");
export const selfEvolutionSkillPath = path.join(repoRoot, "core/pi/skills/self-evolution/SKILL.md");
export const readmePath = path.join(repoRoot, "README.md");
export const plainHostInstallDocPath = path.join(repoRoot, "docs/install-plain-host.md");
export const installDocPath = path.join(repoRoot, "docs/install.md");
export const quickDeployDocPath = path.join(repoRoot, "docs/operations/quick-deploy.md");
export const ovhRescueDeployDocPath = path.join(repoRoot, "docs/operations/ovh-rescue-deploy.md");
export const firstBootDocPath = path.join(repoRoot, "docs/operations/first-boot-setup.md");
export const liveTestingDocPath = path.join(repoRoot, "docs/operations/live-testing.md");
export const infrastructureDocPath = path.join(repoRoot, "docs/reference/infrastructure.md");
export const reinstallCommandPath = path.join(repoRoot, "reinstall-nixpi-command.txt");

export const readUtf8 = (filePath: string) => readFileSync(filePath, "utf8");
export const relativePath = (filePath: string) => path.relative(repoRoot, filePath);

export const hostOwnedBootstrapDocCases = [
	{
		label: relativePath(readmePath),
		filePath: readmePath,
		contains: [
			"plain OVH-compatible NixOS base system",
			"plain-host-deploy",
			"nixpi-bootstrap-host",
			"`/etc/nixos` is the running host's source of truth",
		],
		absent: ["final host configuration installed directly by `nixos-anywhere`", "nixpi-rebuild-pull", "/srv/nixpi"],
	},
	{
		label: relativePath(plainHostInstallDocPath),
		filePath: plainHostInstallDocPath,
		contains: ["Install Plain Host", "plain-host-deploy", "standard NixOS host"],
		absent: ["nixpi-deploy-ovh", "final host configuration directly"],
	},
	{
		label: relativePath(installDocPath),
		filePath: installDocPath,
		contains: ["Install a plain host first", "run `nixpi-bootstrap-host` on the machine"],
		absent: ["final host configuration directly", "nixpi-deploy-ovh", "nixpi-rebuild-pull", "/srv/nixpi"],
	},
	{
		label: relativePath(quickDeployDocPath),
		filePath: quickDeployDocPath,
		contains: ["plain-host-deploy", "install the `ovh-vps-base`", "bootstrap NixPI after first boot"],
		absent: ["final `ovh-vps` host configuration directly", "nixpi-rebuild-pull", "/srv/nixpi"],
	},
	{
		label: relativePath(ovhRescueDeployDocPath),
		filePath: ovhRescueDeployDocPath,
		contains: ["plain base system", "run `nixpi-bootstrap-host` on the machine"],
		absent: ["nixpi-reinstall-ovh", "nixpi-rebuild-pull", "/srv/nixpi"],
	},
	{
		label: relativePath(firstBootDocPath),
		filePath: firstBootDocPath,
		contains: ["run `nixpi-bootstrap-host`", "`/etc/nixos#nixos`"],
		absent: ["nixpi-rebuild-pull", "<checkout-path>#ovh-vps", "/srv/nixpi", "nixpi-deploy-ovh"],
	},
	{
		label: relativePath(runtimeFlowsPath),
		filePath: runtimeFlowsPath,
		contains: ["plain base system", "bootstrap writes narrow `/etc/nixos` helper files"],
		absent: ["final host configuration directly", "nixpi-deploy-ovh", "nixpi-rebuild-pull", "/srv/nixpi"],
	},
	{
		label: relativePath(liveTestingDocPath),
		filePath: liveTestingDocPath,
		contains: ["base install then bootstrap", "`nixpi-bootstrap-host` on the machine", "plain-host-deploy"],
		absent: ["final `ovh-vps` host configuration directly", "nixpi-rebuild-pull", "/srv/nixpi", "nixpi-deploy-ovh"],
	},
	{
		label: relativePath(infrastructureDocPath),
		filePath: infrastructureDocPath,
		contains: ["nixpi-bootstrap-host", "`/etc/nixos` is the running host's source of truth"],
		absent: ["nixpi-rebuild-pull [branch]", "/srv/nixpi"],
	},
	{
		label: relativePath(personaSkillPath),
		filePath: personaSkillPath,
		contains: [
			"Canonical rebuild path: `sudo nixpi-rebuild`.",
			"Canonical bootstrap path: `nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- ...`.",
		],
		absent: ["nixpi-deploy-ovh", "nixpi-rebuild-pull", "/srv/nixpi"],
	},
	{
		label: relativePath(recoverySkillPath),
		filePath: recoverySkillPath,
		contains: ["retry `sudo nixpi-rebuild`", "`sudo nixos-rebuild switch --flake /etc/nixos#nixos --impure`"],
		absent: ["nixpi-deploy-ovh", "nixpi-rebuild-pull", "/srv/nixpi"],
	},
	{
		label: relativePath(selfEvolutionSkillPath),
		filePath: selfEvolutionSkillPath,
		contains: [
			"**Standard bootstrap command**: `nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- ...`",
			"**Canonical rebuild command**: `sudo nixpi-rebuild`",
		],
		absent: ["nixpi-deploy-ovh", "nixpi-rebuild-pull", "/srv/nixpi"],
	},
] as const;

export const legacyBootstrapTerms = [
	"sudo nixpi-rebuild-pull [branch]",
	"sudo nixpi-rebuild-pull [branch-or-ref]",
	"nixpi-reinstall-ovh",
	"conventional `/srv/nixpi` operator checkout",
	"final `ovh-vps` host configuration directly",
	"<checkout-path>#ovh-vps",
	"/srv/nixpi",
] as const;

export const legacyFreeDocCases = hostOwnedBootstrapDocCases.map(({ label, filePath }) => ({
	label,
	filePath,
	forbiddenTerms: legacyBootstrapTerms,
}));

export const productionGuidancePaths = [
	readmePath,
	installDocPath,
	quickDeployDocPath,
	ovhRescueDeployDocPath,
	firstBootDocPath,
	runtimeFlowsPath,
	liveTestingDocPath,
] as const;
