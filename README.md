# nazar

Declarative NixOS + MicroVM configuration for the Hetzner host `nazar`.

## Current host identity

| Item | Value |
|---|---|
| Host | `nazar` |
| Public IPv4 | `167.235.12.22` |
| OS | NixOS |
| NetBird | `nazar.netbird.cloud` / `100.124.51.27` |
| Daily SSH | `netbird ssh alex@nazar` |
| Public fallback SSH | `ssh alex@167.235.12.22` |

Root SSH is disabled. Hetzner Rescue is the break-glass root path.

## Repository layout

```text
flake.nix                 # Nazar fleet orchestrator and deploy apps
flake.lock                # pinned inputs
nix/fleet/vms.nix         # VM inventory: IDs, IPs, DNS, sizing
nix/modules/host/         # NixOS host modules
nix/modules/common/       # reusable MicroVM guest baseline
nix/modules/services/     # Nazar-owned MicroVM services, including dav
scripts/netbird/          # NetBird policy/DNS reconciliation helpers
runbooks/                 # operational runbooks
security/                 # hardening notes and roadmap
```

## Active services

### Git / Forgejo

| Item | Value |
|---|---|
| MicroVM | `git` |
| IP | `10.10.10.21` |
| Web | `http://git.nazar.studio/` |
| Git SSH | `ssh://git@git.nazar.studio:10022/nazar/<repo>.git` |
| Host proxy | nginx `:80` and socat `:10022` |

### DAV

Planned fresh personal data VM. No old OwnLoom/OwnLoom Data state is retained.

| Item | Value |
|---|---|
| MicroVM | `dav` |
| IP | `10.10.10.41` |
| DNS | `dav.nazar.studio` |
| Build | `nix build .#dav-qcow2` |
| Deploy | `nix run .#deploy-dav` |
| State | `/persist/microvms/dav` |
| Services | WebDAV `/files/`, CalDAV/CardDAV `/radicale/` |
| Exposure | NetBird/private-only |

See `runbooks/DAV_VM.md`.

### Minecraft

Declared as `minecraft` / `mc.nazar.studio`; restore/deploy separately when ready.

## Agent direction

OwnLoom is removed. Host-level `pi` is being replaced with Hermes Agent.

Target architecture:

1. `nazar` host Hermes: technical architect/operator for infrastructure work.
2. Future personal Hermes MicroVM: life manager with access to `dav`, isolated from host infrastructure authority.

Secrets must go through runtime secret files / secret management, never literal Nix values.

## Useful commands

```bash
git status --short --branch
nix flake check --no-build
sudo nix --accept-flake-config build .#nixosConfigurations.nazar.config.system.build.toplevel --print-build-logs
systemctl is-active netbird sshd microvm@git nginx git-ssh-proxy
curl -I http://git.nazar.studio/
git ls-remote ssh://git@git.nazar.studio:10022/nazar/nazar.git
```

## Constraints

- Do not commit secrets.
- Do not expose private services publicly without an explicit hardening decision.
- Do not enable root SSH.
- Destructive Hetzner actions require explicit confirmation and are only for `nazar` / `167.235.12.22`.
