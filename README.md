# Nazar

Declarative NixOS configuration for the Hetzner host `nazar`, a client laptop profile, host services, and service source code.

## Scope

The canonical local checkout on the Nazar VPS is:

```text
/home/alex/repos/nazar
```

This repository has one production Nix surface: the root `flake.nix`. The host and laptop configurations import modules directly from `nix/modules`.

The root flake owns deployment, SSH-only operator access, Code/Terminal/Hermes services, operator switch apps, and the Hermes Agent NixOS module wiring.

## Services

- Host Hermes Agent: `hermes-agent.service` managed declaratively by NixOS; use `hermes` from SSH or the private Code terminal.
- Hermes WebUI: `http://127.0.0.1:8787/` through the laptop SSH tunnel.
- Code: `http://127.0.0.1:4821/` through the laptop SSH tunnel.
- Terminal: `http://127.0.0.1:8082/` through the laptop SSH tunnel, backed by Zellij Web running as `alex`.

## Repository map

```text
flake.nix                     # root flake: configs, modules, packages, checks, apps
nix/hosts/nazar/              # production host composition, hardware, and disk layout
nix/hosts/alex-laptop/        # client/laptop composition and hardware config
nix/modules/host/             # host baseline, networking, service adapters, monitoring
nix/modules/laptop/           # client-side access modules
nix/modules/guest/            # shared guest VM helpers
nix/fleet/                    # host identity and exposure policy
runbooks/                     # operational notes
```

## Common commands

```bash
cd /home/alex/repos/nazar
nix flake check
nix fmt
nix run .#switch-host
```

## Development commands

```bash
nix build .#hermes-agent
```

## Quick health checks

```bash
systemctl is-active sshd systemd-networkd hermes-agent hermes-webui openvscode-server zellij-web
systemctl status nazar-tunnel
curl -I http://127.0.0.1:4821/
curl -I http://127.0.0.1:8082/
curl -fsS http://127.0.0.1:8787/health
```

## Policy

- Keep deployment authority in the root flake.
- Treat `/home/alex/repos/nazar` as the only canonical local checkout on the VPS.
- Keep browser services bound to host loopback and reachable through SSH local forwarding.
- Keep Hermes configured through NixOS and secrets files, not ad-hoc host services.
- Keep service code in `services/`, but compose production from the root host configuration.
- Prefer explicit direct imports over generated module discovery or wrapper layers.
