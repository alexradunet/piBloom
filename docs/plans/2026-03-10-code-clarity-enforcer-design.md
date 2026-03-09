# Code Clarity Enforcer — Codebase Overseer Redesign

## Summary

Redesign the `code-clarity-enforcer` agent from a post-change TypeScript reviewer into a **codebase-wide quality overseer** that enforces clarity, compactness, and convention compliance across all file types.

## Principles

1. **Small footprint** — every file justifies its existence. Prefer fewer, well-documented files. Move external docs into code (JSDoc, inline comments, frontmatter).
2. **Self-documenting code** — code reads like prose. If you need a separate doc to explain what code does, the code isn't clear enough.
3. **Convention compliance** — pi-mono patterns embedded via `docs/conventions/` reference files.
4. **Fix + ask** — auto-fix clear violations, flag subjective calls for discussion.
5. **Tests exempt** — size/footprint rules do not apply to test files.

## Convention Files

Location: `docs/conventions/`

| File | Covers |
|------|--------|
| `general.md` | Cross-cutting: naming philosophy, no emojis, comment style, self-documenting code, file size limits, footprint rules, import organization principles |
| `typescript.md` | Strict mode, ES2022/NodeNext, Biome formatting, JSDoc patterns, const preference, type patterns, discriminated unions, error handling, .js import extensions, type-only imports |
| `shell.md` | `set -euo pipefail`, quoting, error handling, function naming, variable naming |
| `containers.md` | Containerfiles, podman (never docker), Quadlet units (bloom-{name}), systemd units, bloom.network, health checks, multi-stage builds |
| `markdown.md` | Docs, skills (SKILL.md frontmatter), prose style, heading hierarchy, fenced code blocks with language specifiers |
| `config.md` | YAML, TOML, JSON, GitHub Actions: consistent quoting, key ordering, comment conventions |

Each file follows the same template:

```
# {Domain} Conventions
## Rules (numbered, enforceable)
## Patterns (examples of correct code)
## Anti-patterns (examples of what NOT to do)
```

## Agent Architecture — Tiered Parallel Dispatch

```
code-clarity-enforcer (coordinator)
+-- Reads docs/conventions/*.md into context
+-- Scans repo file tree (glob patterns per tier)
+-- Dispatches parallel sub-agents:
|   +-- TS/JS review agent     -> general.md + typescript.md
|   +-- Shell review agent     -> general.md + shell.md
|   +-- Container review agent -> general.md + containers.md
|   +-- Markdown review agent  -> general.md + markdown.md
|   +-- Config review agent    -> general.md + config.md
+-- Each sub-agent:
|   +-- Reads its assigned files
|   +-- Auto-fixes clear violations
|   +-- Flags judgment calls (with reasoning)
|   +-- Returns structured report
+-- Coordinator merges reports -> unified output
```

Sub-agents work on non-overlapping file sets (no conflicts). They run in the main worktree to write fixes directly.

## Output Format

```
## Codebase Clarity Report

### Footprint Summary
- Total files: N
- Files over 200 lines: [list]
- Redundant docs flagged: [list]

### Auto-Fixed
- [file:line] description of fix

### Needs Discussion
- [file:line] subjective issue -- reasoning + suggestion

### Clean
- [count] files passed all checks
```

## Footprint Enforcement Rules

### File-level (tests exempt)
- Flag source files over 200 lines — suggest splitting
- Flag files with more than 10 exports — doing too much
- Flag files under 10 lines that could be merged into a neighbor
- Flag empty or near-empty types.ts files — delete or merge

### Codebase-level
- Flag external docs that duplicate what JSDoc/inline comments already say
- Flag barrel files (index.ts) that re-export everything — should be selective
- Flag dead code (unused exports, unreachable branches)

### Documentation migration direction
- API docs -> JSDoc on the export
- Architecture notes -> module-level comment at top of file
- "How this works" docs -> inline comments in the code
- Skills/persona -> stay as markdown (product content, not code docs)
- Design docs in docs/plans/ -> stay (historical records)

### What stays as external docs
- CLAUDE.md, ARCHITECTURE.md, AGENTS.md — agent/contributor instructions
- docs/conventions/ — the rules themselves
- docs/plans/ — historical design records
- Skills and persona markdown — product content

## Agent Prompt Structure

File: `.claude/agents/code-clarity-enforcer.md`

Frontmatter: `model: opus`, `memory: project`

Prompt sections (in order):
1. **Identity** — codebase overseer, brief and authoritative
2. **Convention references** — lists each docs/conventions/*.md, instructions to read before starting
3. **Dispatch instructions** — scan file tree, group by tier, spawn sub-agents with right convention files
4. **Fix + Ask behavior** — clear rules for auto-fix vs. flag
5. **Footprint rules** — compactness enforcement (embedded, short enough for prompt)
6. **Report format** — unified output template
7. **Memory instructions** — what to record across runs

What the prompt does NOT contain:
- Actual conventions (live in docs/conventions/)
- File lists (discovered dynamically via glob)
- Biome/TSC rules (enforced by tooling, not the agent)

The agent complements `npm run check` — Biome handles formatting, TSC handles types, the agent handles meaning, clarity, and architecture.

## File Tier Assignments

| Tier | Review depth | File types |
|------|-------------|------------|
| Tier 1 (full review) | All rules + footprint | TypeScript, Shell scripts, Containerfiles, Markdown/Skills |
| Tier 2 (structure check) | Convention + structure | YAML, TOML, JSON, Quadlet/systemd units, GitHub Actions |
| Tier 3 (light touch) | Basic conventions only | HTML, Python, justfile |
