---
title: Install NixPI
description: Install NixPI on a NixOS-capable VPS.
---

# Install NixPI

## Requirements

- NixOS-capable x86_64 VPS or headless VM
- SSH access with `sudo`
- Outbound internet access

## Install command

```bash
nix --extra-experimental-features 'nix-command flakes' run github:alexradunet/nixpi#nixpi-bootstrap-vps
```

Run the command as your normal user (do **not** prefix with `sudo`).
The bootstrap script escalates only the specific steps that need root.

If you want to force the freshest copy from GitHub (skip flake fetch cache), use:

```bash
nix --extra-experimental-features 'nix-command flakes' run --refresh github:alexradunet/nixpi?ref=main#nixpi-bootstrap-vps
```

The bootstrap process prepares `/srv/nixpi` and runs:

```bash
sudo nixos-rebuild switch --flake /srv/nixpi#nixpi
```

## After install

Operate from the canonical checkout:

```bash
cd /srv/nixpi
git fetch origin
git rebase origin/main
sudo nixos-rebuild switch --flake /srv/nixpi#nixpi
```

Check core services:

```bash
systemctl status nixpi-chat.service
systemctl status nixpi-ttyd.service
systemctl status nginx.service
systemctl status netbird.service
```

Rollback if needed:

```bash
sudo nixos-rebuild switch --rollback
```

## Next steps

- [Operations](./operations/)
- [First Boot Setup](./operations/first-boot-setup)
- [Reference](./reference/)
