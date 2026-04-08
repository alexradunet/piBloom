# Quick Deploy

> Bootstrap NixPI onto a VPS, headless VM, or mini PC and operate it from the shell-first Pi runtime

## Audience

Operators and maintainers deploying NixPI onto a NixOS-capable x86_64 VPS, headless VM, or mini PC.

## Security Note: WireGuard Is the Preferred Private Management Network

WireGuard remains the preferred private network path for NixPI hosts. SSH stays available for administration, while WireGuard provides the trusted management overlay for host-to-device access.

## Canonical Deployment Path

NixPI is bootstrap-first and remote-first. The standard deployment flow is:

1. provision a NixOS-capable x86_64 machine
2. run the bootstrap command once
3. connect over SSH (or use a local terminal)
4. keep operating from the canonical checkout at `/srv/nixpi`

## Two Supported Deployment Paths

### Fresh OVH install

For a brand-new OVH VPS that starts from rescue mode, use the dedicated [OVH Rescue Deploy](./ovh-rescue-deploy) path.

### Existing NixOS-capable machine

For a VPS, headless VM, or mini PC that is already NixOS-capable and reachable over SSH, use the bootstrap workflow documented below.

## 1. Provision a NixOS-Capable Machine

Bring up a fresh x86_64 VPS, headless VM, or mini PC with:

- SSH access
- `sudo` privileges
- outbound internet access
- enough disk and RAM to complete a `nixos-rebuild switch`

## 2. Run the Bootstrap Command

From the target host:

```bash
nix run github:alexradunet/nixpi#nixpi-bootstrap-vps
```

If you already have a local checkout of this branch, you can use the repo-local command instead:

```bash
nix run .#nixpi-bootstrap-vps
```

The bootstrap package:

- clones the repo into `/srv/nixpi` if it does not exist
- refreshes that checkout from `origin/main`
- initializes a standard flake-based `/etc/nixos`
- runs `sudo nixos-rebuild switch --flake /etc/nixos#nixos`

On monitor-attached hardware, the resulting system keeps a `tty1` login prompt after reboot for local recovery.

> Warning: rerunning the bootstrap command on a host with local commits in `/srv/nixpi` will reset that checkout to `origin/main`. Commit or export local work first.

## 3. Connect to the Pi Runtime

After the switch completes, connect through one of the supported shell paths:

- SSH to the host
- local `tty1` on monitor-attached hardware

Preferred access is over WireGuard-backed SSH once you have configured peers.

Useful checks:

```bash
systemctl status sshd.service
systemctl status wireguard-wg0.service
systemctl status nixpi-update.timer
systemctl status nixpi-app-setup.service
wg show wg0
ip link show wg0
```

## 4. Operate from `/srv/nixpi`

Treat `/srv/nixpi` as the installed source of truth. Use it for edits, sync, and rebuilds.

```bash
cd /srv/nixpi
sudo nixpi-rebuild
```

To update the canonical checkout and rebuild in one command:

```bash
sudo nixpi-rebuild-pull
sudo nixpi-rebuild-pull main
```

Roll back if needed:

```bash
sudo nixos-rebuild switch --rollback
```

## 5. Validate the Shell Runtime

Smoke-check the core services on a running host:

```bash
systemctl status nixpi-app-setup.service
systemctl status sshd.service
command -v pi
su - <user> -c 'pi --help'
```

Expected result:

- the Pi runtime is seeded under `~/.pi`
- `pi` runs from SSH or a local terminal
- no browser-only host services are required

For repo-side validation during development:

```bash
nix --option substituters https://cache.nixos.org/ build .#checks.x86_64-linux.config --no-link
nix build .#checks.x86_64-linux.nixpi-vps-bootstrap --no-link -L
```
