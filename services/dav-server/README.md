# dav-server

DAV Server service module for Nazar's private personal info and data service.

This directory owns the reusable Radicale/WebDAV service module. The monorepo root remains the production orchestrator and owns host lifecycle, private DNS policy, nginx exposure, Git server, and secrets policy.

## Exports

- `nixosModules.dav-server-service` — Radicale/WebDAV service module
- `nixosModules.dav-server-microvm` / `nixosModules.dav-server` / `default` — legacy service-only MicroVM guest module aliases

## Integration contract

Production evaluation is done by the Nazar monorepo root (`/root/nazar` on the host). Nazar currently runs DAV as a host service by importing `nixosModules.dav-server-service` and passing a DAV service context. The host binds DAV only to the private `dav.nazar.studio` listener and reuses the former guest state roots under `/persist/microvms/dav-server/`.

This subflake owns service behavior only. Host networking, private access, secrets policy, and deployment remain in Nazar.

## Development workflow

Use the monorepo checkout for edits and validation:

```bash
cd /home/alex/repos/nazar/services/dav-server
nix flake check --no-build
# commit from the monorepo root
```

Production switching is host-driven from Nazar after committing the monorepo change:

```bash
cd /root/nazar
nix flake check --no-build
nix run .#switch-dav-server
```
