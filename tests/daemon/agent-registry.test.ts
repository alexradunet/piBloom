import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadRuntimeAgents } from "../../core/daemon/agent-registry.js";

describe("loadRuntimeAgents", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
		vi.restoreAllMocks();
	});

	function makeNixPiDir(): string {
		const dir = mkdtempSync(join(tmpdir(), "nixpi-agents-"));
		tempDirs.push(dir);
		mkdirSync(join(dir, "Agents"), { recursive: true });
		return dir;
	}

	function writeAgent(workspaceDir: string, agentId: string, content: string): void {
		const agentDir = join(workspaceDir, "Agents", agentId);
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "AGENTS.md"), content);
	}

	it("loads a valid AGENTS.md file", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"planner",
			`---
id: planner
name: Planner
matrix:
  username: planner
  autojoin: true
model: anthropic/claude-sonnet-4-5
thinking: medium
respond:
  mode: mentioned
  allow_agent_mentions: true
  max_public_turns_per_root: 3
  cooldown_ms: 2000
description: Planning specialist
---
# Planner

Plan first.
`,
		);

		const { agents, fallbackToHost } = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(agents).toHaveLength(1);
		expect(fallbackToHost).toBe(false);
		expect(agents[0]).toEqual({
			id: "planner",
			name: "Planner",
			description: "Planning specialist",
			instructionsPath: join(workspaceDir, "Agents", "planner", "AGENTS.md"),
			instructionsBody: "# Planner\n\nPlan first.\n",
			matrix: {
				username: "planner",
				userId: "@planner:nixpi",
				autojoin: true,
			},
			model: "anthropic/claude-sonnet-4-5",
			thinking: "medium",
			respond: {
				mode: "mentioned",
				allowAgentMentions: true,
				maxPublicTurnsPerRoot: 3,
				cooldownMs: 2000,
			},
		});
	});

	it("applies defaults for optional respond fields", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"critic",
			`---
id: critic
name: Critic
matrix:
  username: critic
---
# Critic

Question assumptions.
`,
		);

		const { agents } = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(agents[0]?.respond).toEqual({
			mode: "mentioned",
			allowAgentMentions: true,
			maxPublicTurnsPerRoot: 2,
			cooldownMs: 1500,
		});
		expect(agents[0]?.matrix).toEqual({
			username: "critic",
			userId: "@critic:nixpi",
			autojoin: true,
		});
	});

	it("loads multiple agent directories", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"host",
			`---
id: host
name: Host
matrix:
  username: pi
respond:
  mode: host
---
# Host
`,
		);
		writeAgent(
			workspaceDir,
			"planner",
			`---
id: planner
name: Planner
matrix:
  username: planner
---
# Planner
`,
		);

		const { agents } = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(agents.map((agent) => agent.id)).toEqual(["host", "planner"]);
	});

	it("skips agents with missing id and records the error", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"planner",
			`---
name: Planner
matrix:
  username: planner
---
# Planner
`,
		);

		const result = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(result.agents).toEqual([]);
		expect(result.errors).toEqual([expect.stringContaining("missing required field 'id'")]);
	});

	it("skips agents with missing name and records the error", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"planner",
			`---
id: planner
matrix:
  username: planner
---
# Planner
`,
		);

		const result = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(result.agents).toEqual([]);
		expect(result.errors).toEqual([expect.stringContaining("missing required field 'name'")]);
	});

	it("skips agents with missing matrix.username and records the error", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"planner",
			`---
id: planner
name: Planner
matrix:
  autojoin: true
---
# Planner
`,
		);

		const result = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(result.agents).toEqual([]);
		expect(result.errors).toEqual([expect.stringContaining("missing required field 'matrix.username'")]);
	});

	it("loads valid agents even when another agent definition is malformed", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"host",
			`---
id: host
name: Host
matrix:
  username: pi
respond:
  mode: host
---
# Host
`,
		);
		writeAgent(
			workspaceDir,
			"broken",
			`---
name: Broken
matrix:
  username: broken
---
# Broken
`,
		);

		const result = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(result.agents.map((agent) => agent.id)).toEqual(["host"]);
		expect(result.errors).toHaveLength(1);
	});

	it("uses provided server name when deriving Matrix user ids", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"planner",
			`---
id: planner
name: Planner
matrix:
  username: planner
---
# Planner
`,
		);

		const { agents } = loadRuntimeAgents({ nixPiDir: workspaceDir, serverName: "homebox" });
		expect(agents[0]?.matrix.userId).toBe("@planner:homebox");
	});

	it("loads proactive heartbeat and cron jobs when configured", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"host",
			`---
id: host
name: Host
matrix:
  username: pi
respond:
  mode: host
proactive:
  jobs:
    - id: daily-heartbeat
      kind: heartbeat
      room: "!ops:nixpi"
      interval_minutes: 1440
      prompt: Review the room and host state. Reply HEARTBEAT_OK if nothing needs surfacing.
      quiet_if_noop: true
      no_op_token: HEARTBEAT_OK
    - id: morning-check
      kind: cron
      room: "!ops:nixpi"
      cron: "0 9 * * *"
      prompt: Send the morning operational check-in.
---
# Host
`,
		);

		const { agents } = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(agents[0]?.proactive?.jobs).toEqual([
			{
				id: "daily-heartbeat",
				kind: "heartbeat",
				room: "!ops:nixpi",
				intervalMinutes: 1440,
				prompt: "Review the room and host state. Reply HEARTBEAT_OK if nothing needs surfacing.",
				quietIfNoop: true,
				noOpToken: "HEARTBEAT_OK",
			},
			{
				id: "morning-check",
				kind: "cron",
				room: "!ops:nixpi",
				cron: "0 9 * * *",
				prompt: "Send the morning operational check-in.",
			},
		]);
	});

	it("rejects proactive jobs with invalid heartbeat intervals", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"host",
			`---
id: host
name: Host
matrix:
  username: pi
proactive:
  jobs:
    - id: bad-heartbeat
      kind: heartbeat
      room: "!ops:nixpi"
      interval_minutes: 0
      prompt: Invalid
---
# Host
`,
		);

		const result = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(result.agents).toEqual([]);
		expect(result.errors).toEqual([expect.stringContaining("invalid interval_minutes")]);
	});

	it("rejects proactive jobs with unsupported cron expressions", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"host",
			`---
id: host
name: Host
matrix:
  username: pi
proactive:
  jobs:
    - id: bad-cron
      kind: cron
      room: "!ops:nixpi"
      cron: "*/5 * * * *"
      prompt: Invalid
---
# Host
`,
		);

		const result = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(result.agents).toEqual([]);
		expect(result.errors).toEqual([expect.stringContaining("unsupported cron")]);
	});

	it("rejects duplicate proactive job ids within the same room", () => {
		const workspaceDir = makeNixPiDir();
		writeAgent(
			workspaceDir,
			"host",
			`---
id: host
name: Host
matrix:
  username: pi
proactive:
  jobs:
    - id: daily-heartbeat
      kind: heartbeat
      room: "!ops:nixpi"
      interval_minutes: 1440
      prompt: First
    - id: daily-heartbeat
      kind: cron
      room: "!ops:nixpi"
      cron: "0 9 * * *"
      prompt: Second
---
# Host
`,
		);

		const result = loadRuntimeAgents({ nixPiDir: workspaceDir });
		expect(result.agents).toEqual([]);
		expect(result.errors).toEqual([expect.stringContaining("duplicate proactive job 'daily-heartbeat'")]);
	});

	it("falls back to the builtin host agent when no agent definitions exist", () => {
		const workspaceDir = mkdtempSync(join(tmpdir(), "nixpi-agents-empty-"));
		tempDirs.push(workspaceDir);
		const result = loadRuntimeAgents({
			nixPiDir: workspaceDir,
			primaryCredentials: {
				homeserver: "http://matrix",
				botUserId: "@pi:nixpi",
				botAccessToken: "token",
				botPassword: "secret",
				registrationToken: "reg-token",
			},
		});
		expect(result.fallbackToHost).toBe(true);
		expect(result.agents).toEqual([
			expect.objectContaining({
				id: "host",
				instructionsPath: "<builtin>",
				matrix: expect.objectContaining({ userId: "@pi:nixpi" }),
				respond: expect.objectContaining({ mode: "host" }),
			}),
		]);
	});
});
