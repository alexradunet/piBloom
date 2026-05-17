# DAV Server legacy MicroVM guest module

Canonical Nazar runtime is now a host service. This directory remains as a legacy service-only MicroVM guest module alias for compatibility and local experiments; production does not compose it into the active Nazar fleet.

The reusable service behavior lives in `nix/modules/dav-server.nix`. Production switching happens from `/root/nazar` with `nix flake lock --update-input dav-server`, `nix flake check --no-build`, and `nix run .#switch-dav-server`.
