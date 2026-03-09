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
