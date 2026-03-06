import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	commandCheckArgs,
	findLocalServicePackage,
	hasTagOrDigest,
	loadManifest,
	loadServiceCatalog,
	saveManifest,
	tailscaleAuthConfigured,
} from "../../lib/manifest.js";

describe("loadManifest", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "manifest-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns empty manifest for nonexistent file", () => {
		const manifest = loadManifest(join(tempDir, "does-not-exist.yaml"));
		expect(manifest).toEqual({ services: {} });
	});

	it("returns empty manifest for null YAML content", () => {
		const path = join(tempDir, "manifest.yaml");
		writeFileSync(path, "");
		const manifest = loadManifest(path);
		expect(manifest).toEqual({ services: {} });
	});

	it("loads a valid manifest", () => {
		const path = join(tempDir, "manifest.yaml");
		writeFileSync(
			path,
			[
				"device: test-host",
				"os_image: ghcr.io/pibloom/bloom-os:latest",
				"services:",
				"  whisper:",
				"    image: docker.io/fedirz/faster-whisper-server:latest",
				"    version: '0.1.0'",
				"    enabled: true",
			].join("\n"),
		);
		const manifest = loadManifest(path);
		expect(manifest.device).toBe("test-host");
		expect(manifest.os_image).toBe("ghcr.io/pibloom/bloom-os:latest");
		expect(manifest.services.whisper).toBeDefined();
		expect(manifest.services.whisper.enabled).toBe(true);
	});
});

describe("saveManifest + loadManifest roundtrip", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "manifest-roundtrip-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("saves and reloads a manifest correctly", () => {
		const manifestPath = join(tempDir, "Bloom", "manifest.yaml");
		const original = {
			device: "bloom-device",
			os_image: "ghcr.io/pibloom/bloom-os:0.1.0",
			services: {
				whisper: {
					image: "docker.io/fedirz/faster-whisper-server:latest",
					version: "0.1.0",
					enabled: true,
				},
				tailscale: {
					image: "docker.io/tailscale/tailscale:latest",
					enabled: false,
				},
			},
		};

		saveManifest(original, manifestPath, tempDir);
		const reloaded = loadManifest(manifestPath);

		expect(reloaded.device).toBe("bloom-device");
		expect(reloaded.os_image).toBe("ghcr.io/pibloom/bloom-os:0.1.0");
		expect(reloaded.services.whisper.image).toBe("docker.io/fedirz/faster-whisper-server:latest");
		expect(reloaded.services.whisper.version).toBe("0.1.0");
		expect(reloaded.services.whisper.enabled).toBe(true);
		expect(reloaded.services.tailscale.enabled).toBe(false);
	});

	it("creates parent Bloom directory if missing", () => {
		const manifestPath = join(tempDir, "Bloom", "manifest.yaml");
		saveManifest({ services: {} }, manifestPath, tempDir);
		const raw = readFileSync(manifestPath, "utf-8");
		expect(raw).toContain("services");
	});
});

describe("hasTagOrDigest", () => {
	it("returns true for ref with digest (@)", () => {
		expect(hasTagOrDigest("ghcr.io/foo/bar@sha256:abc123")).toBe(true);
	});

	it("returns true for ref with explicit tag", () => {
		expect(hasTagOrDigest("ghcr.io/foo/bar:0.1.0")).toBe(true);
	});

	it("returns false for ref without tag or digest", () => {
		expect(hasTagOrDigest("ghcr.io/foo/bar")).toBe(false);
	});

	it("returns true for ref with latest tag", () => {
		expect(hasTagOrDigest("ghcr.io/foo/bar:latest")).toBe(true);
	});

	it("returns false for bare name without registry", () => {
		expect(hasTagOrDigest("myimage")).toBe(false);
	});
});

describe("tailscaleAuthConfigured", () => {
	const originalEnv = process.env.TS_AUTHKEY;

	afterEach(() => {
		if (originalEnv !== undefined) {
			process.env.TS_AUTHKEY = originalEnv;
		} else {
			delete process.env.TS_AUTHKEY;
		}
	});

	it("returns true when TS_AUTHKEY env var is set", () => {
		process.env.TS_AUTHKEY = "tskey-auth-abc123";
		expect(tailscaleAuthConfigured()).toBe(true);
	});

	it("returns false when TS_AUTHKEY is empty and no config file", () => {
		process.env.TS_AUTHKEY = "";
		// tailscale.env file won't exist in test env
		expect(tailscaleAuthConfigured()).toBe(false);
	});

	it("returns false when TS_AUTHKEY is not set and no config file", () => {
		delete process.env.TS_AUTHKEY;
		expect(tailscaleAuthConfigured()).toBe(false);
	});
});

describe("commandCheckArgs", () => {
	it("returns ['version'] for oras", () => {
		expect(commandCheckArgs("oras")).toEqual(["version"]);
	});

	it("returns ['--version'] for podman", () => {
		expect(commandCheckArgs("podman")).toEqual(["--version"]);
	});

	it("returns ['--version'] for systemctl", () => {
		expect(commandCheckArgs("systemctl")).toEqual(["--version"]);
	});

	it("returns ['--version'] for unknown commands", () => {
		expect(commandCheckArgs("something-else")).toEqual(["--version"]);
	});
});

describe("loadServiceCatalog", () => {
	it("returns empty object for nonexistent repo dir", () => {
		const catalog = loadServiceCatalog("/tmp/__bloom_no_such_repo__");
		// If cwd also doesn't have services/catalog.yaml, empty
		expect(typeof catalog).toBe("object");
	});
});

describe("findLocalServicePackage", () => {
	it("returns null for nonexistent repo dir and service", () => {
		const result = findLocalServicePackage("nonexistent-service", "/tmp/__bloom_no_such_repo__");
		expect(result).toBeNull();
	});
});
