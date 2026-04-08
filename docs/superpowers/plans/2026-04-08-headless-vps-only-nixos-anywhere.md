# Headless VPS Only + Canonical NixOS Anywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every competing install surface so NixPI supports only headless VPS deployment via `nixos-anywhere` while preserving `/srv/nixpi` + `/etc/nixos#nixos` day-2 operations.

**Architecture:** Move the remaining install-time responsibilities out of the old bootstrap package and into the retained headless VPS path itself: the installed system should seed `/srv/nixpi`, initialize `/etc/nixos/flake.nix`, and then continue using the existing rebuild wrappers. Delete bootstrap and QEMU lab surfaces from the flake, tests, scripts, and docs so the repository tells one consistent story.

**Tech Stack:** Nix flakes, NixOS modules, `nixos-anywhere`, `disko`, Bash, Vitest, VitePress, NixOS VM tests, systemd.

---

## File structure and responsibility map

### Create

- `core/os/modules/install-finalize.nix` — first-boot module that ensures `/srv/nixpi` exists and `/etc/nixos/flake.nix` is initialized for the installed headless VPS.
- `core/scripts/nixpi-install-finalize.sh` — shell helper used by the first-boot finalization unit to clone/update the canonical checkout and call `nixpi-init-system-flake.sh`.

### Modify

- `flake.nix` — remove bootstrap/QEMU outputs, keep only VPS + `nixos-anywhere` install surfaces, and replace bootstrap-oriented checks with headless-VPS-only checks.
- `core/os/modules/module-sets.nix` — include the new install-finalize module in the retained module sets.
- `core/os/modules/options.nix` — add install-finalization options for repo URL/branch seeding if needed.
- `core/os/hosts/vps.nix` — remove monitor-attached/mini-PC framing comments and keep headless VPS defaults only.
- `core/os/hosts/ovh-vps.nix` — keep provider-specific rescue-mode install behavior and rely on the new install-finalize path for `/srv/nixpi` and `/etc/nixos` seeding.
- `core/scripts/nixpi-deploy-ovh.sh` — keep `nixos-anywhere` as the sole install entrypoint and document/pass any install-finalization overrides needed by the new module.
- `core/scripts/nixpi-init-system-flake.sh` — keep generating `/etc/nixos/flake.nix`, but update messaging/comments to describe install-finalization rather than bootstrap.
- `tests/integration/standards-guard.test.ts` — replace bootstrap/QEMU assertions with headless-VPS-only assertions.
- `tests/nixos/default.nix` — unregister bootstrap tests and keep only retained VPS/day-2 test lanes.
- `tests/nixos/README.md` — document only the retained test lanes.
- `tests/nixos/nixpi-firstboot.nix` — assert the installed system finalizes `/srv/nixpi` and `/etc/nixos/flake.nix` without `nixpi-bootstrap-vps`.
- `tests/nixos/nixpi-system-flake.nix` — assert the generated system flake still targets `/etc/nixos#nixos` under the new install-finalize flow.
- `README.md` — rewrite quick start to the canonical `nixos-anywhere` VPS install path.
- `docs/install.md` — remove bootstrap and already-NixOS install lanes.
- `docs/operations/quick-deploy.md` — rewrite as headless VPS install + `/srv/nixpi` operate guide.
- `docs/operations/live-testing.md` — replace bootstrap/QEMU lab checklist with `nixos-anywhere` + headless VPS validation.
- `docs/operations/first-boot-setup.md` — remove bootstrap wording and assume the machine was installed via `nixos-anywhere`.
- `docs/operations/index.md` — keep only retained operations links/wording.
- `docs/.vitepress/config.ts` — remove or rename navigation entries that still imply multiple install paths.

### Delete

- `core/os/pkgs/bootstrap/default.nix`
- `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh`
- `tools/qemu/README.md`
- `tools/qemu/clean-lab.sh`
- `tools/qemu/common.sh`
- `tools/qemu/prepare-preinstalled-stable.sh`
- `tools/qemu/run-installer.sh`
- `tools/qemu/run-preinstalled-stable.sh`
- `qemu-lab/README.md`
- `tests/integration/qemu-lab-paths.test.ts`
- `tests/nixos/nixpi-bootstrap-fresh-install.nix`
- `tests/nixos/nixpi-bootstrap-fresh-install-stable.nix`
- `tests/nixos/nixpi-bootstrap-fresh-install-external.nix`
- `tests/nixos/nixpi-vps-bootstrap.nix`

---

### Task 1: Lock the headless-VPS-only boundary with failing tests

**Files:**
- Modify: `tests/integration/standards-guard.test.ts`
- Test: `tests/integration/standards-guard.test.ts`

- [ ] **Step 1: Add a failing standards guard for the new repository boundary**

Replace the bootstrap/QEMU-oriented expectations with a new block like this near the existing OVH deploy assertions:

```ts
	it("keeps headless VPS deployment as the only supported install story", () => {
		const flake = readFileSync(path.join(repoRoot, "flake.nix"), "utf8");
		const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
		const installDoc = readFileSync(path.join(repoRoot, "docs/install.md"), "utf8");
		const quickDeployDoc = readFileSync(path.join(repoRoot, "docs/operations/quick-deploy.md"), "utf8");
		const liveTestingDoc = readFileSync(path.join(repoRoot, "docs/operations/live-testing.md"), "utf8");

		expect(flake).not.toContain("nixpi-bootstrap-vps");
		expect(flake).not.toContain("nixpi-bootstrap-fresh-install-harness");
		expect(flake).not.toContain("qemu-installer");
		expect(flake).not.toContain("qemu-preinstalled-stable");
		expect(flake).not.toContain("qemu-prepare-preinstalled-stable");
		expect(flake).not.toContain("qemu-clean");

		expect(readme).toContain("nix run .#nixpi-deploy-ovh --");
		expect(readme).not.toContain("nixpi-bootstrap-vps");

		expect(installDoc).toContain("headless VPS");
		expect(installDoc).toContain("nixos-anywhere");
		expect(installDoc).not.toContain("Already NixOS-capable machine");
		expect(installDoc).not.toContain("mini PC");
		expect(installDoc).not.toContain("headless VM");

		expect(quickDeployDoc).toContain("nixos-anywhere");
		expect(quickDeployDoc).not.toContain("nixpi-bootstrap-vps");
		expect(quickDeployDoc).not.toContain("mini PC");
		expect(quickDeployDoc).not.toContain("headless VM");

		expect(liveTestingDoc).not.toContain("qemu-lab");
		expect(liveTestingDoc).not.toContain("nixpi-bootstrap-vps");
	});
```

- [ ] **Step 2: Remove the old integration test that protects the QEMU lab path**

Delete this file outright once the new standards guard exists:

```bash
rm tests/integration/qemu-lab-paths.test.ts
```

- [ ] **Step 3: Run the focused integration test and confirm it fails for the right reasons**

Run:

```bash
npx vitest run tests/integration/standards-guard.test.ts
```

Expected: FAIL because `flake.nix`, `README.md`, `docs/install.md`, `docs/operations/quick-deploy.md`, and `docs/operations/live-testing.md` still contain bootstrap/QEMU references.

- [ ] **Step 4: Commit the failing guard**

```bash
git add tests/integration/standards-guard.test.ts tests/integration/qemu-lab-paths.test.ts
git commit -m "Lock the repo boundary to headless VPS installs"
```

---

### Task 2: Replace bootstrap install side effects with first-boot install finalization

**Files:**
- Create: `core/os/modules/install-finalize.nix`
- Create: `core/scripts/nixpi-install-finalize.sh`
- Modify: `core/os/modules/module-sets.nix`
- Modify: `core/os/modules/options.nix`
- Modify: `core/scripts/nixpi-init-system-flake.sh`
- Modify: `core/scripts/nixpi-deploy-ovh.sh`
- Modify: `tests/nixos/nixpi-firstboot.nix`
- Modify: `tests/nixos/nixpi-system-flake.nix`
- Test: `tests/nixos/nixpi-firstboot.nix`
- Test: `tests/nixos/nixpi-system-flake.nix`

- [ ] **Step 1: Add a failing VM assertion that the installed system seeds `/srv/nixpi` and `/etc/nixos/flake.nix` without bootstrap**

In `tests/nixos/nixpi-firstboot.nix`, add assertions like:

```nix
    machine.wait_for_unit("multi-user.target")
    machine.succeed("test -d /srv/nixpi/.git")
    machine.succeed("test -f /etc/nixos/flake.nix")
    machine.succeed("grep -F 'description = \"NixPI system flake\"' /etc/nixos/flake.nix")
    machine.succeed("grep -F 'path:/srv/nixpi' /etc/nixos/flake.nix")
    machine.fail("command -v nixpi-bootstrap-vps")
```

In `tests/nixos/nixpi-system-flake.nix`, keep the `/etc/nixos#nixos` contract but update the setup to call the new retained helper instead of the bootstrap package.

- [ ] **Step 2: Run the targeted VM tests and confirm they fail before implementation**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-firstboot --no-link -L
nix build .#checks.x86_64-linux.nixpi-system-flake --no-link -L
```

Expected: FAIL because the current OVH/headless install path does not create `/srv/nixpi` or initialize `/etc/nixos/flake.nix` on its own.

- [ ] **Step 3: Create the retained first-boot finalization helper**

Create `core/scripts/nixpi-install-finalize.sh` with this shape:

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:?repo url required}"
REPO_BRANCH="${2:?repo branch required}"
PRIMARY_USER="${3:?primary user required}"
HOSTNAME_VALUE="${4:?hostname required}"
TIMEZONE_VALUE="${5:?timezone required}"
KEYBOARD_VALUE="${6:?keyboard required}"
REPO_DIR="/srv/nixpi"

primary_group="$(id -gn "$PRIMARY_USER")"
install -d -m 0755 /srv

if [ ! -d "$REPO_DIR/.git" ]; then
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR"
else
  git -C "$REPO_DIR" fetch origin "$REPO_BRANCH"
  git -C "$REPO_DIR" checkout "$REPO_BRANCH"
  git -C "$REPO_DIR" reset --hard "origin/$REPO_BRANCH"
fi

chown -R "$PRIMARY_USER:$primary_group" "$REPO_DIR"

bash "$REPO_DIR/core/scripts/nixpi-init-system-flake.sh" \
  "$REPO_DIR" \
  "$HOSTNAME_VALUE" \
  "$PRIMARY_USER" \
  "$TIMEZONE_VALUE" \
  "$KEYBOARD_VALUE"
```

- [ ] **Step 4: Add a dedicated install-finalize module and wire it into the retained module sets**

Create `core/os/modules/install-finalize.nix` with a oneshot service like:

```nix
{ config, lib, pkgs, ... }:

let
  cfg = config.nixpi.install;
  finalizeScript = pkgs.writeShellScript "nixpi-install-finalize" ''
    exec ${../../scripts/nixpi-install-finalize.sh} \
      ${lib.escapeShellArg cfg.repoUrl} \
      ${lib.escapeShellArg cfg.repoBranch} \
      ${lib.escapeShellArg config.nixpi.primaryUser} \
      ${lib.escapeShellArg config.networking.hostName} \
      ${lib.escapeShellArg config.nixpi.timezone} \
      ${lib.escapeShellArg config.nixpi.keyboard}
  '';
in {
  config = {
    systemd.services.nixpi-install-finalize = {
      description = "Seed /srv/nixpi and initialize /etc/nixos/flake.nix";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];
      unitConfig.ConditionPathExists = "!/srv/nixpi/.git";
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
      };
      path = with pkgs; [ bash git coreutils nix ];
      script = ''
        ${finalizeScript}
      '';
    };
  };
}
```

Add matching options in `core/os/modules/options.nix`:

```nix
    install = {
      repoUrl = lib.mkOption {
        type = lib.types.str;
        default = "https://github.com/alexradunet/nixpi.git";
      };

      repoBranch = lib.mkOption {
        type = lib.types.str;
        default = "main";
      };
    };
```

Then add `./install-finalize.nix` to the retained module sets in `core/os/modules/module-sets.nix`.

- [ ] **Step 5: Update `nixpi-init-system-flake.sh` and the deploy wrapper to match the new lifecycle**

Adjust the helper error text from “bootstrap expects ...” to “install finalization expects ...”, and update the OVH deploy wrapper examples so they describe the first boot as the place where `/srv/nixpi` and `/etc/nixos` are seeded.

The user-visible lines should move toward this wording:

```bash
log "First boot will seed /srv/nixpi and initialize /etc/nixos/flake.nix"
```

- [ ] **Step 6: Re-run the retained VM tests and the deploy wrapper checks**

Run:

```bash
bash -n core/scripts/nixpi-install-finalize.sh
bash -n core/scripts/nixpi-init-system-flake.sh
bash -n core/scripts/nixpi-deploy-ovh.sh
nix build .#checks.x86_64-linux.nixpi-firstboot --no-link -L
nix build .#checks.x86_64-linux.nixpi-system-flake --no-link -L
nix run .#nixpi-deploy-ovh -- --help
```

Expected: PASS. The retained install path now establishes `/srv/nixpi` and `/etc/nixos#nixos` without `nixpi-bootstrap-vps`.

- [ ] **Step 7: Commit the install-finalization move**

```bash
git add core/os/modules/install-finalize.nix core/scripts/nixpi-install-finalize.sh core/os/modules/module-sets.nix core/os/modules/options.nix core/scripts/nixpi-init-system-flake.sh core/scripts/nixpi-deploy-ovh.sh tests/nixos/nixpi-firstboot.nix tests/nixos/nixpi-system-flake.nix
git commit -m "Move install finalization into the retained VPS path"
```

---

### Task 3: Delete bootstrap packages, tests, and flake outputs

**Files:**
- Delete: `core/os/pkgs/bootstrap/default.nix`
- Delete: `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh`
- Delete: `tests/nixos/nixpi-bootstrap-fresh-install.nix`
- Delete: `tests/nixos/nixpi-bootstrap-fresh-install-stable.nix`
- Delete: `tests/nixos/nixpi-bootstrap-fresh-install-external.nix`
- Delete: `tests/nixos/nixpi-vps-bootstrap.nix`
- Modify: `flake.nix`
- Modify: `tests/nixos/default.nix`
- Modify: `tests/nixos/README.md`
- Test: `flake.nix`
- Test: `tests/nixos/default.nix`

- [ ] **Step 1: Remove bootstrap package exposure from `flake.nix`**

Delete the bootstrap package line from `mkPackages`:

```nix
          nixpi-bootstrap-vps = pkgs.callPackage ./core/os/pkgs/bootstrap { };
```

Delete bootstrap-only checks/apps such as these blocks:

```nix
          nixpi-bootstrap-fresh-install-harness =
            self.checks.${system}.nixpi-bootstrap-fresh-install-external.driver;
```

```nix
          bootstrap-script = pkgs.runCommandLocal "bootstrap-script-check" { } ''
            ...
          '';
```

```nix
          system-flake-bootstrap = pkgs.runCommandLocal "system-flake-bootstrap-check" { } ''
            ...
          '';
```

```nix
            {
              name = "nixpi-bootstrap-fresh-install";
              path = nixosTests.nixpi-bootstrap-fresh-install;
            }
```

```nix
        nixpi-bootstrap-fresh-install-harness = {
          type = "app";
          program = "${self.packages.${system}.nixpi-bootstrap-fresh-install-harness}/bin/nixos-test-driver";
        };
```

- [ ] **Step 2: Unregister and delete bootstrap-only NixOS tests**

Update `tests/nixos/default.nix` to remove the bootstrap package argument and bootstrap tests. The resulting `sharedArgs` and `tests` blocks should look like:

```nix
  sharedArgs = {
    inherit (testLib)
      nixPiModules
      nixPiModulesNoShell
      mkTestFilesystems
      mkManagedUserConfig
      ;
  };
```

```nix
  tests = {
    nixpi-firstboot = runTest ./nixpi-firstboot.nix;
    nixpi-system-flake = runTest ./nixpi-system-flake.nix;
    nixpi-runtime = runTest ./nixpi-runtime.nix;
    nixpi-network = runTest ./nixpi-network.nix;
    nixpi-e2e = runTest ./nixpi-e2e.nix;
    nixpi-security = runTest ./nixpi-security.nix;
    nixpi-wireguard = runTest ./nixpi-wireguard.nix;
    nixpi-modular-services = runTest ./nixpi-modular-services.nix;
    nixpi-post-setup-lockdown = runTest ./nixpi-post-setup-lockdown.nix;
    nixpi-broker = runTest ./nixpi-broker.nix;
    nixpi-update = runTest ./nixpi-update.nix;
    nixpi-options-validation = runTest ./nixpi-options-validation.nix;
  };
```

Then delete the four bootstrap-only test files listed above.

- [ ] **Step 3: Rewrite the NixOS test README to describe only retained lanes**

Update the lane list so it no longer mentions bootstrap or external harnesses. The main bullets should become:

```md
- `config`: fast non-VM closure build for the retained headless VPS system
- `nixos-smoke`: PR-oriented headless VPS VM subset
- `nixos-full`: comprehensive retained VM lane
- `nixos-destructive`: slower retained cases intended for manual or scheduled runs
```

Remove the “Run the external fresh-install bootstrap harness” section entirely.

- [ ] **Step 4: Run the retained flake and NixOS test entry checks**

Run:

```bash
nix eval .#packages.x86_64-linux --apply 'builtins.attrNames'
nix eval .#apps.x86_64-linux --apply 'builtins.attrNames'
nix build .#checks.x86_64-linux.vps-topology --no-link -L
nix build .#checks.x86_64-linux.nixos-smoke --no-link -L
```

Expected: PASS, with no `nixpi-bootstrap-vps`, no bootstrap harness app, and no bootstrap-only test lane names left in the exposed outputs.

- [ ] **Step 5: Commit the bootstrap surface removal**

```bash
git add flake.nix tests/nixos/default.nix tests/nixos/README.md core/os/pkgs/bootstrap/default.nix core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh tests/nixos/nixpi-bootstrap-fresh-install.nix tests/nixos/nixpi-bootstrap-fresh-install-stable.nix tests/nixos/nixpi-bootstrap-fresh-install-external.nix tests/nixos/nixpi-vps-bootstrap.nix
git commit -m "Remove bootstrap as a first-class install surface"
```

---

### Task 4: Delete QEMU lab surfaces and remove lab references from docs/navigation

**Files:**
- Delete: `tools/qemu/README.md`
- Delete: `tools/qemu/clean-lab.sh`
- Delete: `tools/qemu/common.sh`
- Delete: `tools/qemu/prepare-preinstalled-stable.sh`
- Delete: `tools/qemu/run-installer.sh`
- Delete: `tools/qemu/run-preinstalled-stable.sh`
- Delete: `qemu-lab/README.md`
- Modify: `flake.nix`
- Modify: `docs/operations/live-testing.md`
- Modify: `docs/.vitepress/config.ts`
- Modify: `.gitignore`
- Test: `docs/operations/live-testing.md`
- Test: `docs/.vitepress/config.ts`

- [ ] **Step 1: Remove QEMU apps from `flake.nix`**

Delete the app blocks:

```nix
        qemu-installer = {
          type = "app";
          program = "${pkgs.writeShellScript "qemu-installer" ''
            exec ${./tools/qemu}/run-installer.sh "$@"
          ''}";
        };
```

```nix
        qemu-preinstalled-stable = {
          type = "app";
          program = "${pkgs.writeShellScript "qemu-preinstalled-stable" ''
            exec ${./tools/qemu}/run-preinstalled-stable.sh "$@"
          ''}";
        };
```

```nix
        qemu-prepare-preinstalled-stable = {
          type = "app";
          program = "${pkgs.writeShellScript "qemu-prepare-preinstalled-stable" ''
            exec ${./tools/qemu}/prepare-preinstalled-stable.sh "$@"
          ''}";
        };
```

```nix
        qemu-clean = {
          type = "app";
          program = "${pkgs.writeShellScript "qemu-clean" ''
            exec ${./tools/qemu}/clean-lab.sh "$@"
          ''}";
        };
```

- [ ] **Step 2: Delete the QEMU lab files and clean `.gitignore`**

Run:

```bash
rm -rf tools/qemu qemu-lab
python - <<'PY'
from pathlib import Path
p = Path('.gitignore')
text = p.read_text()
for line in ['qemu-lab/*\n', '!qemu-lab/README.md\n']:
    text = text.replace(line, '')
p.write_text(text)
PY
```

- [ ] **Step 3: Rewrite live-testing to the retained headless VPS validation story**

Replace the bootstrap/QEMU sections in `docs/operations/live-testing.md` with a single install-validation section like:

```md
## Canonical Install Validation

1. Start from a fresh OVH VPS in rescue mode.
2. Run `nix run .#nixpi-deploy-ovh -- ...`.
3. Confirm first boot seeds `/srv/nixpi`, initializes `/etc/nixos/flake.nix`, and reaches the expected service state.
4. Reboot once and confirm the same `/srv/nixpi` + `nixpi-rebuild` workflow still works.
```

Delete every mention of `qemu-lab`, `qemu-installer`, `qemu-preinstalled-stable`, `qemu-prepare-preinstalled-stable`, and `qemu-clean`.

- [ ] **Step 4: Remove now-misleading operations navigation if needed**

If the operations sidebar text still implies multiple install/lab paths, rewrite it to retain only:

```ts
					items: [
						{ text: "Overview", link: "/operations/" },
						{ text: "OVH Rescue Deploy", link: "/operations/ovh-rescue-deploy" },
						{ text: "Quick Deploy", link: "/operations/quick-deploy" },
						{ text: "First Boot Setup", link: "/operations/first-boot-setup" },
						{ text: "Live Testing", link: "/operations/live-testing" },
					],
```

The key requirement is that none of those pages mention the deleted QEMU lab workflow anymore.

- [ ] **Step 5: Run the focused docs/navigation checks**

Run:

```bash
rg -n "qemu-lab|qemu-installer|qemu-preinstalled-stable|qemu-prepare-preinstalled-stable|qemu-clean" README.md docs flake.nix tests .gitignore
npm run docs:build
npx vitest run tests/integration/standards-guard.test.ts
```

Expected: the ripgrep command returns no matches outside historical plan/spec docs; docs build passes; standards guard passes.

- [ ] **Step 6: Commit the QEMU lab removal**

```bash
git add flake.nix docs/operations/live-testing.md docs/.vitepress/config.ts .gitignore tools/qemu qemu-lab
git commit -m "Delete local QEMU lab install surfaces"
```

---

### Task 5: Rewrite the public docs and README around one install story

**Files:**
- Modify: `README.md`
- Modify: `docs/install.md`
- Modify: `docs/operations/quick-deploy.md`
- Modify: `docs/operations/first-boot-setup.md`
- Modify: `docs/operations/index.md`
- Modify: `tests/integration/standards-guard.test.ts`
- Test: `README.md`
- Test: `docs/install.md`
- Test: `docs/operations/quick-deploy.md`
- Test: `docs/operations/first-boot-setup.md`

- [ ] **Step 1: Rewrite the README quick start to the canonical `nixos-anywhere` path**

Replace the current bootstrap quick-start block with a deployment block like:

```md
## Quick start

Install onto a fresh OVH VPS from rescue mode:

```bash
nix run .#nixpi-deploy-ovh -- \
  --target-host root@SERVER_IP \
  --disk /dev/sdX
```

After first boot, operate from the canonical checkout:

```bash
cd /srv/nixpi
sudo nixpi-rebuild
sudo nixpi-rebuild-pull
```
```

Remove `nixpi-bootstrap-vps` entirely.

- [ ] **Step 2: Rewrite `docs/install.md` to a single install lane**

The top of the page should converge on content like:

```md
---
title: Install NixPI
description: Install NixPI on a fresh headless OVH VPS with nixos-anywhere.
---

# Install NixPI

## Supported target

- headless x86_64 VPS
- provider rescue-mode access
- SSH access to the rescue environment

## Canonical install path

Use the dedicated [OVH Rescue Deploy](./operations/ovh-rescue-deploy) runbook.

NixPI no longer supports bootstrap installation onto an already-NixOS machine, mini PC, desktop, or local VM lab as first-class install paths.
```

- [ ] **Step 3: Rewrite `docs/operations/quick-deploy.md` as a single retained deploy/operate guide**

Change the opening summary and audience to:

```md
> Install NixPI onto a headless VPS with nixos-anywhere and operate it from the shell-first runtime
```

```md
Operators and maintainers deploying NixPI onto a headless x86_64 VPS.
```

Remove the “Two Supported Deployment Paths” split entirely. Replace it with a short four-step flow:

```md
1. Put the VPS into rescue mode.
2. Run the `nixpi-deploy-ovh` wrapper.
3. Let first boot seed `/srv/nixpi` and `/etc/nixos/flake.nix`.
4. Keep operating from `/srv/nixpi`.
```

- [ ] **Step 4: Rewrite first-boot setup to assume `nixos-anywhere` install, not bootstrap**

Adjust the prerequisites section in `docs/operations/first-boot-setup.md` to this shape:

```md
1. a completed `nixpi-deploy-ovh` install
2. the canonical checkout present at `/srv/nixpi`
3. a completed `nixos-rebuild switch --flake /etc/nixos#nixos`
```

Delete any text that says “successful `nixpi-bootstrap-vps` run” or depends on a local desktop/tty recovery story.

- [ ] **Step 5: Keep operations index focused on day-2 only**

Update the related-links section in `docs/operations/index.md` so it points to the retained pages without implying old install paths:

```md
- [OVH Rescue Deploy](./ovh-rescue-deploy)
- [Quick Deploy](./quick-deploy)
- [First Boot Setup](./first-boot-setup)
- [Live Testing](./live-testing)
```

- [ ] **Step 6: Run the final document/build verification set**

Run:

```bash
rg -n "nixpi-bootstrap-vps|mini PC|mini-PC|headless VM|desktop deployment|Already NixOS-capable machine|qemu-lab|Raspberry Pi|rasperry" README.md docs flake.nix tests
npx vitest run tests/integration/standards-guard.test.ts
npm run docs:build
nix eval .#nixosConfigurations.ovh-vps.config.networking.hostName
nix build .#nixosConfigurations.ovh-vps.config.system.build.diskoScript --no-link
nix build .#packages.x86_64-linux.nixpi-deploy-ovh --no-link
```

Expected: ripgrep returns no matches outside historical plan/spec documents; docs build passes; standards guard passes; OVH config and deploy wrapper still evaluate/build.

- [ ] **Step 7: Commit the final doc convergence**

```bash
git add README.md docs/install.md docs/operations/quick-deploy.md docs/operations/first-boot-setup.md docs/operations/index.md tests/integration/standards-guard.test.ts
git commit -m "Make nixos-anywhere the only public install story"
```

---

## Final verification checklist

Before declaring the implementation complete, run this full set:

```bash
npx vitest run tests/integration/standards-guard.test.ts
npm run docs:build
bash -n core/scripts/nixpi-install-finalize.sh
bash -n core/scripts/nixpi-init-system-flake.sh
bash -n core/scripts/nixpi-deploy-ovh.sh
nix eval .#packages.x86_64-linux --apply 'builtins.attrNames'
nix eval .#apps.x86_64-linux --apply 'builtins.attrNames'
nix build .#checks.x86_64-linux.vps-topology --no-link -L
nix build .#checks.x86_64-linux.nixpi-firstboot --no-link -L
nix build .#checks.x86_64-linux.nixpi-system-flake --no-link -L
nix build .#checks.x86_64-linux.nixos-smoke --no-link -L
nix build .#nixosConfigurations.ovh-vps.config.system.build.diskoScript --no-link
nix build .#packages.x86_64-linux.nixpi-deploy-ovh --no-link
nix run .#nixpi-deploy-ovh -- --help
```

Expected outcomes:

- no bootstrap or QEMU lab install apps remain in flake outputs
- retained tests/builds pass
- docs build passes
- deploy wrapper help still works
- `/srv/nixpi` + `/etc/nixos#nixos` remains the retained day-2 model

## Spec coverage self-check

- **Single install story:** covered by Tasks 1, 3, 4, and 5
- **Preserve `/srv/nixpi` day-2 operations:** covered by Task 2 and final verification
- **Delete bootstrap/QEMU/mini-PC install surfaces:** covered by Tasks 3, 4, and 5
- **Keep `nixos-anywhere` + VPS host path working:** covered by Task 2 and final verification
