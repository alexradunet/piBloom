# Nazar live-source integration

NixPi is integrated into Nazar as a private, sshuttle-routed Pi web surface. The current Nazar deployment runs this repository as a live checkout on the host; this document describes that current shape only.

## Current production shape

- Source checkout: `/home/alex/repos/nixpi` on the `nazar` host.
- Host module: `nazar/nix/modules/host/nixpi.nix`.
- Runtime: Bun runs `server.js` directly from the live checkout.
- Backend bind: `127.0.0.1:4815`.
- Public exposure: none.
- Private route: host nginx serves `http://nixpi.nazar.studio/` on the sshuttle-routed private listener.
- Workspaces: host-local and SSH workspaces are generated from Nazar fleet data; VM work is reached through SSH into Pi agents, not by running per-VM NixPi HTTP services.

The reusable NixPi flake/module remains available in this repository, but current Nazar production does not consume it as a flake input. Do not change that architecture without an explicit deployment decision.

## Nazar constraints

- Private services stay behind sshuttle and host nginx on `10.44.0.1`.
- Do not publish public DNS or public HTTP for NixPi endpoints.
- The `nazar` host owns VM lifecycle, VMID/IP/MAC, NAT/firewall, and public exposure.
- NixPi runs centrally on the host; VM work is reached through configured workspaces rather than VM-local NixPi services.
- DAV data remains isolated in `dav-server`; NixPi should not co-locate DAV state or secrets.

## Routing

Canonical route:

- `nixpi.nazar.studio` -> host nginx private listener -> host NixPi service on `127.0.0.1:4815`.

Configured laptops get `/etc/hosts` entries from the Nazar laptop module so `nixpi.nazar.studio` resolves to `10.44.0.1` and is routed through sshuttle. Do not use `nazar.studio/nixpi/`; `nazar.studio` is the public static dashboard.

## Declarative exposure

Nazar keeps host HTTP exposure policy in `nix/fleet/exposure.nix`:

- `access = "private"` serves only on the sshuttle-routed private listener.
- `access = "public"` also serves on the host public IPv4 listener and opens public TCP/80.

VM private service domains come from `nix/fleet/vms.nix` `privateAccess`. Keep NixPi private unless a separate auth/hardening review happens.

## Security stance

NixPi is an operator surface: it can drive Pi tools as `alex` in configured workspaces. Until NixPi has service-level authentication and authorization, keep it available only through the trusted sshuttle private path.

## Validation checklist

From `/root/nazar` after changes to the host module or route policy:

```bash
nix flake check --no-build
nix run .#switch-host
```

From `/home/alex/repos/nixpi` after app changes:

```bash
node --check server.js
node --check public/app.js
node --check public/ds/topbar-actions.js
nix flake check --no-build
```

From the host:

```bash
systemctl is-active nixpi nginx
curl -I http://127.0.0.1:4815/
curl -I --resolve nixpi.nazar.studio:80:10.44.0.1 http://nixpi.nazar.studio/
```

From a configured sshuttle client:

```bash
getent hosts nixpi.nazar.studio
curl -I http://nixpi.nazar.studio/
```
