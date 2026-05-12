# minecraft

Nazar-owned PaperMC Minecraft VM code/config repository.

This repository owns the VM 110 NixOS host/image modules, PaperMC service module, and canonical Minecraft runbook. The `/root/nazar` repository remains the fleet orchestrator and still owns VMID/IP/MAC/DNS/resources, deploy-rs apps, host-side Proxmox forwarding, NetBird/firewall policy, and secrets policy.

## Exports

- `nixosModules.minecraft` — installed VM host module
- `nixosModules.minecraft-image` — qcow2 image module
- `nixosModules.minecraft-service` — PaperMC service module
- `nixosModules.minecraft-web` — nginx/static website for `mc.nazar.studio`
- `nixosModules.minecraft-disko` — optional disko layout

## Integration contract

Production evaluation is done by `/root/nazar`. Nazar imports these modules with shared common VM modules and `specialArgs` containing `vm`, `fleet`, and `inputs`. This repo intentionally does not export production `nixosConfigurations` or deploy-rs nodes.

## VM-local Pi workflow

Day-to-day changes should be made from the VM once repo access is provisioned:

```bash
ssh alex@minecraft
nazar-vm-repo-bootstrap
cd ~/minecraft
pi
nix flake check --no-build
# commit and push to Forgejo
```

Direct VM-local `nixos-rebuild switch` is not the canonical production path. A future `nazar-deploy-self` command may be added, but it must be a restricted trigger for the matching Nazar deploy action.

Nazar remains the deployment orchestrator:

```bash
cd /root/nazar
nix flake lock --update-input minecraft
nix run .#deploy-minecraft
```

## Validate

```bash
nix flake show
nix flake check --no-build
```

Production builds and deploys are run from `/root/nazar`.
