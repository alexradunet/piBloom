# Core Library

> Shared TypeScript helpers used across daemon and extensions

## What lives here

Keep additions here narrow and shared. If logic is only used by one feature, prefer keeping it inside that feature module instead of growing `core/lib/`.

- `filesystem.ts` owns path resolution and NixPI directory conventions.
- `exec.ts` owns guarded subprocess execution.
- `frontmatter.ts` owns markdown frontmatter parsing/serialization.
- `matrix.ts` and `matrix-format.ts` own Matrix-specific helpers.
- `extension-tools.ts` owns small helpers for consistent tool registration/result shapes.
- `shared.ts` owns cross-cutting utilities that are genuinely reused.

## Cleanup rule

Before adding a new lib file or export, check:

1. Is it used by more than one subsystem?
2. Does it reduce duplication rather than move it?
3. Is it smaller than the coupling cost it introduces?

If the answer is no, keep it local to the caller.

**Responsibility**: Matrix client utilities and helpers.

**Key Exports**:
- `registerUser(homeserver, options)` - Register new Matrix user
- `loginUser(homeserver, credentials)` - Authenticate existing user
- `resolveRoomAlias(homeserver, alias)` - Get room ID from alias
- `ensureRoomJoined(client, roomId)` - Join room if not member

**Inbound Dependencies**:
- Daemon for Matrix authentication
- Setup extension for account creation
- Tests for Matrix integration

**Outbound Dependencies**:
- `matrix-js-sdk`

---

### `core/lib/matrix-format.ts`

**Responsibility**: Format messages for Matrix display.

**Key Exports**:
- `markdownToHtml(markdown)` - Convert markdown to Matrix HTML
- `formatCodeBlock(code, language)` - Format code for display
- `stripHtml(html)` - Remove HTML tags

**Inbound Dependencies**:
- Daemon for message formatting
- Extensions for tool output display

---

### `core/lib/frontmatter.ts`

**Responsibility**: Parse and generate YAML frontmatter.

**Key Exports**:
- `parseFrontmatter(content)` - Extract frontmatter from markdown
- `stringifyFrontmatter(data, content)` - Add frontmatter to content
- `FrontmatterData` - Type for frontmatter objects

**Used By**:
- Episode extension for episode files
- Object extension for durable objects
- AGENTS.md parsing for agent overlays

**Outbound Dependencies**:
- `js-yaml` for YAML parsing

---

### `core/lib/extension-tools.ts`

**Responsibility**: Common utilities for Pi extensions.

**Key Exports**:
- Tool definition helpers
- Context access utilities
- Response formatting helpers

**Inbound Dependencies**:
- All Pi extensions

---

### `core/lib/shared.ts`

**Responsibility**: Common types and constants used across the codebase.

**Key Exports**:
- `NIXPI_DIR` - Base directory constant (`~/nixpi`)
- `AGENT_STATE_DIR` - Service state directory (`/var/lib/nixpi`)
- Common type definitions
- Utility functions

---

## Related Tests

| Test File | Coverage |
|-----------|----------|
| `tests/lib/filesystem.test.ts` | Filesystem operations |
| `tests/lib/exec.test.ts` | Command execution with guardrails |
| `tests/lib/matrix.test.ts` | Matrix client utilities |
| `tests/lib/matrix-format.test.ts` | Message formatting |
| `tests/lib/setup.test.ts` | Setup state management |
| `tests/lib/shared.test.ts` | Shared utilities |

---

## Related

- [Pi Extensions](./pi-extensions) - Primary consumers of lib utilities
- [Daemon](./daemon) - Uses Matrix and filesystem utilities
- [Tests](./tests) - Test coverage details
