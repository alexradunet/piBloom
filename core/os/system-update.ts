import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SYSTEM_PROFILE_PATH = "/nix/var/nix/profiles/system";
const CURRENT_SYSTEM_PATH = "/run/current-system";

export interface UpdateStatus {
	available: boolean;
	checked: string;
	generation: string;
	notified: boolean;
}

export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface SystemUpdateRuntime {
	exists(target: string): Promise<boolean>;
	ensureDir(target: string): Promise<void>;
	readFile(target: string): Promise<string>;
	readLink(target: string): Promise<string>;
	run(cmd: string, args: string[]): Promise<CommandResult>;
	writeFile(target: string, content: string): Promise<void>;
	chownToUser(target: string, user: string, allowFailure?: boolean): Promise<void>;
	now(): string;
	stderr(message: string): void;
}

export interface SystemUpdateEnvironment {
	primaryUser: string;
	flakeDir: string;
}

function defaultEnvironment(env: NodeJS.ProcessEnv): SystemUpdateEnvironment {
	return {
		primaryUser: env.NIXPI_PRIMARY_USER ?? "pi",
		flakeDir: env.NIXPI_SYSTEM_FLAKE_DIR ?? "/etc/nixos",
	};
}

function updateStatusPaths(primaryUser: string) {
	const statusDir = path.join("/home", primaryUser, ".nixpi");
	return {
		statusDir,
		statusFile: path.join(statusDir, "update-status.json"),
	};
}

export function parseCurrentGeneration(stdout: string): string {
	const currentLine = stdout
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.includes("current"));
	if (!currentLine) {
		return "0";
	}

	const generation = currentLine.split(/\s+/)[0];
	return generation || "0";
}

async function readExistingNotified(
	runtime: SystemUpdateRuntime,
	statusFile: string,
	available: boolean,
): Promise<boolean> {
	if (!available || !(await runtime.exists(statusFile))) {
		return false;
	}

	try {
		const raw = await runtime.readFile(statusFile);
		const parsed = JSON.parse(raw) as Partial<UpdateStatus>;
		return parsed.notified ?? false;
	} catch {
		return false;
	}
}

async function writeStatusFile(
	runtime: SystemUpdateRuntime,
	statusFile: string,
	primaryUser: string,
	status: UpdateStatus,
): Promise<void> {
	await runtime.writeFile(statusFile, `${JSON.stringify(status)}\n`);
	await runtime.chownToUser(statusFile, primaryUser);
}

export async function runSystemUpdate(
	runtime: SystemUpdateRuntime,
	environment: SystemUpdateEnvironment,
): Promise<number> {
	const { primaryUser, flakeDir } = environment;
	const { statusDir, statusFile } = updateStatusPaths(primaryUser);
	const flakeFile = path.join(flakeDir, "flake.nix");
	const flakeRef = `${flakeDir}#nixos`;
	const checked = runtime.now();

	if (!(await runtime.exists(flakeFile))) {
		runtime.stderr(
			`Missing ${flakeFile}; NixPI updates require the standard /etc/nixos flake that imports /srv/nixpi.`,
		);
		return 1;
	}

	await runtime.ensureDir(statusDir);
	await runtime.chownToUser(statusDir, primaryUser, true);

	const currentGeneration = parseCurrentGeneration(
		(await runtime.run("nix-env", ["--list-generations", "-p", SYSTEM_PROFILE_PATH])).stdout,
	);
	const currentSystem = (await runtime.readLink(CURRENT_SYSTEM_PATH)).trim();
	const newSystemResult = await runtime.run("nix", [
		"build",
		`${flakeDir}#nixosConfigurations.nixos.config.system.build.toplevel`,
		"--no-link",
		"--print-out-paths",
	]);
	const newSystem = newSystemResult.exitCode === 0 ? newSystemResult.stdout.trim() : "";
	const available = newSystem !== "" && newSystem !== currentSystem;
	const notified = await readExistingNotified(runtime, statusFile, available);

	await writeStatusFile(runtime, statusFile, primaryUser, {
		checked,
		available,
		generation: currentGeneration,
		notified,
	});

	if (!available) {
		return 0;
	}

	const applyResult = await runtime.run("nixos-rebuild", ["switch", "--flake", flakeRef]);
	if (applyResult.exitCode !== 0) {
		return 0;
	}

	const newGeneration = parseCurrentGeneration(
		(await runtime.run("nix-env", ["--list-generations", "-p", SYSTEM_PROFILE_PATH])).stdout,
	);
	await writeStatusFile(runtime, statusFile, primaryUser, {
		checked,
		available: false,
		generation: newGeneration,
		notified: false,
	});

	return 0;
}

async function runCommand(cmd: string, args: string[]): Promise<CommandResult> {
	try {
		const result = await execFileAsync(cmd, args, {
			maxBuffer: 10 * 1024 * 1024,
		});
		return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: 0 };
	} catch (error) {
		const result = error as { code?: number | string; stdout?: string; stderr?: string };
		return {
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			exitCode: typeof result.code === "number" ? result.code : 1,
		};
	}
}

async function chownToUser(target: string, user: string, allowFailure = false): Promise<void> {
	const uidResult = await runCommand("id", ["-u", user]);
	const gidResult = await runCommand("id", ["-g", user]);
	if (uidResult.exitCode !== 0 || gidResult.exitCode !== 0) {
		if (allowFailure) {
			return;
		}
		throw new Error(uidResult.stderr || gidResult.stderr || `Failed to resolve user ${user}`);
	}

	const uid = Number.parseInt(uidResult.stdout.trim(), 10);
	const gid = Number.parseInt(gidResult.stdout.trim(), 10);
	if (!Number.isFinite(uid) || !Number.isFinite(gid)) {
		if (allowFailure) {
			return;
		}
		throw new Error(`Failed to parse uid/gid for ${user}`);
	}

	try {
		await fs.chown(target, uid, gid);
	} catch (error) {
		if (!allowFailure) {
			throw error;
		}
	}
}

export const defaultSystemUpdateRuntime: SystemUpdateRuntime = {
	async exists(target) {
		try {
			await fs.access(target);
			return true;
		} catch {
			return false;
		}
	},
	async ensureDir(target) {
		await fs.mkdir(target, { recursive: true });
	},
	readFile(target) {
		return fs.readFile(target, "utf-8");
	},
	readLink(target) {
		return fs.readlink(target, "utf-8");
	},
	run: runCommand,
	writeFile(target, content) {
		return fs.writeFile(target, content, "utf-8");
	},
	chownToUser,
	now() {
		return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
	},
	stderr(message) {
		process.stderr.write(`${message}\n`);
	},
};

export function isMainModule(argv1: string | undefined, moduleUrl: string): boolean {
	if (!argv1) {
		return false;
	}

	const modulePath = fileURLToPath(moduleUrl);

	try {
		return argv1 === modulePath;
	} catch {
		return false;
	}
}

if (isMainModule(process.argv[1], import.meta.url)) {
	runSystemUpdate(defaultSystemUpdateRuntime, defaultEnvironment(process.env))
		.then((exitCode) => {
			process.exitCode = exitCode;
		})
		.catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(`${message}\n`);
			process.exitCode = 1;
		});
}
