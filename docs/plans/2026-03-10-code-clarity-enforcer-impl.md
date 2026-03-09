# Code Clarity Enforcer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the code-clarity-enforcer agent as a codebase-wide quality overseer with convention files per domain and tiered parallel dispatch.

**Architecture:** Create 6 convention reference files in `docs/conventions/`, then rewrite the agent prompt to act as a coordinator that dispatches parallel sub-agents per file-type tier. Each sub-agent reads its convention files and reviews its assigned files.

**Tech Stack:** Claude agent markdown, Biome (existing), pi-mono conventions (embedded)

---

### Task 1: Create `docs/conventions/general.md`

**Files:**
- Create: `docs/conventions/general.md`

**Step 1: Write the convention file**

```markdown
# General Conventions

Cross-cutting rules that apply to every file type in the Bloom codebase.

## Rules

1. **No emojis** in code, comments, commit messages, or documentation. Technical prose only.
2. **Naming philosophy**: names are self-documenting. If you need a comment to explain what a variable holds, rename it.
3. **Files justify their existence.** Every file has a single clear responsibility. If a file is under 10 lines, merge it into a neighbor. If over 200 lines (tests exempt), split it.
4. **No more than 10 exports per file** (tests exempt). More than 10 means the file is doing too much.
5. **Dead code is deleted.** No commented-out code, no unused exports, no unreachable branches.
6. **Comments explain WHY, not WHAT.** The code tells you what it does. Comments explain non-obvious decisions, constraints, or trade-offs.
7. **Self-documenting over external docs.** API docs belong in JSDoc. Architecture notes belong in module-level comments. "How this works" belongs inline. Don't maintain a separate doc that restates what code already says.
8. **Import organization** (all languages that support imports):
   - Group 1: Standard library / built-in
   - Group 2: External dependencies
   - Group 3: Internal (absolute paths)
   - Group 4: Relative (local)
   - Blank line between groups
9. **Consistent casing per domain:**
   - Files: kebab-case (`bloom-audit`, `shared.ts`, `bloom-greeting.sh`)
   - Types/interfaces: PascalCase (`ExtensionAPI`, `ServiceManifest`)
   - Functions/variables: camelCase (`createLogger`, `guardBloom`)
   - Constants: UPPER_SNAKE_CASE (`DEFAULT_EDITOR_KEYBINDINGS`, `PI_CODING_AGENT_VERSION`)
   - Environment variables: UPPER_SNAKE_CASE (`BLOOM_DIR`, `WIFI_SSID`)
   - systemd/Quadlet units: kebab-case with `bloom-` prefix (`bloom-lemonade.container`)
10. **No magic values.** Named constants for numbers, strings, and regex patterns that aren't immediately obvious.
11. **Early returns** to reduce nesting. Guard clauses at the top of functions.
12. **Error messages are specific.** Include what went wrong, what was expected, and what was received.
13. **No barrel re-exports of everything.** Index files export selectively and intentionally.

## Patterns

```typescript
// Good: self-documenting name, no comment needed
const maxAuditRetentionDays = 30;

// Good: comment explains WHY
// NetBird requires CAP_NET_ADMIN at the system level, not in a container
RUN systemctl enable netbird

// Good: early return guard
export function guardBloom(name: string): string | null {
	if (!/^bloom-[a-z0-9][a-z0-9-]*$/.test(name)) {
		return `Security error: name must match bloom-[a-z0-9-]+, got "${name}"`;
	}
	return null;
}
```

## Anti-patterns

```typescript
// Bad: comment restates the code
// Set x to 5
const x = 5;

// Bad: magic number
if (entries.length > 500) { ... }

// Bad: deeply nested
if (a) {
	if (b) {
		if (c) {
			doThing();
		}
	}
}

// Bad: barrel re-export of everything
export * from "./actions.js";
export * from "./types.js";
export * from "./helpers.js";
```

## Footprint Rules

- Source files over 200 lines: flag for splitting (tests exempt)
- Files with more than 10 exports: flag as doing too much (tests exempt)
- Files under 10 lines: flag for merging into neighbor
- Empty or near-empty `types.ts`: delete or merge into parent module
- External docs that duplicate JSDoc/inline comments: flag for deletion
- Dead code (unused exports, unreachable branches): flag for removal
```

**Step 2: Commit**

```bash
git add docs/conventions/general.md
git commit -m "docs: add general conventions reference for code-clarity-enforcer"
```

---

### Task 2: Create `docs/conventions/typescript.md`

**Files:**
- Create: `docs/conventions/typescript.md`

**Step 1: Write the convention file**

```markdown
# TypeScript Conventions

Rules for all `.ts` and `.js` files in the Bloom codebase. Supplements the general conventions.

## Rules

1. **Strict mode always.** `"strict": true` in tsconfig. No `@ts-ignore` without a justification comment.
2. **ES2022 + NodeNext.** Target ES2022, use NodeNext module resolution.
3. **Biome formatting.** Tabs, double quotes, 120 line width, LF line endings, semicolons always. Never add eslint, prettier, or other formatters.
4. **`const` by default.** Use `let` only when reassignment is required. Never use `var`.
5. **`import type` for type-only imports.** Separate type imports from value imports.
6. **`.js` extensions in import paths.** ESM convention: `import { foo } from "./bar.js"`.
7. **No inline/dynamic imports.** Always use top-level static imports. No `await import()`.
8. **Avoid `any`.** Use `unknown` + type narrowing. `any` triggers a Biome warning — if unavoidable, add a justification comment. Tests are exempt.
9. **Discriminated unions** for known variant sets. Use `type` or `role` field as discriminant.
10. **JSDoc on every export:**
    - Functions: description + `@param` + `@returns` (add `@example` for non-obvious usage)
    - Types/interfaces: description of purpose
    - Constants: brief description
    - Module-level: top-of-file comment explaining what the module does and why it exists
11. **Pure lib/ functions.** No side effects, no global state, no I/O at module level. Functions take inputs, return outputs. Testable without mocks.
12. **Extension structure:**
    - `index.ts`: wiring only (Pi SDK registration). No business logic. No `if` doing domain work.
    - `actions.ts`: orchestrates lib/ calls, formats results for Pi. Side effects happen here.
    - `types.ts`: extension-specific interfaces. Shared types go in lib/.
13. **Error handling:** Throw with specific messages including what failed and what was expected. Validation functions return error strings or null (not booleans).
14. **No `console.log` in production code.** Use `createLogger()` from `lib/shared.ts`. Tests are exempt.

## Patterns

```typescript
/**
 * bloom-audit — Tool-call audit trail with 30-day retention.
 *
 * @tools audit_review
 * @hooks session_start, tool_call, tool_result
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { sanitize } from "../../lib/audit.js";
import { appendAudit, ensureAuditDir, handleAuditReview, rotateAudit } from "./actions.js";

export default function (pi: ExtensionAPI) {
	// wiring only — no business logic here
	pi.on("session_start", (_event, ctx) => { ... });
	pi.registerTool({ ... });
}
```

```typescript
/** Validate that a service name matches the bloom naming convention. Returns error message or null. */
export function guardBloom(name: string): string | null {
	if (!/^bloom-[a-z0-9][a-z0-9-]*$/.test(name)) {
		return `Security error: name must match bloom-[a-z0-9-]+, got "${name}"`;
	}
	return null;
}
```

## Anti-patterns

```typescript
// Bad: logic in index.ts
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event) => {
		const sanitized = event.input.replace(/password=\S+/g, "***"); // business logic!
		fs.appendFileSync(logPath, sanitized); // I/O in index!
	});
}

// Bad: no JSDoc on export
export function truncate(text: string): string { ... }

// Bad: dynamic import
const { foo } = await import("./bar.js");

// Bad: any without justification
function process(data: any) { ... }
```
```

**Step 2: Commit**

```bash
git add docs/conventions/typescript.md
git commit -m "docs: add TypeScript conventions reference for code-clarity-enforcer"
```

---

### Task 3: Create `docs/conventions/shell.md`

**Files:**
- Create: `docs/conventions/shell.md`

**Step 1: Write the convention file**

```markdown
# Shell Conventions

Rules for all `.sh` files and inline shell in Containerfiles, systemd units, and GitHub Actions.

## Rules

1. **Shebang**: `#!/usr/bin/env bash` for standalone scripts. No `#!/bin/sh` unless POSIX-only is required.
2. **Strict mode**: `set -euo pipefail` immediately after the shebang. Every script, no exceptions.
3. **Quoting**: Double-quote all variable expansions (`"$VAR"`, `"${VAR}"`). Only skip quotes for intentional word splitting (rare, add comment explaining why).
4. **Variable naming**:
   - Local variables: `lower_snake_case`
   - Environment variables / constants: `UPPER_SNAKE_CASE`
   - Function names: `lower_snake_case`
5. **No backtick substitution.** Use `$()` for command substitution. `$(...)` nests cleanly; backticks don't.
6. **Error messages to stderr.** `echo "Error: ..." >&2`. Never print errors to stdout.
7. **Use `[[ ]]` for conditionals**, not `[ ]`. Double brackets support regex, glob, and safer string comparison.
8. **Heredocs for multi-line output.** Use `cat <<EOF` or `cat <<'EOF'` (quoted to prevent expansion). Don't chain echo statements.
9. **No `eval`.** Blocked by guardrails. If you think you need eval, redesign.
10. **No pipe-to-shell.** `curl | bash` and `wget | sh` are blocked by guardrails.
11. **Idempotent operations.** Scripts may run multiple times. Use `mkdir -p`, check before creating, use `|| true` for non-fatal cleanup.
12. **One-line description comment** at the top of the script (after shebang and set).

## Patterns

```bash
#!/usr/bin/env bash
set -euo pipefail

# Bloom login script — ensures Pi settings include Bloom package.

BLOOM_PKG="/usr/local/share/bloom"
PI_SETTINGS="$HOME/.pi/agent/settings.json"

if [[ -d "$BLOOM_PKG" ]]; then
    mkdir -p "$(dirname "$PI_SETTINGS")"
    if [[ -f "$PI_SETTINGS" ]]; then
        # ... modify existing settings
    else
        cp "$BLOOM_PKG/.pi/agent/settings.json" "$PI_SETTINGS"
    fi
fi
```

## Anti-patterns

```bash
# Bad: no strict mode
#!/bin/bash
rm -rf $TEMPDIR

# Bad: unquoted variable (word splitting + globbing risk)
if [ -f $PI_SETTINGS ]; then

# Bad: backtick substitution
VERSION=`cat version.txt`

# Bad: error to stdout
echo "Error: file not found"

# Bad: eval
eval "$USER_INPUT"
```
```

**Step 2: Commit**

```bash
git add docs/conventions/shell.md
git commit -m "docs: add shell conventions reference for code-clarity-enforcer"
```

---

### Task 4: Create `docs/conventions/containers.md`

**Files:**
- Create: `docs/conventions/containers.md`

**Step 1: Write the convention file**

```markdown
# Container & systemd Conventions

Rules for Containerfiles, Quadlet units (.container, .volume, .network), systemd units (.service, .timer, .socket), and podman usage.

## Rules

### Containerfile
1. **Always `Containerfile`**, never `Dockerfile`. Always `podman`, never `docker`.
2. **Pin base images** with digest when stability matters: `FROM image@sha256:...`
3. **Group related RUN commands** to minimize layers. Separate groups with blank lines and a comment explaining the group's purpose.
4. **Clean package caches** in the same RUN that installs them: `&& dnf clean all && rm -rf /var/cache/...`
5. **Cache-friendly ordering**: dependencies (package.json, lock files) before source code. Source changes shouldn't invalidate dependency layers.
6. **ARG for versions**: Pin tool versions with ARG at the top of the relevant section. Makes updates visible and grep-able.
7. **LABEL at the end** (after all build steps, before final validation).
8. **Comments on non-obvious steps.** Each major section gets a one-line comment.

### Quadlet (.container, .volume, .network)
9. **Naming**: `bloom-{name}` for ContainerName, unit file, and volume.
10. **Network isolation**: Use `Network=bloom.network` unless the service specifically needs host networking (document why).
11. **Health checks required** on every container: `HealthCmd`, `HealthInterval`, `HealthRetries`, `HealthTimeout`, `HealthStartPeriod`.
12. **Resource limits**: Set `PodmanArgs=--memory=` appropriate to the service.
13. **Security**: `NoNewPrivileges=true`, `PodmanArgs=--security-opt label=disable` only when volume mounts require it.
14. **Restart policy**: `Restart=on-failure`, `RestartSec=10` minimum.
15. **Volumes for state**: Service data persists in named volumes, not bind mounts (unless sharing with host is required).

### systemd (.service, .timer, .socket)
16. **Unit naming**: `bloom-{name}.service`, consistent with Quadlet naming.
17. **Dependencies**: Use `After=` and `Wants=` to declare ordering. `network-online.target` for anything needing network.
18. **Restart policy**: `Restart=on-failure` with `RestartSec=` for services.
19. **User field**: Run as `pi` user, not root, unless elevated privileges are required (document why).

## Patterns

```ini
# Good: Quadlet container with all required fields
[Unit]
Description=Bloom dufs — WebDAV file server for home directory
After=network-online.target
Wants=network-online.target

[Container]
Image=docker.io/sigoden/dufs:latest
ContainerName=bloom-dufs
Network=host
Volume=%h:/data
PodmanArgs=--memory=128m
PodmanArgs=--security-opt label=disable
NoNewPrivileges=true
LogDriver=journald

[Service]
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
```

```dockerfile
# Good: Containerfile layer ordering
# Install deps first (cached unless package.json changes)
COPY package.json package-lock.json /app/
RUN cd /app && npm install

# Copy source (re-runs on changes, but deps are cached)
COPY . /app/
RUN cd /app && npm run build
```

## Anti-patterns

```dockerfile
# Bad: Dockerfile naming
# Bad: docker CLI usage
docker build -f Dockerfile ...

# Bad: no cache cleanup
RUN dnf install -y git curl wget

# Bad: source before deps (cache-busting)
COPY . /app/
RUN npm install && npm run build
```

```ini
# Bad: no health check
[Container]
Image=localhost/bloom-foo:latest
ContainerName=bloom-foo

# Bad: no restart policy
[Service]
ExecStart=/usr/bin/foo

# Bad: no memory limit
[Container]
PodmanArgs=--security-opt label=disable
```
```

**Step 2: Commit**

```bash
git add docs/conventions/containers.md
git commit -m "docs: add container and systemd conventions reference for code-clarity-enforcer"
```

---

### Task 5: Create `docs/conventions/markdown.md`

**Files:**
- Create: `docs/conventions/markdown.md`

**Step 1: Write the convention file**

```markdown
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
```
const x = 5;
```

<!-- Bad: skipped heading level -->
# Title
### Subsection (skipped ##)

<!-- Bad: indented code block -->
    const x = 5;
```
```

**Step 2: Commit**

```bash
git add docs/conventions/markdown.md
git commit -m "docs: add markdown conventions reference for code-clarity-enforcer"
```

---

### Task 6: Create `docs/conventions/config.md`

**Files:**
- Create: `docs/conventions/config.md`

**Step 1: Write the convention file**

```markdown
# Configuration File Conventions

Rules for YAML, TOML, JSON, justfile, and GitHub Actions workflows.

## Rules

### YAML (.yaml, .yml)
1. **2-space indentation.** No tabs in YAML.
2. **Quote strings that could be misinterpreted**: booleans (`"true"`), numbers-as-strings (`"3.0"`), empty strings (`""`). Unambiguous strings don't need quotes.
3. **Comments before blocks**, not inline. One-line comment explaining each top-level key or section.
4. **Consistent key ordering**: metadata keys first (version, name), then content keys alphabetically or by logical grouping.
5. **`.yaml` for project config, `.yml` for GitHub Actions** (GitHub convention).

### TOML (.toml)
6. **Section headers** (`[section]`) with a blank line before each.
7. **Comments for non-obvious values.** Especially build configuration and version pins.
8. **Inline tables** only for simple key-value pairs. Use full tables for anything with 3+ keys.

### JSON (.json)
9. **Machine-managed JSON** (package.json, tsconfig.json, biome.json): don't add comments or reformat beyond what the tool produces.
10. **Tab indentation** for Biome-managed JSON. Follow the formatter.
11. **No trailing commas** (JSON spec doesn't allow them).

### GitHub Actions (.yml in .github/workflows/)
12. **Explicit permissions block.** Always declare `permissions:` with minimum required.
13. **Pin action versions** with full tag: `actions/checkout@v4`, not `@main`.
14. **Cache dependencies** when available (`cache: "npm"` in setup-node).
15. **Steps mirror local workflow**: install, build, check, test. Same commands as `npm run build`, `npm run check`, `npm run test:coverage`.

### justfile
16. **One-line comment** above each recipe describing what it does.
17. **Variables at top** with `env()` defaults for overridable values.
18. **Guard recipes** (prefixed with `_`) for precondition checks.

## Patterns

```yaml
# Good: service catalog entry
services:
  lemonade:
    version: "0.1.0"
    category: ai
    image: ghcr.io/lemonade-sdk/lemonade-server:v9.4.1
    optional: false
    preflight:
      commands: [podman, systemctl]
```

```toml
# Good: clear section with comment
[customizations]
hostname = "bloom"

[[customizations.user]]
name = "pi"
groups = ["wheel"]
```

```yaml
# Good: GitHub Actions with permissions and caching
permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
```

## Anti-patterns

```yaml
# Bad: no permissions block in workflow
on: push
jobs:
  build:
    runs-on: ubuntu-latest

# Bad: unpinned action
- uses: actions/checkout@main

# Bad: inconsistent quoting
version: 0.1.0    # YAML reads as float
version: "0.1.0"  # correct: string
```
```

**Step 2: Commit**

```bash
git add docs/conventions/config.md
git commit -m "docs: add config file conventions reference for code-clarity-enforcer"
```

---

### Task 7: Rewrite `.claude/agents/code-clarity-enforcer.md`

**Files:**
- Modify: `.claude/agents/code-clarity-enforcer.md`

**Step 1: Replace the entire agent prompt**

Replace the full contents of `.claude/agents/code-clarity-enforcer.md` with the new overseer prompt. The prompt must include:

1. **Frontmatter**: name, description (updated to reflect overseer role), model: opus, memory: project
2. **Identity**: Codebase-wide quality overseer. Brief, authoritative.
3. **Convention references**: List each `docs/conventions/*.md` file. Instruct agent to read ALL of them before starting any review.
4. **Dispatch instructions**:
   - Scan file tree with glob patterns per tier
   - Tier 1 (full review): `**/*.ts` (not in tests/), `**/*.sh`, `**/Containerfile`, `**/*.md`
   - Tier 2 (structure check): `**/*.yaml`, `**/*.yml`, `**/*.toml`, `**/*.json`, `**/*.container`, `**/*.volume`, `**/*.network`, `**/*.service`, `**/*.timer`, `**/*.socket`
   - Tier 3 (light touch): `**/*.html`, `**/*.py`, `justfile`
   - Dispatch parallel sub-agents using the Agent tool:
     - TS/JS agent: reads `general.md` + `typescript.md`, reviews all `.ts` files
     - Shell agent: reads `general.md` + `shell.md`, reviews all `.sh` files
     - Container agent: reads `general.md` + `containers.md`, reviews Containerfiles + Quadlet + systemd units
     - Markdown agent: reads `general.md` + `markdown.md`, reviews all `.md` files
     - Config agent: reads `general.md` + `config.md`, reviews YAML + TOML + JSON + justfile + GitHub Actions
5. **Fix + Ask behavior**:
   - Auto-fix: missing JSDoc, wrong import order, unused imports, formatting issues, missing strict mode in shell, missing language specifiers in code blocks
   - Ask first: file splitting suggestions, module restructuring, merging small files, deleting external docs
6. **Footprint rules**: embedded directly (from general.md — the agent also has them for quick reference)
7. **Report format**: the unified Codebase Clarity Report template
8. **Memory instructions**: record recurring violations, codebase trends, files that keep failing

The description in frontmatter should be updated to cover all file types and mention the overseer/codebase-wide role. Include examples for: running a full codebase sweep, reviewing after a feature branch, auditing footprint.

**Step 2: Commit**

```bash
git add .claude/agents/code-clarity-enforcer.md
git commit -m "refactor: rewrite code-clarity-enforcer as codebase-wide quality overseer"
```

---

### Task 8: Update CLAUDE.md reference

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Check if CLAUDE.md references the old code-clarity-enforcer behavior**

Read CLAUDE.md and check for any references to the code-clarity-enforcer agent. If it mentions "recently changed code" or "post-change reviewer", update to reflect the new overseer role. Also add `docs/conventions/` to the Key Paths table if not already there.

**Step 2: Commit (if changes were needed)**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect code-clarity-enforcer overseer role"
```

---

### Task 9: Verify the full setup

**Step 1: Check all convention files exist and are well-formed**

```bash
ls -la docs/conventions/
```

Expected: `general.md`, `typescript.md`, `shell.md`, `containers.md`, `markdown.md`, `config.md`

**Step 2: Check the agent file is valid**

```bash
head -20 .claude/agents/code-clarity-enforcer.md
```

Expected: valid YAML frontmatter with updated description, `model: opus`, `memory: project`

**Step 3: Run biome check to ensure no formatting issues in any new files**

```bash
npm run check
```

Expected: PASS

**Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: address any formatting issues in convention files"
```
