# Bloom OS v0.0.1 Simplification Design

**Date:** 2026-03-25
**Goal:** Clean up AI-accumulated complexity before making the repository public and releasing v0.0.1. No new features — remove dead code, flatten abstraction layers, make the codebase navigable by an external contributor.

---

## 1. Motivation

The codebase accumulated over-abstraction, speculative features, and inconsistent patterns during AI-assisted development. The specific problems:

- 4-layer TypeScript daemon call chain where 2 would suffice
- `activationScripts` used for logic that should be oneshot systemd services (and are now officially deprecated upstream, nixpkgs #475305)
- A circuit breaker state machine where exponential backoff would do
- A file-persisted interaction system that is unused in practice
- An identity function (`defineTool`) masquerading as an abstraction
- Monolithic shell scripts (1,111 + 813 lines) with scattered state files
- NixOS modules without `default.nix` aggregators, requiring callers to list every file
- matrix-js-sdk wrapped behind a contract interface with no alternative implementation
- No persistent `deviceId` or crypto store — new Matrix device registered on every daemon restart

---

## 2. TypeScript Daemon

### 2.1 Delete thin orchestration layers

**Delete `router.ts`** (166 lines) — inline its routing logic directly into `AgentSupervisor.handleEnvelope()`. The file contains 9 functions, the `RoomEnvelope` type, `classifySender`, `extractMentions`, and `RouteDecision` — all of which move into `agent-supervisor.ts`. The separation adds a call frame without enabling independent testability or reuse.

**Delete `multi-agent-runtime.ts`** — it is a 116-line wiring shell. Move all wiring to `main.ts` as a `bootstrap()` factory function. `main.ts` becomes the explicit composition root: the one place that calls `new` on external dependencies.

**Delete `lifecycle.ts` / `startWithRetry`** — subsumed by the new `withRetry` utility (Section 2.3). `lifecycle.ts` handles process-level reconnect; `withRetry` is more general and replaces it.

### 2.2 Flatten the Matrix bridge

**Delete `contracts/matrix.ts`** — it exports `MatrixBridge`, `MatrixIdentity`, and `MatrixTextEvent`. No alternative implementation exists or is planned. After deletion:
- `MatrixBridge` is replaced by the existing `MatrixBridgeLike` interface already in `agent-supervisor.ts` (keep it, rename to `MatrixClient` for clarity)
- `MatrixIdentity` moves to a new `core/lib/types.ts` (shared domain types with no dependencies)
- `MatrixTextEvent` is inlined at its call site or also moved to `types.ts`

**Use the matrix-js-sdk client directly**, injected as a constructor argument to `AgentSupervisor` for testability. Import as `import * as sdk from "matrix-js-sdk"` — never mix named and default imports from different paths (known bundler issue, GitHub #4597).

**Fix daemon startup sequence:**
1. Call `await client.initRustCrypto({ storePath })` before `startClient()` — replaces deprecated `initCrypto()`. Use `@matrix-org/matrix-sdk-crypto-nodejs` as the crypto store backend (Node.js compatible, no browser APIs).
2. Implement session restore per identity: for each `MatrixIdentity` in `options.identities`, check `/var/lib/bloom-matrix/<agentId>/session.json` for a saved `{ userId, deviceId, accessToken }`. If present, pass `deviceId` and `accessToken` to `createClient()` to restore the session. If absent (first run or new agent), perform a fresh login and write the result to that agent's `session.json`.
3. Wait for `ClientEvent.Sync` state `"PREPARED"` before processing any messages — avoids acting on stale history during initial sync.

**Handle Matrix 429 rate limiting:** read `err.data?.retry_after_ms` and use it as the delay floor in `shouldRetry`.

### 2.3 Replace circuit breaker with retry

**Delete `rate-limiter.ts`** circuit breaker state machine (closed/open/half-open, 139 lines).

**Replace with `withRetry<T>(fn, opts)`** utility (~40 lines) in `core/lib/retry.ts`:

```typescript
async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>

interface RetryOptions {
  maxRetries?: number;      // default: 5
  baseDelayMs?: number;     // default: 1000
  maxDelayMs?: number;      // default: 30_000
  jitter?: boolean;         // default: true — ±50% jitter to prevent thundering herd
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  onError?: () => Promise<void>; // teardown hook called before each retry (e.g., runtime.stop())
}
```

Delay formula: `min(baseMs * 2^attempt, maxDelayMs) * (0.5 + random() * 0.5)`

`shouldRetry` must filter out non-retryable errors: 4xx HTTP responses, auth failures, validation errors. Only retry transient errors (5xx, ETIMEDOUT, ECONNREFUSED, 429). For 429, use `err.data?.retry_after_ms` as the delay if present.

`retry.ts` has no dependencies and is trivially testable in isolation.

### 2.4 Merge room state into AgentSupervisor

**Delete `room-state.ts`** as a standalone module. The `RoomState` interface exposes internal `Map` structures, forcing consumers to know key formats and TTL semantics — a leaky abstraction.

Move the three maps (`processedEvents`, `rootReplies`, `lastReplyAtByRoomAgent`) directly into `AgentSupervisor` as private fields. Keep the TTL pruning logic as private methods. No public interface exposes the map structure.

### 2.5 Split and simplify `core/lib/shared.ts`

Split the 441-line file into focused modules. Full symbol assignment:

| Target file | Symbols |
|---|---|
| `core/lib/logging.ts` | `createLogger()` |
| `core/lib/validation.ts` | `guardServiceName()` |
| `core/lib/interactions.ts` | `InteractionRecord`, `requestInteraction`, `resolveInteractionReply`, `formatResumeMessage`, `getPendingInteractions`, `requireConfirmation`, `requestSelection`, `requestTextInput` |
| `core/lib/types.ts` | `MatrixIdentity`, `MatrixTextEvent` (both moved from `contracts/matrix.ts`), shared domain types |
| `core/lib/utils.ts` | `truncate()`, `errorResult()`, `nowIso()` |

**Simplify the interaction system:** drop file-based persistence. The `InteractionStore` currently writes JSON to disk with schema validation, token deduplication, and record trimming. In practice, extensions use `ctx.ui` directly when UI is available. Replace with a simple in-memory `Map<token, InteractionRecord>` scoped to the daemon session. Remove `InteractionRecordSchema` TypeBox validation and `getStorePath` file discovery logic.

### 2.6 Delete `defineTool()`

`core/lib/extension-tools.ts` exports an identity function with zero runtime value:

```typescript
export function defineTool(tool: RegisteredExtensionTool): RegisteredExtensionTool {
  return tool;
}
```

Delete the file. Replace all call sites (across 5 extension files, ~21 total occurrences) with plain object literals passed directly to `registerTools()`.

### 2.7 Result: daemon file count

| Before | After |
|---|---|
| `multi-agent-runtime.ts` (116L) | deleted |
| `router.ts` (166L) | deleted, inlined into `agent-supervisor.ts` |
| `rate-limiter.ts` (139L) | deleted |
| `room-state.ts` (129L) | deleted, inlined into `agent-supervisor.ts` |
| `lifecycle.ts` | deleted, subsumed by `retry.ts` |
| `contracts/matrix.ts` | deleted |
| `matrix-js-sdk-bridge.ts` (221L) | slimmed (~80L, no contract) |
| `shared.ts` (441L) | split into 5 focused files |
| `extension-tools.ts` (22L) | deleted |
| — | `retry.ts` (~40L, new) |
| — | `types.ts` (~30L, new) |
| `agent-supervisor.ts` (364L) | grows to ~480L — single routing authority |

Call depth: 4 layers → 2 layers (`AgentSupervisor` → SDK client).

---

## 3. NixOS Configuration

### 3.1 Eliminate all activationScripts

`system.activationScripts` is officially deprecated upstream (nixpkgs #475305, Dec 2025). Three modules currently use it (`desktop-xfce.nix`, `app.nix`, `shell.nix`). Replace all usages:

| Current use | Replacement |
|---|---|
| Directory creation | `systemd.tmpfiles.rules` — e.g., `"d /var/lib/nixpi 0750 nixpi nixpi -"` |
| First-boot setup | `Type=oneshot` systemd service with sentinel |
| System markers | Written by the oneshot service `ExecStartPost` on success |
| Password file cleanup | `ExecStartPost` on the relevant service |

### 3.2 First-boot services: sentinel pattern

Replace firstboot activation scripts with a `Type=oneshot` systemd service chain:

```nix
systemd.services.bloom-firstboot = {
  description = "Bloom OS first-boot initialization";
  wantedBy = [ "multi-user.target" ];
  unitConfig.ConditionPathExists = "!/var/lib/nixpi/.initialized";
  serviceConfig = {
    Type = "oneshot";
    RemainAfterExit = true;
    ExecStart = "${script}";
    ExecStartPost = "${pkgs.coreutils}/bin/touch /var/lib/nixpi/.initialized";
  };
};
```

**Key decisions:**
- Use `ConditionPathExists=!/var/lib/nixpi/.initialized` (not `ConditionFirstBoot` — not yet a NixOS first-class option, nixpkgs #293112)
- Sentinel written in `ExecStartPost` — only on success, so failed runs retry on next boot
- `RemainAfterExit=true` keeps the unit `active (exited)` so dependents can see it
- `wantedBy = [ "multi-user.target" ]` throughout

### 3.3 Consolidate state directory

Replace scattered state files with a single canonical directory:

```
/var/lib/nixpi/
  .initialized          ← sentinel: first-boot complete
  state/
    setup-phase         ← current wizard phase (replaces WIZARD_STATE)
    bootstrap-status    ← replaces BOOTSTRAP_UPGRADE_STATUS_FILE
```

Remove `LEGACY_SETUP_STATE`. Declare the directory via `systemd.tmpfiles.rules`.

### 3.4 Split firstboot.nix

Split `core/os/modules/firstboot.nix` (430 lines, mixes 4 concerns) into:

| File | Concern | Est. lines |
|---|---|---|
| `firstboot/default.nix` | Imports aggregator | ~10 |
| `firstboot/options.nix` | Option declarations | ~40 |
| `firstboot/users.nix` | Password handling, user creation | ~80 |
| `firstboot/repo.nix` | Git repo setup and validation | ~70 |
| `firstboot/marker.nix` | Sentinel service, system-ready marker | ~50 |

**Delete the `bootstrapAction` factory.** It creates multiple wrappers with identical guard logic (`if [ -f "${systemReadyFile}" ]; then exit 1; fi`). Inline the guard into the 2-3 scripts that need it.

### 3.5 Prune options.nix

Narrow scope: remove only options that are **obviously dead** — options with no override in any host file and no consumer in any module. Do not attempt a full audit pre-release. Walk `core/os/modules/options.nix` and grep for each option name across the codebase; remove those with zero hits outside their declaration.

Split surviving options so each feature area's `options.nix` is co-located with its `service.nix` rather than all options living in a single 413-line file.

### 3.6 Module layout: default.nix aggregators

Add `default.nix` aggregators at each module directory level so callers use `./modules` not a file list:

```
core/os/modules/
  default.nix           ← imports all sibling modules
  firstboot/
    default.nix         ← imports options, users, repo, marker
    options.nix
    users.nix
    repo.nix
    marker.nix
  broker/
    default.nix
    options.nix
    service.nix
  ...
```

### 3.7 Flake cleanup

- Add `specialArgs = { inherit inputs; }` to `nixosSystem` call — removes import gymnastics from individual modules
- Ensure `inputs.nixpkgs.follows` is set on all secondary inputs
- Verify `flake.lock` is committed and intentionally pinned
- All new `.nix` files must be `git add`-ed before evaluation

---

## 4. Shell Scripts

### 4.1 Split setup-wizard.sh

Split `core/scripts/setup-wizard.sh` (1,111 lines) into phase scripts, each sourcing `setup-lib.sh`:

| File | Phase | Responsibility |
|---|---|---|
| `wizard-identity.sh` | Identity | Username, password, SSH key collection |
| `wizard-matrix.sh` | Matrix | Homeserver configuration, account creation |
| `wizard-repo.sh` | Repository | Git setup, branch validation, remote configuration |
| `wizard-promote.sh` | Promote | Appliance promotion, final system configuration |
| `setup-lib.sh` | (shared) | Validation utilities, UI helpers, state management |

The orchestrator (`setup-wizard.sh` becomes ~80 lines) sources each phase script and calls phase functions in order, using the consolidated state directory for checkpointing.

### 4.2 Remove duplicated validation

`setup-wizard.sh` and `firstboot.nix` both define stack readiness checks (`has_runtime_stack`, `has_matrix_stack`). The NixOS module is the authoritative source. Remove the duplicated shell implementations and have scripts query systemd unit state directly (`systemctl is-active`).

---

## 5. What We Are Not Changing

To keep release risk contained:

- **`netbird-provisioner.nix`** — complex but self-contained and working
- **`broker.nix`** — well-designed privilege escalation, no changes
- **Extension business logic** — functional correctness is not in question
- **Matrix seen-event deduplication** — solves a real problem, keep it (move inside `AgentSupervisor`)
- **Agent registry and frontmatter parsing** — sound design, leave it
- **`proactive.ts`** — leave job collection separation for now

---

## 6. Success Criteria

- [ ] No `activationScripts` in any NixOS module (`desktop-xfce.nix`, `app.nix`, `shell.nix` migrated)
- [ ] `router.ts`, `multi-agent-runtime.ts`, `rate-limiter.ts`, `room-state.ts`, `lifecycle.ts`, `contracts/matrix.ts`, `extension-tools.ts` deleted
- [ ] `shared.ts` replaced by `logging.ts`, `validation.ts`, `interactions.ts`, `types.ts`, `utils.ts`
- [ ] `withRetry` in place of circuit breaker, with Matrix 429 `retry_after_ms` handling
- [ ] Session restore implemented: `deviceId` + `accessToken` persisted to `/var/lib/bloom-matrix/session.json`
- [ ] `initRustCrypto({ storePath })` called before `startClient()`
- [ ] `ClientEvent.Sync` `"PREPARED"` gate before processing messages
- [ ] `firstboot.nix` split into 4 focused files under `firstboot/`
- [ ] Single state directory `/var/lib/nixpi/state/` with no legacy state files
- [ ] `default.nix` aggregators at all module directory levels
- [ ] `setup-wizard.sh` split into 4 phase scripts + slim orchestrator (~80L)
- [ ] `flake.nix` has `specialArgs` and all inputs follow nixpkgs
- [ ] Repository builds cleanly: `nix flake check` passes
- [ ] Obviously dead NixOS options removed from `options.nix`
- [ ] `defineTool` removed from all ~21 call sites across 5 extension files
