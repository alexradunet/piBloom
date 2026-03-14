import { createLogger } from "../lib/shared.js";

const log = createLogger("pi-daemon");

export interface RoomFailureState {
	count: number;
	windowStart: number;
	quarantinedUntil: number;
}

export interface HandleRoomProcessErrorOptions {
	roomFailureWindowMs: number;
	roomFailureThreshold: number;
	roomQuarantineMs: number;
	now?: () => number;
}

export function handleRoomProcessError(
	roomId: string,
	code: number,
	failures: Map<string, RoomFailureState>,
	options: HandleRoomProcessErrorOptions,
): void {
	const now = (options.now ?? (() => Date.now()))();
	const prev = failures.get(roomId);
	const next =
		!prev || now - prev.windowStart > options.roomFailureWindowMs
			? { count: 1, windowStart: now, quarantinedUntil: 0 }
			: { ...prev, count: prev.count + 1 };

	if (next.count >= options.roomFailureThreshold) {
		next.quarantinedUntil = now + options.roomQuarantineMs;
		log.error("room session quarantined after repeated failures", {
			roomId,
			code,
			failures: next.count,
			quarantinedUntil: new Date(next.quarantinedUntil).toISOString(),
		});
	} else {
		log.warn("room session failed", { roomId, code, failures: next.count });
	}

	failures.set(roomId, next);
}
