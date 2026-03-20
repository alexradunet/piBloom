---
name: builtin-services
description: Reference for NixPI's built-in user-facing services that are always available on every node
---

# Built-In Services

NixPI ships these services as part of the base NixOS system. They are not optional packages and they do not need to be installed from the repo.

## Always Available

- `NixPI Home` on `:8080` — minimal service directory showing localhost and NetBird access details
- `Element Web` on `:8081` — Element Web client for the local NixPI Matrix server

## Operational Notes

- These services are managed as declarative user systemd units
- Use `systemd_control` for status, restart, and stop/start operations
- They should be treated as stable base OS capabilities, not as optional service packages

## Expected Unit Names

- `nixpi-home`
- `nixpi-element-web`

## URLs

Preferred access is over NetBird:

- `http://<netbird-host>:8080`
- `http://<netbird-host>:8081`
- `http://<netbird-host>:6167`

Local access on the machine also works:

- `http://localhost:8080`
- `http://localhost:8081`
- `http://localhost:6167`
