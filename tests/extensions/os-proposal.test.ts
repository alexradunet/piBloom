import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockExtensionContext } from "../helpers/mock-extension-context.js";

const runMock = vi.fn();
const PROPOSAL_REPO_DIR = "/var/lib/nixpi/pi-nixpi";
const CANONICAL_REPO_DIR = "/srv/nixpi";
const proposalRepoState = vi.hoisted(() => ({ tempDir: "" }));

vi.mock("../../core/lib/exec.js", () => ({
	run: (...args: unknown[]) => runMock(...args),
}));

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	const resolvePath = (target: fs.PathLike) => {
		const asString = String(target);
		if (!proposalRepoState.tempDir) return target;
		if (asString === PROPOSAL_REPO_DIR) return proposalRepoState.tempDir;
		if (asString.startsWith(`${PROPOSAL_REPO_DIR}/`)) {
			return path.join(proposalRepoState.tempDir, asString.slice(PROPOSAL_REPO_DIR.length + 1));
		}
		return target;
	};

	return {
		...actual,
		existsSync: (target: fs.PathLike) => actual.existsSync(resolvePath(target)),
		mkdirSync: (target: fs.PathLike, options?: fs.MakeDirectoryOptions & { recursive?: boolean }) =>
			actual.mkdirSync(resolvePath(target), options),
		readdirSync: (
			target: fs.PathLike,
			options?:
				| { encoding?: BufferEncoding | null; withFileTypes?: false; recursive?: boolean }
				| BufferEncoding
				| null,
		) => actual.readdirSync(resolvePath(target), options as never),
	};
});

describe("os local Nix proposal handler", () => {
	let repoDir: string;

	beforeEach(() => {
		vi.resetModules();
		runMock.mockReset();
		repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-repo-"));
		proposalRepoState.tempDir = repoDir;
	});

	afterEach(() => {
		proposalRepoState.tempDir = "";
		fs.rmSync(repoDir, { recursive: true, force: true });
	});

	it("reports git branch and working tree status for the local proposal repo", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: "main\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: " M flake.nix\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: " flake.nix | 2 +-\n", stderr: "", exitCode: 0 });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("status", undefined, createMockExtensionContext() as never);

		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toContain(`Local proposal repo: ${PROPOSAL_REPO_DIR}`);
		expect(result.content[0].text).not.toContain(CANONICAL_REPO_DIR);
		expect(result.content[0].text).toContain("Branch: main");
		expect(result.content[0].text).toContain("M flake.nix");
		expect((result.details as { repoDir?: string } | undefined)?.repoDir).toBe(PROPOSAL_REPO_DIR);
	});

	it("runs both flake and config validation in the local repo", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: "flake ok\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "config ok\n", stderr: "", exitCode: 0 });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("validate", undefined, createMockExtensionContext() as never);

		expect(result.isError).toBe(false);
		expect(result.content[0].text).toContain("nix flake check --no-build: ok");
		expect(result.content[0].text).toContain("nix build .#checks.x86_64-linux.config --no-link: ok");
		expect(runMock).toHaveBeenNthCalledWith(1, "nix", ["flake", "check", "--no-build"], undefined, PROPOSAL_REPO_DIR);
		expect(runMock).toHaveBeenNthCalledWith(
			2,
			"nix",
			["build", ".#checks.x86_64-linux.config", "--no-link"],
			undefined,
			PROPOSAL_REPO_DIR,
		);
	});

	it("requires confirmation before refreshing flake.lock", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: "updated inputs\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: " M flake.lock\n", stderr: "", exitCode: 0 });

		const ctx = createMockExtensionContext({ hasUI: true });
		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("update_flake_lock", undefined, ctx as never);

		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect(result.isError).toBe(false);
		expect(result.content[0].text).toContain("flake.lock status:");
		expect(result.content[0].text).toContain("M flake.lock");
	});

	it("initializes the local proposal repo lazily when missing", async () => {
		fs.rmSync(repoDir, { recursive: true, force: true });
		runMock
			.mockResolvedValueOnce({ stdout: "cloned\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "main\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("status", undefined, createMockExtensionContext() as never);

		expect(result.isError).toBeUndefined();
		expect(runMock).toHaveBeenNthCalledWith(1, "git", ["clone", expect.any(String), PROPOSAL_REPO_DIR], undefined);
		expect(runMock).not.toHaveBeenCalledWith("git", ["clone", expect.any(String), CANONICAL_REPO_DIR], undefined);
		expect(result.content[0].text).toContain("Initialized from:");
	});

	it("returns isError when validate fails", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: "", stderr: "flake error", exitCode: 1 })
			.mockResolvedValueOnce({ stdout: "", stderr: "build error", exitCode: 1 });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("validate", undefined, createMockExtensionContext() as never);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("failed");
	});

	it("returns isError when update_flake_lock command fails", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock.mockResolvedValueOnce({ stdout: "", stderr: "network error", exitCode: 1 });

		const ctx = createMockExtensionContext({ hasUI: true });
		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("update_flake_lock", undefined, ctx as never);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("nix flake update failed");
	});

	it("returns an error when the proposal path exists but is not a clone", async () => {
		fs.writeFileSync(path.join(repoDir, "README"), "not a repo", "utf-8");

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("status", undefined, createMockExtensionContext() as never);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Proposal repo path exists but is not a git clone");
	});
});
