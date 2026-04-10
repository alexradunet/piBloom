// Extension-specific types for os

/** Update status persisted to the primary NixPI user's ~/.nixpi/update-status.json. */
export interface UpdateStatus {
	available: boolean;
	checked: string;
	generation?: string; // NixOS generation number
	notified?: boolean;
}

export interface ExitCodeDetails {
	exitCode: number;
}

export interface NixosApplyDetails extends ExitCodeDetails {
	flake: string;
	flakeDir: string;
}

export interface ScheduleRebootDetails {
	delay_minutes: number;
}

export interface SystemHealthDetails {
	sections: string[];
}

export interface RepoSetupDetails {
	repoDir: string;
	created: boolean;
	source: string;
}

export interface RepoStatusDetails {
	repoDir: string;
	branch: string;
	remote: string;
	clean: boolean;
}

export interface RepoCommandDetails {
	repoDir: string;
	exitCode: number;
}

export interface RepoValidationDetails {
	repoDir: string;
	flakeCheck: number;
	configBuild: number;
}
