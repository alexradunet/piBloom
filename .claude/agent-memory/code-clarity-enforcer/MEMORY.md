# Code Clarity Enforcer Memory

## Recurring Violations

- **Empty/stub types.ts files**: 4 extensions have stub types.ts with only `export {};`: bloom-setup, bloom-repo, bloom-services, bloom-objects.
- **Thin barrel files**: bloom-channels/actions.ts is a 4-line re-export passthrough.
- **Oversized files**: bloom-channels/matrix-client.ts (307 lines), bloom-services/service-io.ts (257 lines), bloom-dev/index.ts (242 lines).

## Post-Migration Stale References (2026-03-11)

Major migration moved Matrix/NetBird from containers to OS infrastructure. Unix socket channel architecture fully retired. Many docs still reference old patterns:

### Critical stale references (active docs that mislead agents):
- CLAUDE.md Key Paths table: channels.sock
- AGENTS.md: service_pair tool, bloom-channels Unix socket desc, bloom-element Podman, lib/services.ts
- README.md: Unix socket IPC, bloom-element
- docs/channel-protocol.md: entire file is dead
- docs/service-architecture.md: bloom-element container, Unix socket diagram, Matrix as Podman
- services/_template/: entire template implements retired socket architecture
- skills/first-boot, service-management, recovery: service_pair and channels.sock refs
- services/matrix/SKILL.md: service_pair references
- docs/pibloom-setup.md: bloom-element, service_pair
- services/README.md: element service listed
- ARCHITECTURE.md: references lib/services.ts (now split)
- .claude/agents/bloom-live-tester.md: lemonade, channels.sock refs
- docs/quick_deploy.md: Sway/Wayland references (removed from OS)

### What replaced the old architecture:
- bloom-channels uses matrix-bot-sdk directly (matrix-client.ts)
- Matrix (Continuwuity) is native systemd service in os/Containerfile
- Cinny served by nginx (static files)
- External bridges via bridge_create/remove/status tools

## Resolved Issues (from previous audit)

- lib/services.ts barrel: was split into services-catalog, services-install, services-manifest, services-validation
- bloom-services/actions.ts (760 lines): was split into actions-apply, actions-bridges, etc.
- bloom-display extension: removed entirely
- build-iso.sh shebang: fixed to #!/usr/bin/env bash
- bloom-greeting.sh: now uses [[ ]] correctly

## CI/Workflow Notes

- build-os.yml uses docker/login-action@v3 (docker reference despite podman convention)

## Last Audit

- Date: 2026-03-11
- Files reviewed: ~80
- Auto-fixes applied: 0 (report-only run)
- Critical stale references: 11 documentation items
- Important issues: 10
- Minor issues: 7
