import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockExtensionContext } from "../helpers/mock-extension-context.js";

const runMock = vi.fn();

vi.mock("../../core/lib/exec.js", () => ({
	run: (...args: unknown[]) => runMock(...args),
}));

describe("os nixos_update handler", () => {
	beforeEach(() => {
		vi.resetModules();
		runMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("applies the installed /etc/nixos flake", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		runMock.mockResolvedValueOnce({ stdout: "ok\n", stderr: "", exitCode: 0 });

		const { handleNixosUpdate } = await import("../../core/pi/extensions/os/actions.js");
		const ctx = createMockExtensionContext({ hasUI: true });
		const result = await handleNixosUpdate("apply", undefined, ctx as never);

		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect(runMock).toHaveBeenCalledWith(
			"nixpi-brokerctl",
			["nixos-update", "apply", "/etc/nixos"],
			undefined,
		);
		expect(result.isError).toBe(false);
		expect(result.content[0].text).toContain("from /etc/nixos");
	});

	it("fails early if the installed system flake is missing", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(false);

		const { handleNixosUpdate } = await import("../../core/pi/extensions/os/actions.js");
		const ctx = createMockExtensionContext({ hasUI: true });
		const result = await handleNixosUpdate("apply", undefined, ctx as never);

		expect(runMock).not.toHaveBeenCalled();
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("System flake not found at /etc/nixos");
	});

	it("returns error result when apply exits non-zero", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		runMock.mockResolvedValueOnce({ stdout: "", stderr: "build failed", exitCode: 1 });

		const { handleNixosUpdate } = await import("../../core/pi/extensions/os/actions.js");
		const ctx = createMockExtensionContext({ hasUI: true });
		const result = await handleNixosUpdate("apply", undefined, ctx as never);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("build failed");
	});

	it("schedules a reboot after confirmation", async () => {
		runMock.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

		const { handleScheduleReboot } = await import("../../core/pi/extensions/os/actions.js");
		const ctx = createMockExtensionContext({ hasUI: true });
		const result = await handleScheduleReboot(5, undefined, ctx as never);

		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect((result as { isError?: boolean }).isError).toBeFalsy();
		expect(result.content[0].text).toContain("5 minute");
	});

	it("returns error when schedule reboot command fails", async () => {
		runMock.mockResolvedValueOnce({ stdout: "", stderr: "permission denied", exitCode: 1 });

		const { handleScheduleReboot } = await import("../../core/pi/extensions/os/actions.js");
		const ctx = createMockExtensionContext({ hasUI: true });
		const result = await handleScheduleReboot(1, undefined, ctx as never);

		expect((result as { isError?: boolean }).isError).toBe(true);
		expect(result.content[0].text).toContain("Failed to schedule reboot");
	});
});
