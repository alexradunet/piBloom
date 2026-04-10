# Security Model

> Security perimeter and threat model

## Core Security Model

NixPI no longer ships an HTTP terminal surface. The supported operator paths are:

- SSH for remote administration
- local terminal login on monitor-attached hardware

## Network Exposure

By default, the host keeps:

- SSH reachable only for configured admin CIDRs
- outbound network access required for package fetches, updates, and normal host operation
- no built-in HTTP/HTTPS Pi surface

## Threat Actors Within Scope

1. **Compromised SSH client or admin device**
2. **Internet-origin scanning or brute-force traffic against SSH**
3. **Template forker who deploys without verifying shell-access hardening**

## Agent Privilege Boundary

- The primary operator account is the normal human and Pi runtime identity
- Interactive Pi state lives in `~/.pi`, while service and secret state lives under `/var/lib/nixpi`
- Privileged actions are routed through the root-owned `nixpi-broker` service
