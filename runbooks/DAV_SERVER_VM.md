# DAV Server runbook

Canonical runtime: host service on `nazar`. DAV is private-only and served by host nginx on `dav.nazar.studio`; there is no DAV MicroVM in the active fleet.

## Identity

- Host module: `nix/modules/host/dav-server.nix`
- Service module source: `services/dav-server` via `inputs.dav-server.nixosModules.dav-server-service`
- DNS: `dav.nazar.studio`
- Private access: sshuttle to `10.44.0.1`, then host nginx serves DAV directly on the private listener
- State roots reused from the former guest:
  - `/persist/microvms/dav-server/data`
  - `/persist/microvms/dav-server/radicale`

## Switch

```bash
cd /root/nazar
nix flake check --no-build
nix run .#switch-dav-server
```

For DAV service updates, edit and commit `services/dav-server` in this monorepo, then switch:

```bash
nix flake check --no-build
nix run .#switch-dav-server
```

`switch-dav-server` switches the host configuration. It does not restart a DAV MicroVM.

## Lifecycle

```bash
systemctl status nginx radicale
journalctl -u nginx -u radicale -f
```

If the old guest is still running after a migration or rollback test, stop it from the host:

```bash
systemctl stop microvm@dav-server.service microvm-virtiofsd@dav-server.service
```

## Persistence

DAV state is host-mounted directly:

- `/persist/microvms/dav-server/data` -> DAV state root
- `/persist/microvms/dav-server/data/webdav` -> WebDAV file root
- `/persist/microvms/dav-server/radicale` -> Radicale collections
- `/persist/microvms/dav-server/data/secrets/dav-server-htpasswd` -> basic-auth file, provisioned outside git

## Checks

```bash
systemctl is-active nginx radicale
curl -I http://dav.nazar.studio/files/
curl -I http://dav.nazar.studio/radicale/
curl -I --resolve dav.nazar.studio:80:10.44.0.1 http://dav.nazar.studio/files/
```

## Policy

Keep DAV private through sshuttle/host nginx unless there is an explicit hardening decision. Do not reintroduce a DAV MicroVM without a new isolation decision.
