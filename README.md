# nazar

Declarative NixOS configuration for the Hetzner host `nazar`, host services, and its small MicroVM service fleet.

## Purpose

This repository owns the host configuration, private access model, nginx routing, DAV/NixPi/Code host services, MicroVM composition, operator switch apps, and service code for Nazar. NixPi, Minecraft, and DAV live as local subflakes under `services/`; the running host remains the deployment authority.

## Source repository

Canonical Git hosting is on Codeberg: <https://codeberg.org/NazarStudio/Nazar>. The host no longer runs a Git server; the repository remotes are declared in `nix/fleet/host.nix`.

## Current access model

Default posture: private by default, sshuttle first.

- Private operator tunnel: `nazar-sshuttle.service` from configured laptops over public SSH to `alex@167.235.12.22`.
- Private service address: `10.44.0.1/32` on the host-local `nazar-private` interface.
- Daily host SSH: `ssh alex@10.44.0.1` through sshuttle.
- Public host SSH: `22/tcp`, key-only, `alex` only, for administration and sshuttle.
- Public HTTP: `http://nazar.studio/`, static dashboard only.
- Public Minecraft: `mc.nazar.studio` game traffic, `25565/tcp` and `24454/udp`, DNAT to the Minecraft MicroVM.
- Private NixPi: `http://nixpi.nazar.studio/` through sshuttle and host nginx.
- Private Code: `http://code.nazar.studio/` through sshuttle and host nginx.
- Private DAV: `http://dav.nazar.studio/` through sshuttle and host nginx on the Nazar host.

There is intentionally no public DAV, NixPi, or Code exposure from the Nazar host.

## Active services

| Service        | Runs on                             | Endpoint                                   | Notes                                           |
| -------------- | ----------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| Host dashboard | host `nazar`                        | `http://nazar.studio/`                     | public static site                              |
| NixPi          | host `nazar`                        | `http://nixpi.nazar.studio/` over sshuttle | Flake-packaged Bun service; Pi RPC workspace UI |
| Code           | host `nazar`                        | `http://code.nazar.studio/` over sshuttle  | Native OpenVSCode Server running as `alex`      |
| DAV Server     | host `nazar`                        | `http://dav.nazar.studio/` over sshuttle   | WebDAV, CalDAV, CardDAV, private data service   |
| Minecraft      | MicroVM `minecraft` / `10.10.10.30` | `mc.nazar.studio:25565`, voice `24454/udp` | public game service                             |

## Repository layout

```text
flake.nix                    # host/laptop configurations and switch apps
nix/fleet/host.nix           # shared host identity constants
nix/fleet/private-domains.nix # generated private domain list for host/laptop hosts files
nix/fleet/vms.nix            # active MicroVM inventory and service data
nix/fleet/exposure.nix       # host HTTP route policy
nix/hosts/                   # host and laptop entrypoints
nix/modules/host/            # host networking, firewall, nginx, DAV, NixPi, Code, MicroVM host
nix/modules/guest/           # reusable MicroVM guest baseline
nix/modules/services/        # thin service identity wrappers
nix/users/                   # public SSH key material only
services/nixpi/              # NixPi Bun web interface subflake
services/minecraft/          # Minecraft MicroVM service subflake
services/dav-server/         # DAV/Radicale/WebDAV host service subflake
runbooks/                    # operational runbooks
www/                         # static public dashboard
```

## Switch commands

Run host-driven switches from `/root/nazar` on the host:

```bash
cd /root/nazar
nix flake check --no-build
nix run .#switch-host
nix run .#switch-minecraft
nix run .#switch-dav-server
nix run .#switch-fleet
```

For service changes, edit the corresponding `services/` subflake in this monorepo, commit the change, then run the service switch app:

```bash
# after editing services/minecraft/
nix run .#switch-minecraft

# after editing services/dav-server/
nix run .#switch-dav-server

# after editing services/nixpi/
nix run .#switch-host
```

`switch-minecraft` switches the host configuration and restarts the Minecraft MicroVM. `switch-dav-server` switches the host configuration for the host DAV service. `switch-fleet` switches the host and restarts all active MicroVMs.

## Validation commands

```bash
nix flake check --no-build
nix --accept-flake-config build .#nixosConfigurations.nazar.config.system.build.toplevel --no-link --print-build-logs
nix eval --json .#nixosConfigurations.alex-laptop.config.nazar.access.sshuttle.privateDomains
systemctl is-active sshd systemd-networkd nginx nixpi-bun openvscode-server radicale
systemctl is-active microvm@minecraft.service
ip addr show nazar-private
```

From a configured sshuttle laptop:

```bash
systemctl status nazar-sshuttle
getent hosts nazar.studio nixpi.nazar.studio code.nazar.studio dav.nazar.studio
curl -I http://nazar.studio/
curl -I http://nixpi.nazar.studio/
curl -I http://code.nazar.studio/
git ls-remote https://codeberg.org/NazarStudio/Nazar.git
```

## Constraints

- Do not commit secrets or private SSH keys.
- Add only trusted client public SSH keys to `nix/users/alex-public-ssh-keys.nix`.
- Keep root SSH disabled.
- Keep public SSH key-only and `alex`-only because it is the sshuttle control endpoint.
- Keep DAV, NixPi, and Code private unless there is an explicit hardening decision.
- Keep Git hosting on Codeberg; do not reintroduce a host Git server without an explicit architecture decision.
- Treat sshuttle over OpenSSH as the canonical private access path.
- The host owns MicroVM lifecycle; service subflakes under `services/` export service modules and do not own deployment.
- Use the host-built `switch-*` apps for service changes; do not add a second guest-local deployment path without an explicit architecture decision.
- Avoid new deploy frameworks or route abstractions while the fleet remains one host and one active MicroVM.
