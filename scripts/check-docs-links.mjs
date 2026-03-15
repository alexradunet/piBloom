import fs from "node:fs";
import path from "node:path";

const markdownFiles = [
	"README.md",
	"AGENTS.md",
	"ARCHITECTURE.md",
	...fs
		.readdirSync("docs")
		.filter((file) => file.endsWith(".md"))
		.map((file) => path.join("docs", file)),
	"services/README.md",
];

let failures = 0;

for (const file of markdownFiles) {
	const text = fs.readFileSync(file, "utf8");
	const dir = path.dirname(file);
	const links = text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g);

	for (const match of links) {
		const target = match[1]?.trim();
		if (!target || /^(https?:|mailto:|#)/.test(target)) continue;

		const resolved = path.normalize(path.join(dir, target.split("#")[0] ?? ""));
		if (!fs.existsSync(resolved)) {
			console.log(`${file}: missing -> ${target}`);
			failures += 1;
		}
	}
}

if (failures > 0) {
	console.log(`FAIL ${failures} broken relative links`);
	process.exit(1);
}

console.log(`OK ${markdownFiles.length} markdown files checked`);
