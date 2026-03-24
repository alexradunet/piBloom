# Canonical Repo Worktree Design

**Date:** 2026-03-24
**Status:** Approved

---

## Overview

NixPI should treat `/home/$USER/nixpi` as the single canonical local repository for an
installation. That repository is cloned from a chosen Git remote during install or first boot
and then used for live edits, rebuilds, agent workflows, and upstream contribution.

This design is aimed at an owner-operated workflow where the installed machine is also the
development environment. The operator should be able to patch the checked-out repo directly,
test changes live on the machine, and then push to the source remote or open a pull request
from a fork.

Legacy working repositories such as `~/.nixpi/pi-nixpi` and `/var/lib/nixpi/pi-nixpi` should
stop being supported as source-of-truth worktrees.

---

## Approaches Considered

### Recommended: installer-owned canonical clone at `/home/$USER/nixpi`

The installer or first-boot flow clones a configured Git remote and branch into
`/home/$USER/nixpi`. NixPI treats that path as the only valid working repository path.

Why this is the right fit:

- matches the intended live-patch workflow directly
- gives every install the same mental model
- supports both upstream and fork-based contribution without changing the local path
- removes ambiguity between “proposal/apply” clones and the real working tree

### Alternative: canonical home repo with legacy compatibility bridge

Make `/home/$USER/nixpi` canonical but keep legacy paths as mirrors, aliases, or transitional
fallbacks.

Why not:

- preserves ambiguity during normal operation
- weakens the enforced-path rule
- increases maintenance cost by keeping two repo models alive

### Alternative: remote-managed workspace abstraction

Model the system around a canonical remote URL, branch, and synchronized checkout policy, with
more explicit repo state management.

Why not:

- introduces extra product complexity before the simpler path invariant is in place
- solves more than the current problem requires
- can be added later if stricter remote/branch management becomes necessary

---

## Architecture

Every installation owns one supported Git worktree at `/home/$USER/nixpi`. The local path is
fixed; the remote may vary so users can install from the upstream repository or from their own
fork/template-derived repository.

The system should store or derive three values:

- canonical local path: `/home/$USER/nixpi`
- canonical remote URL
- canonical branch, defaulting to `main`

The remote policy should be explicit and strict:

- each installation stores one expected remote URL and one expected branch
- `/home/$USER/nixpi` is valid only if its `origin` URL matches the configured remote URL exactly
- the checked-out branch must match the configured branch
- users may install from upstream or from a fork, but the selected remote becomes the one
  canonical remote for that machine until intentionally reconfigured

The installer or first-boot process creates that clone and all supported operational flows act
on it. Runtime code should resolve the canonical repo path through one shared API rather than
constructing paths ad hoc or falling back to state-dir clones.

This design intentionally separates “where the repo lives” from “which repo it tracks”:

- the path is fixed
- the remote is configurable per install

That preserves the contribution workflow without allowing multiple local source-of-truth repos.

---

## Components

### Installer and bootstrap

This component is responsible for creating `/home/$USER/nixpi` from the configured remote and
branch during installation or first boot. It must fail clearly if the clone cannot be created
or validated.

If `/home/$USER/nixpi` already exists:

- accept it only if it is a Git repository whose `origin` URL and checked-out branch exactly
  match the configured remote and branch
- otherwise stop and require explicit operator correction rather than mutating or replacing the
  directory implicitly

### Canonical repo path API

One library function or module should define the supported repo path based on the primary user.
All code that needs the working repo should consume that API instead of hardcoding legacy paths.

### Runtime validation

Validation should confirm that `/home/$USER/nixpi` exists, is a Git repository, and matches the
expected remote policy for the install. Unsupported legacy paths should not be silently used.

For this design, “matches the expected remote policy” means:

- `origin` equals the configured remote URL
- the checkout is on the configured branch
- the repository path is exactly `/home/$USER/nixpi`

### Update and rebuild flows

Rebuild helpers, broker actions, setup scripts, and operational commands should point at the
canonical home worktree only. Proposal/apply clone semantics should be removed or rewritten so
they no longer represent the default working repository model.

### Docs and agent policy

Contributor docs, install docs, operations docs, skills, and `AGENTS.md` should all describe the
same model:

- clone into `/home/$USER/nixpi`
- edit there
- rebuild there
- commit and push from there

---

## Data Flow

On installation:

1. choose or receive the canonical remote URL and branch
2. determine the primary user
3. clone the repository into `/home/$USER/nixpi`
4. validate `origin`, branch, and path against configured values
5. continue setup using that clone as the source of truth

During normal operation:

1. runtime code resolves the canonical repo path from the primary user
2. rebuild and update helpers operate on `/home/$USER/nixpi`
3. operator edits are made in that working tree
4. commits and pushes happen from the same checkout

For fork-based workflows:

1. the user installs from their chosen remote
2. the local clone still lives at `/home/$USER/nixpi`
3. contribution happens by pushing to that fork or opening PRs upstream

The key invariant is that the local path never changes even when the source remote does.

---

## Error Handling

Because this is an enforced-path design, failures should be explicit rather than permissive.

The system should stop with a clear error when:

1. `/home/$USER/nixpi` does not exist when required
2. `/home/$USER/nixpi` exists but is not a Git repository
3. the configured clone step fails during install or first boot
4. the existing checkout does not match the configured `origin` URL or branch for that
   installation
5. code attempts to use `~/.nixpi/pi-nixpi` or `/var/lib/nixpi/pi-nixpi` as a working repo

Errors should report the expected canonical path and, when relevant, the expected remote and
branch. The system should not silently fall back to a legacy path or create an alternate local
worktree.

This design does not require automatic migration. Existing installations that relied on legacy
paths can be handled through explicit migration guidance rather than hidden compatibility logic.

---

## Testing

Testing should prove that the path invariant is real across installation, runtime behavior, and
operator tooling.

### Path resolution tests

Verify that canonical repo path resolution always returns `/home/$USER/nixpi` for the primary
user and does not fall back to legacy state directories.

### Installer and bootstrap tests

Verify:

- successful clone into `/home/$USER/nixpi`
- failure when the target directory already exists but is not a Git repo
- acceptance when an existing checkout exactly matches configured `origin` and branch
- failure when clone validation finds the wrong remote
- failure when clone validation finds the wrong branch

### Runtime and operations tests

Verify:

- rebuild/update helpers target `/home/$USER/nixpi`
- broker or OS-operation code uses the canonical path only
- legacy paths are rejected with a clear error

### Documentation and workflow checks

Verify that operator-facing docs and generated instructions consistently reference the canonical
home checkout and not the legacy proposal/apply clones.

### Acceptance criteria

Implementation is successful when:

- a fresh install clones a repo into `/home/$USER/nixpi`
- the installed system uses that checkout as its only supported working repository
- live edits and rebuilds happen directly from that path
- users can point the install at upstream or a fork without changing the local path
- no supported workflow defaults to `~/.nixpi/pi-nixpi` or `/var/lib/nixpi/pi-nixpi`

---

## Scope Boundaries

This design defines the canonical local repository model. It does not specify the exact user
interface for selecting the remote during installation, nor does it redesign Git workflows
beyond enforcing the local path.

It also does not preserve backward-compatible multi-repo behavior. If older proposal/apply
clones remain on disk, they are out of scope except for providing explicit migration or cleanup
guidance.
