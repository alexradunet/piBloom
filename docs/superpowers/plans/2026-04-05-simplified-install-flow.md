# Simplified Install Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current two-stage bootstrap flow with a pre-baked full-system installer ISO, a minimal Netbird-only setup wizard, and a prefill-driven VM install path that does not clone or rebuild after first boot.

**Architecture:** The installer package stops generating a large template module and instead writes a tiny `nixpi-install.nix` plus a minimal `configuration.nix` that imports the already-packaged host module. The installer ISO carries the full `desktop` closure, and the web wizard shrinks to an optional Netbird submission that only calls `nixpi-setup-apply` and marks the system ready; dev testing moves to the ISO path with `prefill.env`, and the legacy qcow2 VM workflow is deleted.

**Tech Stack:** NixOS/Nix flakes, bash, TypeScript/Node.js, Vitest, NixOS tests, QEMU

---

## File Map

**Create:**
- `docs/superpowers/plans/2026-04-05-simplified-install-flow.md` — this plan
- `prefill.env.example` — root-level documented prefill template for ISO installs

**Modify:**
- `core/os/pkgs/installer/nixpi-installer.sh` — add prefill support, replace template flow with heredoc-generated config, prefer `--system`
- `core/os/pkgs/installer/default.nix` — stop packaging `nixpi-install-module.nix.in`, inject host-module/store paths needed by the new installer
- `core/chat-server/setup.ts` — reduce payload to Netbird-only, add prefill auto-submit handling, update HTML copy and redirect behavior
- `core/scripts/nixpi-setup-apply.sh` — replace repo/bootstrap/rebuild flow with minimal Netbird + marker flow
- `core/os/pkgs/nixpi-setup-apply/default.nix` — remove unneeded runtime deps after the apply script shrink
- `core/os/hosts/installer-iso.nix` — disable fail2ban in the installer ISO
- `tools/run-installer-iso.sh` — read `prefill.env`, pass it into the install flow, keep SSH/web forwards
- `justfile` — remove qcow2 VM recipes, keep ISO install recipes, update comments for the new workflow
- `flake.nix` — remove `desktop-vm`, remove qcow2 packaging references, wire installer helper to the desktop closure, keep ISO/check outputs coherent
- `tests/chat-server/setup.test.ts` — rewrite for Netbird-only payload and optional prefill auto-apply behavior
- `tests/nixos/nixpi-installer-smoke.nix` — assert the simplified generated files and absence of bootstrap tooling assumptions
- `tests/nixos/default.nix` — keep installer smoke wired after flake cleanup if needed

**Delete:**
- `core/os/pkgs/installer/nixpi-install-module.nix.in`
- `core/os/hosts/x86_64-vm.nix`
- `tools/run-qemu.sh`
- `core/scripts/prefill.env.example`
- qcow2-oriented `justfile` recipes: `qcow2`, `vm`, `vm-daemon`, `vm-logs`, `vm-stop`, `vm-kill`

## Task 1: Rework the installer package around a pre-built closure

**Files:**
- Modify: `core/os/pkgs/installer/default.nix`
- Modify: `core/os/pkgs/installer/nixpi-installer.sh`
- Delete: `core/os/pkgs/installer/nixpi-install-module.nix.in`

- [ ] **Step 1: Write the failing installer backend assertion**

Add a regression check to `flake.nix`'s `installer-frontend` command so it fails until the template is removed and the new installer placeholders exist:

```nix
installer-frontend = pkgs.runCommandLocal "installer-frontend-check" { } ''
  bash -n "${installerFrontendSource}"
  ! test -e "${installerHelper}/share/nixpi-installer/nixpi-install-module.nix.in"
  grep -F 'PREFILL_FILE=""' "${installerHelper}/share/nixpi-installer/nixpi-installer.sh" >/dev/null
  grep -F 'DESKTOP_SYSTEM="@desktopSystem@"' "${installerFrontendSource}" >/dev/null
  touch "$out"
'';
```

- [ ] **Step 2: Run the check and confirm it fails before the package changes**

Run: `nix build .#checks.x86_64-linux.installer-frontend --no-link`

Expected: FAIL because `nixpi-install-module.nix.in` still exists in the package and the installer script does not contain the new prefill/system placeholders yet.

- [ ] **Step 3: Replace package substitution inputs in `core/os/pkgs/installer/default.nix`**

Update the derivation so it installs only the shell script and layout files, and substitutes the store paths the script now needs:

```nix
{ pkgs, makeWrapper, nixpiSource, piAgent, appPackage, setupApplyPackage, self }:

let
  layoutsDir = ../../installer/layouts;
  desktopSystem = self.nixosConfigurations.desktop.config.system.build.toplevel;
  desktopHostModule = "${nixpiSource}/core/os/hosts/x86_64.nix";
in
pkgs.stdenvNoCC.mkDerivation {
  pname = "nixpi-installer";
  version = "0.3.0";
  dontUnpack = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin" "$out/share/nixpi-installer/layouts"
    install -m 0755 ${./nixpi-installer.sh} "$out/share/nixpi-installer/nixpi-installer.sh"
    install -m 0644 ${layoutsDir}/standard.nix "$out/share/nixpi-installer/layouts/standard.nix"
    install -m 0644 ${layoutsDir}/swap.nix "$out/share/nixpi-installer/layouts/swap.nix"

    substituteInPlace "$out/share/nixpi-installer/nixpi-installer.sh" \
      --replace-fail "@layoutStandard@" "$out/share/nixpi-installer/layouts/standard.nix" \
      --replace-fail "@layoutSwap@" "$out/share/nixpi-installer/layouts/swap.nix" \
      --replace-fail "@desktopSystem@" "${desktopSystem}" \
      --replace-fail "@desktopHostModule@" "${desktopHostModule}"

    makeWrapper ${pkgs.bash}/bin/bash "$out/bin/nixpi-installer" \
      --prefix PATH : "${pkgs.lib.makeBinPath [ pkgs.openssl ]}" \
      --add-flags "$out/share/nixpi-installer/nixpi-installer.sh"
    runHook postInstall
  '';
}
```

- [ ] **Step 4: Rewrite `core/os/pkgs/installer/nixpi-installer.sh` around prefill + heredocs**

Replace the template-dependent parts with explicit store-path constants, prefill loading, and direct file generation:

```bash
DESKTOP_SYSTEM="@desktopSystem@"
DESKTOP_HOST_MODULE="@desktopHostModule@"
PREFILL_FILE=""

load_prefill() {
  local prefill_path="$1"
  [[ -n "$prefill_path" ]] || return 0
  if [[ ! -f "$prefill_path" ]]; then
    echo "Prefill file not found: $prefill_path" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  . "$prefill_path"
  HOSTNAME_VALUE="${HOSTNAME_VALUE:-${PREFILL_HOSTNAME:-}}"
  PRIMARY_USER_VALUE="${PRIMARY_USER_VALUE:-${PREFILL_USERNAME:-}}"
  PRIMARY_PASSWORD_VALUE="${PRIMARY_PASSWORD_VALUE:-${PREFILL_PASSWORD:-${PREFILL_PRIMARY_PASSWORD:-}}}"
}

write_install_config() {
  local hashed_password="$1"
  cat >"${ROOT_MOUNT}/etc/nixos/nixpi-install.nix" <<EOF
{ ... }: {
  nixpi.primaryUser = "${PRIMARY_USER_VALUE}";
  networking.hostName = "${HOSTNAME_VALUE}";
  users.users.${PRIMARY_USER_VALUE}.hashedPassword = "${hashed_password}";
  nixpi.security.ssh.passwordAuthentication = true;
}
EOF
}

write_configuration_nix() {
  cat >"${ROOT_MOUNT}/etc/nixos/configuration.nix" <<EOF
{ ... }: {
  imports = [
    ./hardware-configuration.nix
    ./nixpi-install.nix
    ${DESKTOP_HOST_MODULE}
  ];
}
EOF
}

install_system() {
  nixos-install --no-channel-copy --system "${SYSTEM_CLOSURE:-$DESKTOP_SYSTEM}"
}
```

Also update argument parsing and usage so the script supports:

```bash
Usage: nixpi-installer [--prefill /path/to/prefill.env] [--disk /dev/sdX] [--hostname NAME] [--primary-user USER] [--password VALUE] [--layout no-swap|swap] [--swap-size 8GiB] [--yes] [--system PATH]
```

- [ ] **Step 5: Delete the installer template**

Run:

```bash
git rm core/os/pkgs/installer/nixpi-install-module.nix.in
```

- [ ] **Step 6: Re-run the focused installer package check**

Run: `nix build .#checks.x86_64-linux.installer-frontend --no-link`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add core/os/pkgs/installer/default.nix core/os/pkgs/installer/nixpi-installer.sh flake.nix
git commit -m "feat: simplify installer packaging around prebuilt system closure"
```

## Task 2: Simplify first-boot apply to Netbird-only completion

**Files:**
- Modify: `core/scripts/nixpi-setup-apply.sh`
- Modify: `core/os/pkgs/nixpi-setup-apply/default.nix`

- [ ] **Step 1: Add a failing shell-level packaging expectation**

Extend the same `installer-frontend` or add a new tiny package check to assert the apply package no longer references `git` or `jq`:

```nix
setup-apply-package = pkgs.runCommandLocal "setup-apply-package-check" { } ''
  bash -n "${./core/scripts/nixpi-setup-apply.sh}"
  wrapped="${setupApplyPackage}/bin/nixpi-setup-apply"
  ! grep -F "${pkgs.git}/bin" "$wrapped"
  ! grep -F "${pkgs.jq}/bin" "$wrapped"
  touch "$out"
'';
```

- [ ] **Step 2: Run the new check to verify current behavior fails**

Run: `nix build .#checks.x86_64-linux.setup-apply-package --no-link`

Expected: FAIL because the wrapper still injects `git` and `jq`.

- [ ] **Step 3: Replace `core/scripts/nixpi-setup-apply.sh` with the minimal flow**

The file should become:

```bash
#!/usr/bin/env bash
set -euo pipefail

PRIMARY_USER="${NIXPI_PRIMARY_USER:-${SUDO_USER:-pi}}"
PRIMARY_HOME="/home/${PRIMARY_USER}"
NIXPI_STATE_DIR="${PRIMARY_HOME}/.nixpi"
SYSTEM_READY_FILE="${NIXPI_STATE_DIR}/wizard-state/system-ready"

log() { printf '[setup] %s\n' "$*"; }

if [[ -n "${SETUP_NETBIRD_KEY:-}" ]]; then
  log "Configuring Netbird..."
  netbird up --setup-key "${SETUP_NETBIRD_KEY}" --foreground=false
fi

mkdir -p "$(dirname "${SYSTEM_READY_FILE}")"
touch "${SYSTEM_READY_FILE}"
chown "${PRIMARY_USER}:${PRIMARY_USER}" "${SYSTEM_READY_FILE}"
log "System ready"
```

- [ ] **Step 4: Drop unused wrapper dependencies**

Update `core/os/pkgs/nixpi-setup-apply/default.nix` to:

```nix
{ stdenvNoCC, makeWrapper, netbird }:

stdenvNoCC.mkDerivation {
  pname = "nixpi-setup-apply";
  version = "0.2.0";
  dontUnpack = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin"
    install -m 0755 ${../../../scripts/nixpi-setup-apply.sh} "$out/bin/nixpi-setup-apply"
    wrapProgram "$out/bin/nixpi-setup-apply" \
      --prefix PATH : ${netbird}/bin
    runHook postInstall
  '';
}
```

- [ ] **Step 5: Re-run the package check**

Run: `nix build .#checks.x86_64-linux.setup-apply-package --no-link`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/scripts/nixpi-setup-apply.sh core/os/pkgs/nixpi-setup-apply/default.nix flake.nix
git commit -m "feat: shrink setup apply flow to netbird and ready marker"
```

## Task 3: Reduce the chat setup wizard to the new contract

**Files:**
- Modify: `core/chat-server/setup.ts`
- Modify: `tests/chat-server/setup.test.ts`

- [ ] **Step 1: Write failing Vitest coverage for the reduced payload**

Add tests that assert:

```ts
it("returns 400 for /api/setup/apply with invalid JSON", async () => { /* ... */ });
it("accepts an empty netbirdKey payload", async () => { /* ... */ });
it("serves setup copy that mentions Netbird and terminal login", async () => { /* ... */ });
it("auto-applies and redirects when a prefill marker file exists", async () => { /* ... */ });
```

For the auto-apply case, stub the apply script with a temp shell file that exits `0`, then assert the SSE stream emits `SETUP_COMPLETE`.

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run: `npx vitest run tests/chat-server/setup.test.ts`

Expected: FAIL because `ApplyPayload` still requires identity fields and there is no prefill auto-apply path.

- [ ] **Step 3: Rewrite `ApplyPayload`, POST validation, and prefill handling**

Change the server contract to:

```ts
export interface ApplyPayload {
	netbirdKey?: string;
}

export function hasWizardPrefill(prefillFile: string): boolean {
	try {
		fs.accessSync(prefillFile);
		return true;
	} catch {
		return false;
	}
}
```

In `handleSetupApply`, validate only `netbirdKey` when present:

```ts
const netbirdKey =
	typeof payload.netbirdKey === "string" ? payload.netbirdKey.trim() : "";
if ("netbirdKey" in payload && typeof payload.netbirdKey !== "string") {
	res.writeHead(400).end(JSON.stringify({ error: "netbirdKey must be a string" }));
	return;
}
```

Spawn `sudo -n` with only:

```ts
env: {
	...process.env,
	SETUP_NETBIRD_KEY: netbirdKey,
},
```

Expose a small helper for GET `/setup` so the route can auto-submit when the prefill file exists:

```ts
export function shouldAutoApply(prefillFile: string, systemReadyFile: string): boolean {
	return hasWizardPrefill(prefillFile) && !isSystemReady(systemReadyFile);
}
```

- [ ] **Step 4: Replace the HTML with the simplified one-step wizard**

The page should show only:

```html
<h1>NixPI Setup</h1>
<p class="subtitle">NixPI is installed and running. Add a Netbird setup key now so you can reach this machine remotely.</p>
<label>Netbird setup key <span class="optional">(optional, strongly recommended)</span></label>
<input id="netbird-key" type="text" placeholder="setup-key">
<button id="btn-apply">Complete setup</button>
<p class="hint">After redirect, run <code>pi /login</code> and <code>pi /model</code> in the terminal.</p>
```

If `shouldAutoApply(...)` is true, inject a script that posts `{"netbirdKey": ""}` immediately and redirects to `/` on `SETUP_COMPLETE` without rendering the manual form first.

- [ ] **Step 5: Re-run the targeted wizard tests**

Run: `npx vitest run tests/chat-server/setup.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/chat-server/setup.ts tests/chat-server/setup.test.ts
git commit -m "feat: simplify setup wizard to netbird-only flow"
```

## Task 4: Move dev install testing to root-level prefill + ISO flow

**Files:**
- Create: `prefill.env.example`
- Delete: `core/scripts/prefill.env.example`
- Modify: `tools/run-installer-iso.sh`
- Modify: `justfile`

- [ ] **Step 1: Add the new committed root-level example**

Create `prefill.env.example` with:

```dotenv
PREFILL_HOSTNAME=nixpi-test
PREFILL_USERNAME=alex
PREFILL_PASSWORD=testpass
PREFILL_NETBIRD_KEY=
```

- [ ] **Step 2: Delete the old wizard-oriented prefill example**

Run:

```bash
git rm core/scripts/prefill.env.example
```

- [ ] **Step 3: Teach `tools/run-installer-iso.sh` to discover and pass prefill**

Add:

```bash
prefill_path="${NIXPI_INSTALL_PREFILL_PATH:-$PWD/prefill.env}"

if [[ -f "$prefill_path" ]]; then
    echo "Using prefill file: $prefill_path"
    installer_kernel_append="console=ttyS0 prefill=$(readlink -f "$prefill_path")"
else
    installer_kernel_append="console=ttyS0"
fi
```

Then pass the file into the guest in the least-invasive existing path the repo supports. If you keep this script host-side only, document that the operator runs `nixpi-installer --prefill /path/to/prefill.env` once the ISO boots. If you wire automatic delivery, use a temporary FAT seed disk or QEMU `-fw_cfg`; do not reintroduce the deleted qcow2 VM path.

- [ ] **Step 4: Rewrite the `justfile` recipes around the ISO-only dev path**

Update the relevant section to:

```just
iso:
    nix build {{ flake }}#installerIso

vm-install-iso: iso
    NIXPI_INSTALL_VM_OVMF_CODE={{ ovmf }} NIXPI_INSTALL_VM_OVMF_VARS_TEMPLATE={{ ovmf_vars }} bash tools/run-installer-iso.sh

vm-ssh:
    #!/usr/bin/env bash
    key_file="$(mktemp)"
    trap 'rm -f "$key_file"' EXIT
    install -m 600 tools/dev-key "$key_file"
    ssh -i "$key_file" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 pi@localhost
```

Delete the `qcow2`, `vm`, `vm-daemon`, `vm-logs`, `vm-stop`, and `vm-kill` recipes entirely.

- [ ] **Step 5: Verify the updated dev entrypoints**

Run:

```bash
just --list | rg '^(iso|vm-install-iso|vm-ssh|check-installer|check-installer-smoke)'
```

Expected: output includes `iso`, `vm-install-iso`, `vm-ssh`, `check-installer`, and `check-installer-smoke`, and does not include `qcow2` or `vm-stop`.

- [ ] **Step 6: Commit**

```bash
git add prefill.env.example tools/run-installer-iso.sh justfile
git commit -m "feat: move dev install flow to iso prefill workflow"
```

## Task 5: Remove the legacy qcow2 host and wire the installer ISO to the desktop closure

**Files:**
- Modify: `flake.nix`
- Modify: `core/os/hosts/installer-iso.nix`
- Delete: `core/os/hosts/x86_64-vm.nix`
- Delete: `tools/run-qemu.sh`

- [ ] **Step 1: Add failing flake assertions for the new topology**

Extend an existing lightweight check so it fails until the VM host and runner are gone:

```nix
flake-topology = pkgs.runCommandLocal "flake-topology-check" { } ''
  ! grep -F 'desktop-vm' ${./flake.nix}
  ! test -e ${./core/os/hosts/x86_64-vm.nix}
  ! test -e ${./tools/run-qemu.sh}
  grep -F 'self.nixosConfigurations.desktop.config.system.build.toplevel' ${./core/os/hosts/installer-iso.nix} >/dev/null
  touch "$out"
'';
```

- [ ] **Step 2: Run the topology check and verify it fails**

Run: `nix build .#checks.x86_64-linux.flake-topology --no-link`

Expected: FAIL because `desktop-vm`, `x86_64-vm.nix`, and `tools/run-qemu.sh` still exist.

- [ ] **Step 3: Remove `desktop-vm` and related recipe references from `flake.nix`**

Delete the whole block:

```nix
nixosConfigurations.desktop-vm = nixpkgs.lib.nixosSystem {
  inherit system specialArgs;
  modules = [
    ./core/os/hosts/x86_64-vm.nix
    {
      nixpkgs.hostPlatform = system;
      nixpkgs.config.allowUnfree = true;
    }
  ];
};
```

Keep `desktop` as the canonical full system and ensure `installerHelper` receives `self`:

```nix
installerHelper = pkgs.callPackage ./core/os/pkgs/installer {
  inherit nixpiSource piAgent appPackage setupApplyPackage self;
};
```

- [ ] **Step 4: Update the installer ISO host and delete the old VM files**

In `core/os/hosts/installer-iso.nix`, keep:

```nix
system.extraDependencies = [
  self.nixosConfigurations.desktop.config.system.build.toplevel
];

services.fail2ban.enable = lib.mkForce false;
```

Then remove the dead files:

```bash
git rm core/os/hosts/x86_64-vm.nix tools/run-qemu.sh
```

- [ ] **Step 5: Re-run the topology check**

Run: `nix build .#checks.x86_64-linux.flake-topology --no-link`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add flake.nix core/os/hosts/installer-iso.nix justfile
git commit -m "feat: remove legacy qcow2 vm path from install flow"
```

## Task 6: Update smoke coverage for the simplified installer contract

**Files:**
- Modify: `tests/nixos/nixpi-installer-smoke.nix`
- Modify: `tests/nixos/default.nix`
- Modify: `flake.nix`

- [ ] **Step 1: Write the failing smoke assertions for the new installed system**

Update `tests/nixos/nixpi-installer-smoke.nix` to assert the post-install image no longer contains bootstrap-upgrade assumptions:

```python
installer.fail("nixos-enter --root " + target_mount + " -c 'command -v nixpi-bootstrap-prepare-repo'")
installer.fail("nixos-enter --root " + target_mount + " -c 'command -v nixpi-bootstrap-nixos-rebuild-switch'")
installer.succeed("nixos-enter --root " + target_mount + " -c 'systemctl is-enabled nixpi-chat.service'")
installer.succeed("grep -q '" + "${self.nixosConfigurations.desktop.config.system.build.toplevel}" + "' /tmp/nixpi-installer.log")
```

Also add assertions for the simplified generated files:

```python
installer.succeed("grep -q 'imports = \\[' " + target_mount + "/etc/nixos/configuration.nix")
installer.succeed("grep -q './nixpi-install.nix' " + target_mount + "/etc/nixos/configuration.nix")
installer.fail("grep -q 'nixpi.install.mode' " + target_mount + "/etc/nixos/nixpi-install.nix")
```

- [ ] **Step 2: Run the focused installer smoke test and confirm failure**

Run: `nix build .#checks.x86_64-linux.nixpi-installer-smoke --no-link -L`

Expected: FAIL until the installer stops installing the old bootstrap-oriented system layout.

- [ ] **Step 3: Align the test registration and any renamed checks**

Keep `tests/nixos/default.nix` exporting `nixpi-installer-smoke`, and if you added `setup-apply-package` or `flake-topology` checks in `flake.nix`, register them under `checks.${system}` next to `installer-frontend`.

- [ ] **Step 4: Re-run the full focused verification set**

Run:

```bash
npx vitest run tests/chat-server/setup.test.ts
nix build .#checks.x86_64-linux.installer-frontend --no-link
nix build .#checks.x86_64-linux.setup-apply-package --no-link
nix build .#checks.x86_64-linux.flake-topology --no-link
nix build .#checks.x86_64-linux.nixpi-installer-smoke --no-link -L
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/nixos/nixpi-installer-smoke.nix tests/nixos/default.nix flake.nix
git commit -m "test: cover simplified install flow and iso topology"
```

## Self-Review

**Spec coverage:**
- Full-system ISO closure: Task 1 and Task 5
- Minimal installer-generated `nixpi-install.nix` and `configuration.nix`: Task 1
- Netbird-only wizard and no `nixos-rebuild`/git clone: Task 2 and Task 3
- Prefill-driven dev flow and root-level example file: Task 4
- Deletion of qcow2 VM path and fail2ban disable on installer ISO: Task 5
- Verification through installer smoke and wizard tests: Task 6

**Placeholder scan:**
- No `TODO`, `TBD`, or "implement later" placeholders remain.
- Each task names exact files, exact commands, and the concrete assertions that should pass or fail.

**Type consistency:**
- `PREFILL_PASSWORD` and `PREFILL_PRIMARY_PASSWORD` are treated as compatible during migration, but the steady-state example uses `PREFILL_PASSWORD`.
- Wizard payload uses `netbirdKey` consistently in tests, API validation, and HTML.
- The pre-built system path is consistently named `DESKTOP_SYSTEM` in installer packaging and smoke expectations.
