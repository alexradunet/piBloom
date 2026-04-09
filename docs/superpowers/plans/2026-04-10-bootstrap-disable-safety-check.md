# Bootstrap Disable Safety Check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block the agent from editing `.nix` host config files to set `bootstrap.enable = false` without first ensuring SSH and `allowedSourceCIDRs` are explicitly configured.

**Architecture:** A `tool_call` hook in the OS extension intercepts `edit` and `write` tool calls targeting NixOS host config files. Before the edit lands, it reconstructs post-edit content and runs two regex checks. If either fails, the edit is blocked with a targeted message listing only the missing config.

**Tech Stack:** TypeScript, `@mariozechner/pi-coding-agent` (`isToolCallEventType`), Vitest

---

## File Map

| File | Change |
|------|--------|
| `core/pi/extensions/os/actions.ts` | Add `checkBootstrapDisable(filePath, postEditContent)` |
| `core/pi/extensions/os/index.ts` | Add `tool_call` hook; import `isToolCallEventType` and `readFile` |
| `tests/extensions/os.test.ts` | Add unit tests for `checkBootstrapDisable` + hook integration tests |

---

### Task 1: Unit tests for `checkBootstrapDisable` (failing)

**Files:**
- Modify: `tests/extensions/os.test.ts`

- [ ] **Step 1: Add import and describe block**

At the top of `tests/extensions/os.test.ts`, add the import alongside the existing ones:

```typescript
import {
  checkBootstrapDisable,
  checkPendingUpdates,
  handleNixosUpdate,
  handleScheduleReboot,
  handleSystemdControl,
  handleUpdateStatus,
} from "../../core/pi/extensions/os/actions.js";
```

Then add this describe block at the bottom of the file (before the final closing brace if any):

```typescript
// ---------------------------------------------------------------------------
// checkBootstrapDisable
// ---------------------------------------------------------------------------

const SAFE_CONTENT = `{
  nixpi.bootstrap.enable = false;
  services.openssh.enable = true;
  nixpi.security.ssh.allowedSourceCIDRs = [ "1.2.3.4/32" ];
}`;

const SAFE_CONTENT_BOOTSTRAP_SSH = `{
  nixpi.bootstrap.enable = false;
  nixpi.bootstrap.ssh.enable = true;
  nixpi.security.ssh.allowedSourceCIDRs = [ "1.2.3.4/32" ];
}`;

const UNSAFE_NO_SSH = `{
  nixpi.bootstrap.enable = false;
  nixpi.security.ssh.allowedSourceCIDRs = [ "1.2.3.4/32" ];
}`;

const UNSAFE_NO_CIDRS = `{
  nixpi.bootstrap.enable = false;
  services.openssh.enable = true;
  nixpi.security.ssh.allowedSourceCIDRs = [  ];
}`;

const UNSAFE_BOTH_MISSING = `{
  nixpi.bootstrap.enable = false;
}`;

const CONTENT_BOOTSTRAP_STILL_ENABLED = `{
  nixpi.bootstrap.enable = true;
}`;

describe("checkBootstrapDisable", () => {
  it("returns undefined for files outside /etc/nixos or not named nixpi-host.nix", () => {
    expect(checkBootstrapDisable("/home/alex/other.nix", UNSAFE_BOTH_MISSING)).toBeUndefined();
  });

  it("returns undefined when bootstrap is not being disabled", () => {
    expect(checkBootstrapDisable("/etc/nixos/nixpi-host.nix", CONTENT_BOOTSTRAP_STILL_ENABLED)).toBeUndefined();
  });

  it("returns undefined when both SSH and CIDRs are present (services.openssh)", () => {
    expect(checkBootstrapDisable("/etc/nixos/nixpi-host.nix", SAFE_CONTENT)).toBeUndefined();
  });

  it("returns undefined when both SSH and CIDRs are present (bootstrap.ssh.enable)", () => {
    expect(checkBootstrapDisable("/etc/nixos/nixpi-host.nix", SAFE_CONTENT_BOOTSTRAP_SSH)).toBeUndefined();
  });

  it("returns undefined for nixpi-host.nix matched by filename anywhere in path", () => {
    expect(checkBootstrapDisable("/srv/checkout/nixpi-host.nix", SAFE_CONTENT)).toBeUndefined();
  });

  it("blocks when SSH is missing", () => {
    const result = checkBootstrapDisable("/etc/nixos/nixpi-host.nix", UNSAFE_NO_SSH);
    expect(result).toBeDefined();
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("services.openssh.enable = true");
    expect(result?.reason).not.toContain("allowedSourceCIDRs");
  });

  it("blocks when CIDRs are missing", () => {
    const result = checkBootstrapDisable("/etc/nixos/nixpi-host.nix", UNSAFE_NO_CIDRS);
    expect(result).toBeDefined();
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("allowedSourceCIDRs");
    expect(result?.reason).not.toContain("services.openssh.enable");
  });

  it("blocks and lists both items when both SSH and CIDRs are missing", () => {
    const result = checkBootstrapDisable("/etc/nixos/nixpi-host.nix", UNSAFE_BOTH_MISSING);
    expect(result).toBeDefined();
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("services.openssh.enable = true");
    expect(result?.reason).toContain("allowedSourceCIDRs");
  });

  it("matches /etc/nixos/ subdirectory files that are directly under /etc/nixos/", () => {
    const result = checkBootstrapDisable("/etc/nixos/custom.nix", UNSAFE_BOTH_MISSING);
    expect(result).toBeDefined();
    expect(result?.block).toBe(true);
  });

  it("does not match .nix files in subdirectories of /etc/nixos/", () => {
    expect(checkBootstrapDisable("/etc/nixos/sub/deep.nix", UNSAFE_BOTH_MISSING)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/alex/pi-bloom && npm run test:unit -- --reporter=verbose 2>&1 | grep -A 3 "checkBootstrapDisable"
```

Expected: FAIL — `checkBootstrapDisable is not a function` or similar.

---

### Task 2: Implement `checkBootstrapDisable` in `actions.ts`

**Files:**
- Modify: `core/pi/extensions/os/actions.ts`

- [ ] **Step 1: Add the function at the end of the file**

```typescript
// --- Bootstrap disable safety check ---

const BOOTSTRAP_DISABLE_RE = /nixpi\.bootstrap\.enable\s*=\s*false/;
const SSH_ENABLED_RE = /services\.openssh\.enable\s*=\s*true|nixpi\.bootstrap\.ssh\.enable\s*=\s*true/;
const CIDRS_RE = /allowedSourceCIDRs\s*=\s*\[\s*\S/;

function isNixHostFile(filePath: string): boolean {
  return filePath.endsWith("nixpi-host.nix") || /^\/etc\/nixos\/[^/]+\.nix$/.test(filePath);
}

export function checkBootstrapDisable(
  filePath: string,
  postEditContent: string,
): { block: true; reason: string } | undefined {
  if (!isNixHostFile(filePath)) return undefined;
  if (!BOOTSTRAP_DISABLE_RE.test(postEditContent)) return undefined;

  const sshEnabled = SSH_ENABLED_RE.test(postEditContent);
  const cidrsConfigured = CIDRS_RE.test(postEditContent);

  if (sshEnabled && cidrsConfigured) return undefined;

  const missing: string[] = [];
  if (!sshEnabled) missing.push("  services.openssh.enable = true;");
  if (!cidrsConfigured) missing.push('  nixpi.security.ssh.allowedSourceCIDRs = [ "YOUR_IP/32" ];');

  const reason = [
    "⚠ Disabling bootstrap will remove passwordless sudo and may close SSH.",
    "",
    "Before this edit can proceed, add the following to your config:",
    "",
    ...missing,
    "",
    "Add these lines to nixpi-host.nix, then retry.",
  ].join("\n");

  return { block: true, reason };
}
```

- [ ] **Step 2: Run unit tests to confirm they pass**

```bash
cd /home/alex/pi-bloom && npm run test:unit -- --reporter=verbose 2>&1 | grep -A 3 "checkBootstrapDisable"
```

Expected: all `checkBootstrapDisable` tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/alex/pi-bloom && git add core/pi/extensions/os/actions.ts tests/extensions/os.test.ts && git commit -m "feat(os): add checkBootstrapDisable safety check

Blocks bootstrap.enable = false edits when SSH or allowedSourceCIDRs
are not explicitly configured in the target nix host file.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Integration tests for the `tool_call` hook (failing)

**Files:**
- Modify: `tests/extensions/os.test.ts`

- [ ] **Step 1: Add hook integration tests**

Add a new describe block at the bottom of `tests/extensions/os.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// tool_call hook — bootstrap disable guard
// ---------------------------------------------------------------------------

describe("tool_call hook — write to nixpi-host.nix", () => {
  it("blocks write with bootstrap.enable = false and no SSH/CIDRs", async () => {
    const result = await api.fireEvent("tool_call", {
      type: "tool_call",
      toolCallId: "tc-1",
      toolName: "write",
      input: { path: "/etc/nixos/nixpi-host.nix", content: UNSAFE_BOTH_MISSING },
    });
    expect((result as { block: boolean }).block).toBe(true);
    expect((result as { reason: string }).reason).toContain("Disabling bootstrap");
  });

  it("allows write with bootstrap.enable = false when SSH and CIDRs are present", async () => {
    const result = await api.fireEvent("tool_call", {
      type: "tool_call",
      toolCallId: "tc-2",
      toolName: "write",
      input: { path: "/etc/nixos/nixpi-host.nix", content: SAFE_CONTENT },
    });
    expect(result).toBeUndefined();
  });

  it("allows write to unrelated .nix files", async () => {
    const result = await api.fireEvent("tool_call", {
      type: "tool_call",
      toolCallId: "tc-3",
      toolName: "write",
      input: { path: "/etc/nixos/subdir/deep.nix", content: UNSAFE_BOTH_MISSING },
    });
    expect(result).toBeUndefined();
  });
});

describe("tool_call hook — edit to nixpi-host.nix", () => {
  it("blocks edit that introduces bootstrap.enable = false without SSH/CIDRs", async () => {
    // Write a real temp file with bootstrap still enabled
    const hostFile = path.join(temp.nixPiDir, "nixpi-host.nix");
    fs.writeFileSync(hostFile, "{ nixpi.bootstrap.enable = true; }", "utf-8");

    const result = await api.fireEvent("tool_call", {
      type: "tool_call",
      toolCallId: "tc-4",
      toolName: "edit",
      input: {
        path: hostFile,
        oldText: "nixpi.bootstrap.enable = true;",
        newText: "nixpi.bootstrap.enable = false;",
      },
    });
    expect((result as { block: boolean }).block).toBe(true);
    expect((result as { reason: string }).reason).toContain("Disabling bootstrap");
  });

  it("allows edit that introduces bootstrap.enable = false with SSH and CIDRs present", async () => {
    const hostFile = path.join(temp.nixPiDir, "nixpi-host.nix");
    fs.writeFileSync(
      hostFile,
      `{
        nixpi.bootstrap.enable = true;
        services.openssh.enable = true;
        nixpi.security.ssh.allowedSourceCIDRs = [ "1.2.3.4/32" ];
      }`,
      "utf-8",
    );

    const result = await api.fireEvent("tool_call", {
      type: "tool_call",
      toolCallId: "tc-5",
      toolName: "edit",
      input: {
        path: hostFile,
        oldText: "nixpi.bootstrap.enable = true;",
        newText: "nixpi.bootstrap.enable = false;",
      },
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when edit target file does not exist", async () => {
    const result = await api.fireEvent("tool_call", {
      type: "tool_call",
      toolCallId: "tc-6",
      toolName: "edit",
      input: {
        path: "/etc/nixos/nixpi-host.nix",
        oldText: "nixpi.bootstrap.enable = true;",
        newText: "nixpi.bootstrap.enable = false;",
      },
    });
    // File doesn't exist — hook should not throw, just pass through
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/alex/pi-bloom && npm run test:unit -- --reporter=verbose 2>&1 | grep -A 3 "tool_call hook"
```

Expected: FAIL — `tool_call` hook not yet registered.

---

### Task 4: Add `tool_call` hook to `index.ts`

**Files:**
- Modify: `core/pi/extensions/os/index.ts`

- [ ] **Step 1: Add imports**

At the top of `core/pi/extensions/os/index.ts`, add to the existing imports:

```typescript
import { readFile } from "node:fs/promises";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { checkBootstrapDisable } from "./actions.js";
```

- [ ] **Step 2: Add the hook inside the `export default function` block**

After the `registerTools(pi, tools);` call and before the `let updateChecked = false;` line:

```typescript
pi.on("tool_call", async (event) => {
  if (isToolCallEventType("write", event)) {
    return checkBootstrapDisable(event.input.path, event.input.content);
  }
  if (isToolCallEventType("edit", event)) {
    let currentContent: string;
    try {
      currentContent = await readFile(event.input.path, "utf-8");
    } catch {
      return undefined;
    }
    const postEditContent = currentContent.replaceAll(event.input.oldText, event.input.newText);
    return checkBootstrapDisable(event.input.path, postEditContent);
  }
});
```

- [ ] **Step 3: Run all unit tests to confirm they pass**

```bash
cd /home/alex/pi-bloom && npm run test:unit -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS, no failures.

- [ ] **Step 4: Commit**

```bash
cd /home/alex/pi-bloom && git add core/pi/extensions/os/index.ts tests/extensions/os.test.ts && git commit -m "feat(os): add tool_call hook to guard bootstrap disable

Intercepts edit/write tool calls on NixOS host config files.
Blocks the edit and shows targeted guidance when bootstrap.enable = false
is set without SSH and allowedSourceCIDRs being explicitly configured.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- ✅ Hook fires on `edit` and `write` for `.nix` host config files — Task 4
- ✅ Detects `bootstrap.enable = false` in post-edit content — `checkBootstrapDisable`
- ✅ Checks SSH enabled — `SSH_ENABLED_RE`
- ✅ Checks `allowedSourceCIDRs` non-empty — `CIDRS_RE`
- ✅ Only lists failing checks in message — conditional `missing` array
- ✅ Lives in OS extension — `index.ts` / `actions.ts`

**Placeholder scan:** None found.

**Type consistency:**
- `checkBootstrapDisable` returns `{ block: true; reason: string } | undefined` — used consistently in both Tasks 2 and 4
- `isToolCallEventType("write", event)` → `event.input.path` (string), `event.input.content` (string) ✅
- `isToolCallEventType("edit", event)` → `event.input.path` (string), `event.input.oldText` (string), `event.input.newText` (string) ✅
