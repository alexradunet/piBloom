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
		// Redirect the parent dir (/var/lib/nixpi) to the temp dir's parent
		const proposalParent = PROPOSAL_REPO_DIR.slice(0, PROPOSAL_REPO_DIR.lastIndexOf("/"));
		if (asString === proposalParent) {
			return proposalRepoState.tempDir.slice(0, proposalRepoState.tempDir.lastIndexOf("/"));
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

describe("os local NixPI repo handler", () => {
	let repoDir: string;
	let originalSystemFlakeDir: string | undefined;

	beforeEach(() => {
		vi.resetModules();
		runMock.mockReset();
		repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-repo-"));
		proposalRepoState.tempDir = repoDir;
		originalSystemFlakeDir = process.env.NIXPI_SYSTEM_FLAKE_DIR;
	});

	afterEach(() => {
		proposalRepoState.tempDir = "";
		if (originalSystemFlakeDir !== undefined) {
			process.env.NIXPI_SYSTEM_FLAKE_DIR = originalSystemFlakeDir;
		} else {
			delete process.env.NIXPI_SYSTEM_FLAKE_DIR;
		}
		fs.rmSync(repoDir, { recursive: true, force: true });
	});

	it("reports remote and branch details for the local NixPI repo", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: "main\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({
				stdout: "origin\thttps://github.com/example/nixpi.git (fetch)\n",
				stderr: "",
				exitCode: 0,
			})
			.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: " flake.nix | 2 +-\n", stderr: "", exitCode: 0 });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("status", undefined, createMockExtensionContext() as never);

		expect(result.isErr()).toBe(false);
		expect(result._unsafeUnwrap().text).toContain(`Local NixPI repo: ${PROPOSAL_REPO_DIR}`);
		expect(result._unsafeUnwrap().text).not.toContain(CANONICAL_REPO_DIR);
		expect(result._unsafeUnwrap().text).toContain("Branch: main");
		expect(result._unsafeUnwrap().text).toContain("Remote: origin");
		expect(result._unsafeUnwrap().details).toEqual({
			repoDir: PROPOSAL_REPO_DIR,
			branch: "main",
			remote: "origin",
			clean: true,
		});
	});

	it("runs both flake and config validation in the local repo", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: "flake ok\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "config ok\n", stderr: "", exitCode: 0 });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("validate", undefined, createMockExtensionContext() as never);

		expect(result.isErr()).toBe(false);
		expect(result._unsafeUnwrap().text).toContain("nix flake check --no-build: ok");
		expect(result._unsafeUnwrap().text).toContain("nix build .#checks.x86_64-linux.config --no-link: ok");
		expect(runMock).toHaveBeenNthCalledWith(1, "nix", ["flake", "check", "--no-build"], undefined, PROPOSAL_REPO_DIR);
		expect(runMock).toHaveBeenNthCalledWith(
			2,
			"nix",
			["build", ".#checks.x86_64-linux.config", "--no-link"],
			undefined,
			PROPOSAL_REPO_DIR,
		);
	});

	it("creates a commit for validated local changes", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: " M flake.nix\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "[main abc123] Fix SSH defaults\n", stderr: "", exitCode: 0 });

		const ctx = createMockExtensionContext({ hasUI: true });
		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("commit", undefined, ctx as never);

		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect(result.isErr()).toBe(false);
		expect(result._unsafeUnwrap().text).toContain("Created commit in");
	});

	it("returns an actionable error when commit is requested on a clean tree", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal(
			"commit",
			undefined,
			createMockExtensionContext({ hasUI: true }) as never,
		);

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toContain("No local changes to commit");
	});

	it("pushes the current branch to origin after confirmation", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: "main\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "Everything up-to-date\n", stderr: "", exitCode: 0 });

		const ctx = createMockExtensionContext({ hasUI: true });
		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("push", undefined, ctx as never);

		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect(runMock).toHaveBeenNthCalledWith(2, "git", ["push", "origin", "main"], undefined, PROPOSAL_REPO_DIR);
		expect(result.isErr()).toBe(false);
	});

	it("applies the local repo flake through nixpi-brokerctl after confirmation", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock.mockResolvedValueOnce({ stdout: "applied\n", stderr: "", exitCode: 0 });

		const ctx = createMockExtensionContext({ hasUI: true });
		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("apply", undefined, ctx as never);

		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect(runMock).toHaveBeenCalledWith(
			"nixpi-brokerctl",
			["nixos-update", "apply", `${PROPOSAL_REPO_DIR}#nixos`],
			undefined,
		);
		expect(result.isErr()).toBe(false);
		expect(result._unsafeUnwrap().text).toContain("Applied local NixPI repo");
	});

	it("initializes the local proposal repo lazily when missing", async () => {
		fs.rmSync(repoDir, { recursive: true, force: true });
		runMock
			.mockResolvedValueOnce({ stdout: "cloned\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "main\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("setup", undefined, createMockExtensionContext() as never);

		expect(result.isErr()).toBe(false);
		expect(runMock).toHaveBeenNthCalledWith(1, "git", ["clone", expect.any(String), PROPOSAL_REPO_DIR], undefined);
		expect(runMock).not.toHaveBeenCalledWith("git", ["clone", expect.any(String), CANONICAL_REPO_DIR], undefined);
		expect(result._unsafeUnwrap().text).toContain("Initialized from:");
	});

	it("prefers the configured system flake checkout when it is a git repo", async () => {
		fs.rmSync(repoDir, { recursive: true, force: true });
		const systemFlakeDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-system-flake-"));
		process.env.NIXPI_SYSTEM_FLAKE_DIR = systemFlakeDir;
		fs.mkdirSync(path.join(systemFlakeDir, ".git"), { recursive: true });
		runMock.mockResolvedValueOnce({ stdout: "cloned\n", stderr: "", exitCode: 0 });

		try {
			const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
			const result = await handleNixConfigProposal("setup", undefined, createMockExtensionContext() as never);

			expect(result.isErr()).toBe(false);
			expect(runMock).toHaveBeenNthCalledWith(1, "git", ["clone", systemFlakeDir, PROPOSAL_REPO_DIR], undefined);
			expect(result._unsafeUnwrap().text).toContain(`Initialized from: ${systemFlakeDir}`);
		} finally {
			fs.rmSync(systemFlakeDir, { recursive: true, force: true });
		}
	});

	it("falls back to the remote default when the configured system flake is not a git repo", async () => {
		fs.rmSync(repoDir, { recursive: true, force: true });
		const systemFlakeDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-non-git-flake-"));
		process.env.NIXPI_SYSTEM_FLAKE_DIR = systemFlakeDir;
		runMock.mockResolvedValueOnce({ stdout: "cloned\n", stderr: "", exitCode: 0 });

		try {
			const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
			const result = await handleNixConfigProposal("setup", undefined, createMockExtensionContext() as never);

			expect(result.isErr()).toBe(false);
			expect(runMock).toHaveBeenNthCalledWith(
				1,
				"git",
				["clone", "https://github.com/alexradunet/NixPI.git", PROPOSAL_REPO_DIR],
				undefined,
			);
			expect(result._unsafeUnwrap().text).toContain("Initialized from: https://github.com/alexradunet/NixPI.git");
		} finally {
			fs.rmSync(systemFlakeDir, { recursive: true, force: true });
		}
	});

	it("returns an actionable error when the local NixPI repo is missing for status", async () => {
		fs.rmSync(repoDir, { recursive: true, force: true });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("status", undefined, createMockExtensionContext() as never);

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toContain("Local NixPI repo is not initialized");
		expect(result._unsafeUnwrapErr()).toContain("setup");
		expect(runMock).not.toHaveBeenCalled();
	});

	it("returns current repo details without cloning when setup is called on an existing clone", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("setup", undefined, createMockExtensionContext() as never);

		expect(result.isErr()).toBe(false);
		expect(result._unsafeUnwrap().text).toContain("already initialized");
		expect(runMock).not.toHaveBeenCalled();
	});

	it("returns isError when validate fails", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: "", stderr: "flake error", exitCode: 1 })
			.mockResolvedValueOnce({ stdout: "", stderr: "build error", exitCode: 1 });

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("validate", undefined, createMockExtensionContext() as never);

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toContain("failed");
	});

	it("returns isError when push command fails", async () => {
		fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
		runMock
			.mockResolvedValueOnce({ stdout: "main\n", stderr: "", exitCode: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "network error", exitCode: 1 });

		const ctx = createMockExtensionContext({ hasUI: true });
		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("push", undefined, ctx as never);

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toContain("git push failed");
	});

	it("returns an error when the local NixPI repo path exists but is not a clone", async () => {
		fs.writeFileSync(path.join(repoDir, "README"), "not a repo", "utf-8");

		const { handleNixConfigProposal } = await import("../../core/pi/extensions/os/actions-proposal.js");
		const result = await handleNixConfigProposal("status", undefined, createMockExtensionContext() as never);

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr()).toContain("Local NixPI repo path exists but is not a git clone");
	});
});
