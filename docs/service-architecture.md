# Service Architecture

> 📖 [Emoji Legend](LEGEND.md)

Audience: maintainers and operators deciding how nixPI exposes user-facing services.

## 🌱 Current Model

nixPI no longer ships a separate packaged-service layer. The user-facing service surface is built directly into the base NixOS system.

## 🧩 Built-In Services

The current built-in service set is:

- `Home` on `:8080`
- `Web Chat` on `:8081`
- `Matrix` on `:6167`

These are declared as user systemd services in the OS modules and are expected to exist on every nixPI node.

## 📚 Operational Notes

- Home is a minimal status page for the service surface
- FluffyChat is preconfigured for the local nixPI Matrix server
- use `systemd_control` to inspect and restart these units

## 🔗 Related

- [../README.md](../README.md)
- [../AGENTS.md](../AGENTS.md)
- [operations/first-boot-setup.md](operations/first-boot-setup.md)
