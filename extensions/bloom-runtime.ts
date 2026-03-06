import { randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { commandExists, runCommand } from "../lib/command.js";
import {
	loadManifest as loadManifestFile,
	loadServiceCatalog as loadServiceCatalogFile,
	type Manifest,
	type ServiceCatalogEntry,
	saveManifest as saveManifestFile,
} from "../lib/manifest.js";
import { hasSubidRange, hasTagOrDigest, tailscaleAuthConfigured } from "../lib/service-policy.js";
import { createLogger, errorResult, getGardenDir, requireConfirmation, truncate } from "../lib/shared.js";

const log = createLogger("bloom-runtime");

export default function (pi: ExtensionAPI) {
	const gardenDir = getGardenDir();
	const manifestPath = join(gardenDir, "Bloom", "manifest.yaml");
	const repoDir = join(os.homedir(), ".bloom", "pi-bloom");
	const defaultServiceRegistry =
		process.env.BLOOM_SERVICE_REGISTRY?.trim() || process.env.BLOOM_REGISTRY?.trim() || "ghcr.io/pibloom";
	const serviceCatalogCandidates = [
		join(repoDir, "services", "catalog.yaml"),
		"/usr/local/share/bloom/services/catalog.yaml",
		join(process.cwd(), "services", "catalog.yaml"),
	];

	function loadManifestState(): Manifest {
		return loadManifestFile(manifestPath, (error) => {
			log.warn("failed to load manifest", { error });
		});
	}

	function saveManifestState(manifest: Manifest): void {
		saveManifestFile(manifestPath, manifest);
	}

	function loadServiceCatalogState(): Record<string, ServiceCatalogEntry> {
		return loadServiceCatalogFile(serviceCatalogCandidates);
	}

	async function servicePreflightErrors(
		name: string,
		entry: ServiceCatalogEntry | undefined,
		signal?: AbortSignal,
	): Promise<string[]> {
		const errors: string[] = [];
		const commands = entry?.preflight?.commands ?? ["oras", "podman", "systemctl"];
		for (const command of commands) {
			const ok = await commandExists(command, signal);
			if (!ok) errors.push(`missing command: ${command}`);
		}

		if (entry?.preflight?.rootless_subids) {
			const user = os.userInfo().username;
			const hasSubuid = hasSubidRange("/etc/subuid", user);
			const hasSubgid = hasSubidRange("/etc/subgid", user);
			if (!hasSubuid || !hasSubgid) {
				errors.push(
					`rootless subuid/subgid mappings missing for ${user} (fix: sudo usermod --add-subuids 100000-165535 ${user} && sudo usermod --add-subgids 100000-165535 ${user})`,
				);
			}
		}

		if (name === "tailscale" && !entry?.preflight?.rootless_subids) {
			const user = os.userInfo().username;
			const hasSubuid = hasSubidRange("/etc/subuid", user);
			const hasSubgid = hasSubidRange("/etc/subgid", user);
			if (!hasSubuid || !hasSubgid) {
				errors.push(
					`rootless subuid/subgid mappings missing for ${user} (fix: sudo usermod --add-subuids 100000-165535 ${user} && sudo usermod --add-subgids 100000-165535 ${user})`,
				);
			}
		}

		return errors;
	}

	function findLocalServicePackage(name: string): { serviceDir: string; quadletDir: string; skillPath: string } | null {
		const candidates = [
			join(repoDir, "services", name),
			`/usr/local/share/bloom/services/${name}`,
			join(process.cwd(), "services", name),
		];
		for (const serviceDir of candidates) {
			const quadletDir = join(serviceDir, "quadlet");
			const skillPath = join(serviceDir, "SKILL.md");
			if (existsSync(quadletDir) && existsSync(skillPath)) {
				return { serviceDir, quadletDir, skillPath };
			}
		}
		return null;
	}

	async function installServicePackage(
		name: string,
		version: string,
		registry: string,
		entry: ServiceCatalogEntry | undefined,
		signal?: AbortSignal,
	): Promise<{ ok: boolean; source: "oci" | "local"; ref: string; note?: string }> {
		const artifactBase = entry?.artifact?.trim() || `${registry}/bloom-svc-${name}`;
		const ref = hasTagOrDigest(artifactBase) ? artifactBase : `${artifactBase}:${version}`;
		const tempDir = mkdtempSync(join(os.tmpdir(), `bloom-manifest-${name}-`));

		try {
			let source: "oci" | "local" = "oci";
			const pull = await runCommand("oras", ["pull", ref, "-o", tempDir], { signal });
			if (pull.exitCode !== 0) {
				const localPackage = findLocalServicePackage(name);
				if (!localPackage) {
					return {
						ok: false,
						source,
						ref,
						note: `Failed to pull ${ref}: ${pull.stderr || pull.stdout}`,
					};
				}

				const localTempQuadlet = join(tempDir, "quadlet");
				mkdirSync(localTempQuadlet, { recursive: true });
				for (const fileName of readdirSync(localPackage.quadletDir)) {
					const src = join(localPackage.quadletDir, fileName);
					if (!statSync(src).isFile()) continue;
					writeFileSync(join(localTempQuadlet, fileName), readFileSync(src));
				}
				writeFileSync(join(tempDir, "SKILL.md"), readFileSync(localPackage.skillPath));
				source = "local";
			}

			const quadletSrc = join(tempDir, "quadlet");
			const skillSrc = join(tempDir, "SKILL.md");
			if (!existsSync(quadletSrc) || !existsSync(skillSrc)) {
				return {
					ok: false,
					source,
					ref,
					note: `Service package for ${name} missing quadlet/ or SKILL.md`,
				};
			}

			const systemdDir = join(os.homedir(), ".config", "containers", "systemd");
			const userSystemdDir = join(os.homedir(), ".config", "systemd", "user");
			const skillDir = join(gardenDir, "Bloom", "Skills", name);
			mkdirSync(systemdDir, { recursive: true });
			mkdirSync(userSystemdDir, { recursive: true });
			mkdirSync(skillDir, { recursive: true });

			const networkDest = join(systemdDir, "bloom.network");
			if (!existsSync(networkDest)) {
				const networkCandidates = [
					"/usr/share/containers/systemd/bloom.network",
					"/usr/local/share/bloom/os/sysconfig/bloom.network",
					join(repoDir, "os", "sysconfig", "bloom.network"),
				];
				for (const candidate of networkCandidates) {
					if (!existsSync(candidate)) continue;
					writeFileSync(networkDest, readFileSync(candidate));
					break;
				}
			}

			for (const fileName of readdirSync(quadletSrc)) {
				const src = join(quadletSrc, fileName);
				if (!statSync(src).isFile()) continue;
				const destDir = fileName.endsWith(".socket") ? userSystemdDir : systemdDir;
				writeFileSync(join(destDir, fileName), readFileSync(src));
			}
			writeFileSync(join(skillDir, "SKILL.md"), readFileSync(skillSrc));

			const tokenDir = join(os.homedir(), ".config", "bloom", "channel-tokens");
			mkdirSync(tokenDir, { recursive: true });
			const tokenPath = join(tokenDir, name);
			const tokenEnvPath = join(tokenDir, `${name}.env`);
			if (!existsSync(tokenPath)) {
				const token = randomBytes(32).toString("hex");
				writeFileSync(tokenPath, `${token}\n`);
				writeFileSync(tokenEnvPath, `BLOOM_CHANNEL_TOKEN=${token}\n`);
			}

			return { ok: true, source, ref };
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	}

	async function detectRunningServices(signal?: AbortSignal): Promise<Map<string, { image: string; state: string }>> {
		const result = await runCommand("podman", ["ps", "-a", "--format", "json", "--filter", "name=bloom-"], { signal });
		const detected = new Map<string, { image: string; state: string }>();
		if (result.exitCode !== 0) return detected;
		try {
			const containers = JSON.parse(result.stdout || "[]") as Array<{
				Names?: string[];
				Image?: string;
				State?: string;
			}>;
			for (const c of containers) {
				const name = (c.Names ?? [])[0]?.replace(/^bloom-/, "") ?? "";
				if (name) {
					detected.set(name, { image: c.Image ?? "unknown", state: c.State ?? "unknown" });
				}
			}
		} catch {
			// parse error
		}
		return detected;
	}

	pi.registerTool({
		name: "runtime_manifest_show",
		label: "Show Manifest",
		description: "Display the declarative service manifest from ~/Garden/Bloom/manifest.yaml",
		promptSnippet: "runtime_manifest_show — display the Bloom service manifest",
		promptGuidelines: ["Use runtime_manifest_show to view the current manifest state and configured services."],
		parameters: Type.Object({}),
		async execute() {
			const manifest = loadManifestState();
			if (Object.keys(manifest.services).length === 0 && !manifest.device) {
				return {
					content: [
						{
							type: "text" as const,
							text: "No manifest found. Use runtime_manifest_sync to generate one from running services.",
						},
					],
					details: {},
				};
			}
			const lines: string[] = [];
			if (manifest.device) lines.push(`Device: ${manifest.device}`);
			if (manifest.os_image) lines.push(`OS Image: ${manifest.os_image}`);
			lines.push("");
			const svcs = Object.entries(manifest.services);
			if (svcs.length === 0) {
				lines.push("No services configured.");
			} else {
				lines.push("Services:");
				for (const [name, svc] of svcs) {
					const ver = svc.version ? `@${svc.version}` : "";
					const state = svc.enabled ? "enabled" : "disabled";
					lines.push(`  ${name}: ${svc.image}${ver} [${state}]`);
				}
			}
			return { content: [{ type: "text" as const, text: lines.join("\n") }], details: manifest };
		},
	});

	pi.registerTool({
		name: "runtime_manifest_sync",
		label: "Sync Manifest",
		description:
			"Reconcile the manifest with actual running containers. Detects drift and can update the manifest or report differences.",
		promptSnippet: "runtime_manifest_sync — reconcile manifest with running state",
		promptGuidelines: [
			"Use runtime_manifest_sync to detect drift between the manifest and reality.",
			"Pass mode='detect' (default) to report differences, mode='update' to update the manifest to match reality.",
		],
		parameters: Type.Object({
			mode: Type.Optional(
				StringEnum(["detect", "update"] as const, {
					description: "detect (report drift) or update (write manifest from running state)",
					default: "detect",
				}),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const mode = params.mode ?? "detect";
			const manifest = loadManifestState();
			const running = await detectRunningServices(signal);

			const bootcResult = await runCommand("bootc", ["status", "--format=json"], { signal });
			let osImage = manifest.os_image;
			if (bootcResult.exitCode === 0) {
				try {
					const status = JSON.parse(bootcResult.stdout) as {
						status?: { booted?: { image?: { image?: { image?: string } } } };
					};
					osImage = status?.status?.booted?.image?.image?.image ?? osImage;
				} catch {
					// keep existing
				}
			}

			const drifts: string[] = [];
			for (const [name, svc] of Object.entries(manifest.services)) {
				if (svc.enabled && !running.has(name)) {
					drifts.push(`- ${name}: manifest says enabled, but not running`);
				}
			}
			for (const [name, info] of running) {
				if (!manifest.services[name]) {
					drifts.push(`- ${name}: running (${info.image}) but not in manifest`);
				} else if (manifest.services[name].image !== info.image) {
					drifts.push(`- ${name}: image mismatch — manifest: ${manifest.services[name].image}, actual: ${info.image}`);
				}
			}
			if (osImage && manifest.os_image && osImage !== manifest.os_image) {
				drifts.push(`- OS image: manifest: ${manifest.os_image}, actual: ${osImage}`);
			}

			if (mode === "update") {
				const hostname = os.hostname();
				const updated: Manifest = {
					device: manifest.device || hostname,
					os_image: osImage,
					services: { ...manifest.services },
				};
				for (const [name, info] of running) {
					if (!updated.services[name]) {
						updated.services[name] = { image: info.image, enabled: true };
					} else {
						updated.services[name].image = info.image;
						updated.services[name].enabled = true;
					}
				}
				saveManifestState(updated);
				const text =
					drifts.length > 0
						? `Manifest updated. Resolved ${drifts.length} drift(s):\n${drifts.join("\n")}`
						: "Manifest updated. No drift detected.";
				return { content: [{ type: "text" as const, text }], details: updated };
			}

			if (drifts.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No drift detected. Manifest matches running state." }],
					details: manifest,
				};
			}
			return {
				content: [
					{
						type: "text" as const,
						text: `${drifts.length} drift(s) detected:\n${drifts.join("\n")}\n\nRun runtime_manifest_sync with mode='update' to reconcile.`,
					},
				],
				details: manifest,
			};
		},
	});

	pi.registerTool({
		name: "runtime_manifest_set_service",
		label: "Set Manifest Service",
		description: "Add or update a service entry in the manifest.",
		promptSnippet: "runtime_manifest_set_service — add/update a service in the manifest",
		promptGuidelines: ["Use runtime_manifest_set_service to declare a service in the manifest."],
		parameters: Type.Object({
			name: Type.String({ description: "Service name (e.g. whatsapp, whisper)" }),
			image: Type.String({ description: "Container image reference" }),
			version: Type.Optional(Type.String({ description: "Semver version tag" })),
			enabled: Type.Optional(Type.Boolean({ description: "Whether service should be running (default: true)" })),
		}),
		async execute(_toolCallId, params) {
			const manifest = loadManifestState();
			manifest.services[params.name] = {
				image: params.image,
				version: params.version,
				enabled: params.enabled ?? true,
			};
			saveManifestState(manifest);
			return {
				content: [
					{
						type: "text" as const,
						text: `Service ${params.name} set in manifest: ${params.image}${params.version ? `@${params.version}` : ""} [${params.enabled !== false ? "enabled" : "disabled"}]`,
					},
				],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "runtime_manifest_apply",
		label: "Apply Manifest",
		description:
			"Apply desired service state from manifest: install/start enabled services and stop disabled services.",
		promptSnippet: "runtime_manifest_apply — apply manifest desired service state",
		promptGuidelines: [
			"Use runtime_manifest_apply to enact desired service state from manifest.yaml.",
			"Prefer install_missing=true for first-time setup on fresh devices.",
		],
		parameters: Type.Object({
			install_missing: Type.Optional(
				Type.Boolean({
					description: "Install missing services from OCI artifacts before applying state",
					default: true,
				}),
			),
			registry: Type.Optional(
				Type.String({ description: "Registry namespace for service artifacts", default: defaultServiceRegistry }),
			),
			allow_latest: Type.Optional(
				Type.Boolean({ description: "Allow installing latest when manifest version is missing", default: false }),
			),
			dry_run: Type.Optional(Type.Boolean({ description: "Preview actions without mutating system", default: false })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const manifest = loadManifestState();
			const serviceEntries = Object.entries(manifest.services).sort(([a], [b]) => a.localeCompare(b));
			if (serviceEntries.length === 0) {
				return errorResult("Manifest has no services. Use runtime_manifest_set_service first.");
			}

			const installMissing = params.install_missing ?? true;
			const registry = params.registry ?? defaultServiceRegistry;
			const allowLatest = params.allow_latest ?? false;
			const dryRun = params.dry_run ?? false;

			if (!dryRun) {
				const denied = await requireConfirmation(ctx, `Apply manifest to ${serviceEntries.length} service(s)`);
				if (denied) return errorResult(denied);
			}

			const catalog = loadServiceCatalogState();
			const lines: string[] = [];
			const errors: string[] = [];
			let installedCount = 0;
			let startedCount = 0;
			let stoppedCount = 0;
			let manifestChanged = false;
			let needsReload = false;

			const systemdDir = join(os.homedir(), ".config", "containers", "systemd");
			const userSystemdDir = join(os.homedir(), ".config", "systemd", "user");

			for (const [name, svc] of serviceEntries) {
				if (!svc.enabled) continue;

				const unit = `bloom-${name}`;
				const containerDef = join(systemdDir, `${unit}.container`);
				if (existsSync(containerDef)) continue;

				if (!installMissing) {
					errors.push(`${name}: missing unit ${containerDef} (set install_missing=true to auto-install)`);
					continue;
				}

				const catalogEntry = catalog[name];
				const version = svc.version?.trim() || catalogEntry?.version || "latest";
				if (version === "latest" && !allowLatest) {
					errors.push(`${name}: refused auto-install with version=latest (set explicit version or allow_latest=true)`);
					continue;
				}

				const preflight = await servicePreflightErrors(name, catalogEntry, signal);
				if (preflight.length > 0) {
					errors.push(`${name}: preflight failed — ${preflight.join("; ")}`);
					continue;
				}

				if (dryRun) {
					lines.push(`[dry-run] install ${name}@${version}`);
					installedCount += 1;
					continue;
				}

				const install = await installServicePackage(name, version, registry, catalogEntry, signal);
				if (!install.ok) {
					errors.push(`${name}: install failed — ${install.note ?? "unknown error"}`);
					continue;
				}

				installedCount += 1;
				needsReload = true;
				lines.push(
					install.source === "oci"
						? `Installed ${name} from ${install.ref}`
						: `Installed ${name} from bundled local package (OCI ref: ${install.ref})`,
				);

				if (!svc.version) {
					manifest.services[name].version = version;
					manifestChanged = true;
				}
				if ((!svc.image || svc.image === "unknown") && catalogEntry?.image) {
					manifest.services[name].image = catalogEntry.image;
					manifestChanged = true;
				}
			}

			if (needsReload && !dryRun) {
				const reload = await runCommand("systemctl", ["--user", "daemon-reload"], { signal });
				if (reload.exitCode !== 0) {
					return errorResult(`runtime_manifest_apply: daemon-reload failed:\n${reload.stderr || reload.stdout}`);
				}
			}

			for (const [name, svc] of serviceEntries) {
				const unit = `bloom-${name}`;
				const containerDef = join(systemdDir, `${unit}.container`);
				const socketDef = join(userSystemdDir, `${unit}.socket`);
				const startTarget = existsSync(socketDef) ? `${unit}.socket` : `${unit}.service`;

				if (svc.enabled) {
					if (!existsSync(containerDef)) {
						errors.push(`${name}: cannot start, unit not installed`);
						continue;
					}

					if (name === "tailscale" && !tailscaleAuthConfigured()) {
						lines.push(
							"Skipped starting bloom-tailscale.service (TS_AUTHKEY not configured). Configure auth, then start it manually.",
						);
						continue;
					}

					if (dryRun) {
						lines.push(`[dry-run] start ${startTarget}`);
						startedCount += 1;
						continue;
					}

					const start = await runCommand("systemctl", ["--user", "start", startTarget], { signal });
					if (start.exitCode !== 0) {
						errors.push(`${name}: failed to start ${startTarget}: ${start.stderr || start.stdout}`);
					} else {
						startedCount += 1;
						lines.push(`Started ${startTarget}`);
					}
					continue;
				}

				if (dryRun) {
					lines.push(`[dry-run] stop ${unit}.socket (if present)`);
					lines.push(`[dry-run] stop ${unit}.service`);
					stoppedCount += 1;
					continue;
				}

				await runCommand("systemctl", ["--user", "stop", `${unit}.socket`], { signal });
				await runCommand("systemctl", ["--user", "stop", `${unit}.service`], { signal });
				stoppedCount += 1;
				lines.push(`Stopped ${unit}`);
			}

			if (manifestChanged && !dryRun) {
				saveManifestState(manifest);
			}

			const summary = [
				`Manifest apply complete (${dryRun ? "dry-run" : "live"}).`,
				`Installed: ${installedCount}`,
				`Started/enabled: ${startedCount}`,
				`Stopped/disabled: ${stoppedCount}`,
				`Errors: ${errors.length}`,
				"",
				...(lines.length > 0 ? ["Actions:", ...lines, ""] : []),
				...(errors.length > 0 ? ["Errors:", ...errors] : []),
			].join("\n");

			return {
				content: [{ type: "text" as const, text: truncate(summary) }],
				details: {
					installed: installedCount,
					started: startedCount,
					stopped: stoppedCount,
					errors,
					dryRun,
				},
				isError: errors.length > 0,
			};
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		if (!existsSync(manifestPath)) return;
		const manifest = loadManifestState();
		const svcCount = Object.keys(manifest.services).length;
		if (svcCount === 0) return;

		const running = await detectRunningServices();
		const drifts: string[] = [];
		for (const [name, svc] of Object.entries(manifest.services)) {
			if (svc.enabled && !running.has(name)) {
				drifts.push(`${name} (not running)`);
			}
		}

		if (ctx.hasUI) {
			if (drifts.length > 0) {
				ctx.ui.setWidget("bloom-manifest", [`Manifest drift: ${drifts.join(", ")}`]);
			}
			ctx.ui.setStatus("bloom-manifest", `Manifest: ${svcCount} services`);
		}
	});
}
