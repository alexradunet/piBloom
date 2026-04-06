# Host-owned system flake with NixPI layered on top

## Summary

Preserve the machine's full existing host configuration in `/etc/nixos` and layer NixPI from `/srv/nixpi` on top of it. Rebuilds should target `/etc/nixos` with `--impure` rather than replacing the host with the repo's generic `#nixpi` profile.

## Problem

The current bootstrap and rebuild path uses:

```bash
sudo nixos-rebuild switch --flake /srv/nixpi#nixpi
```

That makes the repo's x86_64 host profile the effective system root. On real machines, this can discard or bypass the original host configuration for:
- generated hardware settings
- filesystems and boot setup
- firmware and microcode
- GPU, KMS, and display configuration
- desktop environment and display manager
- host-specific quirks

This is especially dangerous on mini PCs, but the same problem applies to any machine type.

## Goal

Keep **all existing host hardware and system configuration** regardless of machine class (mini PC, VPS, or other host), while adding NixPI as an overlay.

## Ownership model

### Host-owned layer: `/etc/nixos`
This remains the source of truth for machine-specific behavior:
- hardware configuration
- filesystems
- bootloader and initrd
- firmware and microcode
- GPU and display stack
- desktop environment and display manager
- machine quirks

### NixPI-owned layer: `/srv/nixpi`
This provides reusable NixPI functionality:
- NixPI modules
- services (chat, ttyd, nginx, broker)
- NixPI option defaults
- bootstrap and update workflows

## Recommended approach

Use a host flake in `/etc/nixos` as the rebuild root.

Supported rebuild path becomes:

```bash
sudo nixos-rebuild switch --flake /etc/nixos --impure
```

NixPI is imported from `/srv/nixpi` into the host flake instead of replacing the host flake.

## Composition layout

Expected files under `/etc/nixos`:

- `hardware-configuration.nix` — existing generated hardware file, preserved
- existing host config files (`configuration.nix` or other host modules), preserved
- `nixpi-host.nix` — generated NixPI host settings (hostname, primary user, timezone, keyboard)
- `flake.nix` — generated or host-managed flake that composes host config plus NixPI

### Import order

The host flake should conceptually compose modules in this order:
1. existing host config
2. `nixpi.nixosModules.nixpi`
3. `/etc/nixos/nixpi-host.nix`

This ensures:
- host hardware and desktop settings stay present
- NixPI layers services and defaults on top
- explicit local NixPI host choices can override NixPI defaults

## Bootstrap and update behavior

Bootstrap should:
1. ensure `/srv/nixpi` exists and is updated
2. inspect `/etc/nixos`
3. create or update only narrowly-scoped NixPI integration files
4. rebuild from `/etc/nixos --impure`

Update and apply flows should stop treating `/srv/nixpi` as the system flake root.

## Existing host scenarios

### Case A: `/etc/nixos/flake.nix` does not exist
Generate a host flake that:
- imports `/etc/nixos/configuration.nix`
- imports `/etc/nixos/hardware-configuration.nix` if present
- imports NixPI from `/srv/nixpi`
- imports `/etc/nixos/nixpi-host.nix`

This is the preferred automatic path.

### Case B: `/etc/nixos/flake.nix` already exists
Do **not** overwrite it blindly.

Instead:
- generate `/etc/nixos/nixpi-integration.nix`
- generate or update `/etc/nixos/nixpi-host.nix`
- integrate conservatively with the existing host flake

Safe default behavior:
- if classic non-flake host config: auto-generate the host flake
- if an existing host flake is already present: preserve it and use helper integration files rather than replacing custom logic

## Rationale for `--impure`

Use impurity intentionally so the host flake can reference the live checkout in `/srv/nixpi` without pretending the build is fully detached from machine-local state. This matches the requested operator model.

## Safeguards

The implementation must not overwrite:
- `/etc/nixos/configuration.nix`
- `/etc/nixos/hardware-configuration.nix`
- existing custom host modules
- existing complex host flake logic

NixPI-generated files should be narrow and clearly named.

## Repo areas likely affected

- bootstrap script
- firstboot host writer
- OS apply and update logic
- docs and operator guidance
- tests and checks that currently enforce `/srv/nixpi` as rebuild root

## Verification criteria

1. rebuild root is `/etc/nixos`
2. NixPI no longer requires replacing the host system config
3. host hardware files remain preserved
4. host display and desktop settings survive rebuild
5. NixPI services still come up correctly
6. existing host flake users are not clobbered

## Open implementation decision

For existing `/etc/nixos/flake.nix` users, the implementation should be conservative. Automated invasive rewriting of a custom host flake is out of scope unless a very safe insertion path is detected.
