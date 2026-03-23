# Bloom OS Pre-Install Audit — Design Spec

**Date:** 2026-03-23
**Target hardware:** Beelink EQ14 (x86_64 UEFI), generically any modern x86_64 PC/laptop
**Scope:** Comprehensive audit covering hardware portability, code quality, resilience, tests, QoL, and documentation

---

## Overview

This audit prepares the Bloom OS codebase for real-hardware installation (minipc, laptop, or any x86_64 UEFI machine) and improves overall quality. The codebase is already clean and well-structured; the changes are targeted rather than sweeping.

---

## Section 1: Hardware Portability

**Problem:** `core/os/hosts/x86_64.nix` hardcodes QEMU virtio disk paths:

```nix
fileSystems."/" = lib.mkDefault { device = "/dev/vda"; fsType = "ext4"; };
fileSystems."/boot" = lib.mkDefault { device = "/dev/vda1"; fsType = "vfat"; };
```

These paths don't exist on real hardware (NVMe: `/dev/nvme0n1`, SATA: `/dev/sda`). This will cause a boot failure on physical machines.

**Fix:** Remove both `fileSystems` entries from `x86_64.nix`. NixOS generates a `hardware-configuration.nix` during installation (via `nixos-generate-config`) with the correct device paths. The installer already handles disk detection — the host config must not override it.

**Scope:**
- `core/os/hosts/x86_64.nix` — remove the two `fileSystems` entries
- `core/os/modules/firstboot.nix` — make `system = "x86_64-linux"` dynamic using `pkgs.system` so the generated `/etc/nixos` flake is architecture-agnostic

**Not changed:** Serial console (`ttyS0`), `systemd-boot`, EFI settings — all correct and harmless on real hardware.

---

## Section 2: Code Quality & Simplification

The codebase has no dead code, no TODO/FIXME markers, and recent commits reflect active simplification. Changes here are minimal.

**2a. Dynamic architecture in firstboot-generated flake**
`firstboot.nix` generates a flake at `/etc/nixos` hardcoding `system = "x86_64-linux"`. Replace with `pkgs.system` so builds don't break if someone runs this on a different arch in the future.

**2b. Locale and timezone via setup wizard**
`x86_64.nix` hardcodes `time.timeZone = "UTC"` and `i18n.defaultLocale = "en_US.UTF-8"`. Move these to be configurable:
- Add `nixpi.locale` and `nixpi.timezone` options in `options.nix`
- Default to `UTC` / `en_US.UTF-8` (preserving current behavior)
- Add a setup wizard step that prompts for timezone and keyboard layout
- Support prefill via `NIXPI_TIMEZONE` and `NIXPI_LOCALE` in `prefill.env`
- Write selected values via `nixos-rebuild` during first boot

---

## Section 3: Resilience

**3a. WiFi preference logic in setup-wizard.sh**
The wifi preference step (around line 412) prefers WiFi but doesn't verify WiFi hardware exists first. Add a hardware check (`nmcli device | grep wifi`) before attempting WiFi preference, gracefully falling back to Ethernet-only mode.

**3b. system-update.sh missing directory guard**
`system-update.sh` writes to `~/.nixpi/update-status.json` without ensuring the directory exists. Add `mkdir -p ~/.nixpi` before writing.

**3c. run-installer-iso.sh destructive operation warning**
Line 31 runs `rm -rf ~/.nixpi` silently. Add a confirmation prompt (`read -p "This will wipe ~/.nixpi. Continue? [y/N]"`) before proceeding, or at minimum print a clear warning.

**3d. Trusted interface firewall guard**
`network.nix` defaults `trustedInterface = "wt0"` (NetBird). Add a comment documenting that firewall rules referencing `wt0` are inert until NetBird connects, so operators understand the security posture during setup.

---

## Section 4: Tests

The existing test suite is comprehensive (15+ NixOS VM tests, full TypeScript unit/integration coverage). One addition:

**Real-hardware smoke checklist script**
Add `tools/check-real-hardware.sh` — a script that SSHes into a target machine and verifies:
- Boot loader is systemd-boot and EFI variables writable
- Root and boot filesystems mounted correctly
- NetworkManager active and network reachable
- Matrix/Continuwuity service running and healthy
- Pi daemon service healthy
- Element Web accessible on localhost
- Setup wizard checkpoint state (done or pending)

Usage: `./tools/check-real-hardware.sh <ip-or-hostname>`

This gives a quick post-install validation pass without running full VM tests.

---

## Section 5: QoL & Documentation

**5a. Locale/timezone in setup wizard** (implementation detail of §2b)
New step in `setup-wizard.sh` between network and password steps:
- List common timezones (or accept free-form)
- List keyboard layouts (us, uk, fr, de, es as common options + other)
- Write to prefill state so it survives checkpoint resumption

**5b. Installer progress indicator**
`core/os/pkgs/installer/nixpi-installer.sh` logs to `/tmp/nixpi-installer.log` but screen feedback is sparse. Add `echo "=== Step X/Y: <description> ==="` banners at each major phase (disk selection, partitioning, nixos-install, finalize) so non-technical users see progress.

**5c. Expand docs/install.md**
Add:
- Supported hardware (any modern x86_64 UEFI PC with 4GB+ RAM, 32GB+ storage)
- Step-by-step install from ISO
- What to expect during first boot and setup wizard
- How to set up for a friend: creating a `prefill.env` with their credentials pre-filled
- Troubleshooting: where logs are, how to re-run the wizard

---

## Out of Scope

- Raspberry Pi / ARM64 support (not needed for current use case)
- Multi-user support
- Network interface name parameterization beyond NetBird default

---

## Implementation Order

1. §1 — Hardware portability fixes (unblocks real install)
2. §3 — Resilience fixes (low-risk, high-value)
3. §2 — Locale/timezone (requires wizard + options.nix changes)
4. §4 — Smoke test script
5. §5b — Installer progress indicator
6. §5c — Documentation
