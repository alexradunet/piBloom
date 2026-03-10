# Bloom Architect Memory

## Architecture Decisions (Settled)

### Extension directory structure (2026-03-08)
- Every extension is a directory: `extensions/bloom-{name}/index.ts + actions.ts + types.ts`
- Always a directory, even for thin extensions -- consistency for AI-driven development
- `index.ts` is registration only, `actions.ts` handles orchestration, lib/ has pure logic
- All 12 extensions are directories (10 original + bloom-dev + bloom-setup added post-migration)
- Tests live in `tests/` at project root (NOT colocated in extension dirs)

### lib/ actual files (2026-03-10, verified)
- `shared.ts` -- generic utilities (createLogger, nowIso, truncate, errorResult, guardBloom, requireConfirmation)
- `exec.ts` -- command execution (run)
- `repo.ts` -- git remote helpers (getRemoteUrl, inferRepoUrl)
- `audit.ts` -- audit utilities (dayStamp, sanitize, summarizeInput, SENSITIVE_KEY)
- `filesystem.ts` -- path helpers (safePath, getBloomDir)
- `frontmatter.ts` -- YAML frontmatter (parseFrontmatter, stringifyFrontmatter, yaml)
- `git.ts` -- parseGithubSlugFromUrl, slugifyBranchPart
- `services.ts` -- barrel re-export of 4 sub-modules (services-catalog, services-install, services-manifest, services-validation)
- `lemonade.ts` -- lemonade-server model catalog and pull helpers
- `setup.ts` -- setup wizard state machine: STEP_ORDER, advanceStep, etc.

### Service template (2026-03-08)
- `services/_template/` EXISTS with: Containerfile, package.json, src/, tests/, quadlet/, tsconfig, vitest.config
- No shared service library -- independence is the point

## Architecture State (last verified: 2026-03-10)
- 12 extensions (all directory-based), 44 tools (AGENTS.md accurate)
- 5 extensions missing types.ts: display, objects, repo, services, setup
- 2 extensions use split actions files: dev (3 files), services (4 files)
- bloom-topics has ALL command logic in index.ts (major violation)
- dufs service missing HealthCmd in Quadlet
- 3 catalog.yaml entries use :latest tags (matrix, dufs, code-server)
- Missing extension test files: bloom-garden, bloom-services, bloom-topics, bloom-audit

## Recurring Violations
- Business logic in index.ts: bloom-topics (worst), bloom-os, bloom-dev, bloom-persona
- process.env mutation: bloom-garden sets _BLOOM_DIR_RESOLVED in session_start
- lib/ purity: services-install.ts has heavy I/O (functions are not pure)

## Pi SDK Notes
- `StringEnum`, `Type`, `truncateHead` are VALUE exports requiring runtime import as peerDependencies -- correct
- CLAUDE.md's "never import at runtime" is misleading -- peerDependency runtime imports are fine
