export interface ScheduledJob {
	id: string;
	agentId: string;
	roomId: string;
	kind: "heartbeat" | "cron";
	prompt: string;
	intervalMinutes?: number;
	cron?: string;
	quietIfNoop?: boolean;
	noOpToken?: string;
}

export interface SchedulerJobState {
	lastRunAt?: number;
}

export interface TriggeredJob extends ScheduledJob {
	jobId: string;
}

export interface SchedulerOptions {
	jobs: ScheduledJob[];
	onTrigger: (job: TriggeredJob) => Promise<unknown>;
	loadState: () => Record<string, SchedulerJobState>;
	saveState: (state: Record<string, SchedulerJobState>) => void;
	now?: () => number;
	setTimeoutImpl?: typeof setTimeout;
	clearTimeoutImpl?: typeof clearTimeout;
}

type ParsedCron = { kind: "hourly"; minute: number } | { kind: "daily"; minute: number; hour: number };

export class Scheduler {
	private readonly jobs: ScheduledJob[];
	private readonly onTrigger: (job: TriggeredJob) => Promise<unknown>;
	private readonly saveState: (state: Record<string, SchedulerJobState>) => void;
	private readonly now: () => number;
	private readonly setTimeoutImpl: typeof setTimeout;
	private readonly clearTimeoutImpl: typeof clearTimeout;
	private readonly state: Record<string, SchedulerJobState>;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;

	constructor(options: SchedulerOptions) {
		this.jobs = options.jobs;
		this.onTrigger = options.onTrigger;
		this.saveState = options.saveState;
		this.now = options.now ?? (() => Date.now());
		this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
		this.clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
		this.state = options.loadState();
	}

	start(): void {
		this.stopped = false;
		this.scheduleNext();
	}

	stop(): void {
		this.stopped = true;
		if (this.timer) {
			this.clearTimeoutImpl(this.timer);
			this.timer = null;
		}
	}

	private scheduleNext(): void {
		if (this.stopped || this.jobs.length === 0) return;

		const now = this.now();
		const nextRunAt = Math.min(
			...this.jobs.map((job) => computeNextRunAt(job, now, this.state[this.stateKey(job)]?.lastRunAt)),
		);
		const delayMs = Math.max(0, nextRunAt - now);
		this.timer = this.setTimeoutImpl(() => {
			void this.runDueJobs().then(() => this.scheduleNext());
		}, delayMs);
	}

	private async runDueJobs(): Promise<void> {
		const now = this.now();
		for (const job of this.jobs) {
			const stateKey = this.stateKey(job);
			const nextRunAt = computeNextRunAt(job, now, this.state[stateKey]?.lastRunAt);
			if (nextRunAt > now) continue;

			await this.onTrigger({
				...job,
				jobId: job.id,
			});
			this.state[stateKey] = { lastRunAt: now };
			this.saveState(this.state);
		}
	}

	private stateKey(job: ScheduledJob): string {
		return `${job.agentId}::${job.id}`;
	}
}

export function computeNextRunAt(job: ScheduledJob, now: number, lastRunAt?: number): number {
	if (job.kind === "heartbeat") {
		const intervalMs = (job.intervalMinutes ?? 0) * 60 * 1000;
		if (lastRunAt === undefined) return now;
		return lastRunAt + intervalMs;
	}

	const parsed = parseCron(job.cron ?? "");
	const current = new Date(now);
	const next = new Date(now);
	next.setUTCSeconds(0, 0);
	if (parsed.kind === "hourly") {
		next.setUTCMinutes(parsed.minute, 0, 0);
		if (next.getTime() <= current.getTime()) {
			next.setUTCHours(next.getUTCHours() + 1);
		}
		return next.getTime();
	}

	next.setUTCHours(parsed.hour, parsed.minute, 0, 0);
	if (next.getTime() <= current.getTime()) {
		next.setUTCDate(next.getUTCDate() + 1);
	}
	return next.getTime();
}

function parseCron(expression: string): ParsedCron {
	const trimmed = expression.trim();
	if (trimmed === "@daily") return { kind: "daily", minute: 0, hour: 0 };
	if (trimmed === "@hourly") return { kind: "hourly", minute: 0 };

	const parts = trimmed.split(/\s+/);
	if (parts.length !== 5) {
		throw new Error(`Unsupported cron expression: ${expression}`);
	}
	if (parts[2] !== "*" || parts[3] !== "*" || parts[4] !== "*") {
		throw new Error(`Unsupported cron expression: ${expression}`);
	}

	const minute = Number.parseInt(parts[0] ?? "", 10);
	const hour = Number.parseInt(parts[1] ?? "", 10);
	if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
		throw new Error(`Unsupported cron expression: ${expression}`);
	}
	if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
		throw new Error(`Unsupported cron expression: ${expression}`);
	}
	return { kind: "daily", minute, hour };
}
