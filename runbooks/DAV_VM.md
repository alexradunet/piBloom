# DAV VM Runbook

`dav` is the private personal data VM for Nazar.

- VM: `dav`
- DNS: `dav.nazar.studio`
- NAT IP: `10.10.10.41`
- State: `/persist/microvms/dav`
- Guest data: `/var/lib/dav`, `/var/lib/radicale/collections`
- Services: nginx WebDAV at `/files/`, Radicale CalDAV/CardDAV at `/radicale/`

Initial posture: NetBird/private-only. Do not expose publicly without an explicit hardening pass.

Build/deploy:

```bash
nix build .#dav-qcow2
nix run .#deploy-dav
```
