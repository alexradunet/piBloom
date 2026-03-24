# Canonical Repo Worktree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/home/$USER/nixpi` the only supported local NixPI repo worktree, cloned from a configured remote during install/first boot and used for rebuilds, updates, and operator workflows.

**Architecture:** Centralize canonical repo path and repo-validation logic in `core/lib/filesystem.ts`, then move installer/bootstrap, update flows, and proposal tooling to consume that API. Remove legacy repo-path defaults and align docs/tests so all supported flows point at `/home/$USER/nixpi` with a stored canonical remote URL and branch.

**Tech Stack:** TypeScript, Vitest, NixOS modules, Bash shell scripts, Nix flakes, Markdown docs

---

## File Structure

### Core runtime and path policy

- Modify: `core/lib/filesystem.ts`
- Create: `tests/lib/filesystem.test.ts`

Responsibility:
- define the canonical repo path as `/home/$USER/nixpi`
- expose strict repo validation helpers for path, `origin`, and branch
- remove the legacy default of `~/.nixpi/pi-nixpi`

### Bootstrap and install flow

- Modify: `core/os/modules/firstboot.nix`
- Modify: `core/scripts/setup-wizard.sh`
- Modify: `core/os/modules/update.nix`
- Modify: `core/scripts/system-update.sh`
- Modify: `core/os/pkgs/installer/nixpi-installer.sh`
- Modify: `core/os/pkgs/installer/test_nixpi_installer.py`

Responsibility:
- clone or validate `/home/$USER/nixpi`
- store canonical remote URL and branch
- rebuild from the canonical repo instead of `/etc/nixos`
- reject mismatched existing checkouts

### Pi extension and operator tooling

- Modify: `core/pi/extensions/os/actions.ts`
- Modify: `core/pi/extensions/os/actions-proposal.ts`
- Modify: `tests/extensions/os-proposal.test.ts`

Responsibility:
- point operational rebuilds at the canonical repo
- stop defaulting proposal flows to hidden state-dir clones
- make proposal tooling explicitly work from the canonical checkout or fail clearly

### Documentation and operator instructions

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/install.md`
- Modify: `docs/operations/index.md`
- Modify: `docs/operations/quick-deploy.md`
- Modify: `docs/operations/first-boot-setup.md`
- Modify: `docs/fleet-pr-workflow.md`
- Modify: `docs/reference/fleet-workflow.md`
- Modify: `docs/architecture/runtime-flows.md`
- Modify: `core/pi/skills/recovery/SKILL.md`
- Modify: `core/pi/skills/self-evolution/SKILL.md`

Responsibility:
- describe one repo path, one rebuild path, one contribution workflow
- remove user-facing legacy guidance around `~/.nixpi/pi-nixpi` and `/etc/nixos` as the working flake

### NixOS integration coverage

- Modify: `tests/nixos/nixpi-update.nix`
- Modify: `tests/nixos/nixpi-installer-smoke.nix`

Responsibility:
- prove update/install flows target `/home/$USER/nixpi`
- cover mismatched or missing canonical checkout behavior

---

### Task 1: Centralize canonical repo path and validation

**Files:**
- Modify: `core/lib/filesystem.ts`
- Create: `tests/lib/filesystem.test.ts`

- [ ] **Step 1: Write the failing filesystem tests**

Add Vitest coverage for:

```ts
describe("getNixPiRepoDir", () => {
	it("defaults to /home/<user>/nixpi for the primary user", async () => {
		process.env.NIXPI_PRIMARY_USER = "alex";
		const { getNixPiRepoDir } = await import("../../core/lib/filesystem.js");
		expect(getNixPiRepoDir()).toBe("/home/alex/nixpi");
	});
});

describe("validateCanonicalRepo", () => {
	it("rejects a repo outside /home/<user>/nixpi", async () => {
		expect(() =>
			validateCanonicalRepo({
				expectedPath: "/home/alex/nixpi",
				actualPath: "/tmp/pi-nixpi",
				expectedOrigin: "https://github.com/alexradunet/nixpi.git",
				actualOrigin: "https://github.com/alexradunet/nixpi.git",
				expectedBranch: "main",
				actualBranch: "main",
			}),
		).toThrow(/canonical repo/i);
	});
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `npm test -- tests/lib/filesystem.test.ts`
Expected: FAIL because the new helper/test file does not exist yet and `getNixPiRepoDir()` still falls back to `~/.nixpi/pi-nixpi`

- [ ] **Step 3: Implement the canonical path helpers**

Update `core/lib/filesystem.ts` to:

```ts
export function getPrimaryUser(): string {
	return process.env.NIXPI_PRIMARY_USER ?? os.userInfo().username;
}

export function getCanonicalRepoDir(primaryUser = getPrimaryUser()): string {
	return path.join("/home", primaryUser, "nixpi");
}

export function getNixPiRepoDir(): string {
	return process.env.NIXPI_REPO_DIR ?? getCanonicalRepoDir();
}

export function assertCanonicalRepo(args: {
	expectedPath: string;
	actualPath: string;
	expectedOrigin: string;
	actualOrigin: string;
	expectedBranch: string;
	actualBranch: string;
}): void {
	// throw explicit errors for wrong path, origin, or branch
}
```

Implementation notes:
- keep `getSystemFlakeDir()` aligned with the canonical repo unless there is a narrower reason to preserve `NIXPI_SYSTEM_FLAKE_DIR`
- use explicit error messages that mention expected path, origin, and branch
- do not silently normalize legacy paths

- [ ] **Step 4: Run the filesystem tests and make sure they pass**

Run: `npm test -- tests/lib/filesystem.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/lib/filesystem.ts tests/lib/filesystem.test.ts
git commit -m "refactor: centralize canonical repo path policy"
```

### Task 2: Make bootstrap/install own `/home/$USER/nixpi`

**Files:**
- Modify: `core/os/modules/firstboot.nix`
- Modify: `core/scripts/setup-wizard.sh`
- Modify: `core/os/pkgs/installer/nixpi-installer.sh`
- Modify: `core/os/pkgs/installer/test_nixpi_installer.py`

- [ ] **Step 1: Write or extend failing bootstrap tests**

Add coverage for:

```python
def test_installer_records_canonical_checkout_metadata(self):
    self.assertEqual(artifacts["canonical_repo_dir"], "/mnt/target/home/installer/nixpi")
    self.assertEqual(artifacts["canonical_repo_branch"], "main")
```

Add shell-level assertions in the wizard or related test fixture for:

```bash
test -d "/home/$USER/nixpi/.git"
test ! -e "/var/lib/nixpi/pi-nixpi"
```

- [ ] **Step 2: Run the narrow installer/bootstrap tests and confirm they fail**

Run: `pytest core/os/pkgs/installer/test_nixpi_installer.py -q`
Expected: FAIL because canonical repo metadata is not emitted yet

- [ ] **Step 3: Update first-boot/bootstrap scripts to clone or validate the canonical repo**

Key edits:

1. In `core/os/modules/firstboot.nix`, replace `/etc/nixos`-centric bootstrap commands with a canonical repo bootstrap that:

```bash
usage: nixpi-bootstrap-prepare-repo <repo_dir> <remote_url> <branch> <primary_user>
```

2. In `core/scripts/setup-wizard.sh`, make `clone_nixpi_checkout` enforce:

```bash
if [[ -d "$NIXPI_DIR/.git" ]]; then
  git -C "$NIXPI_DIR" remote get-url origin
  git -C "$NIXPI_DIR" branch --show-current
  # reject mismatch instead of overwriting
fi
```

3. Persist the chosen remote and branch in a host-readable config file under the canonical repo or system state so later validation can compare exact values.

4. Update user-facing messages from:

```text
activated through /etc/nixos
```

to:

```text
rebuilt directly from ~/nixpi
```

- [ ] **Step 4: Run the installer/bootstrap tests again**

Run: `pytest core/os/pkgs/installer/test_nixpi_installer.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/os/modules/firstboot.nix core/scripts/setup-wizard.sh core/os/pkgs/installer/nixpi-installer.sh core/os/pkgs/installer/test_nixpi_installer.py
git commit -m "feat: bootstrap canonical home repo checkout"
```

### Task 3: Rebuild and update from the canonical checkout

**Files:**
- Modify: `core/os/modules/update.nix`
- Modify: `core/scripts/system-update.sh`
- Modify: `core/pi/extensions/os/actions.ts`
- Modify: `tests/nixos/nixpi-update.nix`

- [ ] **Step 1: Add failing tests for rebuild/update path selection**

Add or update assertions so the tests expect `/home/<user>/nixpi` instead of `/etc/nixos`:

```nix
machine.succeed("test -f /home/alex/nixpi/flake.nix")
machine.fail("test -f /etc/nixos/flake.nix")
```

Add unit-level expectations for `handleNixosUpdate("apply")` if a dedicated test file exists or is added:

```ts
expect(result.details.flake).toBe("/home/alex/nixpi")
```

- [ ] **Step 2: Run the focused update tests and verify failure**

Run: `npm test -- tests/extensions/os-proposal.test.ts`
Expected: existing assumptions around hidden repo dirs or legacy flake paths cause failures

Run: `nix build .#checks.x86_64-linux.nixos-smoke --no-link`
Expected: FAIL or expose legacy `/etc/nixos` assumptions before implementation

- [ ] **Step 3: Implement canonical flake path usage**

Update:

```nix
# core/os/modules/update.nix
flakeDir = "/home/${primaryUser}/nixpi";
```

Update:

```bash
# core/scripts/system-update.sh
LOCAL_FLAKE_DIR="${NIXPI_SYSTEM_FLAKE_DIR:-${NIXPI_PRIMARY_HOME}/nixpi}"
```

Ensure `core/pi/extensions/os/actions.ts` uses the centralized canonical path helper and returns a hard failure when `flake.nix` is missing there.

- [ ] **Step 4: Re-run the targeted tests**

Run: `npm test -- tests/extensions/os-proposal.test.ts`
Expected: PASS for the updated unit expectations

Run: `nix build .#checks.x86_64-linux.config --no-link`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/os/modules/update.nix core/scripts/system-update.sh core/pi/extensions/os/actions.ts tests/nixos/nixpi-update.nix
git commit -m "refactor: rebuild from canonical repo checkout"
```

### Task 4: Rewrite proposal tooling around the canonical repo

**Files:**
- Modify: `core/pi/extensions/os/actions-proposal.ts`
- Modify: `tests/extensions/os-proposal.test.ts`

- [ ] **Step 1: Write failing tests for canonical proposal behavior**

Replace legacy temp-dir expectations with canonical-repo expectations:

```ts
it("reports status for the canonical repo checkout", async () => {
	process.env.NIXPI_PRIMARY_USER = "alex";
	process.env.NIXPI_REPO_DIR = "/home/alex/nixpi";
	// ...
	expect(result.content[0].text).toContain("Canonical repo: /home/alex/nixpi");
});

it("errors when a legacy proposal clone path is used", async () => {
	process.env.NIXPI_REPO_DIR = "/tmp/pi-nixpi";
	expect(result.isError).toBe(true);
});
```

- [ ] **Step 2: Run the proposal tests and verify they fail**

Run: `npm test -- tests/extensions/os-proposal.test.ts`
Expected: FAIL because the handler still initializes a hidden local proposal clone

- [ ] **Step 3: Implement the minimal proposal-tool rewrite**

Change `ensureProposalRepo()` so it:

- validates the canonical repo path instead of cloning into a state dir
- uses configured `origin` and branch validation
- reports “Canonical repo” in output text
- removes the lazy `git clone` fallback for hidden proposal repos

Minimal target shape:

```ts
const repoDir = getNixPiRepoDir();
assertCanonicalRepo({
	expectedPath: getCanonicalRepoDir(),
	actualPath: repoDir,
	expectedOrigin,
	actualOrigin,
	expectedBranch,
	actualBranch,
});
```

- [ ] **Step 4: Run the proposal tests and make sure they pass**

Run: `npm test -- tests/extensions/os-proposal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add core/pi/extensions/os/actions-proposal.ts tests/extensions/os-proposal.test.ts
git commit -m "refactor: align proposal tooling with canonical repo"
```

### Task 5: Update docs, agent instructions, and skills

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/install.md`
- Modify: `docs/operations/index.md`
- Modify: `docs/operations/quick-deploy.md`
- Modify: `docs/operations/first-boot-setup.md`
- Modify: `docs/fleet-pr-workflow.md`
- Modify: `docs/reference/fleet-workflow.md`
- Modify: `docs/architecture/runtime-flows.md`
- Modify: `core/pi/skills/recovery/SKILL.md`
- Modify: `core/pi/skills/self-evolution/SKILL.md`

- [ ] **Step 1: Add a doc audit checklist in the plan branch**

Search for legacy references:

```bash
rg -n "pi-nixpi|/etc/nixos#|/etc/nixos|~/.nixpi/pi-nixpi|/var/lib/nixpi/pi-nixpi" README.md docs core/pi/skills
```

Expected: multiple matches before edits

- [ ] **Step 2: Update the docs and instructions**

Apply the same invariant everywhere:

```md
- Canonical repo: `/home/$USER/nixpi`
- Rebuild from: `sudo nixos-rebuild switch --flake /home/$USER/nixpi#$(hostname -s)`
- Do not use `~/.nixpi/pi-nixpi` or `/var/lib/nixpi/pi-nixpi` as the source-of-truth repo
```

Be explicit that:
- install clones the chosen upstream or fork into the canonical home path
- `/etc/nixos` is not the supported editable repo
- live patching and push/PR workflows happen from the home checkout

- [ ] **Step 3: Run the doc audit again**

Run: `rg -n "pi-nixpi|~/.nixpi/pi-nixpi|/var/lib/nixpi/pi-nixpi" README.md docs core/pi/skills`
Expected: only intentional historical/spec references remain

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md docs/install.md docs/operations/index.md docs/operations/quick-deploy.md docs/operations/first-boot-setup.md docs/fleet-pr-workflow.md docs/reference/fleet-workflow.md docs/architecture/runtime-flows.md core/pi/skills/recovery/SKILL.md core/pi/skills/self-evolution/SKILL.md
git commit -m "docs: document canonical repo workflow"
```

### Task 6: Run end-to-end verification and fix any test gaps

**Files:**
- Modify: `tests/nixos/nixpi-update.nix`
- Modify: `tests/nixos/nixpi-installer-smoke.nix`
- Modify: any earlier files only if verification reveals real gaps

- [ ] **Step 1: Add any remaining failing integration assertions**

Ensure the NixOS tests cover:

```nix
machine.succeed("test -d /home/alex/nixpi/.git")
machine.succeed("grep -q '/home/alex/nixpi' /run/current-system/sw/bin/nixpi-bootstrap-* || true")
machine.fail("test -d /var/lib/nixpi/pi-nixpi")
```

- [ ] **Step 2: Run the fast verification suite**

Run:

```bash
npm test -- tests/lib/filesystem.test.ts tests/extensions/os-proposal.test.ts tests/extensions/nixpi.test.ts
pytest core/os/pkgs/installer/test_nixpi_installer.py -q
nix build .#checks.x86_64-linux.config --no-link
```

Expected:
- Vitest: PASS
- Pytest: PASS
- `nix build`: PASS

- [ ] **Step 3: Run one higher-signal NixOS check**

Run:

```bash
nix build .#checks.x86_64-linux.nixos-smoke --no-link
```

Expected: PASS

- [ ] **Step 4: Update any broken expectations revealed by verification**

Only make narrow fixes required by the failing verification output. Do not add compatibility shims for legacy paths unless the spec changes.

- [ ] **Step 5: Commit**

```bash
git add tests/nixos/nixpi-update.nix tests/nixos/nixpi-installer-smoke.nix
git commit -m "test: cover canonical repo checkout flow"
```

### Task 7: Final verification and branch finish

**Files:**
- Modify: none expected

- [ ] **Step 1: Run the final verification bundle**

```bash
npm test
pytest core/os/pkgs/installer/test_nixpi_installer.py -q
nix build .#checks.x86_64-linux.config --no-link
```

Expected: PASS

- [ ] **Step 2: Inspect the final diff**

Run:

```bash
git status --short
git log --oneline --decorate -5
```

Expected:
- only intended files are modified
- task commits are present in order

- [ ] **Step 3: Prepare for integration**

If the branch is clean and verification passed, hand off to `superpowers:finishing-a-development-branch` or open a PR from the canonical `/home/$USER/nixpi` checkout.
