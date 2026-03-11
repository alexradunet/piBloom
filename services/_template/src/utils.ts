/**
 * bloom-TEMPLATE — Utility functions
 *
 * Shared helpers for the TEMPLATE service. These are kept separate
 * from transport.ts so they can be unit-tested without mocking I/O.
 */

/**
 * Parse a comma-separated allowlist from an environment variable.
 * Empty string = allow all.
 *
 * @param raw - Raw env var value
 * @returns Set of allowed identifiers
 */
export function parseAllowedSenders(raw: string): Set<string> {
	const entries = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return new Set(entries);
}

/**
 * Check whether a sender is allowed.
 * If the allowlist is empty, all senders are allowed.
 *
 * @param sender - The sender identifier to check
 * @param allowedSenders - Set of allowed sender identifiers
 */
export function isSenderAllowed(sender: string, allowedSenders: Set<string>): boolean {
	if (allowedSenders.size === 0) return true;
	return allowedSenders.has(sender);
}
