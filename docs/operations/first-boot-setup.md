# First Boot Setup

> Bringing up a fresh NixPI host

## 🌱 Audience

Operators bringing up a fresh NixPI host.

## Prerequisites

Before first-boot setup, you need a system installed from the NixPI installer image:

1. Build or download the NixPI installer ISO
2. Boot the installer and run `sudo -i && nixpi-installer`
3. Choose your hostname and primary user in the terminal wizard
4. Reboot into the installed system
5. The installed machine now owns a standard local flake at `/etc/nixos`, but the recommended editable source of truth is the `~/nixpi` git checkout

## 🛡️ Security Note: NetBird is Mandatory

NetBird is the network security boundary for all NixPI services. The firewall configuration (`trustedInterfaces = ["wt0"]`) only protects services when the NetBird interface (`wt0`) is active. Without NetBird:

- Matrix, Home (port 8080), and Element Web (port 8081) are exposed to the local network
- A compromised local device could access OS tools via prompt injection

**Complete NetBird setup and verify `wt0` is active before exposing this machine to any network.**

## 🌱 Why Setup Is Split In Two

NixPI separates deterministic machine setup from Pi-guided personalization.

That split keeps:

- Host provisioning in a predictable bash flow
- Persona customization in Pi where it belongs
- Interrupted setup resumable without redoing the entire host bootstrap

## 💻 How First Boot Works

NixPI's first-boot experience has two phases.

### Phase 1: Bash Wizard

`setup-wizard.sh` handles deterministic machine setup on first interactive login.

**Current responsibilities**:

1. Password change and connectivity checks
2. NetBird enrollment
3. Primary Matrix account bootstrap
4. AI provider defaults for Pi
5. Built-in service provisioning
6. User-facing system update guidance for operating the local `~/nixpi` checkout

**Built-in services provisioned**:

- Home status page on port `8080`
- Element Web on port `8081`

**Bootstrap security lifecycle**:

- SSH on port `22` is available during bootstrap
- Once `~/.nixpi/.setup-complete` is written, SSH is stopped by default
- Matrix registration is available during bootstrap and disabled by default after setup completes
- Set `nixpi.bootstrap.keepSshAfterSetup = true` only if you intentionally want post-setup SSH administration

### Phase 2: Pi Persona Step

After the wizard is complete, `setup` tracks a single Pi-side step:

- `persona`

Pi injects setup guidance until that step is marked complete.

During that Pi-side first conversation, Pi should also orient the user to the platform:

- NixPI keeps durable state in `~/nixpi/` using inspectable files
- `~/nixpi` is the canonical git working tree for syncing with a fork, pulling from upstream, and rebuilding the system
- NixPI can propose persona or workflow changes through tracked evolutions instead of silently changing itself
- Matrix is the native messaging surface, with `nixpi-daemon.service` keeping Pi active in rooms outside the local terminal session as a system service running under the `agent` account
- Multi-agent rooms are optional and activate when valid overlays exist in `~/nixpi/Agents/*/AGENTS.md`

## 🔄 Recovery

If you want to redo persona setup, remove `~/.nixpi/wizard-state/persona-done` and open Pi again.

## 📚 Reference

### Relevant Files

| Path | Purpose |
|------|---------|
| `~/.nixpi/.setup-complete` | Wizard complete sentinel |
| `~/.nixpi/wizard-state/persona-done` | Persona step complete marker |
| `/var/lib/nixpi/agent/matrix-credentials.json` | Primary Matrix credentials |

### Current Behavior

- Before the wizard completes, Pi does not start normal conversation
- After the wizard completes, opening Pi checks only for `persona-done`
- If persona setup is still pending, Pi starts that flow first and defers unrelated conversation
- After `persona-done` exists, Pi resumes normal conversation
- The wizard enables `nixpi-daemon.service` as part of setup completion
- The wizard refreshes Matrix policy so public registration is no longer left open after setup
- The wizard refreshes the built-in service configs so NetBird peers have a stable page listing service URLs and shareable host info

## 🔗 Related

- [Quick Deploy](./quick-deploy)
- [Live Testing](./live-testing)
