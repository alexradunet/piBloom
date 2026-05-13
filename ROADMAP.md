# nixpi Roadmap

## v1 — Rebrand and package

- [x] Rename package, CLI, docs, UI, and environment variables to `nixpi` / `NIXPI_*`.
- [x] Add a Nix flake package and reusable NixOS service module.
- [ ] Publish the rebranded repo to Forgejo as `nazar/nixpi`.

## v2 — Nazar fleet integration

- [ ] Install and run NixPi on the `nazar` host.
- [ ] Install and run NixPi in each MicroVM as the VM-local Pi web interface.
- [ ] Expose all NixPi endpoints only over WireGuard/private DNS through host nginx.
- [ ] Document validation, rollback, and authority boundaries in Nazar runbooks.

## v3 — OwnLoom/base-agent integration

- [ ] Use NixPi as the shared Pi operator surface for OwnLoom development and personal workflows.
- [ ] Add optional OwnLoom-aware context shortcuts without changing the underlying Pi RPC contract.
- [ ] Keep autonomous host/fleet changes behind explicit human review.

## v4 — Future agent core

- [ ] Evaluate OpenClaw/Hermes-like orchestration patterns on top of the existing Pi RPC bridge.
- [ ] Add authenticated multi-user/private-team mode if WireGuard-only trust becomes insufficient.
- [ ] Add a plugin/extension boundary for future tools without bloating the core RPC bridge.
