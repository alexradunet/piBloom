# Persona Wiki Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Pi's 4 persona layers (Soul, Body, Faculty, Skill) from static package files into the wiki as `identity`-typed pages so Pi can evolve its own identity through normal wiki workflows.

**Architecture:** Add `identity` to the wiki type system (touching `types.ts` and `actions-meta.ts` atomically — TypeScript requires `sectionLabel: Record<WikiPageType, string>` to have all keys), then rewrite `loadPersona()` to read from `{wikiRoot}/pages/persona/` with automatic first-boot seeding from the static package files. Also exclude `identity` pages from `buildWikiDigest` to avoid the full persona injection being duplicated as digest summaries. Runtime injection (full text prepended to system prompt) is otherwise unchanged.

**Tech Stack:** TypeScript, Node.js `fs`, `js-yaml`, `vitest`, existing wiki infrastructure (`parseFrontmatter`, `stringifyFrontmatter<T>`, `getWikiRoot`, `CanonicalPageFrontmatter`).

---

### Task 1: Add `identity` to the type system, renderIndex, and digest filter (atomic)

**Why atomic:** `sectionLabel: Record<WikiPageType, string>` in `renderIndex` requires every `WikiPageType` key to be present. Adding `"identity"` to `PAGE_TYPES` (and therefore `WikiPageType`) without adding it to `sectionLabel` in the same edit causes a TypeScript compile error.

**Files:**
- Modify: `core/pi/extensions/wiki/types.ts`
- Modify: `core/pi/extensions/wiki/actions-meta.ts`
- Test: `tests/extensions/wiki.test.ts`

- [ ] **Step 1: Write failing tests**

Add these two tests inside the `describe("wiki meta", ...)` block in `tests/extensions/wiki.test.ts` (after the existing `deriveWikiMetaArtifacts` test, around line 448):

```typescript
it("buildRegistry preserves identity type from frontmatter", () => {
    const content = `---
title: Soul
type: identity
status: active
summary: Core identity layer
updated: 2026-04-10
source_ids: []
aliases: []
tags: []
---
# Soul

Identity content here.
`;
    writeFileSync(path.join(tmpDir, "pages", "soul.md"), content, "utf-8");

    const pages = scanPages(tmpDir);
    const registry = buildRegistry(pages);
    const entry = registry.pages[0];
    expect(entry.type).toBe("identity");
});

it("deriveWikiMetaArtifacts renders Identity Pages section for identity-typed pages", () => {
    const content = `---
title: Soul
type: identity
status: active
summary: Core identity layer
updated: 2026-04-10
source_ids: []
aliases: []
tags: []
---
# Soul

Identity content here.
`;
    writeFileSync(path.join(tmpDir, "pages", "soul.md"), content, "utf-8");

    const pages = scanPages(tmpDir);
    const artifacts = deriveWikiMetaArtifacts(pages, []);
    expect(artifacts.index).toContain("## Identity Pages");
    expect(artifacts.index).toContain("[[soul|Soul]]");
});

it("buildWikiDigest excludes identity pages", () => {
    const identityContent = `---
title: Soul
type: identity
status: active
summary: Core identity layer
updated: 2026-04-10
source_ids: []
aliases: []
tags: []
---
# Soul

Identity content here.
`;
    const conceptContent = `---
title: My Concept
type: concept
status: active
summary: A concept page
updated: 2026-04-10
source_ids: []
aliases: []
tags: []
---
# My Concept

Concept content here.
`;
    writeFileSync(path.join(tmpDir, "pages", "soul.md"), identityContent, "utf-8");
    writeFileSync(path.join(tmpDir, "pages", "my-concept.md"), conceptContent, "utf-8");
    rebuildAllMeta(tmpDir);

    const digest = buildWikiDigest(tmpDir);
    expect(digest).not.toContain("Soul (identity)");
    expect(digest).toContain("My Concept (concept)");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose tests/extensions/wiki.test.ts 2>&1 | grep -E "✗|FAIL|identity|Identity" | head -20
```

Expected: 3 failures — `identity` type not recognized, not rendered, not filtered.

- [ ] **Step 3: Add `identity` to `PAGE_TYPES` and `CANONICAL_PAGE_TYPES` in `types.ts`**

In `core/pi/extensions/wiki/types.ts`, change:

```typescript
export const PAGE_TYPES = [
	"source",
	"concept",
	"entity",
	"synthesis",
	"analysis",
	"evolution",
	"procedure",
	"decision",
] as const;
export type WikiPageType = (typeof PAGE_TYPES)[number];

export const CANONICAL_PAGE_TYPES = [
	"concept",
	"entity",
	"synthesis",
	"analysis",
	"evolution",
	"procedure",
	"decision",
] as const;
export type CanonicalPageType = (typeof CANONICAL_PAGE_TYPES)[number];
```

to:

```typescript
export const PAGE_TYPES = [
	"source",
	"concept",
	"entity",
	"synthesis",
	"analysis",
	"evolution",
	"procedure",
	"decision",
	"identity",
] as const;
export type WikiPageType = (typeof PAGE_TYPES)[number];

export const CANONICAL_PAGE_TYPES = [
	"concept",
	"entity",
	"synthesis",
	"analysis",
	"evolution",
	"procedure",
	"decision",
	"identity",
] as const;
export type CanonicalPageType = (typeof CANONICAL_PAGE_TYPES)[number];
```

- [ ] **Step 4: Update `renderIndex` and `buildWikiDigest` in `actions-meta.ts`**

In `renderIndex` (around line 183), add `"identity"` to `sectionOrder` and `sectionLabel`:

```typescript
const sectionOrder: WikiPageType[] = [
    "source",
    "concept",
    "entity",
    "synthesis",
    "analysis",
    "evolution",
    "procedure",
    "decision",
    "identity",
];
const sectionLabel: Record<WikiPageType, string> = {
    source: "Source Pages",
    concept: "Concept Pages",
    entity: "Entity Pages",
    synthesis: "Synthesis Pages",
    analysis: "Analysis Pages",
    evolution: "Evolution Pages",
    procedure: "Procedure Pages",
    decision: "Decision Pages",
    identity: "Identity Pages",
};
```

In `buildWikiDigest` (around line 358), change the filter from:

```typescript
.filter((p) => p.type !== "source" && p.status === "active")
```

to:

```typescript
.filter((p) => p.type !== "source" && p.type !== "identity" && p.status === "active")
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose tests/extensions/wiki.test.ts 2>&1 | grep -E "✓|✗|identity|Identity" | head -20
```

Expected: all 3 new tests pass, all existing tests still pass.

- [ ] **Step 6: Run full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests passing.

- [ ] **Step 7: Commit**

```bash
git add core/pi/extensions/wiki/types.ts core/pi/extensions/wiki/actions-meta.ts tests/extensions/wiki.test.ts
git commit -m "feat(wiki): add identity page type with index section and digest exclusion"
```

---

### Task 2: Rewrite `loadPersona()` for wiki-native loading with first-boot seeding

**Files:**
- Modify: `core/pi/extensions/persona/actions.ts`
- Test: `tests/extensions/persona.test.ts`

**Background:** `loadPersona()` currently reads from a static package directory. We replace it with wiki-native loading from `{wikiRoot}/pages/persona/`. On first boot (when `pages/persona/SOUL.md` is absent), `seedPersonaToWiki` copies the 4 static files with `identity` frontmatter into the wiki. Frontmatter is stripped via `parseFrontmatter` — only the body is injected into the system prompt.

The seeding frontmatter object uses `CanonicalPageFrontmatter` as the type argument to `stringifyFrontmatter<T>`. This works because `"identity"` is now in `CANONICAL_PAGE_TYPES`, so `CanonicalPageFrontmatter.type` accepts `"identity"`.

Functions removed: `resolvePersonaDir`, `resolveDefaultPersonaDir` (old resolution path with operator override and package fallback). A private `resolveStaticPersonaDir` replaces them solely for seeding.

- [ ] **Step 1: Write failing tests**

Add the following import to the import block at the top of `tests/extensions/persona.test.ts`:

```typescript
import { loadPersona, seedPersonaToWiki } from "../../core/pi/extensions/persona/actions.js";
```

Add these test blocks at the bottom of `tests/extensions/persona.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// loadPersona / seedPersonaToWiki
// ---------------------------------------------------------------------------
describe("loadPersona", () => {
    it("seeds pages/persona/ on first call when it is absent", () => {
        const wikiPersonaDir = path.join(temp.nixPiDir, "Wiki", "pages", "persona");
        expect(fs.existsSync(path.join(wikiPersonaDir, "SOUL.md"))).toBe(false);

        loadPersona();

        expect(fs.existsSync(path.join(wikiPersonaDir, "SOUL.md"))).toBe(true);
        expect(fs.existsSync(path.join(wikiPersonaDir, "BODY.md"))).toBe(true);
        expect(fs.existsSync(path.join(wikiPersonaDir, "FACULTY.md"))).toBe(true);
        expect(fs.existsSync(path.join(wikiPersonaDir, "SKILL.md"))).toBe(true);
    });

    it("returns a block containing all four layer headings", () => {
        const result = loadPersona();
        expect(result).toContain("## Pi Persona");
        expect(result).toContain("### Soul");
        expect(result).toContain("### Body");
        expect(result).toContain("### Faculty");
        expect(result).toContain("### Skill");
    });

    it("strips frontmatter — yaml keys do not appear in output", () => {
        loadPersona(); // seed
        const result = loadPersona();
        expect(result).not.toContain("type: identity");
        expect(result).not.toContain("status: active");
        expect(result).not.toContain("source_ids:");
    });

    it("reads custom content when wiki persona pages already exist", () => {
        const wikiPersonaDir = path.join(temp.nixPiDir, "Wiki", "pages", "persona");
        fs.mkdirSync(wikiPersonaDir, { recursive: true });
        const stub = (title: string) =>
            `---\ntype: identity\ntitle: ${title}\nstatus: active\nsummary: stub\nupdated: 2026-04-10\nsource_ids: []\naliases: []\ntags: []\n---\n# ${title} Stub\n`;
        fs.writeFileSync(
            path.join(wikiPersonaDir, "SOUL.md"),
            `---\ntype: identity\ntitle: Soul\nstatus: active\nsummary: Custom soul\nupdated: 2026-04-10\nsource_ids: []\naliases: []\ntags: []\n---\n# Custom Soul\n\nThis is a custom soul.\n`,
            "utf-8",
        );
        fs.writeFileSync(path.join(wikiPersonaDir, "BODY.md"), stub("Body"), "utf-8");
        fs.writeFileSync(path.join(wikiPersonaDir, "FACULTY.md"), stub("Faculty"), "utf-8");
        fs.writeFileSync(path.join(wikiPersonaDir, "SKILL.md"), stub("Skill"), "utf-8");

        const result = loadPersona();
        expect(result).toContain("This is a custom soul.");
    });
});

describe("seedPersonaToWiki", () => {
    it("creates pages/persona/ and writes all four layer files", () => {
        const wikiRoot = path.join(temp.nixPiDir, "Wiki");
        seedPersonaToWiki(wikiRoot);

        for (const file of ["SOUL.md", "BODY.md", "FACULTY.md", "SKILL.md"]) {
            expect(fs.existsSync(path.join(wikiRoot, "pages", "persona", file))).toBe(true);
        }
    });

    it("seeded files contain identity frontmatter", () => {
        const wikiRoot = path.join(temp.nixPiDir, "Wiki");
        seedPersonaToWiki(wikiRoot);

        const content = fs.readFileSync(path.join(wikiRoot, "pages", "persona", "SOUL.md"), "utf-8");
        expect(content).toContain("type: identity");
        expect(content).toContain("status: active");
        expect(content).toContain("title: Soul");
    });

    it("does not overwrite an existing page (idempotent)", () => {
        const wikiRoot = path.join(temp.nixPiDir, "Wiki");
        const personaDir = path.join(wikiRoot, "pages", "persona");
        fs.mkdirSync(personaDir, { recursive: true });
        fs.writeFileSync(path.join(personaDir, "SOUL.md"), "custom content", "utf-8");

        seedPersonaToWiki(wikiRoot);

        const content = fs.readFileSync(path.join(personaDir, "SOUL.md"), "utf-8");
        expect(content).toBe("custom content");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose tests/extensions/persona.test.ts 2>&1 | grep -E "✗|FAIL|loadPersona|seedPersona" | head -20
```

Expected: failures — `loadPersona` and `seedPersonaToWiki` not exported from actions.ts.

- [ ] **Step 3: Rewrite `core/pi/extensions/persona/actions.ts`**

Replace the entire file with:

```typescript
/**
 * Handler / business logic for persona.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import jsYaml from "js-yaml";
import { parseFrontmatter, stringifyFrontmatter } from "../../../lib/frontmatter.js";
import {
	getBootstrapMode,
	getNixPiDir,
	getPiDir,
	getUpdateStatusPath,
	isBootstrapMode,
	resolvePackageDir,
} from "../../../lib/filesystem.js";
import { createLogger } from "../../../lib/logging.js";
import type { CanonicalPageFrontmatter } from "../wiki/types.js";
import { getWikiRoot } from "../wiki/paths.js";
import type { GuardrailsConfig, NixPiContext } from "./types.js";

const log = createLogger("persona");

interface PersonaLayer {
	title: string;
	file: string;
	summary: string;
}

const PERSONA_LAYERS: PersonaLayer[] = [
	{ title: "Soul", file: "SOUL.md", summary: "Core identity, values, voice, and boundaries" },
	{ title: "Body", file: "BODY.md", summary: "Channel adaptation, presence behavior, physical constraints" },
	{ title: "Faculty", file: "FACULTY.md", summary: "Cognitive patterns, reasoning style, decision framework" },
	{ title: "Skill", file: "SKILL.md", summary: "Current capabilities and competency inventory" },
];

/** Collapse whitespace so `rm  -rf` or `rm\t-rf` can't bypass patterns. */
export function normalizeCommand(cmd: string): string {
	return cmd.replace(/\s+/g, " ");
}

function resolveGuardrailsPath(): string | null {
	const workspaceDir = getNixPiDir();
	const packageDir = resolvePackageDir(import.meta.url);
	const gardenPath = join(workspaceDir, "guardrails.yaml");
	if (existsSync(gardenPath)) {
		return gardenPath;
	}
	const defaultPath = join(packageDir, "guardrails.yaml");
	return existsSync(defaultPath) ? defaultPath : null;
}

function compileGuardrailRules(config: GuardrailsConfig): Array<{ tool: string; pattern: RegExp; label: string }> {
	const compiled: Array<{ tool: string; pattern: RegExp; label: string }> = [];
	for (const rule of config.rules) {
		if (rule.action !== "block" || !rule.patterns) continue;
		for (const pattern of rule.patterns) {
			try {
				compiled.push({ tool: rule.tool, pattern: new RegExp(pattern.pattern), label: pattern.label });
			} catch (patternErr) {
				log.error(`Skipping invalid guardrail pattern "${pattern.pattern}"`, {
					error: (patternErr as Error).message,
				});
			}
		}
	}
	return compiled;
}

/** Load and compile guardrail patterns from YAML config. */
export function loadGuardrails(): Array<{ tool: string; pattern: RegExp; label: string }> {
	const filePath = resolveGuardrailsPath();
	if (!filePath) return [];
	try {
		const raw = readFileSync(filePath, "utf-8");
		const config = jsYaml.load(raw) as GuardrailsConfig;
		if (!config?.rules) return [];
		return compileGuardrailRules(config);
	} catch (err) {
		log.error("Failed to load guardrails", { error: (err as Error).message });
		return [];
	}
}

function getContextFile(): string {
	return join(getPiDir(), "nixpi-context.json");
}

function readJsonFile<T>(filepath: string): T | null {
	try {
		if (!existsSync(filepath)) return null;
		return JSON.parse(readFileSync(filepath, "utf-8")) as T;
	} catch {
		return null;
	}
}

/** Save context state for cross-compaction continuity. */
export function saveContext(ctx: NixPiContext): void {
	try {
		mkdirSync(getPiDir(), { recursive: true });
		writeFileSync(getContextFile(), JSON.stringify(ctx, null, 2));
	} catch (err) {
		log.error("Failed to save context", { error: (err as Error).message });
	}
}

/** Load previously saved context state. */
export function loadContext(): NixPiContext | null {
	return readJsonFile<NixPiContext>(getContextFile());
}

/** Check if an OS update is available by reading the update-status file. */
export function checkUpdateAvailable(): boolean {
	const status = readJsonFile<{ available?: boolean }>(getUpdateStatusPath());
	return status?.available === true;
}

/** Build the restored-context system prompt block from persisted compaction state. */
export function buildRestoredContextBlock(ctx: NixPiContext): string {
	const lines = ["\n\n[RESTORED CONTEXT]"];
	if (ctx.updateAvailable) lines.push("OS update available — inform user if not already done.");
	lines.push(`Context saved at: ${ctx.savedAt}`);
	return lines.join("\n");
}

/** Resolve the static persona directory bundled with the package. Used for first-boot seeding only. */
function resolveStaticPersonaDir(): string {
	const packageDir = resolvePackageDir(import.meta.url);
	const packaged = join(packageDir, "core", "pi", "persona");
	return existsSync(packaged) ? packaged : join(packageDir, "persona");
}

/**
 * Seed persona layers into the wiki on first boot.
 * Copies the 4 static files from the package into `{wikiRoot}/pages/persona/`
 * with `identity` frontmatter added. Skips any file that already exists.
 */
export function seedPersonaToWiki(wikiRoot: string): void {
	const personaDir = join(wikiRoot, "pages", "persona");
	mkdirSync(personaDir, { recursive: true });

	const staticDir = resolveStaticPersonaDir();
	const today = new Date().toISOString().slice(0, 10);

	for (const layer of PERSONA_LAYERS) {
		const destPath = join(personaDir, layer.file);
		if (existsSync(destPath)) continue;

		const staticContent = readFileSync(join(staticDir, layer.file), "utf-8").trim();
		const fm: CanonicalPageFrontmatter = {
			type: "identity",
			title: layer.title,
			status: "active",
			summary: layer.summary,
			updated: today,
			source_ids: [],
			aliases: [],
			tags: [],
		};
		writeFileSync(destPath, stringifyFrontmatter(fm, `${staticContent}\n`), "utf-8");
	}
}

/**
 * Load the 4-layer persona from `{wikiRoot}/pages/persona/`.
 * Seeds the wiki from the static package files on first boot if needed.
 * Frontmatter is stripped — only the markdown body is injected into the system prompt.
 */
export function loadPersona(): string {
	const wikiRoot = getWikiRoot();
	const personaDir = join(wikiRoot, "pages", "persona");

	if (!existsSync(join(personaDir, "SOUL.md"))) {
		seedPersonaToWiki(wikiRoot);
	}

	const sections = PERSONA_LAYERS.map(({ title, file }) => {
		const raw = readFileSync(join(personaDir, file), "utf-8");
		const { body } = parseFrontmatter(raw);
		return `### ${title}\n\n${body.trim()}`;
	}).join("\n\n");

	return `## Pi Persona\n\n${sections}`;
}

export function isSystemSetupPending(): boolean {
	return isBootstrapMode();
}

export function buildSystemSetupBlock(): string {
	return [
		"",
		"## System Setup",
		"",
		"The machine is declaratively configured in bootstrap mode. Stay in setup mode until onboarding is complete.",
		"Use Pi as the primary interface. Do not open with generic `/login` or `/model` instructions when Pi is already responding.",
		"Only ask for `/login` or `/model` if the runtime explicitly reports missing authentication or no model availability.",
		"Guide the user through git identity setup for the operator checkout they plan to use (for example `/srv/nixpi`), or through path-independent global git config, plus OS security configuration, and a short NixPI tutorial.",
		'Default git identity when unset: use `git config --global user.name "$(id -un)"` and `git config --global user.email "$(id -un)@$(hostname -s).local"`, or apply the same values in the operator checkout you chose (for example `/srv/nixpi`).',
		"Leave bootstrap mode by switching the host configuration to `nixpi.bootstrap.enable = false` (or equivalent explicit steady-state settings) and rebuilding.",
		`Runtime bootstrap signal: NIXPI_BOOTSTRAP_MODE=${getBootstrapMode()}`,
	].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose tests/extensions/persona.test.ts 2>&1 | grep -E "✓|✗|loadPersona|seedPersona" | head -30
```

Expected: all new `loadPersona` and `seedPersonaToWiki` tests pass, all existing tests still pass.

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add core/pi/extensions/persona/actions.ts tests/extensions/persona.test.ts
git commit -m "feat(persona): load from wiki with first-boot seeding, remove static resolution"
```

---

### Task 3: Update wiki-maintainer SKILL.md

**Files:**
- Modify: `core/pi/skills/wiki-maintainer/SKILL.md`

- [ ] **Step 1: Add persona note to Rules section**

In `core/pi/skills/wiki-maintainer/SKILL.md`, append a new rule after the existing rules in `## Rules`:

```markdown
7. Identity layers live at `pages/persona/SOUL.md`, `BODY.md`, `FACULTY.md`, and `SKILL.md`. Edit them like any canonical page. Edit Soul with particular care — it defines Pi's core values and voice.
```

- [ ] **Step 2: Add `identity` to Page Types section**

In the `## Page Types` section, append after `decision`:

```markdown
- `identity` (persona layers only — `pages/persona/`)
```

- [ ] **Step 3: Commit**

```bash
git add core/pi/skills/wiki-maintainer/SKILL.md
git commit -m "docs(wiki-maintainer): note identity layers in pages/persona/"
```
