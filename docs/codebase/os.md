# OS Modules

> NixOS integration, packaging, and first-boot wiring

## Responsibilities

Keep the Nix surface split by concern:

- `modules/options.nix` declares the public NixPI option surface.
- `modules/*.nix` implement services and policy.
- `hosts/*.nix` compose concrete machines and installer profiles.
- `pkgs/installer/*` owns install artifact generation.
- `services/*.nix` owns standalone service wrappers and runtime assets.

## Reading order

1. `options.nix`
2. `app.nix`, `broker.nix`, `network.nix`, `service-surface.nix`
3. `firstboot/` and `shell.nix`
4. installer code under `core/os/pkgs/installer/`

## Cleanup rule

Avoid encoding the same install or service policy in multiple places. If shell scripts, Python installer helpers, and Nix modules all need the same rule, pick one canonical owner and make the rest thin wrappers.

### Package Flow

```
flake.nix
    ↓
callPackage core/os/pkgs/pi     → piAgent
    ↓
callPackage core/os/pkgs/app    → appPackage (uses piAgent)
    ↓
NixOS modules use appPackage
```

---

## Host Configurations (`core/os/hosts/`)

| File | Why | What | How / Notes |
|------|-----|------|-------------|
| `x86_64.nix` | Desktop config | Managed NixPI desktop profile | Base installed system shape |
| `installer-iso.nix` | Installer image | Minimal console installer ISO carrying the full `desktop` closure | Official installation media |

### Host Configuration Pattern

```nix
{ config, pkgs, lib, ... }:
{
  imports = [
    self.nixosModules.nixpi
    self.nixosModules.firstboot
    ./hardware-configuration.nix
  ];

  nixpi.primaryUser = "pi";
}
```

---

## Important File Details

### `core/os/modules/options.nix`

**Responsibility**: Declares all NixPI NixOS options in one place.

**Option Hierarchy**:
```
nixpi
├── primaryUser
├── stateDir
├── security
│   ├── trustedInterface
│   └── ...
├── bootstrap
│   ├── keepSshAfterSetup
│   └── ...
├── agent
│   ├── autonomy
│   ├── broker.enable
│   └── ...
├── services
│   ├── bindAddress
│   ├── home.enable
│   └── secureWeb.enable
└── network
    ├── netbird.enable
    └── ...
```

**Inbound Dependencies**:
- All other modules reference these options
- User configurations set these options

---

### `core/os/modules/app.nix`

**Responsibility**: Installs the packaged app and wires up the local chat runtime.

**Key Definitions**:
- `appPackage` and `piAgent` in `environment.systemPackages`
- `/usr/local/share/nixpi` symlink and runtime tmpfiles
- `nixpi-chat.service` modular service import
- `nixpi-app-setup.service` to seed `~/.pi/settings.json`

**Service Configuration**:
```nix
system.services.nixpi-chat = {
  imports = [ (lib.modules.importApply ../services/nixpi-chat.nix { inherit pkgs; }) ];
  nixpi-chat = {
    package = appPackage;
    inherit primaryUser agentStateDir;
  };
}
```

---

### `core/os/modules/broker.nix`

**Responsibility**: Privilege escalation service for elevated operations.

**Why It Exists**: The daemon runs without direct root privileges. Some operations (like certain NixOS commands) need elevated privileges. The broker acts as a controlled elevation point.

**Tools**:
| Tool | Purpose |
|------|---------|
| `nixpi-brokerctl grant-admin <duration>` | Grant admin privileges |
| `nixpi-brokerctl status` | Check broker status |
| `nixpi-brokerctl revoke-admin` | Revoke admin privileges |

**Autonomy Levels**:
- `observe` - Read state only
- `maintain` - Operate approved systemd units
- `admin` - Full elevation (time-bounded)

---

### `core/os/modules/service-surface.nix`

**Responsibility**: Exposes the local chat runtime through HTTP and HTTPS.

**Key Features**:
- Asserts that hosted access keeps the secure web entrypoint enabled
- Generates a self-signed TLS certificate for the canonical secure endpoint
- Proxies inbound traffic to the local backend on `127.0.0.1:${toString config.nixpi.services.home.port}`
- Keeps the backend itself off the external interface

---

### `core/os/modules/network.nix`

**Responsibility**: Network configuration including NetBird and firewall.

The first-boot path is WiFi-first on mini-PC installs. Ethernet remains enabled as fallback, but saved WiFi profiles are given higher NetworkManager autoconnect priority.

**Security Model**:
```nix
networking.firewall = {
  trustedInterfaces = [ "wt0" ];  # NetBird only
  # All services only accessible via wt0
};
```

**Critical**: Without NetBird running, services are exposed to local network.

---

### `core/os/modules/runtime.nix`

**Responsibility**: Composes the runtime-facing modules.

**Current Imports**:
- `app.nix` for packaged runtime setup
- `broker.nix` for privileged operations

This file is intentionally small. It defines the runtime boundary, not the behavior itself.

---

### `core/os/modules/default.nix`

**Responsibility**: Aggregates the full appliance module stack.

**Current Imports**:
- Core options and packaging
- Network and update policy
- Runtime and service surface
- Tooling, shell, desktop, and first-boot modules

Read this file when you need the shortest path to "what ships on a normal NixPI host?"

---

## Related Tests

| Test Area | Location | Coverage |
|-----------|----------|----------|
| NixOS smoke | `tests/nixos/` | Chat service, broker, and first-boot sanity checks |
| NixOS full | `tests/nixos/` | Broader VM coverage for network, desktop, update, security, and install flows |

See [Tests](./tests) for detailed test documentation.

---

## Related

- [Architecture Overview](../architecture/) - High-level design
- [Runtime Flows](../architecture/runtime-flows) - End-to-end flows
- [Tests](./tests) - Test coverage
