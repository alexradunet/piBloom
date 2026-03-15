/**
 * bloom-repo — Repository management: configure, sync, submit PRs, check status.
 *
 * @tools bloom_repo, bloom_repo_submit_pr
 * @see {@link ../../AGENTS.md#bloom-repo} Extension reference
 */
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { type RegisteredExtensionTool, defineTool, registerTools } from "../../lib/extension-tools.js";
import { handleConfigure } from "./actions-configure.js";
import { handleSubmitPr } from "./actions-submit-pr.js";
import { handleStatus, handleSync } from "./actions.js";

export default function (pi: ExtensionAPI) {
	const tools: RegisteredExtensionTool[] = [
		defineTool({
			name: "bloom_repo",
			label: "Bloom Repository",
			description: "Configure, check status, or sync the local Bloom repo for self-evolution PRs.",
			promptGuidelines: ["Never push directly to main; always open a PR."],
			parameters: Type.Object({
				action: StringEnum(["configure", "status", "sync"] as const),
				// configure-specific params (ignored for status/sync):
				repo_url: Type.Optional(Type.String({ description: "Upstream repo URL (configure only)" })),
				fork_url: Type.Optional(Type.String({ description: "Fork URL (configure only)" })),
				git_name: Type.Optional(Type.String({ description: "Git author name (configure only)" })),
				git_email: Type.Optional(Type.String({ description: "Git author email (configure only)" })),
				// sync-specific param:
				branch: Type.Optional(Type.String({ description: "Branch to sync (sync only, default: main)" })),
			}),
			async execute(_toolCallId, params, signal) {
				const typedParams = params as {
					action: "configure" | "status" | "sync";
					repo_url?: string;
					fork_url?: string;
					git_name?: string;
					git_email?: string;
					branch?: string;
				};
				switch (typedParams.action) {
					case "configure":
						return handleConfigure(typedParams, signal);
					case "status":
						return handleStatus(signal);
					case "sync": {
						const branch = (typedParams.branch ?? "main").trim() || "main";
						return handleSync(branch, signal);
					}
				}
				throw new Error(`Unsupported bloom_repo action: ${String(typedParams.action)}`);
			},
		}),
		defineTool({
			name: "bloom_repo_submit_pr",
			label: "Submit Bloom Fix PR",
			description: "Create branch + commit + push + PR from local repo changes to upstream.",
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
				return handleSubmitPr(
					params as {
						title: string;
						body?: string;
						commit_message?: string;
						branch?: string;
						base?: string;
						draft?: boolean;
						add_all?: boolean;
					},
					signal,
					ctx,
				);
			},
		}),
	];
	registerTools(pi, tools);
}
