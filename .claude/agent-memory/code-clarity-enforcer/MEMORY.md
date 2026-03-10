# Code Clarity Enforcer Memory

## Recurring Violations

- **Empty/stub types.ts files**: Extensions frequently have 1-2 line types.ts files with only a comment or a re-export. Three such files found: bloom-repo, bloom-services, bloom-setup.
- **Missing module-level JSDoc**: 6 of 10 lib/ files start with imports instead of a module-level comment (exec.ts, filesystem.ts, frontmatter.ts, repo.ts, services.ts, shared.ts).
- **Oversized files**: bloom-services/actions.ts (760 lines), lib/services.ts (476 lines), bloom-channels/actions.ts (438 lines), bloom-dev/actions.ts (430 lines), bloom-repo/actions.ts (320 lines), bloom-garden/actions.ts (288 lines), bloom-os/actions.ts (284 lines), bloom-dev/index.ts (242 lines).
- **High export counts**: lib/services.ts (18 exports), bloom-dev/actions.ts (15), bloom-garden/actions.ts (13), bloom-services/actions.ts (12), bloom-display/actions.ts (10), lib/setup.ts (10).
- **Shell convention violations**: build-iso.sh uses `#!/bin/bash` instead of `#!/usr/bin/env bash`. bloom-greeting.sh uses `[ ]` instead of `[[ ]]`.
- **Dynamic imports**: bloom-display/actions.ts line 29 uses `await import("node:fs/promises")`.
- **Missing types.ts**: bloom-display and bloom-objects have no types.ts despite ARCHITECTURE.md mandating the directory structure.

## Stale Documentation

- `docs/quick_deploy.md` references `just vm-serial` which does not exist in the justfile.

## Codebase Trends

- lib/services.ts is the largest lib file at 476 lines with 18 exports -- a clear split candidate.
- bloom-services/actions.ts at 760 lines is the largest file in the repo -- needs decomposition.
- Test coverage has gaps: 4 extensions (bloom-audit, bloom-garden, bloom-services, bloom-topics) and 3 lib files (filesystem, frontmatter, git) have no dedicated test files.

## Last Audit

- Date: 2026-03-10
- Files reviewed: ~120
- Auto-fixes applied: 0 (report-only run)
- Issues flagged: ~30
