/** Minimal confirmation helper for OS extension actions. */
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export async function requireConfirmation(ctx: ExtensionContext, action: string): Promise<string | null> {
	if (!ctx.hasUI) {
		return `Cannot perform "${action}" without interactive user confirmation.`;
	}
	const confirmed = await ctx.ui.confirm("Confirm action", `Allow: ${action}?`);
	if (!confirmed) return `User declined: ${action}`;
	return null;
}
