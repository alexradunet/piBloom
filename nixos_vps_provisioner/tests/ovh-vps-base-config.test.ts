import path from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../core/lib/exec.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("ovh-vps-base host configuration", () => {
	it("evaluates the plain ovh-vps-base install profile", async () => {
		const result = await run(
			"nix",
			[
				"eval",
				"--impure",
				"--json",
				"--expr",
				`let flake = builtins.getFlake (toString ${JSON.stringify(repoRoot)});
				  evalConfig = import (flake.inputs.nixpkgs + "/nixos/lib/eval-config.nix");
				  config = (evalConfig {
				    system = builtins.currentSystem;
				    modules = [ ${JSON.stringify(`${repoRoot}/nixos_vps_provisioner/presets/ovh-vps-base.nix`)} ];
				  }).config;
				in {
				  hostName = config.networking.hostName;
				  stateVersion = config.system.stateVersion;
				  experimentalFeatures = config.nix.settings.experimental-features;
				  allowedTCPPorts = config.networking.firewall.allowedTCPPorts;
				  opensshEnable = config.services.openssh.enable;
				  passwordAuthentication = config.services.openssh.settings.PasswordAuthentication;
				  permitRootLogin = config.services.openssh.settings.PermitRootLogin;
				  pubkeyAuthentication = config.services.openssh.settings.PubkeyAuthentication;
				  qemuGuestEnable = config.services.qemuGuest.enable;
				  grubEnable = config.boot.loader.grub.enable;
				  grubEfiSupport = config.boot.loader.grub.efiSupport;
				  grubEfiInstallAsRemovable = config.boot.loader.grub.efiInstallAsRemovable;
				  systemdBootEnable = config.boot.loader.systemd-boot.enable;
				  canTouchEfiVariables = config.boot.loader.efi.canTouchEfiVariables;
				}`,
			],
			undefined,
			repoRoot,
		);

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({
			hostName: "ovh-vps-base",
			stateVersion: "25.05",
			experimentalFeatures: ["nix-command", "flakes"],
			allowedTCPPorts: [22],
			opensshEnable: true,
			passwordAuthentication: false,
			permitRootLogin: "prohibit-password",
			pubkeyAuthentication: "yes",
			qemuGuestEnable: true,
			grubEnable: true,
			grubEfiSupport: true,
			grubEfiInstallAsRemovable: true,
			systemdBootEnable: false,
			canTouchEfiVariables: false,
		});
	});
});
