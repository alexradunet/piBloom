import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "node",
		clearMocks: true,
		restoreMocks: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary", "lcov"],
			reportsDirectory: "coverage",
			include: ["core/lib/**/*.ts", "core/pi/extensions/**/*.ts"],
			thresholds: {
				"core/lib/**/*.ts": { lines: 72, functions: 77, branches: 57, statements: 69 },
				"core/pi/extensions/**/*.ts": { lines: 60, functions: 60, branches: 50, statements: 60 },
			},
		},
	},
});
