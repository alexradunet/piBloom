# Review Follow-ups Design

## Goal

Address the verified review findings without broad architectural churn: tighten confirmation routing, make memory reads side-effect free, fix blueprint persona update paths, restrict broker rebuild targets to the canonical flake, and harden the chat server against oversized request bodies.

## Scope

Included:
- non-UI interaction disambiguation for pending confirmations/inputs
- object-store read semantics
- blueprint update source resolution
- broker rebuild target enforcement
- chat request body limits
- regression tests plus lint cleanup needed in touched files

Excluded:
- broader chat multi-session architecture changes
- frontend session-management redesign
- unrelated refactors outside touched modules

## Design

### 1. Interaction safety
When multiple non-UI interactions are pending, untokened replies should not silently resolve destructive requests. The interaction resolver keeps its current `ambiguous` signal for generic callers, but `requireConfirmation()` now refuses to consume ambiguous resolutions and instead re-prompts with an explicit tokenized confirmation instruction.

### 2. Memory reads become read-only
`memory_read` should not mutate arbitrary files. Reads still support the existing lookup rules, but only return truncated content. Access timestamp updates are reserved for explicit write/update flows.

### 3. Blueprint updates reuse seed-time source resolution
Persona blueprints are seeded from either `core/pi/persona` or the packaged fallback `persona` directory. Update logic now reuses the same source resolution instead of naively joining `packageDir` with the logical blueprint key.

### 4. Broker flake enforcement
The broker treats `nixos-update apply` as a canonical rebuild operation and always executes the configured default flake. Higher-level callers may still validate `/etc/nixos#nixos`, but the privileged boundary no longer trusts caller-supplied flake refs.

### 5. Chat request size hardening
The server request-body reader enforces an explicit maximum size for `/chat` JSON payloads and returns HTTP 413 for oversized bodies before buffering unbounded input.

## Testing strategy

- Add targeted regression tests first for each behavior change.
- Keep fixes small and local.
- Re-run focused tests during red/green, then full `npm test`, lint, and build verification at the end.

## Risks

- Interaction changes must preserve current untokened behavior for non-confirmation flows.
- Broker changes must preserve current CLI messages and successful canonical rebuild flow.
