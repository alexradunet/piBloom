import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockExtensionAPI, type MockExtensionAPI } from "../helpers/mock-extension-api.js";
import { createTempGarden, type TempGarden } from "../helpers/temp-garden.js";

let temp: TempGarden;
let api: MockExtensionAPI;

const EXPECTED_TOOL_NAMES = [
	"bootc_status",
	"bootc_update",
	"bootc_rollback",
	"container_status",
	"container_logs",
	"systemd_control",
	"container_deploy",
	"update_status",
	"schedule_reboot",
	"bloom_repo_configure",
	"bloom_repo_sync",
	"bloom_repo_submit_pr",
	"bloom_repo_status",
	"system_health",
	"manifest_show",
	"manifest_sync",
	"manifest_set_service",
	"manifest_apply",
];

beforeEach(async () => {
	temp = createTempGarden();
	api = createMockExtensionAPI();
	const mod = await import("../../extensions/bloom-os.js");
	mod.default(api as never);
});

afterEach(() => {
	temp.cleanup();
});

function toolNames(): string[] {
	return api._registeredTools.map((t) => t.name as string);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
describe("bloom-os registration", () => {
	it("registers exactly 18 tools", () => {
		expect(api._registeredTools).toHaveLength(18);
	});

	it("registers all expected tool names", () => {
		expect(toolNames()).toEqual(EXPECTED_TOOL_NAMES);
	});

	it("has session_start and before_agent_start event handlers", () => {
		const events = [...api._eventHandlers.keys()];
		expect(events).toContain("session_start");
		expect(events).toContain("before_agent_start");
	});
});

// ---------------------------------------------------------------------------
// Tool structure validation
// ---------------------------------------------------------------------------
describe("bloom-os tool structure", () => {
	it("each tool has name, label, description, parameters, and execute", () => {
		for (const tool of api._registeredTools) {
			expect(tool, `tool ${tool.name} missing 'name'`).toHaveProperty("name");
			expect(tool, `tool ${tool.name} missing 'label'`).toHaveProperty("label");
			expect(tool, `tool ${tool.name} missing 'description'`).toHaveProperty("description");
			expect(tool, `tool ${tool.name} missing 'parameters'`).toHaveProperty("parameters");
			expect(tool, `tool ${tool.name} missing 'execute'`).toHaveProperty("execute");
			expect(typeof tool.execute, `tool ${tool.name} execute is not a function`).toBe("function");
		}
	});

	it("each tool has a non-empty description", () => {
		for (const tool of api._registeredTools) {
			expect(typeof tool.description).toBe("string");
			expect((tool.description as string).length).toBeGreaterThan(0);
		}
	});

	it("each tool has a non-empty label", () => {
		for (const tool of api._registeredTools) {
			expect(typeof tool.label).toBe("string");
			expect((tool.label as string).length).toBeGreaterThan(0);
		}
	});

	it("tool names are unique", () => {
		const names = toolNames();
		expect(new Set(names).size).toBe(names.length);
	});
});
