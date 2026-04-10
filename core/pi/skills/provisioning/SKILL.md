---
name: provisioning
description: Provision and bootstrap NixPI on a fresh or existing NixOS host with OVH-safe recovery guardrails
---

# Provisioning Skill

Use this skill when the task is to install a plain OVH base host, layer NixPI onto an installed NixOS machine, or recover a failed bootstrap.

## Supported Model

1. Install a plain host first.
2. Keep console recovery access for `root`.
3. Bootstrap NixPI on the host once with explicit SSH CIDR and operator user details.
4. Verify SSH, firewall, passwords, and the primary user runtime before leaving bootstrap mode.

NixPI is layered onto `/etc/nixos`; it is not the machine root.

## Guardrails

- Keep SSH key-only:
  - `PasswordAuthentication no`
  - `PermitRootLogin no`
- Keep KVM fallback credentials:
  - preserve or set a `root` password for OVH KVM
  - set a primary-user password for local console fallback
- Require an explicit admin CIDR for SSH reachability
- Prefer `fail2ban` off during bootstrap; only enable it intentionally later
- Before ending the session, confirm a fresh SSH login works for the primary user from the operator machine

## Plain Host Install

For fresh OVH installs, use the plain-host provisioner first. The plain-host stage should:

- install only the base OVH NixOS profile
- keep a `root` password for KVM fallback
- keep SSH key-only
- not try to create the future NixPI primary user yet

If the operator did not save the generated root password, reset it from the host console with `passwd root`.

## NixPI Bootstrap Command

Run `nixpi-bootstrap-host` on the installed host with:

- `--primary-user`
- `--ssh-allowed-cidr`
- `--authorized-key-file` or `--authorized-key`
- `--root-password` if the current root KVM password must be preserved
- `--primary-user-password` if the operator wants an explicit console fallback password

If `/root/.ssh/authorized_keys` does not exist, create it before bootstrap or pass `--authorized-key` explicitly.

## Known Failure Modes

### 1. Generic `configuration.nix` from `nixos-generate-config`

Symptom:

- rebuild fails with the GRUB assertion about `boot.loader.grub.devices`

Recovery:

1. keep `/etc/nixos/hardware-configuration.nix`
2. move `/etc/nixos/configuration.nix` aside
3. rerun `nixpi-bootstrap-host` with `--force`

### 2. Primary user exists but cannot SSH

Symptom:

- `users.users.<primary>.openssh.authorizedKeys.keys` exists in config
- but `/home/<primary>/.ssh/authorized_keys` is missing on disk

Recovery:

1. create `/home/<primary>/.ssh`
2. write `authorized_keys`
3. set owner to the primary user
4. set modes `700` on `.ssh` and `600` on `authorized_keys`
5. rebuild onto a revision that contains the explicit authorized-keys materialization fix

### 3. SSH says `Connection refused` after bootstrap

Check in this order:

1. `systemctl status sshd.service`
2. `sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin'`
3. `sudo nft list ruleset | grep 'dport 22'`
4. `fail2ban-client status sshd`

If `fail2ban` banned the operator IP, unban it or disable `fail2ban` and rebuild.

## Verification Checklist

Before calling provisioning complete, verify:

- `systemctl is-active sshd`
- `systemctl is-active nixpi-app-setup.service`
- `systemctl is-enabled nixpi-update.timer`
- `sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin|allowtcpforwarding|allowagentforwarding'`
- `sudo nft list ruleset | grep 'dport 22'`
- `/home/<primary>/.ssh/authorized_keys` exists with correct owner/mode
- a fresh SSH login from the operator machine works with the intended key
- `/etc/nixos/nixpi-host.nix` contains the intended hostname, CIDR, and user settings

## Exit Criteria

Provisioning is done only when all of these are true:

- the host booted into the intended NixPI generation
- the operator can SSH in as the primary user with the correct key
- KVM fallback still works via passwords for `root` and the primary user
- the operator has saved the recovery passwords
- the host can be rebuilt again from `/etc/nixos#nixos`
