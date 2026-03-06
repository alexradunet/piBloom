import { existsSync, readFileSync } from "node:fs";

/**
 * Check whether a `/etc/subuid` or `/etc/subgid` file contains an entry
 * for the given username.
 *
 * Each line in these files has the format `username:start:count`.
 * Returns `true` if any line starts with `username:`.
 *
 * @param filePath - Path to the subid file (e.g. `/etc/subuid`).
 * @param username - OS username to look for.
 * @returns `true` if the user has a subordinate ID range in the file.
 */
export function hasSubidRange(filePath: string, username: string): boolean {
	if (!existsSync(filePath)) return false;
	try {
		return readFileSync(filePath, "utf-8")
			.split("\n")
			.some((line) => line.trim().startsWith(`${username}:`));
	} catch {
		return false;
	}
}
