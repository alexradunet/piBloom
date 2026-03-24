# Canonical NetBird Host Access Design

**Date:** 2026-03-24
**Status:** Approved

---

## Overview

NixPI should present exactly one operator-facing network identity: the hostname assigned by
NetBird, used as-is. Home, Element, and Matrix client configuration should all treat that
hostname as the canonical address.

`localhost` remains available only as an on-box recovery path. It is not part of the normal
operator story and should not be presented as an equal alternative in setup output, Home, or
documentation unless NetBird access is unavailable.

This design is explicitly optimized for simplicity in the live mini-PC workflow: one host to
remember, one host to share, one host to configure in mobile Matrix clients.

---

## Approaches Considered

### Recommended: NetBird hostname as the single canonical host, explicit localhost fallback

Use the NetBird-assigned hostname exactly as provided for all normal access. Keep `localhost`
working locally, but surface it only in recovery situations.

Why this is the right fit:

- Simplest user model: one host everywhere
- No extra local naming system to invent or maintain
- Reuses NetBird's existing DNS naming directly
- Keeps recovery possible without turning fallback into a second normal workflow

### Alternative: custom canonical hostname such as `bloom.local`

Create and maintain a NixPI-specific local hostname and route everything through it.

Why not:

- Adds naming and DNS work that the user does not want
- Creates another identity on top of the NetBird one
- More code and more setup complexity for little user benefit

### Alternative: dual-primary model (`localhost` and NetBird hostname both documented)

Keep both local and remote addresses visible as normal options.

Why not:

- Preserves the current ambiguity
- Makes docs and setup output harder to follow
- Encourages clients and humans to configure different addresses for the same machine

---

## Architecture

NixPI should have one operator-facing network identity: the NetBird-provided hostname. Raw mesh
IPs, `localhost`, and custom hostnames should stop being presented as equivalent choices during
normal operation.

The service surface should move to a single HTTPS front door on that NetBird hostname. Browser
users start from that host, and Matrix clients also use that same host as the homeserver
address. The intended user experience is:

- Open `https://<netbird-host>` in a browser
- Configure Element X mobile against the same NetBird hostname
- Do not require service-specific raw ports in the normal access story

This design assumes the NetBird hostname can present a publicly trusted TLS certificate. That is
a hard prerequisite for the unified HTTPS access model because mobile Matrix clients and browsers
must trust the hostname without manual certificate installation.

`localhost` still exists as a local recovery path, but it does not become a second canonical
identity. If NetBird is degraded, the system explains how to recover locally without changing
what the canonical address is.

---

## Components

### Service-surface gateway

A single gateway should own the canonical hostname. Its responsibilities are:

- terminate HTTPS for the NetBird hostname
- serve local degraded recovery on `http://localhost/`
- serve Home at `/`
- route Element Web under a stable browser path such as `/element/`
- expose Matrix under the same hostname using the standard Matrix client and server endpoints
  clients expect, including `/_matrix/client/*` and any required discovery handling

This component exists to unify access, not to merge the underlying services.

### Existing backend services

Home, Element Web, and Continuwuity should remain separate services behind the gateway. They can
continue to run on their existing internal ports so current module boundaries stay mostly
intact. The design changes how they are reached, not necessarily how they are implemented.

### Access-state layer

One small access-state layer should determine what Home displays:

- healthy: show only the canonical NetBird hostname and shareable URLs
- degraded: show local recovery guidance using `localhost`

This keeps fallback messaging centralized instead of duplicating it across setup scripts, docs,
and runtime configs.

---

## Data Flow

During setup or runtime refresh, NixPI should discover the hostname from local NetBird state and
write it into the generated runtime configuration for Home and Element. That discovered hostname
becomes the single source of truth for:

- Home links
- Element default configuration
- user-facing access instructions

The system should stop generating parallel operator-facing outputs for:

- NetBird hostname
- raw mesh IP
- `localhost`

In the normal path:

1. NetBird DNS resolves the canonical hostname
2. the front door receives the request
3. the gateway routes the request to Home, Element, or Matrix
4. browser and mobile clients use the same host identity

In the degraded path:

1. canonical NetBird access is unavailable
2. Home keeps the NetBird hostname as the canonical identity
3. the same front-door gateway remains reachable locally at `http://localhost/`
4. local recovery guidance points to that localhost entry point on the box only
5. when NetBird returns, no migration or config rewrite is needed

---

## Error Handling

Failure must not create a second normal access model.

If NetBird is disconnected, hostname discovery is stale, or the gateway cannot confirm the
canonical path is usable, NixPI should preserve the NetBird hostname as the canonical identity
and show explicit degraded-state messaging locally.

The design must cover these cases:

1. NetBird connected but hostname discovery missing or stale
   Home should avoid printing misleading URLs and should indicate canonical access is not ready.

2. NetBird unavailable on the box
   The same front-door gateway should remain available locally at `http://localhost/`. Home
   should show on-box recovery guidance there and explain that remote access is unavailable.

3. Backend service failure behind the front door
   The gateway should return a service-specific error rather than a generic connection refusal so
   the operator can distinguish gateway, NetBird, and backend failures.

The fallback rule is intentionally simple:

- one canonical host
- one explicit local recovery path
- no silent switching between identities

---

## Testing

Testing should prove that the system behaves like one-host access in the normal case and clear
recovery in the degraded case.

### Configuration and routing tests

Verify that:

- the discovered NetBird hostname is injected into generated Home runtime state
- the discovered NetBird hostname is injected into Element runtime config
- Matrix client and server endpoints are reachable on the canonical hostname through the gateway
- the front door routes correctly to Home, Element, and Matrix on one host

### Degraded-mode tests

Verify that:

- absent or unusable NetBird hostname data does not create a new canonical identity
- the same front-door gateway stays reachable at `http://localhost/` in degraded mode
- Home shows `localhost` recovery guidance only in degraded mode
- canonical configuration still points to the NetBird hostname once available again

### Acceptance criteria

Implementation is successful when:

- the operator-facing story is one hostname everywhere
- browser users start from the canonical NetBird hostname
- a mobile Matrix client such as Element X can connect using that same hostname
- the canonical hostname presents a publicly trusted certificate acceptable to browsers and mobile
  Matrix clients
- normal usage does not require raw ports, raw mesh IPs, or alternate hostnames

---

## Scope Boundaries

This design is about access identity and service reachability, not broader NetBird cloud
topology. It does not require changing the underlying NetBird naming system, inventing custom
DNS beyond what NetBird already provides, or redesigning Home/Element/Matrix as one combined
application.

It also does not promote `localhost` into a supported peer of the canonical host. `localhost`
remains a recovery tool for on-box troubleshooting only.
