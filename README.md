# dav-server

DAV Server service module for Nazar's private personal info and data service.

This repository owns the reusable Radicale/WebDAV service module. The `/root/nazar` repository remains the production orchestrator and owns host lifecycle, private DNS policy, nginx exposure, Git server, and secrets policy.

## Exports

- `nixosModules.dav-server-service` — Radicale/WebDAV service module
- `nixosModules.dav-server-microvm` / `nixosModules.dav-server` / `default` — legacy service-only MicroVM guest module aliases

## Integration contract

Production evaluation is done by `/root/nazar`. Nazar currently runs DAV as a host service by importing `nixosModules.dav-server-service` and passing a DAV service context. The host binds DAV only to the private `dav.nazar.studio` listener and reuses the former guest state roots under `/persist/microvms/dav-server/`.

This repo owns service behavior only. Host networking, private access, secrets policy, and deployment remain in Nazar.

## Development workflow

Use a local checkout for edits and validation:

```bash
cd /home/alex/repos/dav-server
nix flake check --no-build
# commit and push to the Git server
```

Production switching is host-driven from Nazar after updating the service input:

```bash
cd /root/nazar
nix flake lock --update-input dav-server
nix flake check --no-build
nix run .#switch-dav-server
```
