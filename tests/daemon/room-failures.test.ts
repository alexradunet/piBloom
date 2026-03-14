import { describe, expect, it } from "vitest";

import { handleRoomProcessError } from "../../core/daemon/room-failures.js";

describe("handleRoomProcessError", () => {
	it("quarantines a room after repeated failures within the failure window", () => {
		const failures = new Map();
		const options = {
			roomFailureWindowMs: 60_000,
			roomFailureThreshold: 3,
			roomQuarantineMs: 300_000,
		};

		handleRoomProcessError("!room:bloom", 1, failures, { ...options, now: () => 1_000 });
		handleRoomProcessError("!room:bloom", 1, failures, { ...options, now: () => 2_000 });
		handleRoomProcessError("!room:bloom", 1, failures, { ...options, now: () => 3_000 });

		expect(failures.get("!room:bloom")).toEqual({
			count: 3,
			windowStart: 1_000,
			quarantinedUntil: 303_000,
		});
	});

	it("resets the failure count after the failure window expires", () => {
		const failures = new Map();
		const options = {
			roomFailureWindowMs: 60_000,
			roomFailureThreshold: 3,
			roomQuarantineMs: 300_000,
		};

		handleRoomProcessError("!room:bloom", 1, failures, { ...options, now: () => 1_000 });
		handleRoomProcessError("!room:bloom", 1, failures, { ...options, now: () => 70_000 });

		expect(failures.get("!room:bloom")).toEqual({
			count: 1,
			windowStart: 70_000,
			quarantinedUntil: 0,
		});
	});
});
