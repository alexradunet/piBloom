import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface TempGarden {
	gardenDir: string;
	cleanup: () => void;
}

export function createTempGarden(): TempGarden {
	const gardenDir = mkdtempSync(path.join(os.tmpdir(), "bloom-test-garden-"));
	const origResolved = process.env._BLOOM_GARDEN_RESOLVED;
	const origGarden = process.env.BLOOM_GARDEN_DIR;

	process.env._BLOOM_GARDEN_RESOLVED = gardenDir;
	process.env.BLOOM_GARDEN_DIR = gardenDir;

	return {
		gardenDir,
		cleanup() {
			if (origResolved !== undefined) {
				process.env._BLOOM_GARDEN_RESOLVED = origResolved;
			} else {
				delete process.env._BLOOM_GARDEN_RESOLVED;
			}
			if (origGarden !== undefined) {
				process.env.BLOOM_GARDEN_DIR = origGarden;
			} else {
				delete process.env.BLOOM_GARDEN_DIR;
			}
			rmSync(gardenDir, { recursive: true, force: true });
		},
	};
}
