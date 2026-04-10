---
name: self-evolution
description: Detect improvement opportunities and propose system changes through a structured evolution workflow
---

# Self-Evolution Skill

Use this skill when NixPI detects a capability gap or the user requests a system change.

## Choosing the Right Mechanism

When extending capabilities, prefer the lightest option: **Skill → Extension → Service**.

| Need | Mechanism | Example |
|------|-----------|---------|
| Pi needs knowledge or a procedure | **Skill** — create a SKILL.md | Meal planning guide, API reference |
| Pi needs commands, tools, or session hooks | **Extension** — TypeScript (requires PR) | New Pi command, event handler |
| Standalone workload needing isolation | **Service** — Container (Podman Quadlet) | ML model, messaging bridge, VPN |

## Evolution Workflow

1. **Detect**: Recognize a capability gap or improvement opportunity
2. **Propose**: Create or resolve an evolution page using `wiki_ensure_page`
3. **Plan**: Design the implementation approach
4. **Implement**: Make the changes locally in the repo or NixPI directory
5. **Verify**: Test and validate
6. **Review**: Have the human inspect the resulting diff before any external publish

## Available Tools

### Wiki Memory (for tracking)
- `wiki_ensure_page` — Create or resolve evolution tracking pages
- `wiki_search` — Find existing evolution pages and related context
- `wiki_capture` — Capture supporting evidence before integration

## Evolution Page Fields

- `status`: proposed | planning | implementing | reviewing | approved | applied | rejected
- `risk`: low | medium | high
- `area`: wiki | persona | skills | services | system

## Safety Rules

- All system changes require user approval before applying
- Always test changes before deploying
- Document what each evolution changes and why
- Keep a rollback plan for NixOS and service changes
- Persona changes are tracked as `type: evolution` wiki pages before they land in persona files

## Code Evolution Workflow

When NixPI identifies a code-level fix or improvement to its own OS/extensions, it should prepare the change locally for human review.

**Running host source of truth**: installed `/etc/nixos#nixos`
**Standard bootstrap command**: `nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- ...`
**Canonical rebuild command**: `sudo nixpi-rebuild`

### Process

1. **Detect + Plan**
   - Describe the issue and proposed fix in plain language.
2. **Implement locally**
   - Edit the repo checkout under review. On a deployed host, any checkout is only a working copy; the machine itself converges from `/etc/nixos`.
3. **Validate**
   - Run local checks such as `npm run build`, `npm run test:unit`, `npm run test:integration`, and `npm run test:e2e` when relevant.
4. **Prepare review**
   - Summarize the diff and the validation results.
5. **Human review**
   - The user reviews the local diff in VS Code or another editor.
6. **External publish**
   - Commit, push, PR creation, merge, and rollout happen outside NixPI.

### Safety

- NixPI prepares local proposals only
- remote publish is always human- or controller-driven
- rollout is always external to the node

## Adding A Built-In Service

When NixPI identifies a need for a new user-facing service, treat it as base NixOS work rather than a packaged runtime feature.

Use direct repo edits in the OS modules, add a bundled skill only if Pi needs service-specific operating guidance, validate locally, and hand the resulting diff to the human for review and external publish.
