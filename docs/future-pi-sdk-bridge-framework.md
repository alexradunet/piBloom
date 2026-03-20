# Pi SDK Bridge Framework

## Summary

Set up the framework for an Element-first Pi integration without building the full product yet.

The immediate goal is to extract stable boundaries so future work can add a widget, daemon API, approvals, and richer multi-agent UX without refactoring the core again.

The framework stays Node-first, preserves the current Matrix/daemon/session model, and keeps the Pi TUI available as a development and fallback interface.

## Key Changes

### Session runtime core

Create a dedicated room-session core around `createAgentSession()` that is responsible for:

- one persisted session per `(room, agent)`
- prompt delivery via `prompt`, `steer`, and `followUp`
- session lifecycle, idle disposal, and restart
- full subscription to Pi SDK events instead of only final text extraction

This core should become the single owner of Pi session behavior. Matrix should stop depending on ad hoc event handling embedded in the current runtime path.

### Internal event model

Introduce one small normalized event contract for downstream consumers.

Initial event set:

- `session_started`
- `session_finished`
- `session_failed`
- `text_delta`
- `tool_started`
- `tool_finished`
- `approval_requested`

This is intentionally smaller than the raw Pi SDK event stream. The goal is to stabilize what the rest of NixPI consumes, not to expose every SDK detail yet.

### Transport adapter boundary

Split output delivery from session execution.

Define adapters for:

- Matrix room output
- future widget stream consumer
- future observability/metrics consumer

For now, only Matrix needs to be implemented. The widget adapter should exist only as an interface and type contract, not as a real transport.

### Approval boundary

Add a single approval interface into the runtime now, even if the first implementation is a no-op or policy stub.

Shape:

- runtime emits `approval_requested`
- approval provider resolves `approve` or `reject`
- session resumes or aborts based on that result

Do not implement the full UI or auth flow yet. The purpose is to prevent approval logic from being hardcoded into tools or transports later.

### Shared type contracts

Add a small shared contract package or module for:

- normalized session events
- room/session status snapshot
- approval request and decision types
- transport adapter interfaces

These types should be transport-neutral and not mention Matrix widgets, HTTP, or TUI-specific concepts unless unavoidable.

## Public Interfaces and Behavior

Define these framework-level interfaces:

- `RoomAgentSessionRuntime`
  Owns one active Pi session and exposes `sendPrompt`, `sendSteer`, `sendFollowUp`, `dispose`, `getSnapshot`, and event subscription.
- `SessionEventSink`
  Receives normalized runtime events.
- `ApprovalProvider`
  Resolves pending approvals for sensitive actions.
- `SessionSnapshot`
  Minimal current state for reconnecting future clients.

Behavior defaults:

- room-bound sessions remain the canonical model
- Matrix-visible agents remain the multi-agent model
- TUI and daemon share persisted session history where practical
- Matrix remains the only active user-facing transport for now

## Test Plan

Add or update tests to cover:

- normalized events are emitted in correct order from Pi SDK activity
- Matrix transport consumes normalized events without depending on raw SDK event shapes
- room sessions correctly support `prompt`, `steer`, and `followUp`
- session snapshot reflects idle, running, waiting-for-approval, finished, and failed states
- approval provider can block and resume runtime behavior through the interface
- existing room routing, cooldowns, reply budgets, and multi-agent behavior remain unchanged
- persisted sessions remain compatible with TUI usage

## Assumptions and Defaults

- This phase is framework-only. No widget, no HTTP API, and no new end-user UX yet.
- Node remains the canonical runtime.
- The event model stays intentionally minimal until a real second consumer exists.
- Matrix is the first transport adapter and the current production path.
- Approval support is introduced as an interface now so later UI work does not require runtime redesign.
