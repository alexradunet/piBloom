# Memory Model

> How NixPI stores and promotes memory

## Audience

Maintainers changing memory tools, storage rules, or retrieval behavior.

## Why NixPI Uses A Wiki

NixPI memory is intentionally file-based and page-first.

The goal is to keep memory:

- Inspectable by humans
- Editable without special tooling
- Lightweight enough for a minimal host footprint
- Explicit about evidence, synthesis, and uncertainty

## How The Memory Layers Work

NixPI stores long-term memory under `~/nixpi/Wiki/` in three layers:

- `raw/` for immutable source packets captured from text, files, or other raw inputs
- `pages/` for editable wiki pages
- `meta/` for generated registry, backlinks, index, and event logs

### Working Memory

Short-term continuity lives in `~/.pi/nixpi-context.json` and normal Pi session compaction.

Use this for:

- Current conversational continuity
- Recent task state
- Compacted session context

Do not treat working memory as canonical long-term truth.

### Source Packets

Source packets live under `~/nixpi/Wiki/raw/SRC-YYYY-MM-DD-NNN/`.

Use source packets for:

- Raw observations
- Imported notes or files
- Immutable evidence snapshots
- Material that still needs synthesis

Each source packet gets a paired source page under `~/nixpi/Wiki/pages/sources/`.

### Canonical Wiki Pages

Canonical pages live under `~/nixpi/Wiki/pages/*.md`.

Use canonical pages for:

- Stable facts and concepts
- Confirmed preferences and procedures
- Decisions and open questions
- Evolutions and analyses

Canonical pages are the long-term knowledge layer. They should reference sources explicitly via `source_ids` and wiki links.

## Integration Rules

Integration is the process of turning captured sources into canonical wiki pages.

Integrate only when the information is:

- Explicit rather than inferred
- Durable rather than transient
- Useful beyond the immediate turn
- High-confidence or directly confirmed

Poor promotion candidates:

- Speculation
- Transient moods
- One-off troubleshooting noise
- Weakly inferred personal facts
- Incomplete ideas with no durable value

## Reference

### Source Page Fields

- `type: source`
- `source_id`
- `title`
- `status`
- `captured_at`
- `origin_type`
- `origin_value`
- `source_ids`

### Canonical Page Fields

- `type`
- `title`
- `aliases`
- `tags`
- `status`
- `updated`
- `source_ids`
- `summary`

### Canonical Page Types

- `concept`
- `entity`
- `synthesis`
- `analysis`
- `evolution`
- `procedure`
- `decision`

### Current Memory Transitions

1. `wiki_capture`
2. Edit and enrich the generated source page
3. `wiki_search`
4. `wiki_ensure_page`
5. `wiki_lint`

### Current Non-Goals

- SQLite
- Vector databases
- External memory services
- Automatic per-turn transcript logging
- Compaction summaries as canonical long-term memory

## Related

- [Wiki memory design spec](../superpowers/specs/2026-04-10-nixpi-wiki-memory-design)
- [Reference](./)
