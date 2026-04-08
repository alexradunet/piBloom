# Live Testing

> Validating a fresh NixPI release against the supported bootstrap operator path

## Audience

Operators validating a fresh NixPI release on a NixOS-capable x86_64 VPS, headless VM, or mini PC.

## Why This Checklist Exists

Use it to verify that bootstrap, the shell-first Pi runtime, and the canonical `/srv/nixpi` workflow still match the shipped docs.

## How To Run The Check

### Fresh Bootstrap

1. Start from a fresh NixOS-capable x86_64 machine.
2. Run `nix run github:alexradunet/nixpi#nixpi-bootstrap-vps`.
3. Confirm the command prepares `/srv/nixpi`, initializes `/etc/nixos/flake.nix`, and completes `sudo nixos-rebuild switch --flake /etc/nixos#nixos`.

### Stable Bootstrap Regression Gate

```bash
nix build .#checks.x86_64-linux.config-stable-bootstrap --no-link -L
nix build .#checks.x86_64-linux.nixpi-bootstrap-fresh-install-stable --no-link -L
```

### Manual QEMU Lab

Local runtime artifacts live under `qemu-lab/`. Use the repo QEMU helpers to validate installer and preinstalled image flows when you need manual guest-side verification.

```bash
nix run .#qemu-installer
nix run .#qemu-prepare-preinstalled-stable
nix run .#qemu-preinstalled-stable
nix run .#qemu-clean
```

### First Remote Validation

1. Confirm `nixpi-app-setup.service`, `sshd.service`, `wireguard-wg0.service`, and `nixpi-update.timer` reach their expected state.
2. Confirm `pi` works from SSH.
3. Confirm the same Pi workflow also works from a local terminal when available.
4. Confirm outbound networking works and add at least one WireGuard peer before treating the host as ready for routine remote use.
5. Reboot once and repeat the shell-access checks.
6. On monitor-attached hardware, confirm the machine also presents a local `tty1` login prompt after reboot.

**Expected result:** the Pi runtime returns after reboot, the system remains operable from the canonical checkout, and no browser-only service layer is required.

### Core Runtime

1. Confirm `~/.pi/settings.json` exists for the primary operator.
2. Confirm `pi --help` works.
3. Verify `pi` is usable from SSH or a local shell.
4. If agent overlays exist, confirm malformed overlays are skipped without breaking Pi availability.

## Reference

### Ship Gate

- Fresh bootstrap completes on a clean host.
- `/srv/nixpi` is present and usable for rebuilds after install.
- The shell-first Pi runtime works from SSH or a local terminal.
- One reboot cycle preserves the expected operator workflow.
- Known risks for any optional packaged workloads are documented.
