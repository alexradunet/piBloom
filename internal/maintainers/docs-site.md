# Docs Site Maintenance

This note replaces the old maintainer-only material that used to live under `docs/`.

## Scope

Keep `docs/` limited to published documentation:

- overview and install guides
- operator workflows
- architecture and reference pages

Do not store planning drafts, speculative design notes, or implementation plans in `docs/`.

## Public docs structure

- `docs/index.md`, `docs/why-nixpi.md`, `docs/install.md` — public entry points
- `docs/getting-started/` — onboarding path
- `docs/operations/` — deployment and operator procedures
- `docs/architecture/` — system boundaries and runtime flows
- `docs/reference/` — canonical technical reference

## Maintenance rules

1. Keep one canonical page per topic.
2. Prefer current-state docs over future-state docs.
3. Remove duplicate mirrors instead of keeping multiple versions.
4. Keep VitePress nav and sidebar links aligned with real pages.
5. Run `npm run docs:build` after doc changes.
