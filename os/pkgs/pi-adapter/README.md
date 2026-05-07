# ownloom PI Adapter

Thin PI harness adapter for ownloom.

PI remains the only shipped ownloom agent today, but this package should stay small and adapter-specific. Shared behavior belongs in `ownloom-*` CLIs and Markdown/context files, not here.

## Contents

- `extension/index.ts` — PI entrypoint, session hooks, `/ownloom` command, and the thin planner registered tool wrapper.
- `extension/wiki/` — PI-specific wiki registered-tool UX and session hooks, delegating to the shared `ownloom-wiki` API.

## Compatibility

The registered planner tool is exposed as `ownloom_planner`. It shells out to `ownloom-planner`.

## Design rules

- Keep PI code as adapter glue only.
- Prefer shared CLIs: `ownloom-context`, `ownloom-planner`, and `ownloom-wiki`. Removed operational CLIs have been replaced by skills in `os/skills/`.
- Critical safety/allowlist logic belongs in config (sudoers, systemd units), not in wrapper CLIs or PI hooks.
- Registered PI tools are UX affordances and should be thin wrappers over shared interfaces.
- Do not add new PI-only operational behavior unless a CLI would be awkward or impossible.
