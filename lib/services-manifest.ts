/** Manifest I/O: loading, saving, and type definitions for Bloom service manifests. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { yaml } from "./frontmatter.js";
import { createLogger } from "./shared.js";

const log = createLogger("manifest");

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** A single service entry inside a Bloom manifest. */
export interface ManifestService {
	image: string;
	version?: string;
	enabled: boolean;
}

/** Declarative service manifest stored at `~/Bloom/manifest.yaml`. */
export interface Manifest {
	device?: string;
	os_image?: string;
	services: Record<string, ManifestService>;
}

/** Entry for one service in the service catalog (`services/catalog.yaml`). */
export interface ServiceCatalogEntry {
	version?: string;
	category?: string;
	image?: string;
	optional?: boolean;
	depends?: string[];
	models?: Array<{
		volume: string;
		path: string;
		url: string;
	}>;
	preflight?: {
		commands?: string[];
		rootless_subids?: boolean;
	};
}

// ---------------------------------------------------------------------------
// Manifest I/O
// ---------------------------------------------------------------------------

/** Load the manifest from disk. Returns an empty manifest if the file is missing or invalid. */
export function loadManifest(manifestPath: string): Manifest {
	if (!existsSync(manifestPath)) return { services: {} };
	try {
		const raw = readFileSync(manifestPath, "utf-8");
		const doc = yaml.load(raw) as Manifest | null;
		return doc ?? { services: {} };
	} catch (err) {
		log.warn("failed to load manifest", { error: (err as Error).message });
		return { services: {} };
	}
}

/** Write the manifest to disk, creating the parent directory if needed. */
export function saveManifest(manifest: Manifest, manifestPath: string): void {
	mkdirSync(dirname(manifestPath), { recursive: true });
	writeFileSync(manifestPath, yaml.dump(manifest));
}
