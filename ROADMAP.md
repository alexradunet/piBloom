# nixpi Roadmap

## v1 — Rebrand and package

- [x] Rename package, CLI, docs, UI, and environment variables to `nixpi` / `NIXPI_*`.
- [x] Add a Nix flake package and reusable NixOS service module.
- [x] Publish the rebranded repo to the Git server as `nazar/nixpi`.

## v2 — Nazar fleet integration

- [x] Install and run NixPi on the `nazar` host.
- [x] Install and run NixPi in each MicroVM as the VM-local Pi web interface.
- [x] Expose NixPi through `/nixpi/` on existing WireGuard-private service domains.
- [x] Keep dedicated `nixpi*.nazar.studio` private DNS routes for direct access.
- [x] Document validation, rollback, and authority boundaries in Nazar runbooks.

## v3 — Personal workflow/base-agent integration

- [ ] Use NixPi as the shared Pi operator surface for Nazar development and personal workflows.
- [ ] Add optional personal-workflow context shortcuts without changing the underlying Pi RPC contract.
- [ ] Keep autonomous host/fleet changes behind explicit human review.

## v4 — Future agent core

- [ ] Evaluate OpenClaw/Hermes-like orchestration patterns on top of the existing Pi RPC bridge.
- [ ] Add authenticated multi-user/private-team mode if WireGuard-only trust becomes insufficient.
- [ ] Add a plugin/extension boundary for future tools without bloating the core RPC bridge.
