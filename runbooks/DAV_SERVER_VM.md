# DAV Server MicroVM runbook

Canonical runtime: Nazar MicroVM only. The DAV Server is managed as part of the declarative Nazar MicroVM fleet.

## Identity

- Fleet entry: `nix/fleet/vms.nix` -> `vms.dav-server`
- Hostname: `dav-server`
- IP: `10.10.10.41`
- DNS: `dav.nazar.studio`
- Private access: sshuttle to `10.44.0.1`, then host nginx proxies to the MicroVM

## Switch

```bash
cd /root/nazar
nix flake check --no-build
nix run .#switch-dav-server
```

For service-repo updates:

```bash
nix flake lock --update-input dav-server
nix flake check --no-build
nix run .#switch-dav-server
```

## Lifecycle

```bash
systemctl status microvm@dav-server
systemctl restart microvm@dav-server
journalctl -u microvm@dav-server -f
```

## Persistence

Persistent shares are declared in `nix/fleet/vms.nix`:

- `/persist/microvms/dav-server/data` -> `/var/lib/dav-server`
- `/persist/microvms/dav-server/radicale` -> `/var/lib/radicale/collections`
- `/persist/microvms/dav-server/ssh` -> guest SSH host keys

## Checks

```bash
ssh alex@dav-server systemctl status nginx radicale --no-pager
curl -I http://dav.nazar.studio/files/
curl -I http://dav.nazar.studio/radicale/
```

## Policy

No alternate VM implementation is supported. Keep DAV Server lifecycle, networking, and persistence declarative in the Nazar MicroVM fleet.
