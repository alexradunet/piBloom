# DAV Server runbook

Canonical Nazar runtime: host service on `nazar`. The service module remains reusable, but production no longer runs a DAV MicroVM.

## Ownership

- Orchestrator repo: `/root/nazar`
- Service repo: `/home/alex/repos/dav-server`
- Host module: `nazar/nix/modules/host/dav-server.nix`
- Private endpoint: `dav.nazar.studio` through sshuttle
- Host NixPi route: `http://nixpi.nazar.studio/` through sshuttle; select host/service workspaces there.

## State and persistence

Nazar reuses the former guest state roots directly on the host:

- DAV state root: `/persist/microvms/dav-server/data`
- WebDAV files: `/persist/microvms/dav-server/data/webdav`
- Radicale collections: `/persist/microvms/dav-server/radicale`
- Basic-auth file: `/persist/microvms/dav-server/data/secrets/dav-server-htpasswd`

## Deploy

Validate service-only edits locally:

```bash
cd /home/alex/repos/dav-server
nix flake check --no-build
git status
# commit and push durable changes
```

Switch production from the Nazar host after updating the `dav-server` input:

```bash
cd /root/nazar
nix flake lock --update-input dav-server
nix flake check --no-build
nix run .#switch-dav-server
```

## Lifecycle

Lifecycle is managed by the Nazar host:

```bash
systemctl status nginx radicale
journalctl -u nginx -u radicale -f
```

If a stale DAV guest is still running after migration work, stop it from the host:

```bash
systemctl stop microvm@dav-server.service microvm-virtiofsd@dav-server.service
```

## Service checks

```bash
systemctl is-active nginx radicale
curl -I http://dav.nazar.studio/files/
curl -I http://dav.nazar.studio/radicale/
```

## Policy

- Keep DAV private through Nazar's sshuttle/host-nginx access model.
- Keep host firewall/private routing in `/root/nazar` only.
- Keep mutable DAV/Radicale state in the host paths listed above.
- Do not reintroduce a DAV MicroVM without a new isolation decision.
