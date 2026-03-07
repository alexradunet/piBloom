# Bloom Architect Memory

## Last Full Review
- Date: 2026-03-07, Commit: 157912a (main)
- Overall: Healthy with targeted improvements needed
- Previous monolith issues (I-1, I-2, I-5) largely resolved by EU sovereignty refactor

## Current Findings (2026-03-07)

### D-1: Duplicated service install (CRITICAL)
- `extensions/bloom-services.ts` lines 300-445 (`service_install`) and `lib/manifest.ts:190-289` (`installServicePackage`) are ~120 lines of near-identical code
- Both do: OCI pull, local fallback, quadlet copy, SKILL install, network copy, token generation
- `service_install` should wrap `installServicePackage`, not reimplement it

### D-2: systemdDir/userSystemdDir constructed in 4 places
- `lib/manifest.ts:239`, `bloom-services.ts:360,469`, `bloom-manifest.ts:254`
- Extract `getSystemdDirs()` to shared

### D-3: Package root resolution duplicated 3 ways
- `bloom-services.ts:34` (resolvePackageRoot), `bloom-garden.ts:18` (getPackageDir), `bloom-persona.ts:38` (inline)
- All computing same value differently

### L-4: `ensureCommand` in bloom-services reimplements `commandExists` from lib/manifest
- Delete ensureCommand, use commandExists

### Structural: 3 single-function lib files
- `lib/object-utils.ts` (parseRef, 5 lines), `lib/persona-utils.ts` (normalizeCommand, 3 lines)
- Candidates for inlining or merging
- `lib/os-utils.ts` misnamed: guardBloom -> service-utils, git funcs -> repo.ts

## Architecture Patterns
- lib/ layer is genuinely pure (no side effects) -- good domain core
- Extensions lack port/adapter separation -- directly call fs, execFile, net
- Cross-extension coupling is low (communicate via Pi events only)
- Shared env var `_BLOOM_DIR_RESOLVED` is the only cross-extension state
- `extensions/shared.ts` is re-export shim for Pi loader discovery

## Pi SDK Import Clarification
- CLAUDE.md says "never import at runtime" -- MISLEADING
- `StringEnum`, `Type`, `truncateHead` are VALUE exports requiring runtime import
- They are peerDependencies resolved by Pi -- architecturally correct

## YAML/Frontmatter Plumbing
- 3 separate createRequire sites: lib/yaml.ts, lib/shared.ts, lib/os-utils.ts
- lib/shared.ts has its own js-yaml import because lib/yaml.ts doesn't expose JSON_SCHEMA
- gray-matter used for frontmatter parsing; could be replaced with ~15 lines of yaml.load
- skill_list (bloom-garden:344) hand-parses frontmatter with regex instead of parseFrontmatter

## Testing Patterns
- `tests/helpers/temp-garden.ts` -- creates temp dir, saves/restores env vars
- `tests/helpers/mock-extension-api.ts` -- mock with _registeredTools, fireEvent
- Vitest with v8 coverage, thresholds: lib/ 60% lines, extensions/ 20% lines
- Coverage now includes extensions/ (was lib-only before)

## Code Style Notes
- `as const` on `type: "text"` inconsistent (some extensions use it, some don't)
- ~55 tool response boilerplate sites; `errorResult` exists but no `textResult`
- `loadPersona()` in bloom-persona has no error handling for missing files
