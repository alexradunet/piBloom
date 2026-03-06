import path from "node:path";

export function parseRef(ref: string): { type: string; slug: string } {
	const slash = ref.indexOf("/");
	if (slash === -1) throw new Error(`invalid reference format: '${ref}' (expected type/slug)`);
	return { type: ref.slice(0, slash), slug: ref.slice(slash + 1) };
}

export function resolveCreatePath(gardenDir: string, slug: string, fields: Record<string, string>): string {
	if (fields.project) return path.join(gardenDir, "Projects", fields.project, `${slug}.md`);
	if (fields.area) return path.join(gardenDir, "Areas", fields.area, `${slug}.md`);
	return path.join(gardenDir, "Inbox", `${slug}.md`);
}
