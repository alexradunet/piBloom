import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../../core/lib/exec.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const deployScriptPath = path.join(repoRoot, "core/scripts/nixpi-deploy-ovh.sh");

function createDeployHarness() {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-deploy-ovh-test-"));
	const argsPath = path.join(rootDir, "nixos-anywhere.args");
	const flakeCopyPath = path.join(rootDir, "generated-flake.nix");
	const stubPath = path.join(rootDir, "fake-nixos-anywhere.sh");

	fs.writeFileSync(
		stubPath,
		`#!/usr/bin/env bash
set -euo pipefail

printf '%s\\0' "$@" > "$NIXPI_TEST_ARGS_FILE"

flake_ref=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --flake)
      flake_ref="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

cp "\${flake_ref%%#*}/flake.nix" "$NIXPI_TEST_FLAKE_COPY"
`,
	);
	fs.chmodSync(stubPath, 0o755);

	return {
		rootDir,
		argsPath,
		flakeCopyPath,
		stubPath,
		cleanup() {
			fs.rmSync(rootDir, { recursive: true, force: true });
		},
	};
}

async function runDeploy(
	args: string[],
	overrides?: {
		cwd?: string;
		env?: Record<string, string>;
	},
) {
	const harness = createDeployHarness();
	const result = await run("bash", [deployScriptPath, ...args], undefined, overrides?.cwd ?? repoRoot, {
		NIXPI_NIXOS_ANYWHERE: harness.stubPath,
		NIXPI_TEST_ARGS_FILE: harness.argsPath,
		NIXPI_TEST_FLAKE_COPY: harness.flakeCopyPath,
		TMPDIR: harness.rootDir,
		...overrides?.env,
	});

	return {
		...result,
		harness,
		readArgs() {
			if (!fs.existsSync(harness.argsPath)) return [];
			return fs.readFileSync(harness.argsPath, "utf8").split("\0").filter(Boolean);
		},
		readGeneratedFlake() {
			return fs.readFileSync(harness.flakeCopyPath, "utf8");
		},
	};
}

afterEach(() => {
	delete process.env.NIXPI_REPO_ROOT;
});

describe("nixpi-deploy-ovh.sh", () => {
	it("exposes a sourceable pure flake builder for deterministic tests", async () => {
		const result = await run(
			"bash",
			[
				"-lc",
				`source "${deployScriptPath}"; build_deploy_flake "path:${repoRoot}" "ovh-vps" "plan-host" "/dev/vda" "" ""`,
			],
			undefined,
			repoRoot,
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`inputs.nixpi.url = "path:${repoRoot}"`);
		expect(result.stdout).toContain("nixosConfigurations.deploy = nixpi.nixosConfigurations.ovh-vps.extendModules");
		expect(result.stdout).toContain('networking.hostName = lib.mkForce "plan-host";');
		expect(result.stdout).toContain('disko.devices.disk.main.device = lib.mkForce "/dev/vda";');
	});

	it("keeps bootstrap escaping inside the pure flake builder", async () => {
		const result = await run(
			"bash",
			[
				"-lc",
				`source "${deployScriptPath}"; build_deploy_flake "path:${repoRoot}" "ovh-vps" "plan-host" "/dev/vda" "human" '$6$abc"def'`,
			],
			undefined,
			repoRoot,
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('nixpi.primaryUser = lib.mkForce "human";');
		expect(result.stdout).toContain('users.users."human".initialHashedPassword = lib.mkForce "\\$6\\$abc\\"def";');
	});

	it("shows usage and exits non-zero when required arguments are missing", async () => {
		const result = await run("bash", [deployScriptPath], undefined, repoRoot);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Usage: nixpi-deploy-ovh");
	});

	it("rejects flake refs that do not include a nixosConfigurations attribute", async () => {
		const result = await runDeploy(["--target-host", "root@198.51.100.10", "--disk", "/dev/sda", "--flake", "."]);

		try {
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Flake ref must include a nixosConfigurations attribute");
			expect(result.readArgs()).toEqual([]);
		} finally {
			result.harness.cleanup();
		}
	});

	it("requires bootstrap user and password hash together", async () => {
		const missingHash = await runDeploy([
			"--target-host",
			"root@198.51.100.10",
			"--disk",
			"/dev/sda",
			"--bootstrap-user",
			"alice",
		]);

		try {
			expect(missingHash.exitCode).toBe(1);
			expect(missingHash.stderr).toContain("--bootstrap-user requires --bootstrap-password-hash");
		} finally {
			missingHash.harness.cleanup();
		}

		const missingUser = await runDeploy([
			"--target-host",
			"root@198.51.100.10",
			"--disk",
			"/dev/sda",
			"--bootstrap-password-hash",
			"$6$hash",
		]);

		try {
			expect(missingUser.exitCode).toBe(1);
			expect(missingUser.stderr).toContain("--bootstrap-password-hash requires --bootstrap-user");
		} finally {
			missingUser.harness.cleanup();
		}
	});

	it("builds a temporary deploy flake and forwards deterministic nixos-anywhere arguments", async () => {
		const result = await runDeploy([
			"--target-host",
			"root@198.51.100.10",
			"--disk",
			"/dev/nvme0n1",
			"--hostname",
			"bloom-eu-1",
			"--debug",
			"--option",
			"accept-flake-config",
			"true",
		]);

		try {
			expect(result.exitCode).toBe(0);

			const args = result.readArgs();
			expect(args).toEqual([
				"--flake",
				expect.stringMatching(/#deploy$/),
				"--target-host",
				"root@198.51.100.10",
				"--debug",
				"--option",
				"accept-flake-config",
				"true",
			]);

			const generatedFlake = result.readGeneratedFlake();
			expect(generatedFlake).toContain(`inputs.nixpi.url = "path:${repoRoot}"`);
			expect(generatedFlake).toContain("nixosConfigurations.deploy = nixpi.nixosConfigurations.ovh-vps.extendModules");
			expect(generatedFlake).toContain('networking.hostName = lib.mkForce "bloom-eu-1";');
			expect(generatedFlake).toContain('disko.devices.disk.main.device = lib.mkForce "/dev/nvme0n1";');
		} finally {
			result.harness.cleanup();
		}
	});

	it("injects the bootstrap login override into the generated flake", async () => {
		const result = await runDeploy([
			"--target-host",
			"root@198.51.100.10",
			"--disk",
			"/dev/sda",
			"--bootstrap-user",
			"human",
			"--bootstrap-password-hash",
			'$6$abc"def',
		]);

		try {
			expect(result.exitCode).toBe(0);

			const generatedFlake = result.readGeneratedFlake();
			expect(generatedFlake).toContain('nixpi.primaryUser = lib.mkForce "human";');
			expect(generatedFlake).toContain("nixpi.security.ssh.passwordAuthentication = lib.mkForce true;");
			expect(generatedFlake).toContain('nixpi.security.ssh.allowUsers = lib.mkForce [ "human" ];');
			expect(generatedFlake).toContain('users.users."human".initialHashedPassword = lib.mkForce "\\$6\\$abc\\"def";');
		} finally {
			result.harness.cleanup();
		}
	});
});
