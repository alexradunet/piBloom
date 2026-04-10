# NixPI Git-First Template Design

Date: 2026-04-10
Status: Draft approved in conversation, written for review

## Summary

NixPI should become a Git-first infrastructure template for personal use. Each user owns one personal `nixpi` repository. That repository is the canonical editable source of truth. Humans and AI agents work against a local clone on a workstation, validate changes locally, commit them, and push directly to the user's GitHub repository. Remote hosts are deployment targets only and should not be treated as the primary authoring surface.

This simplifies the current mental model. Instead of asking users to reason about both a host-owned `/etc/nixos` tree and a separate proposal workflow, the default path becomes one repository, one collaboration surface, and one deployment path.

## Goals

- Make NixPI easy to adopt as a personal infrastructure template.
- Let users and AI agents edit infrastructure from a normal local clone.
- Allow AI agents to commit and push directly to the user's repository.
- Keep host changes reproducible by applying repository state rather than editing the host as the primary workflow.
- Preserve a straightforward upgrade path for the project owner to improve upstream NixPI and let users benefit from the improved template model.

## Non-Goals

- Supporting multiple default remotes or an upstream/fork workflow for every user.
- Making the live host the primary place where infrastructure is edited.
- Keeping `/etc/nixos` and a Git repository as equal authoring sources of truth.
- Designing a permission-heavy approval flow for routine agent pushes in the initial version.

## Current Problem

The current codebase and docs reflect a split model:

- The running host converges from `/etc/nixos`.
- The repo provides bootstrap and rebuild tooling.
- The OS extension also contains a proposal-repo workflow.

This works, but it is conceptually heavier than needed for a template product. A user who wants "my personal infra repo that AI can maintain and push" should not need to decide whether the host tree or a side repo is the real source of truth. That ambiguity makes sharing, agent automation, and bugfix propagation harder to explain.

## Proposed Model

### Source of Truth

The user's personal GitHub `nixpi` repository is the canonical editable state.

### Authoring Surface

The user's workstation clone is the default place where edits happen. AI agents operate there, not primarily on the target host.

### Deployment Target

The target host consumes validated repository state. The host may still materialize config into `/etc/nixos` or another applied runtime location, but that applied copy is not the collaboration source of truth.

### Default Workflow

1. User creates a personal `nixpi` repository from the template.
2. User clones it locally.
3. User or AI agent edits the local checkout.
4. NixPI validates the proposed change locally.
5. AI agent commits and pushes directly to the user's GitHub repository.
6. User runs one explicit deploy/apply command to update the host from the repository state.

This keeps the model explicit and easy to explain: Git is for authoring and sharing, the host is for applying.

## Why This Is The Recommended Approach

This is the simplest design because it removes unnecessary branching in the product story.

- Template use fits naturally with a personal repository.
- Direct agent push is easy to reason about when there is one obvious remote.
- Local validation before push is simpler than recovering from host-local edits after the fact.
- Hosts stay operationally narrow, which reduces drift and accidental configuration divergence.
- The project owner can still maintain upstream NixPI separately, but users are not forced into a two-remote workflow by default.

## Rejected Alternatives

### Host-First Editing

Editing directly on the host appears simple, but it makes drift more likely and turns production machines into authoring environments. It also weakens the template story because the user's real changes may exist only on a box instead of in their repository.

### Dual Source of Truth

Treating both `/etc/nixos` and Git as first-class authoring surfaces is flexible, but it is not simple. It creates ambiguity about which copy should be edited, validated, reviewed, and recovered.

### Default Multi-Remote Fork Workflow

Using `origin` plus `upstream` by default makes sense for maintainers, but it is unnecessary overhead for the normal personal-template user. It can remain an advanced path later.

## Product Surface Changes

NixPI should present itself as a personal infrastructure repository template with an agent-friendly workflow.

The primary user-facing commands should revolve around:

- repository status
- local validation
- commit creation
- direct push to the user's remote
- explicit apply/deploy to a selected host

The current proposal-repo concept should be absorbed into the main model rather than presented as a separate side workflow. The default experience should not require users to understand a distinction between "real repo" and "proposal repo".

## Component Boundaries

### Template Repository

Provides the initial structure, Nix configuration, deployment helpers, and agent-facing conventions for a personal infrastructure repository.

### Local Agent Workflow

Handles edit, validation, commit, and push from the workstation clone. This is the primary automation surface.

### Deployment Workflow

Takes repository state that already passed local validation and applies it to a target host through one explicit command.

### Host Runtime

Runs the applied configuration and exposes operational health/status interfaces. It should not be optimized as the default editing location.

## Data Flow

### Change Authoring

The user or AI agent changes files in the local repo and validates them before publication.

### Publication

When validation succeeds, the agent creates a commit and pushes it to the user's single configured remote.

### Deployment

The user triggers a deploy/apply command from the workstation. That command updates the host to match the intended repository state.

### Recovery

If deployment fails, the Git history remains intact. Recovery uses normal Git and deployment rollback paths rather than trying to reconstruct intent from host-local edits.

## Error Handling

- Validation failure blocks commit-and-push automation.
- Push failure leaves the validated local commit in place and reports the Git/auth failure clearly.
- Deploy failure leaves repository history unchanged and reports deploy logs and host state clearly.
- Host-local drift should be treated as an operational anomaly, not a normal editing path.

## Testing Strategy

The design assumes three levels of confidence:

- Local validation before push for routine change safety.
- Repository-level checks for template integrity and Nix correctness.
- Post-deploy smoke checks for host health and expected service/runtime state.

The existing repo already has useful validation patterns for Nix checks, extension tests, and host smoke coverage. The implementation should reuse those patterns rather than inventing a separate validation system.

## Migration Direction

This design does not require removing all host-oriented mechanics immediately. The practical migration is to change the product story and command defaults first:

- make the personal repo the documented source of truth
- make workstation-first authoring the default path
- make deploy/apply explicit
- demote host-first and proposal-side concepts from the default user journey

The implementation can preserve compatibility while simplifying the default path.

## Risks

### Direct Agent Push

Allowing agents to push directly is intentionally simple, but it increases the importance of reliable default validation. The initial design accepts that tradeoff.

### Documentation Mismatch

Current docs emphasize the host-owned `/etc/nixos` model. Those docs will need to be updated carefully so the new story is internally consistent.

### Partial Transition Complexity

If the product story changes faster than the command surface, users may encounter mixed signals. The rollout should keep the user-facing path coherent even if compatibility layers remain underneath.

## Success Criteria

- A new user can understand the default model in a few sentences: "your repo is the source of truth, your workstation is where changes happen, your host applies the repo state."
- An AI agent can safely make, validate, commit, and push a fix in the user's local clone without needing a second repository concept.
- Deployment to a host is explicit and separate from authoring.
- The project owner can continue improving upstream NixPI while the template model remains simple for downstream users.

## Open Decisions Deferred

These are intentionally out of scope for this design and should be handled during implementation planning:

- exact command names and CLI UX
- whether deploy applies from the local checkout, a fetched remote ref, or a staged artifact
- how upstream template improvements are recommended to downstream users over time
- how branch strategy should work for direct agent pushes

## Recommendation

Adopt the Git-first personal-template model as the default NixPI architecture and product story. Keep the host as a deployment target, not the main place where infrastructure is authored. Optimize the system around one personal repository, local agent-driven change authoring, direct push, and explicit apply-to-host deployment.
