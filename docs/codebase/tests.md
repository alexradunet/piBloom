# Tests

> Test layout and coverage intent

## Suite map

Use the test tree by risk level:

- `tests/lib/` for small reusable helpers
- `tests/extensions/` for tool behavior and extension wiring
- `tests/chat-server/` for the local chat HTTP surface and session lifecycle
- `tests/integration/` for cross-module behavior
- `tests/e2e/` for thin end-to-end registration checks
- `tests/nixos/` for VM-backed system behavior

## Cleanup rule

Prefer tests that protect behavior over tests that mirror structure. When cleanup collapses files or helpers, update tests to keep asserting the user-visible behavior instead of preserving old module boundaries.

### Integration Tests (`tests/integration/`)

| File | Coverage Area |
|------|---------------|
| `frontmatter-roundtrip.test.ts` | Markdown metadata roundtrips |
| `guardrails.test.ts` | Guardrail policy behavior |
| `nixpi-seeding.test.ts` | Seeded NixPI content and defaults |
| `object-lifecycle.test.ts` | Object create/update/read |
| `persona-guardrails.test.ts` | Persona integration |
| `pi-ui-parity-guard.test.ts` | UI consistency |

### Chat Runtime Tests (`tests/chat-server/`)

| File | Coverage Area |
|------|---------------|
| `server.test.ts` | HTTP contract, NDJSON streaming, and reset endpoint |
| `session.test.ts` | Session creation, reuse, and eviction |
| `setup.test.ts` | Setup wizard Netbird-only payload and prefill auto-apply |

### E2E Tests (`tests/e2e/`)

| File | Coverage Area |
|------|---------------|
| `extension-registration.test.ts` | Full extension loading |

### NixOS Tests (`tests/nixos/`)

| Test | Purpose | Check Name |
|------|---------|------------|
| `smoke-chat` | Built-in local chat service | `checks.x86_64-linux.nixos-smoke` |
| `smoke-broker` | Broker service | `checks.x86_64-linux.nixos-smoke` |
| `smoke-firstboot` | Firstboot readiness | `checks.x86_64-linux.nixos-smoke` |
| `nixpi-firstboot` | Full firstboot | `checks.x86_64-linux.nixos-full` |
| `nixpi-network` | Network config | `checks.x86_64-linux.nixos-full` |
| `nixpi-e2e` | End-to-end | `checks.x86_64-linux.nixos-full` |
| `nixpi-security` | Security model | `checks.x86_64-linux.nixos-full` |
| `nixpi-modular-services` | Services | `checks.x86_64-linux.nixos-full` |
| `nixpi-bootstrap-mode` | Bootstrap | `checks.x86_64-linux.nixos-full` |
| `nixpi-post-setup-lockdown` | Post-setup | `checks.x86_64-linux.nixos-full` |
| `nixpi-broker` | Broker | `checks.x86_64-linux.nixos-full` |
| `nixpi-installer-smoke` | Simplified installer smoke lane | `checks.x86_64-linux.nixos-destructive` |
| `nixpi-update` | Update flow | `checks.x86_64-linux.nixos-full` |
| `nixpi-options-validation` | Option assertions | `checks.x86_64-linux.nixos-full` |

### Test Helpers

| File | Purpose |
|------|---------|
| `mock-extension-api.ts` | Mock Pi extension API |
| `mock-extension-context.ts` | Mock extension context |
| `temp-nixpi.ts` | Temporary NixPI directory |

## Coverage Thresholds

From `vitest.config.ts`:

| Area | Lines | Functions | Branches | Statements |
|------|-------|-----------|----------|------------|
| `core/lib/` | 72% | 77% | 57% | 69% |
| `core/pi/extensions/` | 60% | 60% | 50% | 60% |

## Running Tests

### All Tests
```bash
npm run test
```

### CI Gate
```bash
npm run test:ci
```
Runs the Vitest suites, coverage, and the NixOS smoke lane.

### By Suite
```bash
npm run test:unit          # lib, extensions, chat-server
npm run test:integration   # integration/
npm run test:e2e          # e2e/
```

### With Coverage
```bash
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

### NixOS Tests
```bash
npm run test:system:smoke      # PR-oriented VM subset
npm run test:system:full       # Comprehensive VM lane
npm run test:system:destructive # Long-running/manual lane
just check-nixos-smoke       # Smoke tests
just check-nixos-full        # Full suite
just check-nixos-destructive # Long-running tests
```

---

## Adding Tests

### Unit Test Pattern

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../../core/lib/my-module";

describe("myModule", () => {
  it("should do something", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });
});
```

### Integration Test Pattern

```typescript
import { describe, it, expect } from "vitest";
import { createTempNixPi } from "../helpers/temp-nixpi.js";

describe("feature integration", () => {
  it("should work end to end", () => {
    const env = createTempNixPi();
    env.cleanup();
  });
});
```

### Test Naming Conventions

- Descriptive: `describe("component")` + `it("should behavior when condition")`
- Group related tests in describe blocks
- Use `beforeEach`/`afterEach` for setup/teardown

---

## Related

- [Core Library](./core-lib) - Tested library code
- [Pi Extensions](./pi-extensions) - Tested extensions
- [Daemon](./daemon) - Tested daemon code
