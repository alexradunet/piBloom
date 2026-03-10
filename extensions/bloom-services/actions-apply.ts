/**
 * Manifest apply handler for bloom-services.
 */
import { existsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { run } from "../../lib/exec.js";
import { loadServiceCatalog, servicePreflightErrors } from "../../lib/services-catalog.js";
import { loadManifest, saveManifest } from "../../lib/services-manifest.js";
import { errorResult, requireConfirmation, truncate } from "../../lib/shared.js";
import { installServicePackage } from "./service-io.js";

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
