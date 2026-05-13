# NixPi Runbook

NixPi is the private browser interface for Pi Coding Agent in Nazar. It reuses Pi RPC (`pi --mode rpc`) and runs one service on the host plus one service in each concrete MicroVM.

## Exposure model

NixPi is an operator surface: it can drive Pi as `alex` in the configured working directory. Keep it WireGuard-private only.

- Host UI: `http://nixpi.nazar.studio/` -> host `127.0.0.1:4815`
- Git VM UI: `http://nixpi-git.nazar.studio/` -> `10.10.10.21:4815`
- Minecraft VM UI: `http://nixpi-minecraft.nazar.studio/` -> `10.10.10.30:4815`
- OwnLoom VM UI: `http://nixpi-ownloom.nazar.studio/` -> `10.10.10.40:4815`
- DAV Server VM UI: `http://nixpi-dav-server.nazar.studio/` -> `10.10.10.41:4815`

All names resolve to `10.44.0.1` through WireGuard dnsmasq and are proxied by host nginx. Do not add public DNS for these names.

## State

Each MicroVM has a persistent virtiofs share mounted at `/home/alex/.pi`, backed by:

- `/persist/microvms/git/pi`
- `/persist/microvms/minecraft/pi`
- `/persist/microvms/ownloom/pi`
- `/persist/microvms/dav-server/pi`

This keeps Pi config and NixPi session history across VM recreation. The host service uses `/home/alex/.pi` on the host.

## Input source

The Nazar flake uses the private Forgejo repository:

```nix
git+ssh://git@git.nazar.studio:10022/nazar/nixpi.git
```

Update it from `/root/nazar` with:

```bash
nix flake lock --update-input nixpi
```

## Deploy

From `/root/nazar` on the host:

```bash
nix flake check --no-build
sudo nix --accept-flake-config build .#nixosConfigurations.nazar.config.system.build.toplevel --print-build-logs
sudo nixos-rebuild switch --flake .#nazar
```

Then deploy MicroVMs as usual if needed:

```bash
nix run .#deploy-git
nix run .#deploy-minecraft
nix run .#deploy-ownloom
nix run .#deploy-dav-server
```

## Validate

On the host:

```bash
systemctl is-active nixpi nginx wireguard-wg0 dnsmasq
curl -I http://127.0.0.1:4815/
```

From a WireGuard client:

```bash
dig @10.44.0.1 nixpi.nazar.studio +short
dig @10.44.0.1 nixpi-ownloom.nazar.studio +short
curl -I http://nixpi.nazar.studio/
curl -I http://nixpi-ownloom.nazar.studio/
```

Inside each VM:

```bash
systemctl is-active nixpi
curl -I http://127.0.0.1:4815/
```

## Rollback

Host rollback:

```bash
sudo nixos-rebuild switch --rollback
```

VM rollback:

```bash
nix run .#deploy-<vm> -- --rollback
# or inside a VM if the VM-local self flake is healthy:
sudo nixos-rebuild switch --rollback
```
