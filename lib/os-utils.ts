export function guardBloom(name: string): string | null {
	if (!name.startsWith("bloom-")) {
		return `Security error: only bloom-* names are permitted, got "${name}"`;
	}
	return null;
}

export function parseGithubSlugFromUrl(url: string): string | null {
	const trimmed = url.trim();
	const ssh = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (ssh) return `${ssh[1]}/${ssh[2]}`;

	const https = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (https) return `${https[1]}/${https[2]}`;

	const sshUrl = trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (sshUrl) return `${sshUrl[1]}/${sshUrl[2]}`;

	return null;
}

export function slugifyBranchPart(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}
