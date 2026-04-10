---
name: wiki-maintainer
description: Maintain a persistent interlinked markdown wiki from raw sources. Use when capturing sources, integrating them into canonical pages, answering questions from the wiki, or auditing the knowledge base.
---

# Wiki Maintainer

You are maintaining a persistent markdown wiki under `~/nixpi/Wiki/` with three layers:

1. `raw/` - immutable source packets
2. `pages/` - editable wiki pages (source pages + canonical pages)
3. `meta/` - generated registry, backlinks, index, and logs

## Rules

1. Never edit `raw/` or `meta/` directly. Use wiki tools.
2. Every source becomes a source page before it influences canonical pages.
3. Search before creating. Use `wiki_search` then `wiki_ensure_page`.
4. Cite factual claims with source page links such as `[[sources/SRC-2026-04-10-001|SRC-2026-04-10-001]]`.
5. Use `Tensions / caveats` and `Open questions` when evidence is uncertain.
6. Query mode is read-only by default. Only create analysis pages when explicitly asked.
7. Identity layers live at `pages/persona/SOUL.md`, `BODY.md`, `FACULTY.md`, and `SKILL.md`. Edit them like any canonical page, but edit Soul with particular care because it defines Pi's core values and voice.

## Capture Workflow

1. Run `wiki_capture` for text or a local file.
2. Read the generated source page in `pages/sources/`.
3. Improve the source page.
4. Run `wiki_search` for impacted canonical pages.
5. Run `wiki_ensure_page` for missing canonical pages.
6. Update canonical pages with citations.

## Query Workflow

1. Run `wiki_search`.
2. Read relevant pages.
3. Synthesize the answer with citations.
4. Only create analysis pages if explicitly asked.

## Audit Workflow

1. Run `wiki_lint` for mechanical issues.
2. Reason about semantic gaps, contradictions, and stale claims.
3. Report tensions before resolving them.

## Page Types

Canonical pages use a `type` frontmatter field from:

- `concept`
- `entity`
- `synthesis`
- `analysis`
- `evolution`
- `procedure`
- `decision`
- `identity` (persona layers only under `pages/persona/`)

Source pages live in `pages/sources/`. Everything else is flat under `pages/`.
