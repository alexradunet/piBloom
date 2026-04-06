---
title: ISO Installer Removal + Mini PC Support
date: 2026-04-06
status: approved
---

# ISO Installer Removal + Mini PC Support

## Summary

Remove the unsupported ISO installer path from the codebase and document mini PC as a first-class supported deployment target via the existing `nixpi-bootstrap-vps` flow. Monitor output on mini PC installs is already functional (added in commit `5e31d13`) — the remaining work is cleanup and docs.

## Background

NixPI has one supported install path: `nixpi-bootstrap-vps`. A separate ISO installer existed in the codebase but is unsupported and creates confusion. The `vps.nix` profile already enables `console=tty1` and `getty@tty1`, so a mini PC with a connected monitor gets a login prompt after reboot — useful as a local fallback if SSH fails or keys are misconfigured.

## Scope

### Not in scope

- New host profiles (vps.nix already covers both VPS and mini PC)
- Bootstrap script changes
- Any console configuration changes (`vps.nix` is correct as-is)

## Part 1: Files Deleted

| Path | Reason |
|---|---|
| `core/os/hosts/installer-iso.nix` | ISO NixOS host config |
| `core/os/hosts/x86_64.nix` | Compatibility wrapper used only by the installer |
| `core/os/pkgs/installer/` | Entire installer package (script + nix wrapper) |
| `core/os/installer/` | Disko disk layout templates |
| `tests/nixos/nixpi-installer-smoke.nix` | NixOS integration test for the installer |

## Part 2: `flake.nix` Changes

**Inputs:**
- Remove `disko` input entirely (no remaining consumer)

**Variables removed:**
- `installerHelper` variable and its `pkgs.callPackage`
- `installerFrontendSource`
- `mkInstallerGeneratedConfig` helper
- `diskoLayoutsCheck`

**`specialArgs` — remove:**
- `installerHelper`
- `disko`

**`packages.${system}` — remove:**
- `nixpi-installer`
- `installerIso`

**`nixosConfigurations` — remove:**
- `installer-iso`
- `desktop` (compatibility alias for `x86_64.nix`)

**`checks.${system}` — remove entirely:**
- `installer-frontend`
- `installer-generated-config`
- `installer-generated-config-nvme`
- `installer-generated-config-sata`
- `installer-iso`
- `disko-layouts`

**`nixos-smoke` lane — remove entries:**
- `disko-layouts`
- `nixpi-installer-smoke`

**`nixos-destructive` lane — remove entry:**
- `nixpi-installer-smoke`

**`flake-topology` check — remove two assertions:**
- `grep -F 'self.nixosConfigurations.desktop.config...' installer-iso.nix`
- `grep -F 'services.fail2ban.enable...' installer-iso.nix`
- Keep the negative assertions (`! desktop-vm`, `! x86_64-vm.nix`, `! run-qemu.sh`)

**`vps-topology` check — remove two assertions:**
- `disko-layouts` in smoke block
- `nixpi-installer-smoke` in smoke block

## Part 3: Docs Updates

**`docs/install.md`:**
- Change requirements: "VPS or headless VM" → "x86_64 NixOS-capable machine (VPS, headless VM, or mini PC with monitor)"
- Add note: mini PC installs use the same bootstrap command; monitor output available at `tty1` after reboot

**`docs/operations/quick-deploy.md`:**
- Step 1 "Provision" section: add mini PC as a valid target alongside VPS/VM
- Add a brief note that on mini PC, a connected monitor shows a login prompt at `tty1` post-reboot — local recovery path if SSH is unavailable

**`docs/operations/first-boot-setup.md`:**
- In the "Current Behavior" section and/or the recovery guidance: name the local monitor (`tty1`) as an explicit recovery path alongside service logs

## Constraints

- `tests/nixos/nixpi-vps-bootstrap.nix` is kept — it tests the main bootstrap path, not the ISO installer
- `nixos-full` lane is unchanged — no installer entries were in it
- `core/os/pkgs/installer/__pycache__/` is deleted as part of removing the installer package directory
