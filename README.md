# Ownloom infrastructure

This repository is organized by server/platform area.

## Repository map

```text
proxmox/  # Proxmox VE host documentation, runbooks, and future host automation
nazar_backup/  # Previous Nazar NixOS flake, modules, service code, docs, and runbooks
```

## Proxmox

The active server at `167.235.12.22` is now a Proxmox VE host named `proxmox`.

Start here:

```text
proxmox/runbooks/PROXMOX_INSTALLATION.md
proxmox/runbooks/PHASE_1_COMPLETION.md
proxmox/runbooks/PHASE_2_EDGE_REVERSE_PROXY.md
proxmox/runbooks/PHASE_3_DNS_HTTPS_CUTOVER.md
```

Current public edge endpoint:

```text
https://nazar.studio/
```

Preferred SSH access from this laptop:

```bash
ssh proxmox
```

Break-glass root access:

```bash
ssh proxmox-root
```

## Nazar NixOS backup/configuration

The prior NixOS configuration has been moved under:

```text
nazar_backup/
```

Use the flake from that directory:

```bash
cd nazar_backup
nix flake check
nix run .#switch-host
```

Note: the physical server was reinstalled as Proxmox VE on 2026-05-19, so the Nazar NixOS configuration is no longer the active host OS unless intentionally redeployed.
