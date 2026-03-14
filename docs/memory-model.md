# Bloom Memory Model

Bloom uses a markdown-native memory system with two persistent layers:

- `~/Bloom/Objects/` for durable long-term memory
- `~/Bloom/Episodes/` for append-only episodic capture

This keeps memory inspectable, editable, and lightweight enough for Bloom's minimal OS footprint.

## Layers

### Working Memory

Short-term continuity lives in `~/.pi/bloom-context.json` and normal Pi session compaction.

Use this for:

- current conversational continuity
- recent task state
- compacted session context

Do not treat working memory as canonical long-term truth.

### Episodic Memory

Episodes are raw observations stored under `~/Bloom/Episodes/YYYY-MM-DD/*.md`.

Use episodes for:

- recent notable user statements
- tool outcomes worth revisiting
- decisions in progress
- troubleshooting observations
- raw material for later promotion

Episodes are cheap to write and should remain append-only.

### Durable Memory

Durable objects live in `~/Bloom/Objects/*.md`.

Use durable objects for:

- stable facts
- confirmed preferences
- reusable procedures
- explicit decisions
- projects and open threads

Durable objects are the canonical long-term memory store.

## Durable Object Schema

Each durable object is a markdown file with YAML frontmatter.

Required fields:

- `type`
- `slug`
- `title`
- `summary`
- `scope`
- `confidence`
- `status`
- `created`
- `modified`

Common optional fields:

- `scope_value`
- `tags`
- `links`
- `source`
- `salience`
- `last_accessed`
- `last_confirmed`

Common enums:

- `scope`: `global`, `host`, `project`, `room`, `agent`
- `confidence`: `low`, `medium`, `high`
- `status`: `active`, `stale`, `superseded`, `archived`

## Object Types

Current recommended durable types:

- `fact`
- `preference`
- `project`
- `decision`
- `procedure`
- `thread`
- `relationship`

## Promotion Rules

Promotion is the process of turning one or more episodes into durable objects.

Promotion should be conservative.

Auto-promote only when the information is:

- explicit rather than inferred
- durable rather than transient
- useful beyond the immediate turn
- high-confidence or directly confirmed

Good candidates for promotion:

- explicit user preferences
- stable user or host facts
- reusable recovery or operating procedures
- explicit decisions with rationale
- persistent project context

Poor candidates for promotion:

- speculation
- transient moods
- one-off troubleshooting noise
- weakly inferred personal facts
- incomplete ideas with no durable value

## Consolidation Flow

Bloom currently supports three memory transitions:

1. `episode_create`
   Capture a raw episode.
2. `episode_promote`
   Explicitly promote an episode into a durable object.
3. `episode_consolidate`
   Propose or apply conservative promotion candidates from recent episodes.

Consolidation should prefer `propose` first when behavior is uncertain.

## Scope Rules

Scope keeps memory relevant.

- `global`: broadly applicable memory
- `host`: tied to the current Bloom host
- `project`: tied to the current repository or project
- `room`: tied to a specific Matrix room
- `agent`: tied to a specific Bloom agent overlay

Use `scope_value` whenever scope needs a concrete identity.

Examples:

- `scope: project`, `scope_value: pi-bloom`
- `scope: room`, `scope_value: ops-room`

Bloom's ranking and session-start digest prefer more specific scope matches over generic global memory when enough context is available.

## Retrieval Model

Bloom retrieval is file-based and in-memory.

- metadata filters narrow candidates first
- content and summary matching score candidates second
- scope preference boosts room/project matches
- only compact digests are injected at session start
- full object bodies remain tool-accessible on demand

This avoids databases while keeping retrieval useful.

## Operational Guidance

Use episodes first when uncertain.

Use durable objects only for knowledge Bloom should keep and rely on later.

Prefer:

- `memory_update` when correcting an existing durable object
- `memory_upsert` when unsure whether the durable object already exists
- `memory_query` before broad text search when metadata can narrow the result set

When promoting or creating scoped memories, set `scope` intentionally and set `scope_value` whenever the scope refers to a specific project, room, host, or agent.

## Current Non-Goals

Bloom memory does not currently rely on:

- SQLite
- vector databases
- external memory services
- automatic per-turn transcript logging
- compaction summaries as canonical long-term memory

The source of truth remains markdown on disk.
