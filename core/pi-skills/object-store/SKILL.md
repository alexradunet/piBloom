---
name: object-store
description: Create, update, query, read, search, and link durable memory objects in ~/Bloom/Objects/
---

# Object Store Skill

Use this skill when the user wants to create, update, query, read, search, or link any type of durable object in Bloom's object store.

## Storage Model

Every durable object is a Markdown file with YAML frontmatter stored in a flat directory:
```
~/Bloom/Objects/{slug}.md
```

The type lives in frontmatter, not in the directory structure.

### Core frontmatter fields

- `type`: object type (e.g. `task`, `note`, `evolution`)
- `slug`: kebab-case unique identifier
- `title`: human-readable name
- `summary`: short retrieval-oriented synopsis
- `origin`: `pi` for AI-created, `user` for human-created
- `created`: ISO timestamp (set automatically)
- `modified`: ISO timestamp (updated automatically)
- `scope`: `global`, `host`, `project`, `room`, or `agent`
- `confidence`: `low`, `medium`, or `high`
- `status`: `active`, `stale`, `superseded`, or `archived`
- `salience`: retrieval weight hint from `0.0` to `1.0`
- `last_accessed`: last read timestamp
- `last_confirmed`: last confirmation timestamp
- `tags`: comma-separated labels
- `links`: references to related objects in `type/slug` format

### Object types

| Type | Purpose |
|------|---------|
| `task` | Actionable items with status and priority |
| `note` | Reference notes, permanent records |
| `evolution` | Proposed system changes |
| *(custom)* | Any type the user or agent defines |

## Available Tools

### Object Tools

- `memory_create` — Create a new object with type, slug, and fields.
- `memory_update` — Update fields or body for an existing object.
- `memory_upsert` — Create or update an object in one call.
- `memory_read` — Read an object by type and slug.
- `memory_query` — Rank objects by text, tags, scope, status, and links.
- `memory_list` — List objects, filtered by type or frontmatter fields.
- `memory_search` — Search objects by content pattern.
- `memory_link` — Create bidirectional links between objects.

### Bloom Directory Tools

- `garden_status` — Show Bloom directory location, file counts, and blueprint state.
- `/bloom init` — Initialize or re-initialize the Bloom directory.
- `/bloom update-blueprints` — Apply pending blueprint updates from package.

### Episode Tools

- `episode_create` — Capture a raw observation under `~/Bloom/Episodes/`.
- `episode_list` — List stored episodes.
- `episode_promote` — Promote an episode into a durable object.
- `episode_consolidate` — Propose or apply conservative promotions from recent episodes.

## When to Use Each Tool

| Situation | Tool |
|-----------|------|
| User mentions something new durable to track | `memory_create` |
| Existing durable memory needs correction | `memory_update` |
| Unsure whether durable memory already exists | `memory_upsert` |
| User asks about a specific item | `memory_read` |
| User wants the most relevant durable memory | `memory_query` |
| User wants to see items of a type | `memory_list` |
| User remembers content but not the name | `memory_search` |
| Two objects are related | `memory_link` |

## Behavior Guidelines

- Always set `title` when creating objects.
- Prefer `memory_update` or `memory_upsert` when an object may already exist.
- Use `memory_query` before broad `memory_search` when metadata can narrow the candidate set.
- Use `episode_create` for raw observations first when confidence is uncertain.
- Use `episode_consolidate` to review high-signal recent episodes before bulk promotion.
- Promote only durable, reusable knowledge into `~/Bloom/Objects/`.
- After search, offer to read matched objects.
- Use link proactively when connections are mentioned.
- The Bloom directory is accessible via dufs WebDAV — files may be edited externally.
