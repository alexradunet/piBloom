# NixOS VPS Provisioner Extraction Design

## Summary

Extract the plain `nixos-anywhere`-based VPS provisioning surface out of `core/` into a top-level sibling boundary named `nixos_vps_provisioner`, and define a provisioner-local `AGENTS.md` contract for low-interaction rescue-mode automation starting from first SSH access.

End state:

- VPS provisioning code no longer lives under `core/`
- the provisioner has a top-level folder boundary designed for later repo extraction
- the OVH preset/profile is renamed to a provisioner-owned name such as `ovh-vps-base`
- NixPI becomes a downstream consumer of the provisioner surface
- a provisioner-local `AGENTS.md` defines how agents automate rescue-mode provisioning once the operator has already switched OVH into rescue mode

This is a staged in-repo extraction, not an immediate separate repository split.

## Problem

The current plain-host install surface is conceptually separate from NixPI, but it still lives in `core/` and still looks like an internal subsystem rather than an extractable sibling product.

That creates three issues:

1. ownership is still blurry because provisioning code sits beside NixPI runtime code
2. future extraction into a separate repo would require another conceptual reorganization, not just path and flake-root changes
3. operator automation for rescue-mode installs has no dedicated provisioner-local guidance surface

The current boundary is better than the old `nixpi-deploy-ovh` naming, but it is not yet clean enough for long-term independent maintenance.

## Goals

- Move the plain VPS provisioner into a top-level sibling folder named `nixos_vps_provisioner`.
- Rename provisioner presets/profiles so they look provisioner-owned rather than repo-global.
- Keep the provisioner self-contained enough that later extraction to a separate repo is mostly mechanical.
- Make NixPI explicitly consume the provisioner surface instead of owning it.
- Add a provisioner-local `AGENTS.md` that supports low-interaction rescue-mode provisioning starting from first SSH access.
- Keep OVH as the first supported provider workflow.

## Non-Goals

- Splitting into a separate repository immediately.
- Automating the OVH control panel itself.
- Designing a generic multi-provider abstraction deeper than today’s needs.
- Adding a final polished install skill before the folder boundary is stable.
- Mixing NixPI runtime logic back into the provisioner folder.

## Product Boundary

Adopt a strict sibling model:

- `core/` remains for NixPI/runtime/shared system concerns
- `nixos_vps_provisioner/` owns day-0 plain VPS provisioning concerns

NixPI consumes the provisioner output:

1. provision a standard host through `nixos_vps_provisioner`
2. optionally bootstrap NixPI after the host is installed and reachable

Provisioning should no longer be framed as a `core/` concern.

## Target Folder Structure

The provisioner should become a top-level folder with extractable ownership:

- `nixos_vps_provisioner/AGENTS.md`
- `nixos_vps_provisioner/scripts/`
- `nixos_vps_provisioner/pkgs/`
- `nixos_vps_provisioner/presets/`
- `nixos_vps_provisioner/tests/`
- `nixos_vps_provisioner/docs/` or repo docs sourced from this boundary

This shape is chosen to minimize future extraction churn.

The later separate-repo move should mostly require:

- moving the folder to a new repo root
- adjusting flake-root paths
- changing consumer references from local paths to a separate flake input

## Preset and Profile Naming

Rename the OVH install preset/profile now so it stops looking like a repo-global host configuration.

Recommended new name:

- `ovh-vps-base`

Reasoning:

- specific to the current provider and machine class
- neutral relative to NixPI
- clearly a provisioner preset rather than a system-wide canonical host profile

The rename should cover:

- flake `nixosConfigurations` output
- script defaults
- tests
- docs
- any guard assertions that currently mention `ovh-base`

## Provisioner Automation Contract

Inside `nixos_vps_provisioner/`, add a dedicated `AGENTS.md` that governs low-interaction operator workflows.

### Assumed starting point

The human operator has already:

- switched OVH into rescue mode
- obtained the rescue IP and credentials

Automation begins at first SSH access, not at the web-panel step.

### Required inputs

- target IP
- rescue username, typically `root`
- password or SSH key path
- provider, initially `ovh`
- optional hostname
- optional explicit target disk path or persistent disk ID
- optional flag to continue into NixPI bootstrap after first boot

### Expected workflow

1. verify SSH reachability to the rescue host
2. inspect disks using `lsblk`, `/dev/disk/by-id`, and `fdisk -l`
3. require explicit confirmation of the destructive target disk if one is not already supplied
4. execute the provisioner install command for the chosen preset
5. fall back to staged `nixos-anywhere` phases when kexec or disk-remap issues appear
6. stop at any remaining OVH panel operation that still requires a human
7. optionally continue into NixPI bootstrap once the base host is up and reachable

### Safety rules

- never auto-select a destructive target disk when multiple plausible disks exist
- prefer persistent disk IDs over transient Linux device names
- treat rescue credentials as temporary and host keys as expected to change after install
- stop and ask for the human to perform OVH panel actions rather than pretending they can be automated

## OVH-Specific Workflow Expectations

The provisioner-local automation contract must encode the practical OVH rescue-mode realities already learned:

- rescue mode is a prerequisite and must be confirmed, not assumed from nowhere
- disk naming can change after kexec, so the workflow must support staged inspection
- provider-side boot switching may still require the operator to change OVH back from rescue to disk boot
- KVM remains the emergency recovery path

This logic belongs in the provisioner boundary, not in NixPI docs or `core/`.

## Flake and Repo Integration

The root repo can continue exporting the provisioner through the root flake during the staged extraction period.

But ownership should be visibly provisioner-scoped:

- package definitions should come from `nixos_vps_provisioner/pkgs/...`
- script paths should come from `nixos_vps_provisioner/scripts/...`
- preset/module paths should come from `nixos_vps_provisioner/presets/...`
- tests should live under `nixos_vps_provisioner/tests/...` or clearly provisioner-owned integration paths

NixPI-facing docs should reference the provisioner as an external sibling surface even while it still lives in the same repo.

## Migration Plan

### Phase 1: Extract the provisioner folder boundary

- create `nixos_vps_provisioner/`
- move current plain-host scripts, package wrappers, preset/profile definitions, and tests out of `core/`
- update root flake wiring to point to the new paths

### Phase 2: Rename the OVH preset/profile

- rename `ovh-base` to `ovh-vps-base`
- update scripts, tests, docs, and guard assertions

### Phase 3: Add provisioner-local agent guidance

- create `nixos_vps_provisioner/AGENTS.md`
- define the rescue-mode automation contract
- keep the contract starting at first SSH access after the operator has manually enabled rescue mode

### Phase 4: Tighten the NixPI boundary

- remove any remaining suggestion that provisioning belongs to `core/`
- keep NixPI docs explicitly downstream of the provisioner
- add or update guards so provisioning code does not drift back into `core/`

## Verification Criteria

1. Plain VPS provisioning code no longer lives under `core/`.
2. The root flake exports provisioner outputs from `nixos_vps_provisioner/` paths.
3. The OVH preset/profile is renamed from `ovh-base` to the provisioner-owned name.
4. NixPI docs consistently describe provisioning as a sibling surface, not a `core/` concern.
5. `nixos_vps_provisioner/AGENTS.md` exists and defines rescue-mode automation from first SSH onward.
6. The automation contract explicitly stops for destructive ambiguity and OVH panel actions.

## Risks

- A partial path move without ownership-language cleanup would still leave the old coupling in place.
- Renaming presets and paths together will create a broader diff, so tests and docs must move in the same pass.
- If the `AGENTS.md` automation contract is too aggressive, it could encourage unsafe destructive behavior. The disk-confirmation gate must remain strict.

## Recommendation

Proceed with the staged in-repo extraction to `nixos_vps_provisioner`.

This is the cleanest way to:

- separate provisioning from NixPI runtime concerns now
- keep current momentum inside the monorepo
- prepare for a later separate-repo extraction with minimal churn

The provisioner-local `AGENTS.md` should be part of the same boundary change so automation guidance grows in the right place from the start.
