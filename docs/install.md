---
title: Bootstrap NixPI
description: Layer NixPI onto an already-installed plain NixOS host.
---

# Bootstrap NixPI

## Supported target

- headless x86_64 VPS
- SSH or console access to the installed machine
- outbound internet access during bootstrap

## Prerequisite

Install a plain host first using [Install Plain Host](./install-plain-host) or the provider runbook in [OVH Rescue Deploy](./operations/ovh-rescue-deploy).

## Canonical install path

NixPI supports one default operating model:

1. start from an already-installed plain NixOS host
2. run `nixpi-bootstrap-host` on the machine once
3. manage infrastructure from a personal `nixpi` Git repository on your workstation
4. apply validated repository state to the host explicitly

`nixos-anywhere` is used only for plain base-system provisioning. It does not install the final NixPI host directly, and the host is not the default collaboration surface after bootstrap.

Bootstrap writes narrow `/etc/nixos` helper files. On a classic `/etc/nixos` tree it can generate a minimal host flake automatically; on an existing flake host it prints the exact manual integration steps instead.

## Bootstrap NixPI on the machine

Run this on the installed host after the plain base system boots:

```bash
nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- \
  --primary-user alex \
  --ssh-allowed-cidr YOUR_ADMIN_IP/32 \
  --authorized-key-file /root/.ssh/authorized_keys \
  --timezone Europe/Bucharest \
  --keyboard us
```

If you do not provide `--hostname`, NixPI keeps the host at the default `nixos` hostname.
If you provide `--authorized-key-file` or `--authorized-key`, bootstrap also seeds SSH access for the primary user.
Bootstrap also keeps the `root` account available for local console login and generates recovery passwords for both the primary user and `root`, prints them during bootstrap, and stores them at `/root/nixpi-bootstrap-passwords.txt` with root-only permissions unless you pass explicit passwords.
Save those passwords immediately. They are for OVH KVM or rescue fallback only; SSH still stays key-only with `PermitRootLogin no` and `PasswordAuthentication no`.
`fail2ban` is intentionally off by default; enable it later only after validating your steady-state SSH path and ban policy.
Use `--primary-user-password` and `--root-password` if you want to choose those values yourself.

If `/etc/nixos/flake.nix` already exists, follow the printed instructions and rebuild manually:

```bash
sudo nixos-rebuild switch --flake /etc/nixos#nixos --impure
```

## Known Bootstrap Failure: generic `configuration.nix` from `nixos-generate-config`

On fresh plain OVH base hosts, operators sometimes run `nixos-generate-config` before `nixpi-bootstrap-host`.
That often leaves a generic `/etc/nixos/configuration.nix` which triggers the GRUB assertion:

```text
You must set the option ‘boot.loader.grub.devices’ or 'boot.loader.grub.mirroredBoots' to make the system bootable.
```

For this bootstrap flow, keep `hardware-configuration.nix` and move the generated `configuration.nix` out of the way:

```bash
mv /etc/nixos/configuration.nix /etc/nixos/configuration.nix.before-nixpi
```

Then rerun bootstrap with `--force` because the first failed attempt may already have written helper files:

```bash
nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- \
  ... \
  --force
```

## After bootstrap

Validate the installed host:

```bash
systemctl status nixpi-app-setup.service
systemctl status sshd.service
systemctl status nixpi-update.timer
sshd -T | grep -E 'passwordauthentication|permitrootlogin|allowtcpforwarding|allowagentforwarding'
sudo nft list ruleset | grep 'dport 22'
```

If the SSH allowlist is wrong, recover through OVH console or rescue mode.
By default, SSH remains enabled after you leave bootstrap mode unless you explicitly disable `nixpi.bootstrap.ssh.enable`.

Routine changes should be authored from your personal `nixpi` repository, validated locally, pushed to GitHub, and then applied to the host. The host can still use the installed flake for runtime rebuilds:

```bash
sudo nixpi-rebuild
```

The personal `nixpi` repository is the canonical source of authored changes. The installed host flake remains the applied runtime target.

Rollback if needed:

```bash
sudo nixos-rebuild switch --rollback
```

## Next steps

- [Install Plain Host](./install-plain-host)
- [Operations](./operations/)
- [OVH Rescue Deploy](./operations/ovh-rescue-deploy)
- [First Boot Setup](./operations/first-boot-setup)
- [Reference](./reference/)
