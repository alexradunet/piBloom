# Minecraft MicroVM guest module

Canonical runtime: Nazar MicroVM only.

The module in this directory is intentionally service-only. The `/root/nazar` fleet baseline composes hardware-free MicroVM settings, networking, virtiofs persistence, lifecycle, and deploy policy around it.

Important paths:

- Service state: `/var/lib/minecraft` from the `minecraft-state` virtiofs share.
- Monorepo checkout: `/home/alex/nazar` from the `minecraft-repo` virtiofs share.
- Service workspace: `/home/alex/nazar/services/minecraft`.

Validate service changes in the guest with `nix flake check --no-build` from the service workspace, then commit and push from the monorepo root. Production switching happens from `/root/nazar` with `nix flake check --no-build` and `nix run .#switch-minecraft`.
