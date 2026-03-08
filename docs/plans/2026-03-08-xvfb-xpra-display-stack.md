# Xvfb + Xpra Display Stack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Sway/wayvnc Wayland stack with Xvfb/Xpra/i3 for AI agent computer use and human observation.

**Architecture:** Xpra manages the entire display lifecycle — spawns Xvfb :99, starts i3, streams to HTML5 on :14500. Pi interacts via `bloom-display` extension using xdotool, scrot, AT-SPI2, and i3-msg. Physical monitor via greetd initial_session `xpra attach :99`.

**Tech Stack:** TypeScript (strict, ES2022, NodeNext), Biome (tabs, double quotes, 120 line width), Vitest, Xvfb, Xpra, i3, xdotool, scrot, AT-SPI2 (python3-pyatspi), alacritty

**Design doc:** `docs/plans/2026-03-08-xvfb-xpra-display-stack-design.md`

---

## Task 1: Create bloom-display.service systemd unit

**Files:**
- Create: `os/sysconfig/bloom-display.service`

**Step 1: Create the systemd unit file**

```ini
[Unit]
Description=Bloom Display (Xpra + Xvfb + i3)
After=network.target

[Service]
User=bloom
Environment=DISPLAY=:99
ExecStart=/usr/bin/xpra start :99 \
    --start=i3 \
    --bind-tcp=0.0.0.0:14500 \
    --html=on \
    --no-daemon
ExecStop=/usr/bin/xpra stop :99
Restart=on-failure
RestartSec=5

[Install]
WantedBy=graphical.target
```

Write this to `os/sysconfig/bloom-display.service`.

**Step 2: Commit**

```bash
git add os/sysconfig/bloom-display.service
git commit -m "feat: add bloom-display.service systemd unit for Xpra+Xvfb+i3"
```

---

## Task 2: Create i3 configuration

**Files:**
- Create: `os/sysconfig/i3-config`
- Delete: `os/sysconfig/sway-config`

**Step 1: Create the i3 config**

```
# Bloom i3 config — optimized for AI agent computer use
# Baked into OS image at /etc/xdg/i3/config
set $mod Mod4

# Tabbed layout: one app visible at a time, clean screenshots
workspace_layout tabbed

# Minimal decorations — maximize screenshot real estate
default_border pixel 1

# Font for i3bar/titles (small, readable)
font pango:monospace 10

# Workspaces
workspace 1 output *
workspace 2 output *
workspace 3 output *
workspace 4 output *

# Autostart: launch terminal with Pi on workspace 1
exec --no-startup-id alacritty -T "Bloom Pi" -e bash --login

# Keybindings for human use (when attached via Xpra)
bindsym $mod+Return exec alacritty
bindsym $mod+backslash exec chromium
bindsym $mod+Shift+q kill
bindsym $mod+1 workspace 1
bindsym $mod+2 workspace 2
bindsym $mod+3 workspace 3
bindsym $mod+4 workspace 4
bindsym $mod+Shift+1 move container to workspace 1
bindsym $mod+Shift+2 move container to workspace 2
bindsym $mod+Shift+3 move container to workspace 3
bindsym $mod+Shift+4 move container to workspace 4
bindsym $mod+h focus left
bindsym $mod+j focus down
bindsym $mod+k focus up
bindsym $mod+l focus right
bindsym $mod+f fullscreen toggle
bindsym $mod+Shift+e exec "i3-nagbar -t warning -m 'Exit i3?' -B 'Yes' 'i3-msg exit'"
```

Write this to `os/sysconfig/i3-config`.

**Step 2: Delete sway-config**

```bash
git rm os/sysconfig/sway-config
```

**Step 3: Commit**

```bash
git add os/sysconfig/i3-config
git commit -m "feat: add i3-config for agent display, remove sway-config"
```

---

## Task 3: Create AT-SPI2 UI tree helper script

**Files:**
- Create: `os/scripts/ui-tree.py`

**Step 1: Create the Python script**

This script walks the AT-SPI2 accessibility tree and outputs JSON. It accepts an optional `--app` filter.

```python
#!/usr/bin/env python3
"""Walk AT-SPI2 accessibility tree and output JSON.

Usage:
    ui-tree.py              # full tree
    ui-tree.py --app NAME   # filter by application name
"""
import json
import sys

import pyatspi


def node_to_dict(node, depth=0, max_depth=10):
    """Convert an AT-SPI2 accessible node to a dictionary."""
    if depth > max_depth:
        return None
    try:
        role = node.getRoleName()
        name = node.name or ""
        state_set = node.getState()
        states = []
        for s in pyatspi.StateType._enum_lookup.values():
            if state_set.contains(s):
                states.append(str(s).split("_", 2)[-1].lower())

        result = {
            "role": role,
            "name": name,
            "states": states,
        }

        # Add position/size if available
        try:
            component = node.queryComponent()
            if component:
                bbox = component.getExtents(pyatspi.DESKTOP_COORDS)
                result["bounds"] = {
                    "x": bbox.x,
                    "y": bbox.y,
                    "width": bbox.width,
                    "height": bbox.height,
                }
        except (NotImplementedError, AttributeError):
            pass

        # Add text content if available
        try:
            text_iface = node.queryText()
            if text_iface:
                text = text_iface.getText(0, min(text_iface.characterCount, 500))
                if text.strip():
                    result["text"] = text
        except (NotImplementedError, AttributeError):
            pass

        # Add value if available
        try:
            value_iface = node.queryValue()
            if value_iface:
                result["value"] = value_iface.currentValue
        except (NotImplementedError, AttributeError):
            pass

        # Recurse into children
        children = []
        for i in range(node.childCount):
            try:
                child = node.getChildAtIndex(i)
                if child:
                    child_dict = node_to_dict(child, depth + 1, max_depth)
                    if child_dict:
                        children.append(child_dict)
            except Exception:
                continue
        if children:
            result["children"] = children

        return result
    except Exception:
        return None


def main():
    app_filter = None
    if "--app" in sys.argv:
        idx = sys.argv.index("--app")
        if idx + 1 < len(sys.argv):
            app_filter = sys.argv[idx + 1].lower()

    desktop = pyatspi.Registry.getDesktop(0)
    apps = []

    for i in range(desktop.childCount):
        try:
            app = desktop.getChildAtIndex(i)
            if app is None:
                continue
            app_name = app.name or f"app-{i}"
            if app_filter and app_filter not in app_name.lower():
                continue
            app_dict = node_to_dict(app)
            if app_dict:
                apps.append(app_dict)
        except Exception:
            continue

    json.dump(apps, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
```

Write this to `os/scripts/ui-tree.py`.

**Step 2: Commit**

```bash
git add os/scripts/ui-tree.py
git commit -m "feat: add AT-SPI2 ui-tree.py helper for accessibility tree JSON"
```

---

## Task 4: Write bloom-display extension tests

**Files:**
- Create: `tests/extensions/bloom-display.test.ts`

**Step 1: Write the test file**

Follow the pattern from `tests/extensions/bloom-os.test.ts`. Test registration, tool structure, and tool names.

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockExtensionAPI, type MockExtensionAPI } from "../helpers/mock-extension-api.js";
import { createTempGarden, type TempGarden } from "../helpers/temp-garden.js";

let temp: TempGarden;
let api: MockExtensionAPI;

const EXPECTED_TOOL_NAMES = ["display"];

beforeEach(async () => {
	temp = createTempGarden();
	api = createMockExtensionAPI();
	const mod = await import("../../extensions/bloom-display.js");
	mod.default(api as never);
});

afterEach(() => {
	temp.cleanup();
});

function toolNames(): string[] {
	return api._registeredTools.map((t) => t.name as string);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
describe("bloom-display registration", () => {
	it("registers exactly 1 tool", () => {
		expect(api._registeredTools).toHaveLength(1);
	});

	it("registers the display tool", () => {
		expect(toolNames()).toEqual(EXPECTED_TOOL_NAMES);
	});
});

// ---------------------------------------------------------------------------
// Tool structure validation
// ---------------------------------------------------------------------------
describe("bloom-display tool structure", () => {
	it("each tool has name, label, description, parameters, and execute", () => {
		for (const tool of api._registeredTools) {
			expect(tool, `tool ${tool.name} missing 'name'`).toHaveProperty("name");
			expect(tool, `tool ${tool.name} missing 'label'`).toHaveProperty("label");
			expect(tool, `tool ${tool.name} missing 'description'`).toHaveProperty("description");
			expect(tool, `tool ${tool.name} missing 'parameters'`).toHaveProperty("parameters");
			expect(tool, `tool ${tool.name} missing 'execute'`).toHaveProperty("execute");
			expect(typeof tool.execute, `tool ${tool.name} execute is not a function`).toBe("function");
		}
	});

	it("each tool has a non-empty description", () => {
		for (const tool of api._registeredTools) {
			expect(typeof tool.description).toBe("string");
			expect((tool.description as string).length).toBeGreaterThan(0);
		}
	});

	it("each tool has a non-empty label", () => {
		for (const tool of api._registeredTools) {
			expect(typeof tool.label).toBe("string");
			expect((tool.label as string).length).toBeGreaterThan(0);
		}
	});
});
```

Write this to `tests/extensions/bloom-display.test.ts`.

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/extensions/bloom-display.test.ts`

Expected: FAIL — `extensions/bloom-display.js` does not exist yet.

**Step 3: Commit**

```bash
git add tests/extensions/bloom-display.test.ts
git commit -m "test: add bloom-display extension registration tests"
```

---

## Task 5: Implement bloom-display extension

**Files:**
- Create: `extensions/bloom-display.ts`

**Step 1: Implement the extension**

Follow the combined-tool pattern from `extensions/bloom-os.ts`. One tool (`display`) with an `action` parameter that dispatches to different operations.

```typescript
/**
 * 🖥️ bloom-display — AI agent computer use: screenshots, input injection, accessibility tree, window management.
 *
 * @tools display
 * @see {@link ../docs/plans/2026-03-08-xvfb-xpra-display-stack-design.md} Design doc
 */
import { join } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { run } from "../lib/exec.js";
import { errorResult, truncate } from "../lib/shared.js";

const DISPLAY = ":99";
const ENV = { DISPLAY };

/** Run a command with DISPLAY=:99 set. */
async function runDisplay(
	cmd: string,
	args: string[],
	signal?: AbortSignal,
): ReturnType<typeof run> {
	// execa inherits env, so we set DISPLAY in the process env before calling
	const prevDisplay = process.env.DISPLAY;
	process.env.DISPLAY = DISPLAY;
	try {
		return await run(cmd, args, signal);
	} finally {
		if (prevDisplay !== undefined) {
			process.env.DISPLAY = prevDisplay;
		} else {
			delete process.env.DISPLAY;
		}
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "display",
		label: "Display Control",
		description:
			"AI computer use: take screenshots, inject mouse/keyboard input, read the accessibility tree, and manage windows. " +
			"Actions: screenshot, click, type, key, move, scroll, ui_tree, windows, workspace, launch, focus.",
		parameters: Type.Object({
			action: StringEnum(
				["screenshot", "click", "type", "key", "move", "scroll", "ui_tree", "windows", "workspace", "launch", "focus"] as const,
				{
					description:
						"screenshot: capture screen. click: click at coordinates. type: type text. key: send key combo. " +
						"move: move mouse. scroll: scroll at position. ui_tree: AT-SPI2 accessibility tree. " +
						"windows: list windows via i3. workspace: switch workspace. launch: start an app. focus: focus a window.",
				},
			),
			x: Type.Optional(Type.Number({ description: "X coordinate (click, move, scroll)" })),
			y: Type.Optional(Type.Number({ description: "Y coordinate (click, move, scroll)" })),
			text: Type.Optional(Type.String({ description: "Text to type (type action)" })),
			keys: Type.Optional(Type.String({ description: "Key combo e.g. 'ctrl+l', 'Return' (key action)" })),
			button: Type.Optional(Type.Number({ description: "Mouse button 1=left 2=middle 3=right (click, default 1)" })),
			direction: Type.Optional(
				StringEnum(["up", "down"] as const, { description: "Scroll direction (scroll action)" }),
			),
			clicks: Type.Optional(Type.Number({ description: "Number of scroll clicks (scroll, default 3)" })),
			command: Type.Optional(Type.String({ description: "Command to launch (launch action)" })),
			number: Type.Optional(Type.Number({ description: "Workspace number (workspace action)" })),
			target: Type.Optional(
				Type.String({ description: "Window title or ID to focus (focus action)" }),
			),
			app: Type.Optional(Type.String({ description: "Filter by app name (ui_tree action)" })),
			region: Type.Optional(
				Type.Object(
					{
						x: Type.Number(),
						y: Type.Number(),
						w: Type.Number(),
						h: Type.Number(),
					},
					{ description: "Capture region (screenshot action)" },
				),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const { action } = params;

			switch (action) {
				case "screenshot": {
					const args = ["--overwrite", "/tmp/bloom-screenshot.png"];
					if (params.region) {
						const { x, y, w, h } = params.region;
						args.unshift("--select", "--autoselect", `${x},${y},${w},${h}`);
					}
					const result = await runDisplay("scrot", args, signal);
					if (result.exitCode !== 0) {
						return errorResult(`Screenshot failed:\n${result.stderr}`);
					}
					// Read the file and return as base64
					const { readFile } = await import("node:fs/promises");
					const buf = await readFile("/tmp/bloom-screenshot.png");
					const base64 = buf.toString("base64");
					return {
						content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: base64 } }],
						details: { path: "/tmp/bloom-screenshot.png" },
					};
				}

				case "click": {
					if (params.x === undefined || params.y === undefined) {
						return errorResult("click requires x and y coordinates.");
					}
					const btn = String(params.button ?? 1);
					const result = await runDisplay(
						"xdotool",
						["mousemove", "--sync", String(params.x), String(params.y), "click", btn],
						signal,
					);
					if (result.exitCode !== 0) {
						return errorResult(`Click failed:\n${result.stderr}`);
					}
					return {
						content: [{ type: "text", text: `Clicked (${params.x}, ${params.y}) button ${btn}.` }],
						details: { x: params.x, y: params.y, button: btn },
					};
				}

				case "type": {
					if (!params.text) {
						return errorResult("type requires text parameter.");
					}
					const result = await runDisplay(
						"xdotool",
						["type", "--delay", "50", "--", params.text],
						signal,
					);
					if (result.exitCode !== 0) {
						return errorResult(`Type failed:\n${result.stderr}`);
					}
					return {
						content: [{ type: "text", text: `Typed ${params.text.length} characters.` }],
						details: { length: params.text.length },
					};
				}

				case "key": {
					if (!params.keys) {
						return errorResult("key requires keys parameter (e.g. 'ctrl+l', 'Return').");
					}
					const result = await runDisplay("xdotool", ["key", params.keys], signal);
					if (result.exitCode !== 0) {
						return errorResult(`Key press failed:\n${result.stderr}`);
					}
					return {
						content: [{ type: "text", text: `Sent key: ${params.keys}` }],
						details: { keys: params.keys },
					};
				}

				case "move": {
					if (params.x === undefined || params.y === undefined) {
						return errorResult("move requires x and y coordinates.");
					}
					const result = await runDisplay(
						"xdotool",
						["mousemove", "--sync", String(params.x), String(params.y)],
						signal,
					);
					if (result.exitCode !== 0) {
						return errorResult(`Mouse move failed:\n${result.stderr}`);
					}
					return {
						content: [{ type: "text", text: `Moved mouse to (${params.x}, ${params.y}).` }],
						details: { x: params.x, y: params.y },
					};
				}

				case "scroll": {
					if (params.x === undefined || params.y === undefined) {
						return errorResult("scroll requires x and y coordinates.");
					}
					if (!params.direction) {
						return errorResult("scroll requires direction ('up' or 'down').");
					}
					const scrollBtn = params.direction === "up" ? "4" : "5";
					const n = params.clicks ?? 3;
					const args = ["mousemove", "--sync", String(params.x), String(params.y)];
					for (let i = 0; i < n; i++) {
						args.push("click", scrollBtn);
					}
					const result = await runDisplay("xdotool", args, signal);
					if (result.exitCode !== 0) {
						return errorResult(`Scroll failed:\n${result.stderr}`);
					}
					return {
						content: [{ type: "text", text: `Scrolled ${params.direction} ${n} clicks at (${params.x}, ${params.y}).` }],
						details: { x: params.x, y: params.y, direction: params.direction, clicks: n },
					};
				}

				case "ui_tree": {
					const scriptPath = join("/usr/local/share/bloom/os/scripts", "ui-tree.py");
					const args = [scriptPath];
					if (params.app) {
						args.push("--app", params.app);
					}
					const result = await runDisplay("python3", args, signal);
					if (result.exitCode !== 0) {
						return errorResult(`AT-SPI2 tree failed:\n${result.stderr}`);
					}
					return {
						content: [{ type: "text", text: truncate(result.stdout || "[]") }],
						details: { app: params.app ?? null },
					};
				}

				case "windows": {
					const result = await runDisplay("i3-msg", ["-t", "get_tree"], signal);
					if (result.exitCode !== 0) {
						return errorResult(`i3 get_tree failed:\n${result.stderr}`);
					}
					// Parse and simplify the i3 tree to just window info
					try {
						const tree = JSON.parse(result.stdout);
						const windows: Array<{ id: number; name: string; focused: boolean; workspace: string; rect: unknown }> = [];
						function walk(node: { id?: number; name?: string; focused?: boolean; type?: string; num?: number; nodes?: unknown[]; floating_nodes?: unknown[]; rect?: unknown }, wsName: string) {
							const currentWs = node.type === "workspace" ? String(node.num ?? node.name ?? wsName) : wsName;
							if (node.type === "con" && node.name) {
								windows.push({
									id: node.id ?? 0,
									name: node.name ?? "",
									focused: node.focused ?? false,
									workspace: currentWs,
									rect: node.rect,
								});
							}
							for (const child of (node.nodes ?? []) as typeof node[]) {
								walk(child, currentWs);
							}
							for (const child of (node.floating_nodes ?? []) as typeof node[]) {
								walk(child, currentWs);
							}
						}
						walk(tree, "");
						return {
							content: [{ type: "text", text: JSON.stringify(windows, null, 2) }],
							details: { count: windows.length },
						};
					} catch {
						return {
							content: [{ type: "text", text: truncate(result.stdout) }],
							details: {},
						};
					}
				}

				case "workspace": {
					if (params.number === undefined) {
						return errorResult("workspace requires number parameter.");
					}
					const result = await runDisplay(
						"i3-msg",
						["workspace", String(params.number)],
						signal,
					);
					if (result.exitCode !== 0) {
						return errorResult(`Workspace switch failed:\n${result.stderr}`);
					}
					return {
						content: [{ type: "text", text: `Switched to workspace ${params.number}.` }],
						details: { workspace: params.number },
					};
				}

				case "launch": {
					if (!params.command) {
						return errorResult("launch requires command parameter.");
					}
					// Use i3-msg exec to launch the command within the i3 session
					const result = await runDisplay(
						"i3-msg",
						["exec", "--no-startup-id", params.command],
						signal,
					);
					if (result.exitCode !== 0) {
						return errorResult(`Launch failed:\n${result.stderr}`);
					}
					return {
						content: [{ type: "text", text: `Launched: ${params.command}` }],
						details: { command: params.command },
					};
				}

				case "focus": {
					if (!params.target) {
						return errorResult("focus requires target parameter (window title or ID).");
					}
					// Try by title first, then by con_id
					const isNumeric = /^\d+$/.test(params.target);
					const criteria = isNumeric
						? `[con_id=${params.target}]`
						: `[title="${params.target}"]`;
					const result = await runDisplay(
						"i3-msg",
						[`${criteria} focus`],
						signal,
					);
					if (result.exitCode !== 0) {
						return errorResult(`Focus failed:\n${result.stderr}`);
					}
					return {
						content: [{ type: "text", text: `Focused window: ${params.target}` }],
						details: { target: params.target },
					};
				}
			}
		},
	});
}
```

Write this to `extensions/bloom-display.ts`.

**Step 2: Run tests to verify they pass**

Run: `npm run test -- tests/extensions/bloom-display.test.ts`

Expected: PASS — 1 tool registered with name "display", all structure checks pass.

**Step 3: Run full test suite**

Run: `npm run test`

Expected: All existing tests still pass, plus new bloom-display tests.

**Step 4: Run lint/format check**

Run: `npm run check`

Expected: No new errors. If Biome complains about line length or formatting, run `npm run check:fix`.

**Step 5: Commit**

```bash
git add extensions/bloom-display.ts
git commit -m "feat: add bloom-display extension — AI agent computer use tools"
```

---

## Task 6: Update Containerfile — swap display stack

**Files:**
- Modify: `os/Containerfile`

**Step 1: Replace Wayland packages with X11/Xpra packages**

In the `dnf install` block (lines 7-43), replace these packages:

Remove:
```
    sway \
    wayvnc \
    foot \
    xdg-desktop-portal-wlr \
    wl-clipboard \
    grim \
    slurp \
```

Add in their place:
```
    xpra \
    xorg-x11-server-Xvfb \
    i3 \
    xdotool \
    scrot \
    at-spi2-core \
    python3-pyatspi \
    alacritty \
```

Keep `chromium` — Pi will drive it for web browsing.

**Step 2: Replace sway config section with i3 + display service**

Find lines 93-96:
```dockerfile
# Minimal desktop defaults: greetd + sway + wayvnc
COPY os/sysconfig/greetd.toml /etc/greetd/config.toml
RUN mkdir -p /etc/skel/.config/sway
COPY os/sysconfig/sway-config /etc/skel/.config/sway/config
```

Replace with:
```dockerfile
# Display stack: greetd + Xpra + Xvfb + i3 (agent-native, headless-first)
COPY os/sysconfig/greetd.toml /etc/greetd/config.toml
RUN mkdir -p /etc/xdg/i3
COPY os/sysconfig/i3-config /etc/xdg/i3/config
COPY os/sysconfig/bloom-display.service /usr/lib/systemd/system/bloom-display.service
RUN systemctl enable bloom-display.service
```

**Step 3: Update the comment on line 114**

Find:
```dockerfile
# Boot to desktop with greetd (sway is configured as default session)
```

Replace with:
```dockerfile
# Boot to graphical target — greetd handles console, bloom-display handles virtual display
```

**Step 4: Add ui-tree.py to the image**

After the `COPY . /usr/local/share/bloom/` line (line 77), the script is already included. But ensure it's executable. After the `npm prune` line (line 82), add:

```dockerfile
RUN chmod +x /usr/local/share/bloom/os/scripts/ui-tree.py
```

**Step 5: Commit**

```bash
git add os/Containerfile
git commit -m "feat: swap Sway/wayvnc for Xvfb/Xpra/i3 in Containerfile"
```

---

## Task 7: Update greetd.toml and bloom-bashrc

**Files:**
- Modify: `os/sysconfig/greetd.toml`
- Modify: `os/sysconfig/bloom-bashrc`

**Step 1: Update greetd.toml**

Replace the entire file with:

```toml
[terminal]
vt = 1

[default_session]
command = "tuigreet --time --remember --remember-session --cmd 'xpra attach :99'"
user = "greetd"

# Auto-attach to Xpra display on boot so physical monitor shows the session
# immediately. Remove this section if you prefer interactive login.
[initial_session]
command = "xpra attach :99"
user = "bloom"
```

**Step 2: Update bloom-bashrc**

Read `os/sysconfig/bloom-bashrc`. Add `export DISPLAY=:99` so all user shells inherit the display. The file should become:

```bash
export BLOOM_DIR="$HOME/Bloom"
export DISPLAY=":99"
export PATH="/usr/local/share/bloom/node_modules/.bin:$PATH"
```

**Step 3: Commit**

```bash
git add os/sysconfig/greetd.toml os/sysconfig/bloom-bashrc
git commit -m "feat: update greetd for Xpra attach, add DISPLAY=:99 to bashrc"
```

---

## Task 8: Update documentation — README.md, AGENTS.md, quick_deploy.md, netbird SKILL.md

**Files:**
- Modify: `README.md:188`
- Modify: `docs/quick_deploy.md:113-131`
- Modify: `services/netbird/SKILL.md:11`

**Step 1: Update README.md**

Find line 188:
```
- **Desktop**: Sway (Wayland), greetd, foot terminal, wayvnc
```

Replace with:
```
- **Desktop**: Xvfb + Xpra (headless X11), greetd, i3 (tiling WM), alacritty terminal
```

**Step 2: Update docs/quick_deploy.md**

Find the remote desktop section (lines 113-131). Replace the entire section with:

```markdown
## Remote desktop (Xpra HTML5)

Bloom OS boots to `graphical.target` with a virtual display (Xvfb :99) managed by Xpra.
The Xpra HTML5 client is available on port 14500.

```bash
# Connect via browser — open in any web browser
http://<netbird-ip>:14500

# Or connect via native Xpra client
xpra attach tcp://<netbird-ip>:14500
```

The display runs headless — no physical monitor needed. If a monitor is connected,
greetd auto-attaches to the Xpra session on login.
```

**Step 3: Update services/netbird/SKILL.md**

Find line 11:
```
NetBird provides the security layer for remote desktop (wayvnc) and file access (dufs).
```

Replace with:
```
NetBird provides the security layer for remote desktop (Xpra) and file access (dufs).
```

**Step 4: Commit**

```bash
git add README.md docs/quick_deploy.md services/netbird/SKILL.md
git commit -m "docs: update display stack references from Sway/wayvnc to Xvfb/Xpra/i3"
```

---

## Task 9: Build verification

**Step 1: Run full test suite**

Run: `npm run test`

Expected: All tests pass, including new bloom-display tests.

**Step 2: Run lint/format**

Run: `npm run check`

Expected: No errors. Fix any issues with `npm run check:fix`.

**Step 3: Run TypeScript build**

Run: `npm run build`

Expected: Clean build, no errors.

**Step 4: Verify Containerfile syntax**

Quickly review that the Containerfile is valid by checking package names exist in Fedora repos:

```bash
# Verify packages are available (run on a Fedora system or check manually)
dnf info xpra xorg-x11-server-Xvfb i3 xdotool scrot at-spi2-core python3-pyatspi alacritty 2>&1 | grep -E "^Name|^Summary"
```

**Step 5: Commit any fixes**

```bash
git add -u
git commit -m "fix: lint/format fixes for display stack changes"
```

(Only if there were fixes needed.)

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | bloom-display.service systemd unit | `os/sysconfig/bloom-display.service` |
| 2 | i3 config (replace sway-config) | `os/sysconfig/i3-config`, delete `sway-config` |
| 3 | AT-SPI2 ui-tree.py helper | `os/scripts/ui-tree.py` |
| 4 | bloom-display extension tests | `tests/extensions/bloom-display.test.ts` |
| 5 | bloom-display extension | `extensions/bloom-display.ts` |
| 6 | Containerfile — swap display stack | `os/Containerfile` |
| 7 | greetd.toml + bloom-bashrc | `os/sysconfig/greetd.toml`, `os/sysconfig/bloom-bashrc` |
| 8 | Documentation updates | `README.md`, `docs/quick_deploy.md`, `services/netbird/SKILL.md` |
| 9 | Build verification | Run tests, lint, build |
