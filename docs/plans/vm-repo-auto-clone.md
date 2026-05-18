# VM repo auto-clone plan

Status: superseded. Minecraft remains the only active service MicroVM; DAV is now a host service.

For active MicroVM services, guest repositories should be exposed through explicit virtiofs shares declared in `nix/fleet/vms.nix`, not through per-VM bootstrap variants.

## Canonical pattern for active MicroVMs

1. Add a per-service repo share to the VM's `microvm.shares` inventory entry.
2. Mount it at `/home/alex/<repo>` in the guest.
3. Keep ownership/mode in the same share declaration.
4. Let guest tooling initialize or repair the checkout when needed.
5. Validate in the guest if useful, commit and push the monorepo, then switch production from `/root/nazar` with the appropriate host app.

For DAV, edit and commit `services/dav-server` in the monorepo and run `nix run .#switch-dav-server`; it switches the host service, not a guest.

## Policy

Do not introduce separate clone/deploy-key logic for another VM runtime. Keep MicroVM repository shares limited to active MicroVMs.
