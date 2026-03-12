/**
 * Step guidance constants for bloom-setup.
 * Defines what Pi should say/do at each first-boot setup step.
 */
import type { StepName } from "../../lib/setup.js";

/** Step guidance — what Pi should say/do at each step. */
export const STEP_GUIDANCE: Record<StepName, string> = {
	persona:
		"Guide the user through personalizing their AI companion. Ask one question at a time: SOUL — 'What should I call you?', 'How formal or casual should I be?', 'Any values important to you?'. BODY — 'Same style everywhere, or different for Matrix vs terminal?'. FACULTY — 'Step-by-step thinker or quick and direct?'. Update ~/Bloom/Persona/ files with their preferences. Fully skippable.",
	complete:
		"Congratulate the user! Setup is complete. Mention they can chat here on the terminal or on their connected messaging channel. Let them know Pi is always running in the background — even when they log out, Pi stays connected to Matrix rooms and responds to messages. When they log in interactively, they get a separate terminal session while the daemon keeps running in parallel. Both share the same persona and filesystem. Remind them they can revisit any setup step by asking.",
};
