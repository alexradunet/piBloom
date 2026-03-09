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
