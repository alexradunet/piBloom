/**
 * Manifest handlers for bloom-services — show, sync, set, and apply declarative service state.
 */
import { existsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { run } from "../../lib/exec.js";
import { loadServiceCatalog, servicePreflightErrors } from "../../lib/services-catalog.js";
import { detectRunningServices, installServicePackage } from "../../lib/services-install.js";
import { type Manifest, loadManifest, saveManifest } from "../../lib/services-manifest.js";
import { errorResult, requireConfirmation, truncate } from "../../lib/shared.js";

export function handleManifestShow(manifestPath: string) {
	const manifest = loadManifest(manifestPath);
	if (Object.keys(manifest.services).length === 0 && !manifest.device) {
		return {
			content: [
				{
					type: "text" as const,
					text: "No manifest found. Use manifest_sync to generate one from running services.",
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
}

export async function handleManifestSync(
	params: { mode?: "detect" | "update" },
	manifestPath: string,
	signal: AbortSignal | undefined,
) {
	const mode = params.mode ?? "detect";
	const manifest = loadManifest(manifestPath);
	const running = await detectRunningServices(signal);

	const bootcResult = await run("bootc", ["status", "--format=json"], signal);
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

		saveManifest(updated, manifestPath);
		const text =
			drifts.length > 0
				? `Manifest updated. Resolved ${drifts.length} drift(s):\n${drifts.join("\n")}`
				: "Manifest updated. No drift detected.";
		return { content: [{ type: "text" as const, text }], details: updated };
	}

	if (drifts.length === 0) {
		return {
			content: [{ type: "text" as const, text: "No drift detected. Manifest matches running state." }],
			details: {} as Manifest,
		};
	}
	return {
		content: [
			{
				type: "text" as const,
				text: `${drifts.length} drift(s) detected:\n${drifts.join("\n")}\n\nRun manifest_sync with mode='update' to reconcile.`,
			},
		],
		details: { drifts } as unknown as Manifest,
	};
}

export function handleManifestSetService(
	params: {
		name: string;
		image: string;
		version?: string;
		enabled?: boolean;
	},
	manifestPath: string,
) {
	const manifest = loadManifest(manifestPath);
	manifest.services[params.name] = {
		image: params.image,
		version: params.version,
		enabled: params.enabled ?? true,
	};
	saveManifest(manifest, manifestPath);
	return {
		content: [
			{
				type: "text" as const,
				text: `Service ${params.name} set in manifest: ${params.image}${params.version ? `@${params.version}` : ""} [${params.enabled !== false ? "enabled" : "disabled"}]`,
			},
		],
		details: {},
	};
}

export async function handleManifestApply(
	params: {
		install_missing?: boolean;
		dry_run?: boolean;
	},
	bloomDir: string,
	manifestPath: string,
	repoDir: string,
	signal: AbortSignal | undefined,
	ctx: ExtensionContext,
) {
	const manifest = loadManifest(manifestPath);
	const serviceEntries = Object.entries(manifest.services).sort(([a], [b]) => a.localeCompare(b));
	if (serviceEntries.length === 0) {
		return errorResult("Manifest has no services. Use manifest_set_service first.");
	}

	const installMissing = params.install_missing ?? true;
	const dryRun = params.dry_run ?? false;

	if (!dryRun) {
		const denied = await requireConfirmation(ctx, `Apply manifest to ${serviceEntries.length} service(s)`);
		if (denied) return errorResult(denied);
	}

	const catalog = loadServiceCatalog(repoDir);
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

		const installResult = await installServicePackage(name, version, bloomDir, repoDir, catalogEntry, signal);
		if (!installResult.ok) {
			errors.push(`${name}: install failed — ${installResult.note ?? "unknown error"}`);
			continue;
		}

		installedCount += 1;
		needsReload = true;
		lines.push(`Installed ${name} from bundled local package`);

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
		const reload = await run("systemctl", ["--user", "daemon-reload"], signal);
		if (reload.exitCode !== 0) {
			return errorResult(`manifest_apply: daemon-reload failed:\n${reload.stderr || reload.stdout}`);
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

			if (dryRun) {
				lines.push(`[dry-run] start ${startTarget}`);
				startedCount += 1;
				continue;
			}

			const startResult = await run("systemctl", ["--user", "start", startTarget], signal);
			if (startResult.exitCode !== 0) {
				errors.push(`${name}: failed to start ${startTarget}: ${startResult.stderr || startResult.stdout}`);
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

		await run("systemctl", ["--user", "stop", `${unit}.socket`], signal);
		await run("systemctl", ["--user", "stop", `${unit}.service`], signal);
		stoppedCount += 1;
		lines.push(`Stopped ${unit}`);
	}

	if (manifestChanged && !dryRun) {
		saveManifest(manifest, manifestPath);
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
}
