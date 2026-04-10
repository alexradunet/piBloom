# Persona Wiki Merge — Design Spec

**Date:** 2026-04-10
**Status:** Approved

## Goal

Move Pi's identity layers (Soul, Body, Faculty, Skill) from static package files into the wiki so that Pi can evolve its own persona through normal wiki workflows, without requiring a package commit.

## Motivation

The persona is currently frozen in `core/pi/persona/` and can only change via source code changes. The wiki already supports typed, editable, evolvable pages with search and registry metadata. Making persona pages first-class wiki citizens gives Pi an edit surface for its own identity.

## Type System

Add `"identity"` to the wiki page taxonomy in `core/pi/extensions/wiki/types.ts`:

- Added to both `PAGE_TYPES` and `CANONICAL_PAGE_TYPES`.
- `renderIndex` in `actions-meta.ts` gains an `Identity Pages` section.
- No change to `RegistryEntry` shape — identity pages use standard frontmatter fields.

Example frontmatter for a persona page:

```yaml
---
type: identity
title: Soul
status: active
summary: Core identity, values, voice, and boundaries
updated: 2026-04-10
---
```

## Page Location

Persona pages live at `{wikiRoot}/pages/persona/`:

```
pages/persona/SOUL.md
pages/persona/BODY.md
pages/persona/FACULTY.md
pages/persona/SKILL.md
```

## Runtime Loading

`loadPersona()` in `core/pi/extensions/persona/actions.ts` reads exclusively from `{wikiRoot}/pages/persona/`. The operator override path (`{nixpiDir}/Persona/`) and package fallback are removed.

**First-boot seeding:** If `pages/persona/SOUL.md` does not exist when the session starts, the persona extension copies the 4 static files from `core/pi/persona/` into the wiki, injecting `identity` frontmatter. After seeding, the wiki copy is the sole source of truth.

**Load order** is unchanged: Soul → Body → Faculty → Skill. Each file is read in full and assembled into the same `## Pi Persona` block prepended to the system prompt.

The static files in `core/pi/persona/` remain in the package as the canonical seed template but are not loaded at runtime after first boot.

## Evolution Workflow

No new tools are needed. Pi evolves persona layers through the standard wiki edit path:

1. Read the current `pages/persona/<layer>.md`.
2. Edit the page and update the `updated` frontmatter field.
3. `rebuildAllMeta` runs automatically, keeping the registry current.

The `wiki-maintainer` SKILL.md should note that `pages/persona/` pages are identity layers and that Soul in particular should be edited with care, but the mechanism is identical to any other canonical wiki page.

## Files Changed

| File | Change |
|------|--------|
| `core/pi/extensions/wiki/types.ts` | Add `"identity"` to `PAGE_TYPES` and `CANONICAL_PAGE_TYPES` |
| `core/pi/extensions/wiki/actions-meta.ts` | Add `Identity Pages` section to `renderIndex` |
| `core/pi/extensions/persona/actions.ts` | Rewrite `loadPersona()` to read from wiki; add first-boot seeding logic; remove operator override and package fallback |
| `core/pi/skills/wiki-maintainer/SKILL.md` | Note that `pages/persona/` contains identity layers |
| `core/pi/persona/SOUL.md` (et al.) | Unchanged content; no longer loaded at runtime after first boot |

## Out of Scope

- Merging the wiki digest and persona injection into a single pass (consolidation use case — deferred).
- Any new wiki tools or commands.
- Changes to the compaction summary or guardrails logic.
