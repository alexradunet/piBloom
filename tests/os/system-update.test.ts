import { describe, expect, it } from "vitest";
import {
	parseCurrentGeneration,
	runSystemUpdate,
	type CommandResult,
	type SystemUpdateRuntime,
} from "../../core/os/system-update.js";

interface RuntimeState {
	files: Map<string, string>;
	symlinks: Map<string, string>;
	commands: Array<{ cmd: string; args: string[] }>;
	chowns: Array<{ target: string; user: string; allowFailure: boolean }>;
}

function createRuntime(
	commandHandler: (cmd: string, args: string[], state: RuntimeState) => Promise<CommandResult> | CommandResult,
	initial?: Partial<Pick<RuntimeState, "files" | "symlinks">>,
): { runtime: SystemUpdateRuntime; state: RuntimeState } {
	const state: RuntimeState = {
		files: initial?.files ?? new Map(),
		symlinks: initial?.symlinks ?? new Map(),
		commands: [],
		chowns: [],
	};

	const runtime: SystemUpdateRuntime = {
		async exists(target: string) {
			return state.files.has(target);
		},
		async ensureDir(_target: string) {},
		async readFile(target: string) {
			const value = state.files.get(target);
			if (value === undefined) {
				throw new Error(`missing file: ${target}`);
			}
			return value;
		},
		async readLink(target: string) {
			const value = state.symlinks.get(target);
			if (value === undefined) {
				throw new Error(`missing symlink: ${target}`);
			}
			return value;
		},
		async run(cmd: string, args: string[]) {
			state.commands.push({ cmd, args });
			return commandHandler(cmd, args, state);
		},
		async writeFile(target: string, content: string) {
			state.files.set(target, content);
		},
		async chownToUser(target: string, user: string, allowFailure = false) {
			state.chowns.push({ target, user, allowFailure });
		},
		now() {
			return "2026-04-07T12:00:00Z";
		},
		stderr(message: string) {
			state.files.set("__stderr__", `${message}\n`);
		},
	};

	return { runtime, state };
}

describe("parseCurrentGeneration", () => {
	it("returns the current generation number", () => {
		expect(parseCurrentGeneration("1 2026-01-01\n2 2026-01-02 current\n")).toBe("2");
	});

	it("returns 0 when no current generation is present", () => {
		expect(parseCurrentGeneration("")).toBe("0");
	});
});

describe("runSystemUpdate", () => {
	it("fails fast when the system flake is missing", async () => {
		const { runtime, state } = createRuntime(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
		const exitCode = await runSystemUpdate(runtime, { primaryUser: "tester", flakeDir: "/etc/nixos" });

		expect(exitCode).toBe(1);
		expect(state.files.get("__stderr__")).toContain("Missing /etc/nixos/flake.nix");
	});

	it("writes available=false when the built system matches the current system", async () => {
		const { runtime, state } = createRuntime(async (cmd) => {
			if (cmd === "nix-env") {
				return { stdout: "1 something current\n", stderr: "", exitCode: 0 };
			}
			if (cmd === "nix") {
				return { stdout: "/nix/store/current-system\n", stderr: "", exitCode: 0 };
			}
			throw new Error(`unexpected command ${cmd}`);
		}, {
			files: new Map([["/etc/nixos/flake.nix", "{}"]]),
			symlinks: new Map([["/run/current-system", "/nix/store/current-system"]]),
		});

		const exitCode = await runSystemUpdate(runtime, { primaryUser: "tester", flakeDir: "/etc/nixos" });
		const status = JSON.parse(state.files.get("/home/tester/.nixpi/update-status.json") ?? "");

		expect(exitCode).toBe(0);
		expect(status).toEqual({
			checked: "2026-04-07T12:00:00Z",
			available: false,
			generation: "1",
			notified: false,
		});
		expect(state.commands.map((entry) => entry.cmd)).toEqual(["nix-env", "nix"]);
	});

	it("preserves notified=true before apply and clears it after a successful apply", async () => {
		let nixEnvCalls = 0;
		const { runtime, state } = createRuntime(async (cmd) => {
			if (cmd === "nix-env") {
				nixEnvCalls += 1;
				return {
					stdout: nixEnvCalls === 1 ? "4 something current\n" : "5 something current\n",
					stderr: "",
					exitCode: 0,
				};
			}
			if (cmd === "nix") {
				return { stdout: "/nix/store/new-system\n", stderr: "", exitCode: 0 };
			}
			if (cmd === "nixos-rebuild") {
				return { stdout: "", stderr: "", exitCode: 0 };
			}
			throw new Error(`unexpected command ${cmd}`);
		}, {
			files: new Map([
				["/etc/nixos/flake.nix", "{}"],
				[
					"/home/tester/.nixpi/update-status.json",
					JSON.stringify({ checked: "earlier", available: true, generation: "4", notified: true }),
				],
			]),
			symlinks: new Map([["/run/current-system", "/nix/store/current-system"]]),
		});

		const exitCode = await runSystemUpdate(runtime, { primaryUser: "tester", flakeDir: "/etc/nixos" });
		const status = JSON.parse(state.files.get("/home/tester/.nixpi/update-status.json") ?? "");

		expect(exitCode).toBe(0);
		expect(status).toEqual({
			checked: "2026-04-07T12:00:00Z",
			available: false,
			generation: "5",
			notified: false,
		});
		expect(state.commands.map((entry) => `${entry.cmd} ${entry.args.join(" ")}`)).toEqual([
			"nix-env --list-generations -p /nix/var/nix/profiles/system",
			"nix build /etc/nixos#nixosConfigurations.nixos.config.system.build.toplevel --no-link --print-out-paths",
			"nixos-rebuild switch --flake /etc/nixos#nixos",
			"nix-env --list-generations -p /nix/var/nix/profiles/system",
		]);
	});

	it("returns success and keeps the pre-apply status when rebuild fails", async () => {
		const { runtime, state } = createRuntime(async (cmd) => {
			if (cmd === "nix-env") {
				return { stdout: "7 something current\n", stderr: "", exitCode: 0 };
			}
			if (cmd === "nix") {
				return { stdout: "/nix/store/new-system\n", stderr: "", exitCode: 0 };
			}
			if (cmd === "nixos-rebuild") {
				return { stdout: "", stderr: "failed", exitCode: 1 };
			}
			throw new Error(`unexpected command ${cmd}`);
		}, {
			files: new Map([["/etc/nixos/flake.nix", "{}"]]),
			symlinks: new Map([["/run/current-system", "/nix/store/current-system"]]),
		});

		const exitCode = await runSystemUpdate(runtime, { primaryUser: "tester", flakeDir: "/etc/nixos" });
		const status = JSON.parse(state.files.get("/home/tester/.nixpi/update-status.json") ?? "");

		expect(exitCode).toBe(0);
		expect(status).toEqual({
			checked: "2026-04-07T12:00:00Z",
			available: true,
			generation: "7",
			notified: false,
		});
	});
});
