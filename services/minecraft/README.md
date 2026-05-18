# minecraft

Nazar-owned PaperMC Minecraft MicroVM service subflake.

This directory owns the Minecraft service modules used by the canonical Nazar MicroVM fleet. The monorepo root remains the fleet orchestrator and owns MicroVM lifecycle, IDs, IP/MAC/DNS/resources, host forwarding/firewall policy, host switch apps, and secrets policy.

## Exports

- `nixosModules.minecraft-service` — PaperMC service module
- `nixosModules.minecraft-web` — nginx/static website for `mc.nazar.studio`
- `nixosModules.minecraft-microvm` / `nixosModules.minecraft` / `default` — service-only MicroVM guest module

## Integration contract

Production evaluation is done by the Nazar monorepo root (`/root/nazar` on the host). Nazar composes this service module with the shared MicroVM guest baseline and `specialArgs` containing `vm`, `fleet`, and `inputs`. This subflake defines only MicroVM service modules.

## VM-local Pi workflow

Use the guest for editing and validation only:

```bash
ssh alex@minecraft
nazar-vm-repo-bootstrap
cd ~/nazar/services/minecraft
pi
nix flake check --no-build
# commit and push from ~/nazar
```

Production switching is host-driven from Nazar after committing the monorepo change:

```bash
cd /root/nazar
nix flake check --no-build
nix run .#switch-minecraft
```
