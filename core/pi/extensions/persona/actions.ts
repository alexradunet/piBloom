/**
 * Handler / business logic for persona.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import jsYaml from "js-yaml";
import {
	getBootstrapMode,
	getNixPiDir,
	getPiDir,
	getUpdateStatusPath,
	isBootstrapMode,
	resolvePackageDir,
} from "../../../lib/filesystem.js";
import { parseFrontmatter, stringifyFrontmatter } from "../../../lib/frontmatter.js";
import { createLogger } from "../../../lib/logging.js";
import { rebuildAllMeta } from "../wiki/actions-meta.js";
import { getWikiRoot } from "../wiki/paths.js";
import type { CanonicalPageFrontmatter } from "../wiki/types.js";
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

/** Get the path to the NixPI context persistence file. */
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

function resolveStaticPersonaDir(): string {
	const packageDir = resolvePackageDir(import.meta.url);
	const packagedPersonaDir = join(packageDir, "core", "pi", "persona");
	return existsSync(packagedPersonaDir) ? packagedPersonaDir : join(packageDir, "persona");
}

export function seedPersonaToWiki(wikiRoot: string): void {
	const personaDir = join(wikiRoot, "pages", "persona");
	mkdirSync(personaDir, { recursive: true });

	const staticPersonaDir = resolveStaticPersonaDir();
	const today = new Date().toISOString().slice(0, 10);
	let seededAny = false;

	for (const layer of PERSONA_LAYERS) {
		const destPath = join(personaDir, layer.file);
		if (existsSync(destPath)) continue;

		const body = readFileSync(join(staticPersonaDir, layer.file), "utf-8").trim();
		const frontmatter: CanonicalPageFrontmatter = {
			type: "identity",
			title: layer.title,
			aliases: [],
			tags: [],
			status: "active",
			updated: today,
			source_ids: [],
			summary: layer.summary,
		};
		writeFileSync(destPath, stringifyFrontmatter<CanonicalPageFrontmatter>(frontmatter, `${body}\n`), "utf-8");
		seededAny = true;
	}

	if (seededAny) {
		rebuildAllMeta(wikiRoot);
	}
}

function loadPersonaSection(personaDir: string, layer: PersonaLayer): string {
	const raw = readFileSync(join(personaDir, layer.file), "utf-8");
	const { body } = parseFrontmatter(raw);
	return `### ${layer.title}\n\n${body.trim()}`;
}

/** Load the 4-layer persona from wiki pages, seeding from package defaults on first boot. */
export function loadPersona(): string {
	const wikiRoot = getWikiRoot();
	seedPersonaToWiki(wikiRoot);
	const personaDir = join(wikiRoot, "pages", "persona");
	const sections = PERSONA_LAYERS.map((layer) => loadPersonaSection(personaDir, layer)).join("\n\n");
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
