import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary", "lcov"],
			reportsDirectory: "coverage",
			include: ["core/daemon/**/*.ts", "core/lib/**/*.ts", "core/pi-extensions/**/*.ts"],
			thresholds: {
				"core/daemon/**/*.ts": { lines: 40, functions: 45, branches: 30, statements: 40 },
				"core/lib/**/*.ts": { lines: 60, functions: 82, branches: 55, statements: 60 },
				"core/pi-extensions/**/*.ts": { lines: 30, functions: 35, branches: 18, statements: 30 },
			},
		},
	},
});
