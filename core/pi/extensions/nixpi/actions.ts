/**
 * Handler / business logic for nixpi.
 * Package helpers, directory setup, and tool handlers.
 */
import fs from "node:fs";
import path from "node:path";
import { readPackageVersion, resolvePackageDir } from "../../../lib/filesystem.js";
import { textToolResult, truncate } from "../../../lib/utils.js";
import { readBlueprintVersions } from "./actions-blueprints.js";

const NIXPI_DIRS = ["Persona", "Skills", "Agents", "audit", "Wiki/raw", "Wiki/pages/sources", "Wiki/meta"];

// --- Package helpers ---

export function getPackageDir(): string {
	return resolvePackageDir(import.meta.url);
}

export function getPackageVersion(packageDir: string): string {
	return readPackageVersion(packageDir);
}

// --- Directory setup ---

export function ensureNixPi(nixPiDir: string): void {
	for (const dir of NIXPI_DIRS) {
		fs.mkdirSync(path.join(nixPiDir, dir), { recursive: true });
	}
}

// --- Tool handlers ---

export function handleNixPiStatus(nixPiDir: string) {
	const lines: string[] = [`NixPI: ${nixPiDir}`, ""];

	const versions = readBlueprintVersions(nixPiDir);
	lines.push(`Package version: ${versions.packageVersion}`);
	lines.push(`Seeded blueprints: ${Object.keys(versions.seeded).length}`);

	const updates = Object.keys(versions.updatesAvailable);
	if (updates.length > 0) {
		lines.push(`Updates available: ${updates.join(", ")}`);
	}

	return textToolResult(truncate(lines.join("\n")));
}

/** Discover skill paths for dynamic loading. */
export function discoverSkillPaths(workspaceDir: string): string[] | undefined {
	const skillsDir = path.join(workspaceDir, "Skills");
	if (!fs.existsSync(skillsDir)) return undefined;
	return [skillsDir];
}
