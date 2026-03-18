# Structural Cleanup — Design Spec
_Date: 2026-03-18_

## Overview

Four independent, low-risk cleanup items that reduce duplication and make implicit dependencies explicit. All changes are mechanical — no behaviour changes to the installed system or the installer. Tackled as a single PR since they are all confined to developer-facing files (`flake.nix`, `justfile`, `core/scripts/`).

---

## 1. ISO Cleanup: Remove CLI ISO, Rename iso-gui → iso

### Problem

Two ISO outputs exist:
- `iso` — a stock NixOS minimal CLI installer with no Bloom-specific installer logic (no Calamares, no `bloom_nixos`/`bloom_prefill` modules, no offline bundling, no username configuration). An installation via this ISO produces an incomplete system.
- `iso-gui` — the real graphical Calamares installer with all Bloom customisations.

The CLI `iso` is unused and produces an incomplete install. The name `iso-gui` is unnecessarily verbose now that it is the only ISO.

### Changes

**`flake.nix`:**
- Remove the `iso` package block entirely.
- Rename `iso-gui` → `iso`.

**`justfile`:**
- Remove the `iso` and `test-iso` (CLI) recipes.
- Rename `iso-gui` → `iso` and `test-iso-gui` → `test-iso`.
- Update the one internal cross-reference in the `iso` help text (`just iso-gui` → `just iso`).

**CI (`.github/workflows/build-os.yml`):** No changes needed — CI does not build the ISO.

---

## 2. flake.nix: Deduplicate qcow2 / raw Image Config

### Problem

The `qcow2` and `raw` package outputs in `flake.nix` are ~65 lines of near-identical `nixosSystem` configuration. The only difference between them is `image.format`. Any change to boot config, filesystem layout, or kernel modules must be made in both places.

### Changes

Add a `mkDiskImage` helper to the top-level `let` block:

```nix
mkDiskImage = format: (nixpkgs.lib.nixosSystem {
  inherit system specialArgs;
  modules = [
    ./core/os/hosts/x86_64.nix
    ({ config, pkgs, lib, ... }: {
      imports = [ "${nixpkgs}/nixos/modules/virtualisation/disk-image.nix" ];
      image.format       = format;
      image.efiSupport   = true;
      boot.loader.systemd-boot.enable      = true;
      boot.loader.efi.canTouchEfiVariables = true;
      fileSystems."/"     = { device = "/dev/disk/by-label/nixos"; fsType = "ext4"; autoResize = true; };
      fileSystems."/boot" = { device = "/dev/disk/by-label/ESP";   fsType = "vfat"; };
      boot.growPartition  = true;
      boot.initrd.availableKernelModules = [ "virtio_net" "virtio_pci" "virtio_blk" "virtio_scsi" "9p" "9pnet_virtio" ];
      boot.kernelModules  = [ "kvm-intel" "kvm-amd" ];
    })
  ];
}).config.system.build.image;
```

The two package outputs become:

```nix
qcow2 = mkDiskImage "qcow2";
raw   = mkDiskImage "raw";
```

~65 lines → ~2 lines at the call sites.

---

## 3. justfile: Deduplicate VM Recipes via run-qemu.sh

### Problem

`vm`, `vm-gui`, and `vm-daemon` share ~50 lines of identical bash:
- Find qcow2 in the Nix result symlink
- Copy to `/tmp/bloom-vm-disk.qcow2`
- Resize to 24G
- Copy OVMF vars
- Stage `core/scripts/prefill.env` if present

The three recipes diverge only in how QEMU is launched (headless / GUI / daemon). `vm-run` also duplicates most of the QEMU argument list.

### Changes

**New file: `core/scripts/run-qemu.sh`**

A dev-only helper script (not installed on the NixOS system). Accepts a `--mode` flag:

| Mode | QEMU launch style | Notes |
|---|---|---|
| `headless` | `-nographic -serial mon:stdio` | Port forwards include `8888→80` |
| `gui` | `-vga virtio -display gtk` | Port forwards include `8888→80` (aligned with `headless`/`daemon`) |
| `daemon` | `nohup` background, `-serial file:/tmp/bloom-vm.log`, waits up to 30s for SSH on port 2222 | Serial redirected to log file so `just vm-logs` works |

**Note on `vm-gui` port forward alignment:** The current `vm-gui` recipe omits `hostfwd=tcp::8888-:80` while `vm`, `vm-daemon`, and `vm-run` all include it. The unified `run-qemu.sh` will add it to `gui` mode as well — a minor intentional behaviour improvement, not a regression.

Also accepts `--skip-setup` to skip the disk copy/resize/prefill steps (used by `vm-run` which boots an already-prepared disk).

**`justfile` recipes become thin wrappers:**

```just
vm: qcow2
    core/scripts/run-qemu.sh --mode headless

vm-gui: qcow2
    core/scripts/run-qemu.sh --mode gui

vm-daemon: qcow2
    core/scripts/run-qemu.sh --mode daemon

vm-run:
    core/scripts/run-qemu.sh --mode headless --skip-setup
```

`run-qemu.sh` is **not** added to `bloom-app/default.nix` — it is a developer workflow tool, not a system component.

---

## 4. Scripts: Extract bloom-lib.sh, Remove Implicit Sourcing

### Problem

`bloom-firstboot.sh` sources `bloom-wizard.sh` at runtime to reuse helper functions. This creates an implicit, fragile dependency:
- A `BLOOM_FIRSTBOOT_SOURCING=1` guard is required to prevent `main()` from executing when sourced.
- The sourcing requires brittle path fallback logic (`dirname "$0"` → `/run/current-system/sw/bin/bloom-wizard.sh`).
- Any function moved or renamed in `bloom-wizard.sh` silently breaks `bloom-firstboot.sh`.

### Changes

**New file: `core/scripts/bloom-lib.sh`**

Contains all functions used by both `bloom-wizard.sh` and `bloom-firstboot.sh`:

- Checkpoint management: `mark_done`, `mark_done_with`, `read_checkpoint_data`
- Utilities: `json_field`, `generate_password`
- Matrix API + state: `matrix_register`, `matrix_login`, `matrix_state_get`, `matrix_state_set`, `matrix_state_clear`, `load_existing_matrix_credentials`
- Service management: `install_service`, `install_home_infrastructure`, `write_service_home_runtime`
- NetBird utilities: `netbird_status_json`, `netbird_fqdn` (`netbird_fqdn` calls `netbird_status_json` internally — both must move together)
- `step_matrix` — works non-interactively when `PREFILL_USERNAME` is set; called directly by `firstboot_matrix` in `bloom-firstboot.sh`

**`bloom-wizard.sh`:**
- Sources `bloom-lib.sh` at the top.
- Retains only interactive-only step functions: `step_welcome`, `step_password`, `step_network`, `step_git`, `step_ai`, `step_services`, `step_netbird`.
- Retains `main()` orchestrator.

**`bloom-firstboot.sh`:**
- Sources `bloom-lib.sh` using the same two-step fallback pattern it currently uses for `bloom-wizard.sh`: try `$(dirname "$0")/bloom-lib.sh` first, then fall back to `/run/current-system/sw/bin/bloom-lib.sh`.
- No longer sources `bloom-wizard.sh`.
- `BLOOM_FIRSTBOOT_SOURCING` guard and `unset` removed entirely.

**`core/os/pkgs/bloom-app/default.nix`:**
- Add `bloom-lib.sh` to the install phase using the Nix store-path interpolation form, matching how `bloom-wizard.sh` and `bloom-greeting.sh` are currently installed:
  ```nix
  install -m 755 ${../../../scripts/bloom-lib.sh} $out/bin/bloom-lib.sh
  ```
  Do **not** use a plain `cp core/scripts/bloom-lib.sh` — the `cleanSourceWith` filter in `default.nix` may exclude it. Store-path interpolation bypasses the filter and is the established pattern.

### Runtime path

Two scripts, two different resolution paths:

**`bloom-wizard.sh`** is installed into `bloom-app`'s `$out/bin/`. When it runs, `$(dirname "$0")` resolves to that same `$out/bin/` directory. A sibling `bloom-lib.sh` installed there will be found on the first probe. Primary working path: `$(dirname "$0")/bloom-lib.sh`.

**`bloom-firstboot.sh`** is **not** installed via `bloom-app`. It is referenced directly from the Nix source tree by `bloom-firstboot.nix` (`ExecStart = "${pkgs.bash}/bin/bash ${../../scripts/bloom-firstboot.sh}"`). Its `$0` resolves to a raw source store path, not `bloom-app`'s `$out/bin/`. The `$(dirname "$0")/bloom-lib.sh` probe will always fail — it is structurally dead code, included only for pattern consistency. The reliable path is the fallback: `/run/current-system/sw/bin/bloom-lib.sh`. This mirrors exactly how `bloom-firstboot.sh` currently finds `bloom-wizard.sh`.

---

## Out of Scope

The following known issues are intentionally deferred to the separate production-hardening stream:
- WiFi PSK stored in plaintext in the Nix store (`bloom-network.nix`)
- Cachix substituter not configured (`bloom-update.nix`)
- Hardcoded UID/GID 1000 in `bloom_prefill/main.py`

---

## File Change Summary

| File | Change |
|---|---|
| `flake.nix` | Remove `iso`; rename `iso-gui` → `iso`; add `mkDiskImage`; collapse `qcow2`/`raw` |
| `justfile` | Remove `iso`, `test-iso` (CLI); rename `iso-gui` → `iso`, `test-iso-gui` → `test-iso`; vm recipes → thin wrappers |
| `core/scripts/run-qemu.sh` | New file — shared QEMU setup + launch logic |
| `core/scripts/bloom-lib.sh` | New file — shared shell function library |
| `core/scripts/bloom-wizard.sh` | Sources `bloom-lib.sh`; shared functions moved out |
| `core/scripts/bloom-firstboot.sh` | Sources `bloom-lib.sh` directly; remove wizard sourcing + guard |
| `core/os/pkgs/bloom-app/default.nix` | Install `bloom-lib.sh` |
