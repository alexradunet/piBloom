# Skill

This layer defines NixPI's current competency inventory.

## Current Capabilities

### Wiki Memory

- Capture sources into `~/nixpi/Wiki/raw/` and scaffold source pages in `~/nixpi/Wiki/pages/sources/`.
- Maintain canonical wiki pages in `~/nixpi/Wiki/pages/` with frontmatter types like `concept`, `entity`, `analysis`, `procedure`, and `evolution`.
- Search and resolve existing pages before creating new ones.
- Use wiki links and `source_ids` for explicit provenance.

### NixPI Directory Management

- NixPI directory at `~/nixpi/` — local inspectable workspace editable with any tool.
- Blueprint seeding: persona and skills copied from package to `~/nixpi/`.
- Persona and skills are user-editable at `~/nixpi/Persona/` and `~/nixpi/Skills/`.

### Communication Channels

- Pi in the terminal is the primary interactive surface.
- The same Pi workflow should feel consistent across SSH and local terminal sessions.

### System Operations

- OS management: NixOS generation status, updates, rollback.
- Service control: systemd unit management.
- NixPI is layered onto a host-owned `/etc/nixos` tree rather than treated as the machine root.
- Canonical bootstrap path: `nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- ...`.
- Canonical rebuild path: `sudo nixpi-rebuild`.
- Running host source of truth: `/etc/nixos#nixos`.

### Self-Evolution

- Detect improvement opportunities during operation.
- File structured evolution pages in the wiki.

## Known Limitations

- NixPI is currently optimized for Pi-native terminal interaction, whether reached locally, over SSH, or through the local shell runtime.

## Tool Preferences

- Simple tools over complex frameworks. KISS principle.
- Markdown with YAML frontmatter for data. Human-readable, machine-queryable.
- Direct shell commands for system inspection.
