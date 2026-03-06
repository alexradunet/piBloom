/**
 * 💻 bloom-os — OS management, bootc lifecycle, containers, systemd, repo management.
 *
 * @tools bootc_status, bootc_update, bootc_rollback, container_status, container_logs, container_deploy, systemd_control, system_health, update_status, schedule_reboot, bloom_repo_configure, bloom_repo_sync, bloom_repo_submit_pr, bloom_repo_status, manifest_show, manifest_sync, manifest_set_service, manifest_apply
 * @hooks session_start, before_agent_start
 * @see {@link ../AGENTS.md#bloom-os} Extension reference
 */
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { run } from "../lib/exec.js";
import {
	detectRunningServices,
	installServicePackage,
	loadManifest,
	loadServiceCatalog,
	type Manifest,
	saveManifest,
	servicePreflightErrors,
	tailscaleAuthConfigured,
} from "../lib/manifest.js";
import { guardBloom, parseGithubSlugFromUrl, slugifyBranchPart } from "../lib/os-utils.js";
import { getRemoteUrl, inferRepoUrl } from "../lib/repo.js";
import { errorResult, getGardenDir, truncate } from "../lib/shared.js";

async function requireConfirmation(
	ctx: ExtensionContext,
	action: string,
	options?: { requireUi?: boolean },
): Promise<string | null> {
	const requireUi = options?.requireUi ?? true;
	if (!ctx.hasUI) {
		return requireUi ? `Cannot perform "${action}" without interactive user confirmation.` : null;
	}
	const confirmed = await ctx.ui.confirm("Confirm action", `Allow: ${action}?`);
	if (!confirmed) return `User declined: ${action}`;
	return null;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "bootc_status",
		label: "OS Image Status",
		description: "Shows the current Fedora bootc OS image status, pending updates, and rollback availability.",
		promptSnippet: "bootc_status — show OS image version and update status",
		promptGuidelines: ["Use bootc_status when the user asks about OS version, update status, or system health"],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal, _onUpdate, _ctx) {
			const result = await run("bootc", ["status"], signal);
			const text = truncate(result.exitCode === 0 ? result.stdout : `Error running bootc status:\n${result.stderr}`);
			return {
				content: [{ type: "text", text }],
				details: { exitCode: result.exitCode },
				isError: result.exitCode !== 0,
			};
		},
	});

	pi.registerTool({
		name: "bootc_update",
		label: "OS Update",
		description: "Check for, download, or apply a Fedora bootc OS update using a staged workflow.",
		promptSnippet: "bootc_update — check, download, or apply OS updates",
		promptGuidelines: [
			"Use bootc_update with stage='check' first, then 'download' to fetch, then 'apply' to stage for reboot.",
			"The 'download' and 'apply' stages require user confirmation.",
		],
		parameters: Type.Object({
			stage: Type.Optional(
				StringEnum(["check", "download", "apply"] as const, {
					description: "Update stage: check (default), download (fetch only), apply (stage for reboot)",
					default: "check",
				}),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const stage = params.stage ?? "check";
			if (stage !== "check") {
				const denied = await requireConfirmation(ctx, `OS update: ${stage}`);
				if (denied) return errorResult(denied);
			}
			let cmd: string;
			let fullArgs: string[];
			switch (stage) {
				case "check":
					cmd = "bootc";
					fullArgs = ["upgrade", "--check"];
					break;
				case "download":
					cmd = "sudo";
					fullArgs = ["bootc", "upgrade", "--check"];
					break;
				case "apply":
					cmd = "sudo";
					fullArgs = ["bootc", "upgrade"];
					break;
			}
			const result = await run(cmd, fullArgs, signal);
			const text = truncate(result.exitCode === 0 ? result.stdout || "No output." : `Error:\n${result.stderr}`);
			return {
				content: [{ type: "text", text }],
				details: { exitCode: result.exitCode, stage },
				isError: result.exitCode !== 0,
			};
		},
	});

	pi.registerTool({
		name: "bootc_rollback",
		label: "OS Rollback",
		description: "Rollback to the previous Fedora bootc OS image. Requires reboot to take effect.",
		promptSnippet: "bootc_rollback — rollback to previous OS image",
		promptGuidelines: [
			"Use bootc_rollback to revert to the previous OS image after a failed update.",
			"Requires user confirmation. Takes effect on next reboot.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
			const denied = await requireConfirmation(ctx, "Rollback to previous OS image via bootc rollback");
			if (denied) return errorResult(denied);
			const result = await run("sudo", ["bootc", "rollback"], signal);
			const text = truncate(
				result.exitCode === 0 ? result.stdout || "Rollback staged. Reboot to apply." : `Error:\n${result.stderr}`,
			);
			return {
				content: [{ type: "text", text }],
				details: { exitCode: result.exitCode },
				isError: result.exitCode !== 0,
			};
		},
	});

	pi.registerTool({
		name: "container_status",
		label: "Container Status",
		description: "Lists running Bloom containers and their health status.",
		promptSnippet: "container_status — list running bloom-* containers",
		promptGuidelines: ["Use container_status to check running Bloom containers and their health"],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal, _onUpdate, _ctx) {
			const result = await run("podman", ["ps", "--format", "json", "--filter", "name=bloom-"], signal);
			if (result.exitCode !== 0) {
				return errorResult(`Error listing containers:\n${result.stderr}`);
			}
			let text: string;
			try {
				const containers = JSON.parse(result.stdout || "[]") as Array<{
					Names?: string[];
					Status?: string;
					State?: string;
					Image?: string;
				}>;
				if (containers.length === 0) {
					text = "No bloom-* containers are currently running.";
				} else {
					text = containers
						.map((c) => {
							const name = (c.Names ?? []).join(", ") || "unknown";
							const status = c.Status ?? c.State ?? "unknown";
							const image = c.Image ?? "unknown";
							return `${name}\n  status: ${status}\n  image:  ${image}`;
						})
						.join("\n\n");
				}
			} catch {
				text = result.stdout;
			}
			return { content: [{ type: "text", text: truncate(text) }], details: {} };
		},
	});

	pi.registerTool({
		name: "container_logs",
		label: "Container Logs",
		description: "Fetches recent journald logs for a Bloom service.",
		promptSnippet: "container_logs — tail logs for a bloom-* service",
		promptGuidelines: [
			"Use container_logs to check recent logs for a Bloom service. Only bloom-* services are accessible.",
		],
		parameters: Type.Object({
			service: Type.String({ description: "Service name (e.g. bloom-whatsapp)" }),
			lines: Type.Optional(Type.Number({ description: "Number of log lines to return", default: 50 })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const guard = guardBloom(params.service);
			if (guard) return errorResult(guard);
			const n = String(params.lines ?? 50);
			const unit = `${params.service}.service`;
			const result = await run("journalctl", ["--user", "-u", unit, "--no-pager", "-n", n], signal);
			const text = truncate(
				result.exitCode === 0 ? result.stdout || "(no log output)" : `Error fetching logs:\n${result.stderr}`,
			);
			return {
				content: [{ type: "text", text }],
				details: { exitCode: result.exitCode },
				isError: result.exitCode !== 0,
			};
		},
	});

	pi.registerTool({
		name: "systemd_control",
		label: "Systemd Service Control",
		description: "Manage a Bloom user-systemd service (start, stop, restart, status).",
		promptSnippet: "systemd_control — start/stop/restart/status a bloom-* service",
		promptGuidelines: [
			"Use systemd_control to manage Bloom user-systemd services. Only bloom-* services can be controlled.",
			"Use status for read-only checks; other actions require justification.",
		],
		parameters: Type.Object({
			service: Type.String({ description: "Service name (e.g. bloom-whatsapp)" }),
			action: StringEnum(["start", "stop", "restart", "status"] as const),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const guard = guardBloom(params.service);
			if (guard) return errorResult(guard);
			const unit = `${params.service}.service`;
			const readOnly = params.action === "status";
			if (!readOnly) {
				const denied = await requireConfirmation(ctx, `systemctl ${params.action} ${unit}`);
				if (denied) return errorResult(denied);
			}
			const result = await run("systemctl", ["--user", params.action, unit], signal);
			const text = truncate(result.stdout || result.stderr || `systemctl --user ${params.action} ${unit} completed.`);
			return {
				content: [{ type: "text", text }],
				details: { exitCode: result.exitCode },
				isError: result.exitCode !== 0,
			};
		},
	});

	pi.registerTool({
		name: "container_deploy",
		label: "Deploy Container",
		description: "Reload user systemd and start a Bloom Quadlet unit.",
		promptSnippet: "container_deploy — deploy a bloom-* Quadlet container unit",
		promptGuidelines: [
			"Use container_deploy to start a new container from an existing Quadlet unit file. Only bloom-* units can be deployed.",
		],
		parameters: Type.Object({
			quadlet_name: Type.String({ description: "Name of the Quadlet unit to deploy (e.g. bloom-web)" }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const guard = guardBloom(params.quadlet_name);
			if (guard) return errorResult(guard);
			const unit = `${params.quadlet_name}.service`;
			const denied = await requireConfirmation(ctx, `Deploy container ${unit}`);
			if (denied) return errorResult(denied);
			const reload = await run("systemctl", ["--user", "daemon-reload"], signal);
			if (reload.exitCode !== 0) {
				return errorResult(`systemctl --user daemon-reload failed:\n${reload.stderr}`);
			}
			const start = await run("systemctl", ["--user", "start", unit], signal);
			const text = truncate(
				start.exitCode === 0 ? `Started ${unit} successfully.` : `Failed to start ${unit}:\n${start.stderr}`,
			);
			return {
				content: [{ type: "text", text }],
				details: { exitCode: start.exitCode },
				isError: start.exitCode !== 0,
			};
		},
	});

	// --- Update detection tools ---

	const bloomDir = join(os.homedir(), ".bloom");
	const statusFile = join(bloomDir, "update-status.json");
	const repoDir = join(bloomDir, "pi-bloom");
	const defaultServiceRegistry =
		process.env.BLOOM_SERVICE_REGISTRY?.trim() || process.env.BLOOM_REGISTRY?.trim() || "ghcr.io/pibloom";

	pi.registerTool({
		name: "update_status",
		label: "Update Status",
		description: "Reads the Bloom OS update status from the last scheduled check.",
		promptSnippet: "update_status — check if an OS update is available",
		promptGuidelines: ["Use update_status to check whether a new OS image is available before suggesting an upgrade."],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			try {
				const raw = await readFile(statusFile, "utf-8");
				const status = JSON.parse(raw);
				const text = status.available
					? `Update available (checked ${status.checked}). Version: ${status.version || "unknown"}`
					: `System is up to date (checked ${status.checked}).`;
				return { content: [{ type: "text", text }], details: status };
			} catch {
				return errorResult("No update status available. The update check timer may not have run yet.");
			}
		},
	});

	pi.registerTool({
		name: "schedule_reboot",
		label: "Schedule Reboot",
		description: "Schedule a system reboot after a delay (in minutes). Requires user confirmation.",
		promptSnippet: "schedule_reboot — schedule a delayed system reboot",
		promptGuidelines: [
			"ALWAYS ask for explicit user confirmation before calling schedule_reboot.",
			"Use after staging an OS update to apply it.",
		],
		parameters: Type.Object({
			delay_minutes: Type.Number({ description: "Minutes to wait before rebooting", default: 1 }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const delay = Math.max(1, Math.round(params.delay_minutes));
			const denied = await requireConfirmation(ctx, `Schedule reboot in ${delay} minute(s)`);
			if (denied) return errorResult(denied);
			const result = await run("sudo", ["systemd-run", `--on-active=${delay}m`, "systemctl", "reboot"], signal);
			if (result.exitCode !== 0) {
				return errorResult(`Failed to schedule reboot:\n${result.stderr}`);
			}
			return {
				content: [{ type: "text", text: `Reboot scheduled in ${delay} minute(s).` }],
				details: { delay_minutes: delay },
			};
		},
	});

	pi.registerTool({
		name: "bloom_repo_configure",
		label: "Configure Bloom Repo",
		description: "Clone/configure local Bloom repo remotes for PR-based self-evolution (upstream + origin fork).",
		promptSnippet: "bloom_repo_configure — bootstrap local repo and remotes",
		promptGuidelines: [
			"Use bloom_repo_configure during first-boot so each device can submit fixes via PR.",
			"Set upstream to canonical repo and origin to a writable fork whenever possible.",
		],
		parameters: Type.Object({
			repo_url: Type.Optional(
				Type.String({ description: "Canonical upstream repository URL (https://github.com/{owner}/pi-bloom.git)" }),
			),
			fork_url: Type.Optional(Type.String({ description: "Writable fork URL to set as origin (optional)" })),
			git_name: Type.Optional(Type.String({ description: "Local git author name for this device" })),
			git_email: Type.Optional(Type.String({ description: "Local git author email for this device" })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			mkdirSync(bloomDir, { recursive: true });
			const changes: string[] = [];
			const notes: string[] = [];

			const repoCheck = await run("git", ["-C", repoDir, "rev-parse", "--git-dir"], signal);
			const repoExists = repoCheck.exitCode === 0;
			const upstreamUrl = (params.repo_url?.trim() || (await inferRepoUrl(repoDir, signal))).trim();

			if (!repoExists) {
				const clone = await run("git", ["clone", upstreamUrl, repoDir], signal);
				if (clone.exitCode !== 0) {
					return errorResult(`Failed to clone ${upstreamUrl} into ${repoDir}:\n${clone.stderr}`);
				}
				changes.push(`cloned ${upstreamUrl} -> ${repoDir}`);
			}

			const ensureRepo = await run("git", ["-C", repoDir, "rev-parse", "--git-dir"], signal);
			if (ensureRepo.exitCode !== 0) {
				return errorResult(`No repo clone found at ${repoDir}. Run first-boot setup to clone it.`);
			}

			const currentUpstream = await getRemoteUrl(repoDir, "upstream", signal);
			if (!currentUpstream) {
				const add = await run("git", ["-C", repoDir, "remote", "add", "upstream", upstreamUrl], signal);
				if (add.exitCode !== 0) return errorResult(`Failed to add upstream remote:\n${add.stderr}`);
				changes.push(`remote upstream -> ${upstreamUrl}`);
			} else if (currentUpstream !== upstreamUrl) {
				const set = await run("git", ["-C", repoDir, "remote", "set-url", "upstream", upstreamUrl], signal);
				if (set.exitCode !== 0) return errorResult(`Failed to set upstream remote:\n${set.stderr}`);
				changes.push(`updated upstream: ${currentUpstream} -> ${upstreamUrl}`);
			}

			const currentOrigin = await getRemoteUrl(repoDir, "origin", signal);
			if (params.fork_url?.trim()) {
				const forkUrl = params.fork_url.trim();
				if (!currentOrigin) {
					const add = await run("git", ["-C", repoDir, "remote", "add", "origin", forkUrl], signal);
					if (add.exitCode !== 0) return errorResult(`Failed to add origin remote:\n${add.stderr}`);
					changes.push(`remote origin -> ${forkUrl}`);
				} else if (currentOrigin !== forkUrl) {
					const set = await run("git", ["-C", repoDir, "remote", "set-url", "origin", forkUrl], signal);
					if (set.exitCode !== 0) return errorResult(`Failed to set origin remote:\n${set.stderr}`);
					changes.push(`updated origin: ${currentOrigin} -> ${forkUrl}`);
				}
			} else if (!currentOrigin) {
				const upstreamSlug = parseGithubSlugFromUrl(upstreamUrl);
				const ghAuth = await run("gh", ["auth", "status"], signal);
				if (upstreamSlug && ghAuth.exitCode === 0) {
					const fork = await run(
						"gh",
						["repo", "fork", upstreamSlug, "--remote", "--remote-name", "origin", "--clone=false"],
						signal,
					);
					if (fork.exitCode === 0) {
						changes.push(`created/attached fork remote origin for ${upstreamSlug}`);
					} else {
						notes.push(`Could not auto-create fork with gh: ${fork.stderr.trim()}`);
					}
				} else {
					notes.push("gh auth not available; skipping auto-fork creation.");
				}

				const originAfterFork = await getRemoteUrl(repoDir, "origin", signal);
				if (!originAfterFork) {
					const fallback = await run("git", ["-C", repoDir, "remote", "add", "origin", upstreamUrl], signal);
					if (fallback.exitCode !== 0) return errorResult(`Failed to set fallback origin remote:\n${fallback.stderr}`);
					changes.push(`fallback origin -> ${upstreamUrl}`);
					notes.push("origin currently points to upstream. Set fork_url later for writable PR flow.");
				}
			}

			const hostname = os.hostname();
			const desiredName = params.git_name?.trim() || `Bloom (${hostname})`;
			const desiredEmail = params.git_email?.trim() || `bloom+${hostname}@localhost`;

			const setName = await run("git", ["-C", repoDir, "config", "user.name", desiredName], signal);
			if (setName.exitCode !== 0) return errorResult(`Failed to set git user.name:\n${setName.stderr}`);
			const setEmail = await run("git", ["-C", repoDir, "config", "user.email", desiredEmail], signal);
			if (setEmail.exitCode !== 0) return errorResult(`Failed to set git user.email:\n${setEmail.stderr}`);
			changes.push(`git identity -> ${desiredName} <${desiredEmail}>`);

			const remotes = await run("git", ["-C", repoDir, "remote", "-v"], signal);
			const text = [
				`Repo path: ${repoDir}`,
				changes.length > 0 ? `\nChanges:\n- ${changes.join("\n- ")}` : "\nChanges:\n- (none)",
				`\nRemotes:\n${(remotes.stdout || remotes.stderr).trim() || "(none)"}`,
				notes.length > 0 ? `\nNotes:\n- ${notes.join("\n- ")}` : "",
			].join("\n");
			return { content: [{ type: "text", text: text.trim() }], details: { path: repoDir } };
		},
	});

	pi.registerTool({
		name: "bloom_repo_sync",
		label: "Sync Bloom Repo",
		description: "Fetch upstream and fast-forward a local branch (default: main).",
		promptSnippet: "bloom_repo_sync — sync local repo from upstream",
		promptGuidelines: [
			"Use bloom_repo_sync before starting a fix branch to reduce merge conflicts.",
			"Prefer fast-forward sync from upstream main.",
		],
		parameters: Type.Object({
			branch: Type.Optional(
				Type.String({ description: "Branch to sync from upstream (default: main)", default: "main" }),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const branch = (params.branch ?? "main").trim() || "main";
			const check = await run("git", ["-C", repoDir, "rev-parse", "--git-dir"], signal);
			if (check.exitCode !== 0)
				return errorResult(`No repo clone found at ${repoDir}. Run bloom_repo_configure first.`);

			const fetch = await run("git", ["-C", repoDir, "fetch", "upstream", "--prune"], signal);
			if (fetch.exitCode !== 0) {
				return errorResult(`Failed to fetch upstream:\n${fetch.stderr || fetch.stdout}`);
			}

			const checkout = await run("git", ["-C", repoDir, "checkout", branch], signal);
			if (checkout.exitCode !== 0) {
				return errorResult(`Failed to checkout ${branch}:\n${checkout.stderr || checkout.stdout}`);
			}

			const pull = await run("git", ["-C", repoDir, "pull", "--ff-only", "upstream", branch], signal);
			if (pull.exitCode !== 0) {
				return errorResult(`Failed to fast-forward ${branch} from upstream:\n${pull.stderr || pull.stdout}`);
			}

			const short = await run("git", ["-C", repoDir, "rev-parse", "--short", "HEAD"], signal);
			const text = `Synced ${branch} from upstream. HEAD: ${short.stdout.trim() || "unknown"}`;
			return { content: [{ type: "text", text }], details: { path: repoDir, branch } };
		},
	});

	pi.registerTool({
		name: "bloom_repo_submit_pr",
		label: "Submit Bloom Fix PR",
		description: "Create branch + commit + push + PR from local repo changes to upstream.",
		promptSnippet: "bloom_repo_submit_pr — submit local fix as pull request",
		promptGuidelines: [
			"Use bloom_repo_submit_pr after implementing and testing a local fix.",
			"Never push directly to main; always open a PR.",
		],
		parameters: Type.Object({
			title: Type.String({ description: "Pull request title" }),
			body: Type.Optional(Type.String({ description: "Pull request body markdown" })),
			commit_message: Type.Optional(Type.String({ description: "Commit message (default: fix: <title>)" })),
			branch: Type.Optional(Type.String({ description: "Branch name (default auto-generated from hostname/title)" })),
			base: Type.Optional(Type.String({ description: "Base branch on upstream (default: main)", default: "main" })),
			draft: Type.Optional(Type.Boolean({ description: "Open as draft PR", default: false })),
			add_all: Type.Optional(Type.Boolean({ description: "Stage all local changes before commit", default: true })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const denied = await requireConfirmation(
				ctx,
				`Create pull request "${params.title}" from local Bloom repo changes`,
				{
					requireUi: false,
				},
			);
			if (denied) return errorResult(denied);

			const check = await run("git", ["-C", repoDir, "rev-parse", "--git-dir"], signal);
			if (check.exitCode !== 0)
				return errorResult(`No repo clone found at ${repoDir}. Run bloom_repo_configure first.`);

			const ghAuth = await run("gh", ["auth", "status"], signal);
			if (ghAuth.exitCode !== 0) {
				return errorResult(`GitHub auth is not ready. Run gh auth login first.\n${ghAuth.stderr || ghAuth.stdout}`);
			}

			const upstreamUrl = await getRemoteUrl(repoDir, "upstream", signal);
			const originUrl = await getRemoteUrl(repoDir, "origin", signal);
			if (!upstreamUrl) return errorResult("Missing upstream remote. Run bloom_repo_configure first.");
			if (!originUrl) return errorResult("Missing origin remote. Run bloom_repo_configure with fork_url first.");

			const upstreamSlug = parseGithubSlugFromUrl(upstreamUrl);
			const originSlug = parseGithubSlugFromUrl(originUrl);
			if (!upstreamSlug) return errorResult(`Cannot parse upstream GitHub slug from ${upstreamUrl}`);

			const base = (params.base ?? "main").trim() || "main";
			const currentBranch = await run("git", ["-C", repoDir, "branch", "--show-current"], signal);
			const nowBranch = currentBranch.stdout.trim() || "main";
			const defaultBranch = `node/${slugifyBranchPart(os.hostname())}/${slugifyBranchPart(params.title) || "fix"}`;
			const targetBranch = (params.branch?.trim() || (nowBranch === base ? defaultBranch : nowBranch)).trim();

			if (nowBranch !== targetBranch) {
				const checkout = await run("git", ["-C", repoDir, "checkout", "-B", targetBranch], signal);
				if (checkout.exitCode !== 0) {
					return errorResult(`Failed to switch to branch ${targetBranch}:\n${checkout.stderr || checkout.stdout}`);
				}
			}

			if (params.add_all ?? true) {
				const add = await run("git", ["-C", repoDir, "add", "-A"], signal);
				if (add.exitCode !== 0) {
					return errorResult(`Failed to stage changes:\n${add.stderr || add.stdout}`);
				}
			}

			const staged = await run("git", ["-C", repoDir, "diff", "--cached", "--name-only"], signal);
			if (!staged.stdout.trim()) {
				return errorResult("No staged changes found. Make edits first, then retry bloom_repo_submit_pr.");
			}

			const commitMessage = (params.commit_message?.trim() || `fix: ${params.title}`).trim();
			const commit = await run("git", ["-C", repoDir, "commit", "-m", commitMessage], signal);
			if (commit.exitCode !== 0) {
				return errorResult(`Failed to commit changes:\n${commit.stderr || commit.stdout}`);
			}

			const push = await run("git", ["-C", repoDir, "push", "--set-upstream", "origin", targetBranch], signal);
			if (push.exitCode !== 0) {
				return errorResult(`Failed to push branch ${targetBranch} to origin:\n${push.stderr || push.stdout}`);
			}

			const originOwner = originSlug?.split("/")[0] ?? null;
			const headRef = originOwner && originSlug !== upstreamSlug ? `${originOwner}:${targetBranch}` : targetBranch;
			const body =
				params.body?.trim() ||
				["## Summary", params.title, "", "## Source", `Submitted from Bloom device: ${os.hostname()}`].join("\n");

			const prArgs = [
				"pr",
				"create",
				"--repo",
				upstreamSlug,
				"--base",
				base,
				"--head",
				headRef,
				"--title",
				params.title,
				"--body",
				body,
			];
			if (params.draft) prArgs.push("--draft");

			const pr = await run("gh", prArgs, signal);
			let prUrl = pr.stdout.trim();
			if (pr.exitCode !== 0) {
				const existing = await run(
					"gh",
					[
						"pr",
						"list",
						"--repo",
						upstreamSlug,
						"--state",
						"open",
						"--head",
						headRef,
						"--json",
						"url",
						"-q",
						".[0].url",
					],
					signal,
				);
				if (existing.exitCode === 0 && existing.stdout.trim()) {
					prUrl = existing.stdout.trim();
				} else {
					return errorResult(`Failed to create PR:\n${pr.stderr || pr.stdout}`);
				}
			}

			const files = staged.stdout
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((f) => `- ${f}`)
				.join("\n");

			const text = [
				`PR ready: ${prUrl || "(URL unavailable)"}`,
				`Branch: ${targetBranch}`,
				`Base: ${base}`,
				"",
				"Files:",
				files || "- (unknown)",
			].join("\n");

			return {
				content: [{ type: "text", text }],
				details: { path: repoDir, branch: targetBranch, base, pr_url: prUrl || null },
			};
		},
	});

	pi.registerTool({
		name: "bloom_repo_status",
		label: "Bloom Repo Status",
		description: "Check local Bloom repo status, remotes, and PR readiness.",
		promptSnippet: "bloom_repo_status — check local repo and remotes",
		promptGuidelines: [
			"Use bloom_repo_status before starting self-evolution git operations.",
			"Verify upstream/origin remotes and gh auth before attempting PR submission.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal, _onUpdate, _ctx) {
			const check = await run("git", ["-C", repoDir, "rev-parse", "--git-dir"], signal);
			if (check.exitCode !== 0) {
				return errorResult(`No repo clone found at ${repoDir}. Run bloom_repo_configure first.`);
			}
			const branch = await run("git", ["-C", repoDir, "branch", "--show-current"], signal);
			const status = await run("git", ["-C", repoDir, "status", "--short"], signal);
			const log = await run("git", ["-C", repoDir, "log", "--oneline", "-5"], signal);
			const remotes = await run("git", ["-C", repoDir, "remote", "-v"], signal);
			const ghAuth = await run("gh", ["auth", "status"], signal);
			const upstream = await getRemoteUrl(repoDir, "upstream", signal);
			const origin = await getRemoteUrl(repoDir, "origin", signal);
			const upstreamSlug = upstream ? parseGithubSlugFromUrl(upstream) : null;
			const originSlug = origin ? parseGithubSlugFromUrl(origin) : null;

			const ready = upstreamSlug && originSlug && ghAuth.exitCode === 0 ? "yes" : "no";
			const originIsUpstream = upstream && origin && upstream === origin;
			const text = [
				`Path: ${repoDir}`,
				`Branch: ${branch.stdout.trim() || "unknown"}`,
				`PR-ready: ${ready}`,
				`Upstream: ${upstream ?? "(missing)"}`,
				`Origin: ${origin ?? "(missing)"}`,
				originIsUpstream
					? "Warning: origin matches upstream. Configure a writable fork URL for safer fork-based PR flow."
					: "",
				`\nStatus:\n${status.stdout.trim() || "(clean)"}`,
				`\nRemotes:\n${remotes.stdout.trim() || "(none)"}`,
				`\nRecent commits:\n${log.stdout.trim()}`,
				`\nGitHub auth:\n${ghAuth.exitCode === 0 ? "ok" : (ghAuth.stderr || ghAuth.stdout).trim() || "not authenticated"}`,
			].join("\n");
			return { content: [{ type: "text", text }], details: { path: repoDir, pr_ready: ready === "yes" } };
		},
	});

	pi.registerTool({
		name: "system_health",
		label: "System Health",
		description: "Composite health check: OS image status, containers, disk usage, system load, and memory.",
		promptSnippet: "system_health — comprehensive system health overview",
		promptGuidelines: [
			"Use system_health for a quick overview of the entire system.",
			"Run proactively at session start or when the user asks about system health.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal, _onUpdate, _ctx) {
			const sections: string[] = [];

			// OS image status
			const bootc = await run("bootc", ["status", "--format=json"], signal);
			if (bootc.exitCode === 0) {
				try {
					const status = JSON.parse(bootc.stdout) as {
						status?: { booted?: { image?: { image?: { image?: string; version?: string } } } };
					};
					const img = status?.status?.booted?.image?.image;
					sections.push(`## OS Image\n- Image: ${img?.image ?? "unknown"}\n- Version: ${img?.version ?? "unknown"}`);
				} catch {
					sections.push(`## OS Image\n${bootc.stdout.slice(0, 200)}`);
				}
			} else {
				sections.push("## OS Image\n(bootc status unavailable)");
			}

			// Container health
			const ps = await run("podman", ["ps", "--format", "json", "--filter", "name=bloom-"], signal);
			if (ps.exitCode === 0) {
				try {
					const containers = JSON.parse(ps.stdout || "[]") as Array<{
						Names?: string[];
						Status?: string;
						State?: string;
					}>;
					if (containers.length === 0) {
						sections.push("## Containers\nNo bloom-* containers running.");
					} else {
						const lines = containers.map((c) => {
							const name = (c.Names ?? []).join(", ") || "unknown";
							return `- ${name}: ${c.Status ?? c.State ?? "unknown"}`;
						});
						sections.push(`## Containers\n${lines.join("\n")}`);
					}
				} catch {
					sections.push("## Containers\n(parse error)");
				}
			}

			// Disk usage
			const df = await run("df", ["-h", "/", "/var", "/home"], signal);
			if (df.exitCode === 0) {
				sections.push(`## Disk Usage\n\`\`\`\n${df.stdout.trim()}\n\`\`\``);
			}

			// System load & memory
			const loadavg = await run("cat", ["/proc/loadavg"], signal);
			const meminfo = await run("free", ["-h", "--si"], signal);
			const uptime = await run("uptime", ["-p"], signal);

			const loadParts: string[] = [];
			if (loadavg.exitCode === 0) {
				const parts = loadavg.stdout.trim().split(/\s+/);
				loadParts.push(`Load: ${parts.slice(0, 3).join(" ")}`);
			}
			if (uptime.exitCode === 0) {
				loadParts.push(`Uptime: ${uptime.stdout.trim()}`);
			}
			if (meminfo.exitCode === 0) {
				const memLine = meminfo.stdout.split("\n").find((l) => l.startsWith("Mem:"));
				if (memLine) {
					const cols = memLine.split(/\s+/);
					loadParts.push(`Memory: ${cols[2] ?? "?"} used / ${cols[1] ?? "?"} total`);
				}
			}
			if (loadParts.length > 0) {
				sections.push(`## System\n${loadParts.map((l) => `- ${l}`).join("\n")}`);
			}

			const text = sections.join("\n\n");
			return { content: [{ type: "text", text: truncate(text) }], details: {} };
		},
	});

	// --- Declarative service manifest ---

	const gardenDir = getGardenDir();
	const manifestPath = join(gardenDir, "Bloom", "manifest.yaml");

	pi.registerTool({
		name: "manifest_show",
		label: "Show Manifest",
		description: "Display the declarative service manifest from ~/Garden/Bloom/manifest.yaml",
		promptSnippet: "manifest_show — display the Bloom service manifest",
		promptGuidelines: ["Use manifest_show to view the current manifest state and configured services."],
		parameters: Type.Object({}),
		async execute() {
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
		},
	});

	pi.registerTool({
		name: "manifest_sync",
		label: "Sync Manifest",
		description:
			"Reconcile the manifest with actual running containers. Detects drift and can update the manifest or report differences.",
		promptSnippet: "manifest_sync — reconcile manifest with running state",
		promptGuidelines: [
			"Use manifest_sync to detect drift between the manifest and reality.",
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
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const mode = params.mode ?? "detect";
			const manifest = loadManifest(manifestPath);
			const running = await detectRunningServices(signal);

			// Get OS image info
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

			// Check for services in manifest but not running
			for (const [name, svc] of Object.entries(manifest.services)) {
				if (svc.enabled && !running.has(name)) {
					drifts.push(`- ${name}: manifest says enabled, but not running`);
				}
			}

			// Check for running services not in manifest
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

				saveManifest(updated, manifestPath, gardenDir);
				const text =
					drifts.length > 0
						? `Manifest updated. Resolved ${drifts.length} drift(s):\n${drifts.join("\n")}`
						: "Manifest updated. No drift detected.";
				return { content: [{ type: "text" as const, text }], details: updated };
			}

			// detect mode
			if (drifts.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No drift detected. Manifest matches running state." }],
					details: {},
				};
			}
			return {
				content: [
					{
						type: "text" as const,
						text: `${drifts.length} drift(s) detected:\n${drifts.join("\n")}\n\nRun manifest_sync with mode='update' to reconcile.`,
					},
				],
				details: { drifts },
			};
		},
	});

	pi.registerTool({
		name: "manifest_set_service",
		label: "Set Manifest Service",
		description: "Add or update a service entry in the manifest.",
		promptSnippet: "manifest_set_service — add/update a service in the manifest",
		promptGuidelines: ["Use manifest_set_service to declare a service in the manifest."],
		parameters: Type.Object({
			name: Type.String({ description: "Service name (e.g. whatsapp, whisper)" }),
			image: Type.String({ description: "Container image reference" }),
			version: Type.Optional(Type.String({ description: "Semver version tag" })),
			enabled: Type.Optional(Type.Boolean({ description: "Whether service should be running (default: true)" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const manifest = loadManifest(manifestPath);
			manifest.services[params.name] = {
				image: params.image,
				version: params.version,
				enabled: params.enabled ?? true,
			};
			saveManifest(manifest, manifestPath, gardenDir);
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
		name: "manifest_apply",
		label: "Apply Manifest",
		description:
			"Apply desired service state from manifest: install/start enabled services and stop disabled services.",
		promptSnippet: "manifest_apply — apply manifest desired service state",
		promptGuidelines: [
			"Use manifest_apply to enact desired service state from manifest.yaml.",
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
			const manifest = loadManifest(manifestPath);
			const serviceEntries = Object.entries(manifest.services).sort(([a], [b]) => a.localeCompare(b));
			if (serviceEntries.length === 0) {
				return errorResult("Manifest has no services. Use manifest_set_service first.");
			}

			const installMissing = params.install_missing ?? true;
			const registry = params.registry ?? defaultServiceRegistry;
			const allowLatest = params.allow_latest ?? false;
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

			// Pass 1: install missing enabled services if requested
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

				const install = await installServicePackage(name, version, registry, gardenDir, repoDir, catalogEntry, signal);
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
				const reload = await run("systemctl", ["--user", "daemon-reload"], signal);
				if (reload.exitCode !== 0) {
					return errorResult(`manifest_apply: daemon-reload failed:\n${reload.stderr || reload.stdout}`);
				}
			}

			// Pass 2: enforce desired runtime state
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

					const start = await run("systemctl", ["--user", "start", startTarget], signal);
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

				await run("systemctl", ["--user", "stop", `${unit}.socket`], signal);
				await run("systemctl", ["--user", "stop", `${unit}.service`], signal);
				stoppedCount += 1;
				lines.push(`Stopped ${unit}`);
			}

			if (manifestChanged && !dryRun) {
				saveManifest(manifest, manifestPath, gardenDir);
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

	// Drift detection on session start
	pi.on("session_start", async (_event, ctx) => {
		if (!existsSync(manifestPath)) return;
		const manifest = loadManifest(manifestPath);
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

	// --- Session-start hook: notify about pending updates ---

	let updateChecked = false;

	pi.on("before_agent_start", async (event) => {
		if (updateChecked) return;
		updateChecked = true;
		try {
			const raw = await readFile(statusFile, "utf-8");
			const status = JSON.parse(raw);
			if (status.available && !status.notified) {
				status.notified = true;
				await writeFile(statusFile, JSON.stringify(status), "utf-8");
				const note =
					"\n\n[SYSTEM] A Bloom OS update is available. " +
					"Inform the user and ask if they'd like to review and apply it.";
				return { systemPrompt: event.systemPrompt + note };
			}
		} catch {
			// No status file yet — timer hasn't run
		}
	});
}
