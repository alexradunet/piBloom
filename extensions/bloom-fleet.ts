import { mkdirSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { runCommand } from "../lib/command.js";
import { errorResult, requireConfirmation } from "../lib/shared.js";

function parseGithubSlugFromUrl(url: string): string | null {
	const trimmed = url.trim();
	const ssh = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (ssh) return `${ssh[1]}/${ssh[2]}`;

	const https = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (https) return `${https[1]}/${https[2]}`;

	const sshUrl = trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (sshUrl) return `${sshUrl[1]}/${sshUrl[2]}`;

	return null;
}

function slugifyBranchPart(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

async function getRemoteUrl(repoDir: string, remote: string, signal?: AbortSignal): Promise<string | null> {
	const result = await runCommand("git", ["-C", repoDir, "remote", "get-url", remote], { signal });
	if (result.exitCode !== 0) return null;
	const url = result.stdout.trim();
	return url || null;
}

async function inferRepoUrl(repoDir: string, signal?: AbortSignal): Promise<string> {
	const existingUpstream = await getRemoteUrl(repoDir, "upstream", signal);
	if (existingUpstream) return existingUpstream;

	const bootc = await runCommand("bootc", ["status", "--format=json"], { signal });
	if (bootc.exitCode === 0) {
		try {
			const status = JSON.parse(bootc.stdout) as {
				status?: { booted?: { image?: { image?: { image?: string } } } };
			};
			const imageRef = status?.status?.booted?.image?.image?.image ?? "";
			const match = imageRef.match(/^ghcr\.io\/([^/]+)\/bloom-os(?:[:@].+)?$/);
			if (match?.[1]) {
				return `https://github.com/${match[1]}/pi-bloom.git`;
			}
		} catch {
			// fall through
		}
	}

	return "https://github.com/pibloom/pi-bloom.git";
}

export default function (pi: ExtensionAPI) {
	const bloomDir = join(os.homedir(), ".bloom");
	const repoDir = join(bloomDir, "pi-bloom");

	pi.registerTool({
		name: "fleet_repo_configure",
		label: "Configure Bloom Repo",
		description: "Clone/configure local Bloom repo remotes for PR-based self-evolution (upstream + origin fork).",
		promptSnippet: "fleet_repo_configure — bootstrap local repo and remotes",
		promptGuidelines: [
			"Use fleet_repo_configure during first-boot so each device can submit fixes via PR.",
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
		async execute(_toolCallId, params, signal) {
			mkdirSync(bloomDir, { recursive: true });
			const changes: string[] = [];
			const notes: string[] = [];

			const repoCheck = await runCommand("git", ["-C", repoDir, "rev-parse", "--git-dir"], { signal });
			const repoExists = repoCheck.exitCode === 0;
			const upstreamUrl = (params.repo_url?.trim() || (await inferRepoUrl(repoDir, signal))).trim();

			if (!repoExists) {
				const clone = await runCommand("git", ["clone", upstreamUrl, repoDir], { signal });
				if (clone.exitCode !== 0) {
					return errorResult(`Failed to clone ${upstreamUrl} into ${repoDir}:\n${clone.stderr}`);
				}
				changes.push(`cloned ${upstreamUrl} -> ${repoDir}`);
			}

			const ensureRepo = await runCommand("git", ["-C", repoDir, "rev-parse", "--git-dir"], { signal });
			if (ensureRepo.exitCode !== 0) {
				return errorResult(`No repo clone found at ${repoDir}. Run first-boot setup to clone it.`);
			}

			const currentUpstream = await getRemoteUrl(repoDir, "upstream", signal);
			if (!currentUpstream) {
				const add = await runCommand("git", ["-C", repoDir, "remote", "add", "upstream", upstreamUrl], { signal });
				if (add.exitCode !== 0) return errorResult(`Failed to add upstream remote:\n${add.stderr}`);
				changes.push(`remote upstream -> ${upstreamUrl}`);
			} else if (currentUpstream !== upstreamUrl) {
				const set = await runCommand("git", ["-C", repoDir, "remote", "set-url", "upstream", upstreamUrl], { signal });
				if (set.exitCode !== 0) return errorResult(`Failed to set upstream remote:\n${set.stderr}`);
				changes.push(`updated upstream: ${currentUpstream} -> ${upstreamUrl}`);
			}

			const currentOrigin = await getRemoteUrl(repoDir, "origin", signal);
			if (params.fork_url?.trim()) {
				const forkUrl = params.fork_url.trim();
				if (!currentOrigin) {
					const add = await runCommand("git", ["-C", repoDir, "remote", "add", "origin", forkUrl], { signal });
					if (add.exitCode !== 0) return errorResult(`Failed to add origin remote:\n${add.stderr}`);
					changes.push(`remote origin -> ${forkUrl}`);
				} else if (currentOrigin !== forkUrl) {
					const set = await runCommand("git", ["-C", repoDir, "remote", "set-url", "origin", forkUrl], { signal });
					if (set.exitCode !== 0) return errorResult(`Failed to set origin remote:\n${set.stderr}`);
					changes.push(`updated origin: ${currentOrigin} -> ${forkUrl}`);
				}
			} else if (!currentOrigin) {
				const upstreamSlug = parseGithubSlugFromUrl(upstreamUrl);
				const ghAuth = await runCommand("gh", ["auth", "status"], { signal });
				if (upstreamSlug && ghAuth.exitCode === 0) {
					const fork = await runCommand(
						"gh",
						["repo", "fork", upstreamSlug, "--remote", "--remote-name", "origin", "--clone=false"],
						{ signal },
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
					const fallback = await runCommand("git", ["-C", repoDir, "remote", "add", "origin", upstreamUrl], { signal });
					if (fallback.exitCode !== 0) return errorResult(`Failed to set fallback origin remote:\n${fallback.stderr}`);
					changes.push(`fallback origin -> ${upstreamUrl}`);
					notes.push("origin currently points to upstream. Set fork_url later for writable PR flow.");
				}
			}

			const hostname = os.hostname();
			const desiredName = params.git_name?.trim() || `Bloom (${hostname})`;
			const desiredEmail = params.git_email?.trim() || `bloom+${hostname}@localhost`;

			const setName = await runCommand("git", ["-C", repoDir, "config", "user.name", desiredName], { signal });
			if (setName.exitCode !== 0) return errorResult(`Failed to set git user.name:\n${setName.stderr}`);
			const setEmail = await runCommand("git", ["-C", repoDir, "config", "user.email", desiredEmail], { signal });
			if (setEmail.exitCode !== 0) return errorResult(`Failed to set git user.email:\n${setEmail.stderr}`);
			changes.push(`git identity -> ${desiredName} <${desiredEmail}>`);

			const remotes = await runCommand("git", ["-C", repoDir, "remote", "-v"], { signal });
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
		name: "fleet_repo_sync",
		label: "Sync Bloom Repo",
		description: "Fetch upstream and fast-forward a local branch (default: main).",
		promptSnippet: "fleet_repo_sync — sync local repo from upstream",
		promptGuidelines: [
			"Use fleet_repo_sync before starting a fix branch to reduce merge conflicts.",
			"Prefer fast-forward sync from upstream main.",
		],
		parameters: Type.Object({
			branch: Type.Optional(
				Type.String({ description: "Branch to sync from upstream (default: main)", default: "main" }),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const branch = (params.branch ?? "main").trim() || "main";
			const check = await runCommand("git", ["-C", repoDir, "rev-parse", "--git-dir"], { signal });
			if (check.exitCode !== 0)
				return errorResult(`No repo clone found at ${repoDir}. Run fleet_repo_configure first.`);

			const fetch = await runCommand("git", ["-C", repoDir, "fetch", "upstream", "--prune"], { signal });
			if (fetch.exitCode !== 0) {
				return errorResult(`Failed to fetch upstream:\n${fetch.stderr || fetch.stdout}`);
			}

			const checkout = await runCommand("git", ["-C", repoDir, "checkout", branch], { signal });
			if (checkout.exitCode !== 0) {
				return errorResult(`Failed to checkout ${branch}:\n${checkout.stderr || checkout.stdout}`);
			}

			const pull = await runCommand("git", ["-C", repoDir, "pull", "--ff-only", "upstream", branch], { signal });
			if (pull.exitCode !== 0) {
				return errorResult(`Failed to fast-forward ${branch} from upstream:\n${pull.stderr || pull.stdout}`);
			}

			const short = await runCommand("git", ["-C", repoDir, "rev-parse", "--short", "HEAD"], { signal });
			const text = `Synced ${branch} from upstream. HEAD: ${short.stdout.trim() || "unknown"}`;
			return { content: [{ type: "text", text }], details: { path: repoDir, branch } };
		},
	});

	pi.registerTool({
		name: "fleet_repo_submit_pr",
		label: "Submit Bloom Fix PR",
		description: "Create branch + commit + push + PR from local repo changes to upstream.",
		promptSnippet: "fleet_repo_submit_pr — submit local fix as pull request",
		promptGuidelines: [
			"Use fleet_repo_submit_pr after implementing and testing a local fix.",
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

			const check = await runCommand("git", ["-C", repoDir, "rev-parse", "--git-dir"], { signal });
			if (check.exitCode !== 0)
				return errorResult(`No repo clone found at ${repoDir}. Run fleet_repo_configure first.`);

			const ghAuth = await runCommand("gh", ["auth", "status"], { signal });
			if (ghAuth.exitCode !== 0) {
				return errorResult(`GitHub auth is not ready. Run gh auth login first.\n${ghAuth.stderr || ghAuth.stdout}`);
			}

			const upstreamUrl = await getRemoteUrl(repoDir, "upstream", signal);
			const originUrl = await getRemoteUrl(repoDir, "origin", signal);
			if (!upstreamUrl) return errorResult("Missing upstream remote. Run fleet_repo_configure first.");
			if (!originUrl) return errorResult("Missing origin remote. Run fleet_repo_configure with fork_url first.");

			const upstreamSlug = parseGithubSlugFromUrl(upstreamUrl);
			const originSlug = parseGithubSlugFromUrl(originUrl);
			if (!upstreamSlug) return errorResult(`Cannot parse upstream GitHub slug from ${upstreamUrl}`);

			const base = (params.base ?? "main").trim() || "main";
			const currentBranch = await runCommand("git", ["-C", repoDir, "branch", "--show-current"], { signal });
			const nowBranch = currentBranch.stdout.trim() || "main";
			const defaultBranch = `node/${slugifyBranchPart(os.hostname())}/${slugifyBranchPart(params.title) || "fix"}`;
			const targetBranch = (params.branch?.trim() || (nowBranch === base ? defaultBranch : nowBranch)).trim();

			if (nowBranch !== targetBranch) {
				const checkout = await runCommand("git", ["-C", repoDir, "checkout", "-B", targetBranch], { signal });
				if (checkout.exitCode !== 0) {
					return errorResult(`Failed to switch to branch ${targetBranch}:\n${checkout.stderr || checkout.stdout}`);
				}
			}

			if (params.add_all ?? true) {
				const add = await runCommand("git", ["-C", repoDir, "add", "-A"], { signal });
				if (add.exitCode !== 0) {
					return errorResult(`Failed to stage changes:\n${add.stderr || add.stdout}`);
				}
			}

			const staged = await runCommand("git", ["-C", repoDir, "diff", "--cached", "--name-only"], { signal });
			if (!staged.stdout.trim()) {
				return errorResult("No staged changes found. Make edits first, then retry fleet_repo_submit_pr.");
			}

			const commitMessage = (params.commit_message?.trim() || `fix: ${params.title}`).trim();
			const commit = await runCommand("git", ["-C", repoDir, "commit", "-m", commitMessage], { signal });
			if (commit.exitCode !== 0) {
				return errorResult(`Failed to commit changes:\n${commit.stderr || commit.stdout}`);
			}

			const push = await runCommand("git", ["-C", repoDir, "push", "--set-upstream", "origin", targetBranch], { signal });
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

			const pr = await runCommand("gh", prArgs, { signal });
			let prUrl = pr.stdout.trim();
			if (pr.exitCode !== 0) {
				const existing = await runCommand(
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
					{ signal },
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
		name: "fleet_repo_status",
		label: "Bloom Repo Status",
		description: "Check local Bloom repo status, remotes, and PR readiness.",
		promptSnippet: "fleet_repo_status — check local repo and remotes",
		promptGuidelines: [
			"Use fleet_repo_status before starting self-evolution git operations.",
			"Verify upstream/origin remotes and gh auth before attempting PR submission.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal) {
			const check = await runCommand("git", ["-C", repoDir, "rev-parse", "--git-dir"], { signal });
			if (check.exitCode !== 0) {
				return errorResult(`No repo clone found at ${repoDir}. Run fleet_repo_configure first.`);
			}
			const branch = await runCommand("git", ["-C", repoDir, "branch", "--show-current"], { signal });
			const status = await runCommand("git", ["-C", repoDir, "status", "--short"], { signal });
			const log = await runCommand("git", ["-C", repoDir, "log", "--oneline", "-5"], { signal });
			const remotes = await runCommand("git", ["-C", repoDir, "remote", "-v"], { signal });
			const ghAuth = await runCommand("gh", ["auth", "status"], { signal });
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
}
