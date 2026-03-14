import { describe, expect, it, vi } from "vitest";

import {
	type ScheduledJob,
	Scheduler,
	computeNextRunAt,
} from "../../core/daemon/scheduler.js";

describe("computeNextRunAt", () => {
	it("schedules heartbeat jobs relative to the last run time", () => {
		const job: ScheduledJob = {
			id: "daily-heartbeat",
			agentId: "host",
			roomId: "!ops:bloom",
			kind: "heartbeat",
			intervalMinutes: 1440,
			prompt: "Heartbeat",
		};

		expect(computeNextRunAt(job, Date.UTC(2026, 2, 14, 12, 0, 0), Date.UTC(2026, 2, 13, 12, 0, 0))).toBe(
			Date.UTC(2026, 2, 14, 12, 0, 0),
		);
	});

	it("schedules cron jobs at the next matching daily time", () => {
		const job: ScheduledJob = {
			id: "morning-check",
			agentId: "host",
			roomId: "!ops:bloom",
			kind: "cron",
			cron: "0 9 * * *",
			prompt: "Morning check",
		};

		expect(computeNextRunAt(job, Date.UTC(2026, 2, 14, 8, 30, 0))).toBe(Date.UTC(2026, 2, 14, 9, 0, 0));
		expect(computeNextRunAt(job, Date.UTC(2026, 2, 14, 9, 30, 0))).toBe(Date.UTC(2026, 2, 15, 9, 0, 0));
	});

	it("supports the @hourly cron macro", () => {
		const job: ScheduledJob = {
			id: "hourly-check",
			agentId: "host",
			roomId: "!ops:bloom",
			kind: "cron",
			cron: "@hourly",
			prompt: "Hourly check",
		};

		expect(computeNextRunAt(job, Date.UTC(2026, 2, 14, 8, 30, 0))).toBe(Date.UTC(2026, 2, 14, 9, 0, 0));
	});
});

describe("Scheduler", () => {
	it("fires due jobs, persists state, and schedules the next run", async () => {
		vi.useFakeTimers();
		const callback = vi.fn(async () => "ok");
		const persistState = vi.fn();
		const timeouts: Array<() => void> = [];
		const setTimeoutImpl = vi.fn((fn: () => void, _delay: number) => {
			timeouts.push(fn);
			return 1 as unknown as ReturnType<typeof setTimeout>;
		});
		const clearTimeoutImpl = vi.fn();
		const jobs: ScheduledJob[] = [
			{
				id: "daily-heartbeat",
				agentId: "host",
				roomId: "!ops:bloom",
				kind: "heartbeat",
				intervalMinutes: 1440,
				prompt: "Heartbeat",
			},
		];
		const scheduler = new Scheduler({
			jobs,
			now: () => Date.UTC(2026, 2, 14, 12, 0, 0),
			onTrigger: callback,
			loadState: () => ({
				"host::daily-heartbeat": {
					lastRunAt: Date.UTC(2026, 2, 13, 12, 0, 0),
				},
			}),
			saveState: persistState,
			setTimeoutImpl: setTimeoutImpl as unknown as typeof setTimeout,
			clearTimeoutImpl: clearTimeoutImpl as unknown as typeof clearTimeout,
		});

		scheduler.start();
		await timeouts[0]?.();

		expect(callback).toHaveBeenCalledWith(
			expect.objectContaining({
				jobId: "daily-heartbeat",
				agentId: "host",
				roomId: "!ops:bloom",
				kind: "heartbeat",
			}),
		);
		expect(persistState).toHaveBeenCalledWith({
			"host::daily-heartbeat": {
				lastRunAt: Date.UTC(2026, 2, 14, 12, 0, 0),
			},
		});

		scheduler.stop();
		expect(clearTimeoutImpl).toHaveBeenCalled();
		vi.useRealTimers();
	});
});
