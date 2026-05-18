# Code Runbook

Code is the private browser IDE for Nazar. It runs the native NixOS `services.openvscode-server` module on the host and is reached through SSH local forwarding.

## Exposure model

Canonical UI:

- `http://127.0.0.1:4821/` on the laptop -> host `127.0.0.1:4821`

This is an operator surface running as `alex`, so keep it bound to host loopback and reachable only through SSH. `nix/modules/host/code.nix` intentionally disables the OpenVSCode connection token and asserts the loopback bind.

## Runtime shape

```text
nix/fleet/exposure.nix -> nix/modules/host/code.nix -> services.openvscode-server
nix/modules/laptop/nazar-tunnel.nix -> nazar-tunnel.service -> local port 4821
```

Nazar configures OpenVSCode Server with:

- backend bind: `127.0.0.1:4821`
- service unit: `openvscode-server.service`
- user/group: `alex:users`
- initial folder: `/home/alex`
- mutable state: `/home/alex/.openvscode-server/{user-data,server-data,extensions}`
- Nix/Hermes tooling in the service PATH: `hermes`, `nix`, `nil`, `nixfmt`, `git`, `ripgrep`, and common build tools

## Switch

From `/home/alex/repos/nazar` on the host:

```bash
cd /home/alex/repos/nazar
nix flake check --no-build
sudo nix --accept-flake-config build .#nixosConfigurations.nazar.config.system.build.toplevel --print-build-logs
sudo nixos-rebuild switch --flake .#nazar
```

## Validate

On the host:

```bash
systemctl is-active openvscode-server
curl -I http://127.0.0.1:4821/
```

From a configured laptop:

```bash
systemctl status nazar-tunnel
curl -I http://127.0.0.1:4821/
```

## Troubleshooting

If the laptop URL fails, check both the tunnel and the host service:

```bash
systemctl status nazar-tunnel
ssh -v nazar-tunnel true
systemctl status openvscode-server
journalctl -u openvscode-server -n 100 --no-pager
curl -I http://127.0.0.1:4821/
```

## Rollback

```bash
sudo nixos-rebuild switch --rollback
```
