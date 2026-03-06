import { vi } from "vitest";

export interface MockExtensionContext {
	hasUI: boolean;
	ui: {
		setStatus: ReturnType<typeof vi.fn>;
		setWidget: ReturnType<typeof vi.fn>;
		notify: ReturnType<typeof vi.fn>;
		confirm: ReturnType<typeof vi.fn>;
	};
	cwd: string;
	isIdle: ReturnType<typeof vi.fn>;
	sessionManager: {
		getEntries: ReturnType<typeof vi.fn>;
		getLeafEntry: ReturnType<typeof vi.fn>;
	};
	navigateTree: ReturnType<typeof vi.fn>;
}

export function createMockExtensionContext(overrides?: Partial<MockExtensionContext>): MockExtensionContext {
	return {
		hasUI: true,
		ui: {
			setStatus: vi.fn(),
			setWidget: vi.fn(),
			notify: vi.fn(),
			confirm: vi.fn().mockResolvedValue(true),
		},
		cwd: "/tmp/test",
		isIdle: vi.fn().mockReturnValue(true),
		sessionManager: {
			getEntries: vi.fn().mockReturnValue([]),
			getLeafEntry: vi.fn().mockReturnValue(null),
		},
		navigateTree: vi.fn().mockResolvedValue({ cancelled: false }),
		...overrides,
	};
}
