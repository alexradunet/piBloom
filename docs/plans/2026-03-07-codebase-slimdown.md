# Codebase Slimdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce the Bloom codebase by ~35-40% — remove OCI distribution (local-only services), eliminate duplication, consolidate tiny files, merge overlapping extensions, reduce tool count, and strip redundant prompt metadata. The entire source should fit comfortably in LLM context.

**Architecture:** The current codebase is 4,162 lines across 10 extensions + 12 lib files (148KB source). OCI artifact distribution adds significant complexity (oras, registry config, digest verification, publish tools) that isn't needed — services install from local bundled packages. Many lib files exist for a single function, two extensions duplicate service installation logic, and 30 registered tools create unnecessary cognitive load.

**Tech Stack:** TypeScript (ES2022, NodeNext), Pi SDK (`@mariozechner/pi-coding-agent`), TypeBox, execa, js-yaml, gray-matter, Vitest

**Current state:**
| Category | Files | Lines |
|----------|-------|-------|
| extensions/ | 11 | 3,441 |
| lib/ | 12 | 721 |
| **Total source** | **23** | **4,162** |

**Target:** ~2,500 lines across ~15 files (~40% reduction)

---

## Task 1: Consolidate tiny lib files into their consumers

**Rationale:** Six lib files contain 1-2 trivial functions (4-36 lines each). Each file adds import overhead, a separate test file, and mental overhead when navigating the codebase. Inline into their single consumer or merge into `lib/shared.ts`.

**Files:**
- Delete: `lib/persona-utils.ts` (4 lines, 1 function: `normalizeCommand`)
- Delete: `lib/object-utils.ts` (6 lines, 1 function: `parseRef`)
- Delete: `lib/yaml.ts` (6 lines, 1 re-export of js-yaml)
- Delete: `lib/channel-utils.ts` (26 lines, 1 function: `extractResponseText`)
- Delete: `lib/system-checks.ts` (23 lines, 1 function: `hasSubidRange`)
- Delete: `lib/os-utils.ts` (29 lines, 3 functions: `guardBloom`, `parseGithubSlugFromUrl`, `slugifyBranchPart`)
- Modify: `extensions/bloom-persona.ts` — inline `normalizeCommand`
- Modify: `extensions/bloom-objects.ts` — inline `parseRef`
- Modify: `extensions/bloom-channels.ts` — inline `extractResponseText`
- Modify: `lib/shared.ts` — absorb `yaml.ts` export (already imports js-yaml), absorb `guardBloom`
- Modify: `lib/manifest.ts` — inline `hasSubidRange` (only consumer)
- Modify: `extensions/bloom-repo.ts` — inline `parseGithubSlugFromUrl`, `slugifyBranchPart`
- Delete: `tests/lib/persona-utils.test.ts` — move tests to bloom-persona.test.ts
- Delete: `tests/lib/object-utils.test.ts` — move tests to bloom-objects.test.ts
- Delete: `tests/lib/channel-utils.test.ts` — move tests inline
- Delete: `tests/lib/system-checks.test.ts` — move tests to manifest.test.ts
- Delete: `tests/lib/os-utils.test.ts` — move to shared.test.ts / bloom-repo test

**Step 1: Verify baseline**

```bash
npm run test
```

Expected: All tests pass.

**Step 2: Inline single-use functions into their consumers**

For each deleted lib file:
1. Copy the function body into the single consumer file
2. Remove the import
3. Move test assertions into the consumer's test file
4. Delete the lib file and its test file

Order: `persona-utils` → `object-utils` → `channel-utils` → `system-checks` → `yaml` → `os-utils`

Key details:
- `normalizeCommand` (1 line body) → inline into `bloom-persona.ts`
- `parseRef` (3 line body) → inline into `bloom-objects.ts`
- `extractResponseText` (26 lines) → inline into `bloom-channels.ts`
- `hasSubidRange` (10 lines) → inline into `lib/manifest.ts`
- `yaml.ts` → add `export const yaml` to `lib/shared.ts` (it already has jsYaml)
- `guardBloom` → move to `lib/shared.ts` (used by bloom-os)
- `parseGithubSlugFromUrl` + `slugifyBranchPart` → inline into `bloom-repo.ts` (with `hosted-git-info` import)

**Step 3: Run tests and lint**

```bash
npm run test && npm run check:fix
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: consolidate 6 tiny lib files into consumers

Inline single-use functions, merge yaml.ts into shared.ts,
move guardBloom to shared.ts. Eliminates 6 lib files + 5 test files."
```

**Estimated savings:** ~6 lib files, ~5 test files, ~100 lines

---

## Task 2: Remove OCI distribution — local-only services

**Rationale:** Services install from local bundled packages only. No OCI artifact pull, no oras dependency, no registry config. The local package format stays the same, so adding a registry later is straightforward. This removes significant complexity and the entire `service_publish` tool.

**Not changing:**
- Container images referenced in quadlets (e.g. `ghcr.io/lemonade-sdk/lemonade-server`) — those are upstream container images pulled by Podman at runtime, not our distribution
- SKILL.md `image:` frontmatter — keep for metadata, just not enforced

**Files:**
- Modify: `extensions/bloom-services.ts`
- Modify: `extensions/bloom-manifest.ts`
- Modify: `lib/manifest.ts`
- Modify: `lib/service-utils.ts`
- Modify: `lib/shared.ts`
- Modify: `services/catalog.yaml`
- Modify: `justfile`
- Modify: tests

**Step 1: Remove `service_publish` tool from bloom-services.ts**

Delete the entire `service_publish` tool registration (~65 lines, roughly lines 175-239).

**Step 2: Simplify `service_install` in bloom-services.ts**

Remove these parameters:
- `registry` — no remote registry
- `allow_latest` — no version policy for remote tags
- `expected_digest` — no OCI digest verification
- `require_pinned_image` — no remote trust enforcement

Remove this logic:
- `ensureCommand("oras", ...)` check
- `resolveArtifactDigest()` call
- The entire OCI pull branch (oras pull)
- Digest verification block

Keep: local bundled package installation via `resolvePackageRoot()` / local paths. The tool now finds the local service package and installs it directly.

Remove imports: `getServiceRegistry`, `resolveArtifactDigest`, `validatePinnedImage`

**Step 3: Simplify `manifest_apply` in bloom-manifest.ts**

- Remove `registry` parameter and `getServiceRegistry` usage
- Update `installServicePackage` call signature (no registry arg)
- Remove `allow_latest` parameter

**Step 4: Simplify `installServicePackage` in lib/manifest.ts**

- Remove `registry` parameter
- Remove the oras pull path — install from local only via `findLocalServicePackage`
- Remove `hasTagOrDigest` function (only used for OCI ref construction)
- Remove `oras` from `commandCheckArgs` function
- Simplify the function signature: `(name, version, bloomDir, repoDir, entry, signal)`

**Step 5: Clean up lib/service-utils.ts**

- Delete `resolveArtifactDigest` function (only used by OCI flow)
- Keep `validateServiceName`, `validatePinnedImage` (still useful for quadlet images), `extractDigest` (used by validatePinnedImage indirectly? check — if not, delete too), `commandMissingError`

**Step 6: Remove `getServiceRegistry` from lib/shared.ts**

Delete the function (and its test in `tests/lib/shared.test.ts`).

**Step 7: Update services/catalog.yaml**

Remove `registry_default`, `artifact` fields, and `oras` from preflight commands:

```yaml
version: 1
source_repo: https://github.com/pibloom/pi-bloom
services:
  lemonade:
    version: "0.1.0"
    category: ai
    image: ghcr.io/lemonade-sdk/lemonade-server:latest
    optional: false
    preflight:
      commands: [podman, systemctl]
  whatsapp:
    version: "0.2.0"
    category: communication
    optional: true
    native: true
    preflight:
      commands: [systemctl]
  dufs:
    version: "0.1.0"
    category: sync
    image: docker.io/sigoden/dufs:latest
    optional: false
    preflight:
      commands: [podman, systemctl]
```

**Step 8: Update justfile**

Remove these recipes:
- `push-ghcr` — no GHCR push
- `svc-push` — no service package push
- `svc-install` — replaced by `pi install` or direct systemctl

**Step 9: Update service_scaffold template text**

In `bloom-services.ts`, the scaffold generates SKILL.md with `Install: \`just svc-install ${params.name}\``. Update to: `Install: \`systemctl --user start bloom-${params.name}\``

**Step 10: Update tests**

- `tests/lib/shared.test.ts` — remove `getServiceRegistry` tests
- `tests/lib/manifest.test.ts` — remove oras from `commandCheckArgs` test, update `installServicePackage` call signatures
- `tests/lib/service-utils.test.ts` — remove `resolveArtifactDigest` tests, keep `validatePinnedImage` tests

**Step 11: Run tests and lint**

```bash
npm run test && npm run check:fix
```

**Step 12: Commit**

```bash
git add -A
git commit -m "feat: remove OCI distribution — local-only service install

Remove service_publish tool, oras dependency, registry config,
digest verification. Services install from bundled local packages.
Local package format unchanged for future extensibility."
```

**Estimated savings:** ~200-250 lines from extensions + lib, plus justfile recipes

---

## Task 3: Deduplicate service_install + merge bloom-services and bloom-manifest

**Rationale:** After Task 2, both `bloom-services.ts:service_install` and `lib/manifest.ts:installServicePackage` still do the same local-install logic (copy quadlet, copy SKILL.md, install network, generate tokens, handle sockets). And both bloom-services and bloom-manifest manage service lifecycle with overlapping session_start hooks. Deduplicate the install, then merge into one extension.

**Files:**
- Modify: `extensions/bloom-services.ts` — absorb bloom-manifest tools, delegate install to lib/manifest
- Delete: `extensions/bloom-manifest.ts`
- Modify: `lib/manifest.ts` — ensure `installServicePackage` covers all local-install needs

**Step 1: Make `service_install` delegate to `installServicePackage`**

Replace the remaining ~100-line inline install in bloom-services with a ~20-line wrapper:
1. Validate service name
2. Call `installServicePackage(name, version, bloomDir, repoDir, catalogEntry, signal)`
3. Daemon-reload + start
4. Update manifest
5. Return result

Remove `resolvePackageRoot()`, `resolveRepoDir()`, `extractSkillMetadata()`, `ensureCommand()`, `sleep()` from bloom-services (these are in lib/manifest or can be inlined).

**Step 2: Move all bloom-manifest tools into bloom-services**

Move these tool registrations from bloom-manifest.ts into bloom-services.ts:
- `manifest_show`
- `manifest_sync`
- `manifest_set_service`
- `manifest_apply`

Merge the two `session_start` hooks into one.

**Step 3: Delete bloom-manifest.ts**

**Step 4: Run tests and lint**

```bash
npm run test && npm run check:fix
```

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: merge bloom-manifest into bloom-services, deduplicate install

Single extension for all service lifecycle operations.
service_install delegates to lib/manifest.installServicePackage."
```

**Estimated savings:** ~200 lines (dedup install + eliminated extension overhead)

---

## Task 4: Reduce tool count — combine related OS tools

**Rationale:** bloom-os registers 10 tools. Several are thin wrappers that differ only by arguments. Combining reduces the tool count the LLM must track.

**Consolidation:**

| Before | After | Rationale |
|--------|-------|-----------|
| `bootc_status` + `bootc_update` + `bootc_rollback` | `bootc` with `action` param | All bootc subcommands |
| `container_status` + `container_logs` + `container_deploy` | `container` with `action` param | All container ops |
| `update_status` + `schedule_reboot` | Keep separate | Different enough |
| `systemd_control` | Keep as-is | Already parameterized |
| `system_health` | Keep as-is | Composite tool |

**Files:**
- Modify: `extensions/bloom-os.ts`
- Modify: `tests/extensions/bloom-os.test.ts`

**Step 1: Combine bootc tools into one `bootc` tool**

```typescript
pi.registerTool({
    name: "bootc",
    label: "Bootc Management",
    description: "Manage Fedora bootc OS image: status, check/download/apply updates, or rollback.",
    parameters: Type.Object({
        action: StringEnum(["status", "check", "download", "apply", "rollback"] as const, {
            description: "status: show image. check/download/apply: staged update. rollback: revert."
        }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        // Switch on params.action, merge logic from 3 old tools
    },
});
```

**Step 2: Combine container tools into one `container` tool**

```typescript
pi.registerTool({
    name: "container",
    label: "Container Management",
    description: "Manage Bloom containers: list status, view logs, or deploy a Quadlet unit.",
    parameters: Type.Object({
        action: StringEnum(["status", "logs", "deploy"] as const),
        service: Type.Optional(Type.String({ description: "Service name (required for logs/deploy)" })),
        lines: Type.Optional(Type.Number({ description: "Log lines (default 50)", default: 50 })),
    }),
    // Switch on action
});
```

**Step 3: Update tests, run tests and lint**

```bash
npm run test && npm run check:fix
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: combine bootc and container tools in bloom-os

bootc_status/update/rollback -> bootc(action)
container_status/logs/deploy -> container(action)
Reduces bloom-os from 10 to 5 tools."
```

**Estimated savings:** ~90 lines, 5 fewer tool registrations

---

## Task 5: Combine bloom-repo tools

**Rationale:** Combine `bloom_repo_configure` + `bloom_repo_status` + `bloom_repo_sync` into a single `bloom_repo` tool with an `action` parameter. Keep `bloom_repo_submit_pr` separate (destructive, different params).

**Files:**
- Modify: `extensions/bloom-repo.ts`

**Step 1: Merge configure/status/sync into `bloom_repo`**

```typescript
pi.registerTool({
    name: "bloom_repo",
    label: "Bloom Repository",
    description: "Configure, check status, or sync the local Bloom repo for self-evolution PRs.",
    parameters: Type.Object({
        action: StringEnum(["configure", "status", "sync"] as const),
        repo_url: Type.Optional(Type.String({ description: "Upstream repo URL (configure only)" })),
        fork_url: Type.Optional(Type.String({ description: "Fork URL (configure only)" })),
        git_name: Type.Optional(Type.String({ description: "Git author name (configure only)" })),
        git_email: Type.Optional(Type.String({ description: "Git author email (configure only)" })),
        branch: Type.Optional(Type.String({ description: "Branch to sync (sync only, default: main)" })),
    }),
    // Switch on action
});
```

**Step 2: Run tests and lint**

```bash
npm run test && npm run check:fix
```

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: combine bloom_repo configure/status/sync into one tool

Reduces bloom-repo from 4 tools to 2."
```

**Estimated savings:** ~70 lines, 2 fewer tools

---

## Task 6: Slim down promptSnippet/promptGuidelines

**Rationale:** Many tools have `promptSnippet` and `promptGuidelines` that merely repeat the `description`. These optional Pi SDK fields add system prompt weight. Remove where they don't add information beyond the description.

**Files:**
- Modify: all extension files with tools

**Step 1: Remove redundant prompt fields**

Keep `promptGuidelines` only where they encode **non-obvious behavioral rules**:
- Confirmation requirements ("requires user confirmation")
- Security constraints ("only bloom-* services")
- Workflow ordering ("use check first, then download, then apply")

Remove all `promptSnippet` values (they all duplicate `description`).
Remove `promptGuidelines` that are obvious from tool name + params.

**Step 2: Run tests and lint**

```bash
npm run test && npm run check:fix
```

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove redundant promptSnippet/promptGuidelines

Keep only non-obvious behavioral guidelines.
Reduces system prompt weight for LLM context."
```

**Estimated savings:** ~90 lines

---

## Task 7: Parallelize system_health commands

**Files:**
- Modify: `extensions/bloom-os.ts` (system_health tool)

**Step 1: Use Promise.all for independent commands**

```typescript
const [bootc, ps, df, loadavg, meminfo, uptime] = await Promise.all([
    run("bootc", ["status", "--format=json"], signal),
    run("podman", ["ps", "--format", "json", "--filter", "name=bloom-"], signal),
    run("df", ["-h", "/", "/var", "/home"], signal),
    run("cat", ["/proc/loadavg"], signal),
    run("free", ["-h", "--si"], signal),
    run("uptime", ["-p"], signal),
]);
```

**Step 2: Run tests and lint**

```bash
npm run test && npm run check:fix
```

**Step 3: Commit**

```bash
git add extensions/bloom-os.ts
git commit -m "perf: parallelize system_health shell commands"
```

**Estimated savings:** ~10 lines, faster execution

---

## Task 8: Try direct ESM imports for js-yaml and gray-matter

**Files:**
- Modify: `lib/shared.ts`

**Step 1: Replace createRequire with direct imports**

```typescript
import matter from "@11ty/gray-matter";
import jsYaml from "js-yaml";
```

**Step 2: Build and test**

```bash
npm run build && npm run test
```

If ESM/CJS interop fails, **revert and skip this task**.

**Step 3: Commit (only if successful)**

```bash
git add lib/shared.ts
git commit -m "refactor: direct ESM imports for js-yaml and gray-matter"
```

**Estimated savings:** ~10 lines (conditional)

---

## Task 9: Remove extensions/shared.ts

**Files:**
- Potentially delete: `extensions/shared.ts`

**Step 1: Test if Pi loader handles missing shared.ts**

Build and check if the extension loader chokes. If `package.json` `pi.extensions: ["./extensions"]` loads all `.ts` files, check if the no-op default export is actually required.

**Step 2: Delete if safe, keep if required**

```bash
npm run build
```

**Step 3: Commit if removed**

```bash
git add -A
git commit -m "chore: remove extensions/shared.ts no-op bridge"
```

---

## Task 10: Update all documentation

**Files:**
- Modify: `AGENTS.md` — update extension list, tool count, tool table, remove OCI references
- Modify: `CLAUDE.md` — update extension count, remove `just push-ghcr` / `just svc-push` / `just svc-install`
- Modify: `docs/service-architecture.md` — rewrite OCI distribution section for local-only
- Modify: `docs/supply-chain.md` — remove/simplify OCI artifact trust sections
- Modify: `skills/service-management/SKILL.md` — remove OCI/registry instructions
- Modify: `skills/self-evolution/SKILL.md` — remove OCI publishing references

**Step 1: Update AGENTS.md**

- Extension count: 10 → 9 (bloom-manifest merged)
- Tool count: 30 → ~21 (removed service_publish, combined bootc/container/repo tools)
- Remove all OCI/oras/registry references from tool descriptions

**Step 2: Update CLAUDE.md**

- Remove `just push-ghcr`, `just svc-push`, `just svc-install` from Build and Test section
- Update extension count in Architecture section

**Step 3: Update docs/service-architecture.md**

- Remove OCI Artifact Distribution section (sequence diagram, package format for oras)
- Replace with "Local Package Installation" section explaining bundled service packages
- Keep the service lifecycle diagram but simplify (no GHCR/oras steps)

**Step 4: Update skills**

Remove references to `service_publish`, `oras push`, registry configuration from skill files.

**Step 5: Commit**

```bash
git add -A
git commit -m "docs: update all docs for local-only services and tool consolidation

Remove OCI distribution references, update tool counts,
simplify service architecture docs."
```

---

## Summary

| Task | What | Lines Saved | Files Removed |
|------|------|-------------|---------------|
| 1 | Consolidate tiny libs | ~100 | 6 lib + 5 test |
| 2 | Remove OCI distribution | ~220 | 0 |
| 3 | Dedup install + merge extensions | ~200 | 1 extension |
| 4 | Combine OS tools | ~90 | 0 |
| 5 | Combine repo tools | ~70 | 0 |
| 6 | Slim prompt fields | ~90 | 0 |
| 7 | Parallelize system_health | ~10 | 0 |
| 8 | ESM imports (if possible) | ~10 | 0 |
| 9 | Remove shared.ts bridge | ~4 | 1 |
| 10 | Update docs | 0 | 0 |
| **Total** | | **~794 lines** | **~13 files** |

**Expected final state:** ~3,370 lines across ~15 source files (down from 4,162 lines across 23 files). With docs updates removing OCI content, total project context shrinks significantly.

**Dependency order:** Task 2 must come before Task 3. Tasks 1, 4-8 are independent of each other. Task 10 is last.

**Recommended execution order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
