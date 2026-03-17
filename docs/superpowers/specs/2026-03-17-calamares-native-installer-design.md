# Calamares Native Installer Design

**Date:** 2026-03-17
**Status:** Approved

## Overview

Replace the current two-step install flow (Calamares installs vanilla NixOS → `bloom-convert.sh` converts to Bloom) with a single native Calamares installer that generates a proper Bloom OS configuration directly. All wizard configuration (NetBird key, Matrix username, Git identity, optional services) is collected during installation so that after the first reboot everything is running — no interactive setup required.

Service-dependent steps (NetBird connection, Matrix account creation, optional service activation) that require the installed system's running daemons are handled by an automated first-boot systemd service, invisible to the user.

## Goals

- Single Calamares pass installs a fully-configured Bloom OS
- No post-install conversion script or interactive wizard on first login
- Installed system tracks the upstream Bloom flake for OTA updates
- All Bloom-specific data collected as natural Calamares wizard pages
- WiFi credentials, git identity, and AI config applied at install time (no first-boot needed)
- NetBird + Matrix + optional services complete automatically on first boot before login

## Non-Goals

- Replacing the disko-based provisioning path (`just vm`, `just raw`, `just qcow2`)
- LUKS full-disk encryption (out of scope for this iteration)
- Multi-disk or custom partition layouts beyond Calamares's guided mode

## Architecture

### Components

**1. `nixosModules.bloom` and `nixosModules.bloom-firstboot` (new flake outputs)**

Two new outputs added to `flake.nix`:

- `nixosModules.bloom` — exports the six Bloom feature modules (`bloom-app`, `bloom-llm`, `bloom-matrix`, `bloom-network`, `bloom-shell`, `bloom-update`) as a single composable NixOS module, plus `nixpkgs.config.allowUnfree = true`. Does not include disko disk config or VM-specific mounts.
- `nixosModules.bloom-firstboot` — exports the first-boot service module (see below).

These allow the Calamares-installed system's local `flake.nix` to import Bloom cleanly without pulling in machine-specific or dev-only configuration.

**2. `core/calamares/` — custom Calamares extensions package**

An override of `calamares-nixos-extensions` bundled in the repo. Wired into the flake as a nixpkgs overlay in `packages.x86_64-linux` and applied in `x86_64-installer.nix`.

Structure:
```
core/calamares/
  bloom_nixos/
    main.py          # Replaces the standard nixos Calamares module
    module.desc      # Module descriptor
  pages/
    BloomNetbird.qml # Page: NetBird setup key
    BloomGit.qml     # Page: Git name + email
    BloomServices.qml# Page: Optional services checkboxes
  config/
    bloom-settings.conf  # Calamares settings.conf (sequence definition)
    bloom-nixos.conf     # bloom-nixos module config
    bloom-prefill.conf   # shellprocess config for writing prefill.env
  package.nix            # Nix derivation
```

**3. Custom Calamares QML pages**

Three new wizard pages inserted before the partition step:

| Page | Fields | Storage key |
|------|--------|-------------|
| `BloomNetbird` | NetBird setup key (password field, link to app.netbird.io) | `bloom_netbird_key` |
| `BloomGit` | Full name, email address | `bloom_git_name`, `bloom_git_email` |
| `BloomServices` | FluffyChat checkbox, dufs checkbox | `bloom_services` (comma-separated) |

All fields are optional — the first-boot service handles missing keys gracefully (skips the step).

**4. `core/os/modules/bloom-firstboot.nix` + `core/scripts/bloom-firstboot.sh`**

A new NixOS module that declares `bloom-firstboot.service`. The service runs once before `getty@tty1.service` on first boot, reads `~/,bloom/prefill.env`, and completes the service-dependent setup non-interactively.

**5. Updated `core/os/hosts/x86_64-installer.nix`**

Gains the nixpkgs overlay for the custom Calamares extensions and adds the QML pages to the live environment's package list.

**6. Removal of `bloom-convert.sh` and `bloom-convert-desktop`**

These are no longer needed. The installer now produces a Bloom system directly.

## Calamares Wizard Sequence

### Show Phase (pages presented to user)

1. `welcome` — unchanged
2. `locale` — unchanged (sets timezone, locale)
3. `keyboard` — unchanged
4. `users` — unchanged (sets password for `pi` user)
5. `bloom-git` — NEW: name + email
6. `bloom-netbird` — NEW: NetBird setup key
7. `bloom-services` — NEW: optional services selection
8. `partition` — unchanged (full GUI partitioning)
9. `summary` — unchanged

The `packagechooser` page (desktop environment selection) is removed. Bloom always installs headless with its own service stack.

### Exec Phase (installation jobs)

1. `partition` — formats and creates partitions per user selection
2. `mount` — mounts target at `/mnt`
3. `bloom-nixos` — custom module: generates local flake + `host-config.nix` + `hardware-configuration.nix`, runs `nixos-install`
4. `users` — sets `pi` password hash on the installed system
5. `shellprocess@bloom-prefill` — writes `prefill.env`, `.gitconfig`, copies NM WiFi connections
6. `umount` — unmounts target

### Final Show Phase

1. `finished` — with reboot button

## `bloom_nixos` Module (`main.py`)

The custom Python module replaces `calamares-nixos-extensions/modules/nixos/main.py`. It reads from Calamares `globalstorage` (same API as the standard module) and produces a working Bloom installation.

### Step 1 — Hardware detection

```python
subprocess.check_output(["pkexec", "nixos-generate-config", "--root", root_mount_point])
```

Generates `/mnt/etc/nixos/hardware-configuration.nix` from actual hardware.

### Step 2 — Write `host-config.nix`

Machine-specific overrides written to `/mnt/etc/nixos/host-config.nix`:

```nix
{ ... }: {
  boot.loader.systemd-boot.enable = true;   # grub if BIOS firmware
  boot.loader.efi.canTouchEfiVariables = true;
  networking.hostName = "bloom";
  time.timeZone = "@@timezone@@";
  i18n.defaultLocale = "@@LANG@@";
  services.xserver.xkb = { layout = "@@kblayout@@"; variant = "@@kbvariant@@"; };
  console.keyMap = "@@vconsole@@";
  networking.networkmanager.enable = true;
  users.users.pi = {
    isNormalUser = true;
    extraGroups = [ "networkmanager" "wheel" ];
  };
  system.stateVersion = "25.05";
}
```

### Step 3 — Write local `flake.nix`

Written to `/mnt/etc/nixos/flake.nix`:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bloom.url = "github:alexradunet/piBloom";
    llm-agents-nix = {
      url = "github:numtide/llm-agents.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, bloom, llm-agents-nix, ... }:
  let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages.${system};
    piAgent = llm-agents-nix.packages.${system}.pi;
    bloomApp = pkgs.callPackage (bloom + "/core/os/pkgs/bloom-app") { inherit piAgent; };
  in {
    nixosConfigurations.bloom = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = { inherit piAgent bloomApp; };
      modules = [
        ./hardware-configuration.nix
        ./host-config.nix
        bloom.nixosModules.bloom
        bloom.nixosModules.bloom-firstboot
      ];
    };
  };
}
```

The installed system uses `nixos-rebuild switch --flake /etc/nixos#bloom` for updates, automatically tracking upstream Bloom.

### Step 4 — Install

```python
subprocess.run(["pkexec", "nixos-install", "--root", root_mount_point,
                "--no-root-passwd", "--flake", "/mnt/etc/nixos#bloom"])
```

## `shellprocess@bloom-prefill` Job

Runs after `nixos-install`, before `umount`. Writes three things to the installed target:

**`/mnt/home/pi/.bloom/prefill.env`**
```bash
PREFILL_NETBIRD_KEY=<from bloom_netbird_key globalstorage>
PREFILL_USERNAME=<from Calamares username globalstorage>
PREFILL_NAME=<from bloom_git_name globalstorage>
PREFILL_EMAIL=<from bloom_git_email globalstorage>
PREFILL_SERVICES=<from bloom_services globalstorage, e.g. "fluffychat,dufs">
```
File permissions: `600`, owned by `pi`.

**`/mnt/home/pi/.gitconfig`**
```ini
[user]
    name = <name>
    email = <email>
```
Written directly — no first-boot step needed for git config.

**NetworkManager WiFi connections**
```bash
cp /etc/NetworkManager/system-connections/*.nmconnection \
   /mnt/etc/NetworkManager/system-connections/
```
Ensures WiFi configured during live session works immediately after reboot.

## First-Boot Automation

### `bloom-firstboot.nix`

```nix
{ config, pkgs, ... }: {
  systemd.services.bloom-firstboot = {
    description = "Bloom First-Boot Setup";
    wantedBy = [ "multi-user.target" ];
    before = [ "getty@tty1.service" ];
    after = [ "network-online.target" "bloom-matrix.service" "netbird.service" ];
    wants = [ "network-online.target" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      User = "pi";
      ExecStart = "${pkgs.bash}/bin/bash ${./bloom-firstboot.sh}";
      StandardOutput = "journal+console";
    };
    unitConfig.ConditionPathExists = "!/home/pi/.bloom/.setup-complete";
  };
}
```

### `bloom-firstboot.sh`

A stripped, non-interactive version of `bloom-wizard.sh`. Reads `~/,bloom/prefill.env`. Only runs the service-dependent steps:

1. **`step_netbird`** — starts netbird daemon, connects using `PREFILL_NETBIRD_KEY`; skipped if key is empty
2. **`step_matrix`** — waits for `bloom-matrix.service`, registers bot + user accounts using `PREFILL_USERNAME`
3. **`step_services`** — installs services listed in `PREFILL_SERVICES`
4. **`finalize`** — enables linger for `pi`, starts `pi-daemon.service`, writes `.setup-complete`

All prompts from `bloom-wizard.sh` are removed. Error handling logs to journal and continues (non-fatal failures don't block login).

`bloom-wizard.sh` is left unchanged and continues to work as a recovery mechanism (re-runs skipped steps if `.setup-complete` is absent).

## File Changes Summary

| Action | Path |
|--------|------|
| ADD | `core/calamares/package.nix` |
| ADD | `core/calamares/bloom_nixos/main.py` |
| ADD | `core/calamares/bloom_nixos/module.desc` |
| ADD | `core/calamares/pages/BloomNetbird.qml` |
| ADD | `core/calamares/pages/BloomGit.qml` |
| ADD | `core/calamares/pages/BloomServices.qml` |
| ADD | `core/calamares/config/bloom-settings.conf` |
| ADD | `core/calamares/config/bloom-nixos.conf` |
| ADD | `core/calamares/config/bloom-prefill.conf` |
| ADD | `core/os/modules/bloom-firstboot.nix` |
| ADD | `core/scripts/bloom-firstboot.sh` |
| MODIFY | `flake.nix` — add `nixosModules.bloom` + `nixosModules.bloom-firstboot` outputs + nixpkgs overlay |
| MODIFY | `core/os/hosts/x86_64-installer.nix` — use custom Calamares package, remove bloom-convert |
| DELETE | `core/scripts/bloom-convert.sh` |

## Error Handling

- **nixos-install fails**: Calamares shows error dialog with journal output. User can retry from the summary page.
- **First-boot NetBird fails**: Logged to journal. `bloom-wizard.sh` re-runs the netbird step on next login (existing checkpoint resume logic).
- **First-boot Matrix fails**: Same — wizard resumes from `step_matrix` on next login.
- **Missing prefill.env**: First-boot service skips NetBird/services gracefully. Matrix runs but prompts for username interactively via `bloom-wizard.sh` on next login.

## Testing

- `just iso-gui` builds the new installer ISO
- `just test-iso-gui` boots it in QEMU with display — verify all 9 wizard pages appear
- After install + reboot, `systemctl status bloom-firstboot` shows completed
- `netbird status` shows Connected
- `~/.pi/matrix-credentials.json` exists with valid tokens
- `pi` command starts successfully
