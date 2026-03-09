# Markdown Conventions

Rules for all `.md` files: documentation, skills, design docs, and agent instructions.

## Rules

1. **No fluff or filler.** Technical prose only. No "In this document, we will..." — just start.
2. **No emojis** unless they serve a functional purpose (e.g., severity indicators in reports: a defined legend).
3. **Heading hierarchy**: `#` for title (one per file), `##` for major sections, `###` for subsections. Never skip levels.
4. **Fenced code blocks** with language specifier: ` ```typescript `, ` ```bash `, ` ```yaml `, ` ```ini `. Never use indented code blocks.
5. **Tables for structured data.** If you're listing 3+ items with multiple attributes, use a table, not prose.
6. **Links over repetition.** Reference other docs with relative links rather than restating their content.
7. **One blank line** between sections. No multiple blank lines.
8. **Line width**: Wrap prose at ~120 characters for readability in terminals and diffs.

### Skills (SKILL.md)
9. **YAML frontmatter required**: `name` and `description` fields.
10. **Conversational guidance, not code.** Skills tell Pi how to interact with the user, not how to write code.
11. **Step-specific sections** with clear instructions per step.
12. **Prerequisite checks** documented at the top.

### Design Docs (docs/plans/)
13. **Date-prefixed filename**: `YYYY-MM-DD-topic-design.md` or `YYYY-MM-DD-topic-impl.md`.
14. **Immutable after implementation.** Design docs are historical records. Don't update them to match code changes — the code is the source of truth.

### Agent/Contributor Instructions (CLAUDE.md, ARCHITECTURE.md, AGENTS.md)
15. **These are living docs.** Update when conventions change.
16. **Imperative tone.** "Use X", "Never do Y", not "You should consider using X".

## Patterns

```markdown
---
name: first-boot
description: Guided first-boot setup wizard
---

# First-Boot Setup

## Prerequisite

If `~/.bloom/.setup-complete` exists, setup is done. Skip this skill entirely.

## Step-Specific Notes

### welcome
Start by calling `setup_status()`, then introduce yourself.
```

## Anti-patterns

```markdown
<!-- Bad: filler prose -->
## Introduction
In this document, we will explore the various aspects of the Bloom system...

<!-- Bad: no language specifier -->
` ` `
const x = 5;
` ` `

<!-- Bad: skipped heading level -->
# Title
### Subsection (skipped ##)

<!-- Bad: indented code block -->
    const x = 5;
```
