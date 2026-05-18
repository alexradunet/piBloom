# NixPi Runbook

NixPi is the private browser interface for Pi Coding Agent in Nazar. It reuses Pi RPC (`pi --mode rpc`) and runs one reproducibly packaged service on the host.

## Exposure model

NixPi is an operator surface: it can drive Pi as `alex` in configured workspaces. Keep it private behind sshuttle only.

Canonical UI:

- Host UI: `http://nixpi.nazar.studio/` -> host `127.0.0.1:4815`

NixPi uses a dedicated private virtual host. Do not use `http://nazar.studio/nixpi/`; the public `nazar.studio` virtual host is only the static dashboard.

Private/operator hostnames resolve to `10.44.0.1` through declarative laptop `/etc/hosts` entries and are proxied by host nginx. `nazar.studio` and `mc.nazar.studio` may also have public DNS, but NixPi is only served on the private `nixpi.nazar.studio` listener.

## Declarative exposure switch

HTTP route policy lives in `nix/fleet/exposure.nix`.

Each route has an `access` value:

- `"private"` — route is served only on host nginx's sshuttle-routed private listener (`10.44.0.1:80`).
- `"public"` — route is also served on the host public IPv4 listener and opens public TCP/80.

Do not set `access = "public"` for NixPi unless the operator surface has had a separate auth/hardening review.

## Runtime shape

The active NixPi implementation lives in this monorepo at `services/nixpi` and is consumed through the local `nixpi` flake input:

```text
services/nixpi -> inputs.nixpi.nixosModules.nixpi-bun -> systemd.services.nixpi-bun
```

Nazar configures the reusable module in `nix/modules/host/nixpi.nix`:

- package: flake-provided `nixpi-bun` package
- backend bind: `127.0.0.1:4815`
- service unit: `nixpi-bun.service`
- host workspace: local `/home/alex`
- VM workspaces: generated from `nix/fleet/vms.nix` entries with `piAgent.enable = true`

VM workspaces SSH into the VM and start remote `pi --mode rpc`. NixPi copies host Pi auth/model files into the remote `$HOME/.pi/agent` directory at runtime over SSH before spawning remote Pi. There is no shared host/VM auth mount in the production path.

## Switch

From `/root/nazar` on the host:

```bash
nix flake check --no-build
sudo nix --accept-flake-config build .#nixosConfigurations.nazar.config.system.build.toplevel --print-build-logs
sudo nixos-rebuild switch --flake .#nazar
```

After NixPi app changes, commit the `services/nixpi` changes in the monorepo and switch the host:

```bash
nix run .#switch-host
```

Then switch services as usual if another service changed:

```bash
nix run .#switch-minecraft   # host switch + Minecraft MicroVM restart
nix run .#switch-dav-server  # host switch for the DAV host service
```

## Validate

On the host:

```bash
systemctl is-active nixpi-bun nginx
curl -I http://127.0.0.1:4815/
curl -I --resolve nixpi.nazar.studio:80:10.44.0.1 http://nixpi.nazar.studio/
```

From a configured sshuttle laptop:

```bash
systemctl status nazar-sshuttle
getent hosts nazar.studio nixpi.nazar.studio dav.nazar.studio git.nazar.studio
curl -I http://nixpi.nazar.studio/
```

## Troubleshooting 502 Bad Gateway

A 502 from `nixpi.nazar.studio` means host nginx is reachable but the backend NixPi service is not reachable. Check:

```bash
# host
systemctl status nginx
journalctl -u nginx -n 100 --no-pager

# NixPi service and host-local backend
systemctl status nixpi-bun
journalctl -u nixpi-bun -n 100 --no-pager
curl -I http://127.0.0.1:4815/
```

## Rollback

Host rollback:

```bash
sudo nixos-rebuild switch --rollback
```

If a NixPi app change needs rollback, revert the relevant monorepo commit or use a previous host system generation, then switch the host:

```bash
nix run .#switch-host
```

If a MicroVM service change needs rollback, revert the relevant `services/<name>` monorepo commit or use a previous host system generation, then use the host-driven switch app for that VM:

```bash
nix run .#switch-<vm>
```

For a previous host system generation, use the host rollback first, then restart the affected MicroVM from the host if needed:

```bash
sudo systemctl restart microvm@<vm>.service
```
