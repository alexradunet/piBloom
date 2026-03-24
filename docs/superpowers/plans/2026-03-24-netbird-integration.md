# NetBird Deep Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire NetBird cloud APIs deeply into Bloom OS — declarative cloud provisioning, identity-aware SSH, hostname DNS, and a Matrix bot that reports network activity.

**Architecture:** A systemd oneshot provisioner converges NetBird cloud state (groups, policies, posture checks, DNS, setup keys) to what's declared in NixOS options. A timer-driven watcher polls NetBird events and posts them to a Matrix room. network.nix gains NetBird SSH and DNS resolver config. firstboot.nix gains wizard steps for the API token and bot account.

**Tech Stack:** NixOS modules (Nix), Python 3 (provisioner + watcher scripts inlined via `pkgs.writeText`), NetBird Management REST API, Continuwuity Matrix client API, systemd oneshot + timer.

**Spec:** `docs/superpowers/specs/2026-03-24-netbird-integration-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `core/os/modules/options.nix` | Add `nixpi.netbird.*` option declarations |
| Create | `core/os/modules/netbird-provisioner.nix` | Python provisioner script + systemd oneshot service |
| Create | `core/os/modules/nixpi-netbird-watcher.nix` | Python watcher script + systemd timer + oneshot service |
| Modify | `core/os/modules/network.nix` | Enable NetBird SSH daemon, configure systemd-resolved DNS forwarding |
| Modify | `core/os/modules/firstboot.nix` | API token prompt, provisioner wizard step, bot account creation |
| Modify | `core/os/modules/collab.nix` | Import provisioner and watcher modules |
| Create | `tests/nixos/nixpi-netbird-provisioner.nix` | NixOS test: mock API, idempotency, failure handling |
| Create | `tests/nixos/nixpi-netbird-watcher.nix` | NixOS test: mock API + Matrix, state file, pending events |
| Modify | `tests/nixos/default.nix` | Register two new tests |
| Modify | `tests/nixos/nixpi-e2e.nix` | Assert provisioner service active, watcher timer active, #network-activity room exists |

---

## Task 1: Add `nixpi.netbird.*` Options

**Files:**
- Modify: `core/os/modules/options.nix`

- [ ] **Step 1: Add the netbird option block to options.nix**

Insert the following block inside `options.nixpi = { ... };`, after the `matrix` block (before `update`):

```nix
netbird = {
  apiTokenFile = lib.mkOption {
    type = lib.types.nullOr lib.types.path;
    default = null;
    description = ''
      Path to a file containing the NetBird management API personal access
      token. When null, the provisioner and watcher services are not started.
      Never store the token in the Nix store.
    '';
  };

  apiEndpoint = lib.mkOption {
    type = lib.types.str;
    default = "https://api.netbird.io";
    description = ''
      Base URL for the NetBird management API. Override in tests to point
      at a mock server.
    '';
  };

  groups = lib.mkOption {
    type = lib.types.listOf lib.types.str;
    default = [ "bloom-devices" "admins" "bloom-pi" ];
    description = ''
      NetBird groups to ensure exist. "All" is a NetBird built-in and must
      not appear here — the provisioner skips it automatically.
      "bloom-pi" is the group the Pi peer joins via its dedicated setup key;
      it is the destination group in all ACL policies (least-privilege).
    '';
  };

  setupKeys = lib.mkOption {
    type = lib.types.listOf (lib.types.submodule {
      options = {
        name       = lib.mkOption { type = lib.types.str; };
        autoGroups = lib.mkOption { type = lib.types.listOf lib.types.str; };
        ephemeral  = lib.mkOption { type = lib.types.bool; default = false; };
        usageLimit = lib.mkOption { type = lib.types.int;  default = 0; };
      };
    });
    default = [
      { name = "bloom-pi";     autoGroups = [ "bloom-pi" ];             ephemeral = false; usageLimit = 1; }
      { name = "bloom-device"; autoGroups = [ "bloom-devices" ];        ephemeral = false; usageLimit = 0; }
      { name = "admin-device"; autoGroups = [ "bloom-devices" "admins" ]; ephemeral = false; usageLimit = 0; }
    ];
    description = ''
      Setup keys to ensure exist in NetBird cloud. Keys are create-only —
      the NetBird API does not support mutating existing keys. To change a
      key's config, revoke it in the NetBird dashboard then re-run the
      provisioner (next nixos-rebuild switch or reboot).
    '';
  };

  policies = lib.mkOption {
    type = lib.types.listOf (lib.types.submodule {
      options = {
        name          = lib.mkOption { type = lib.types.str; };
        sourceGroup   = lib.mkOption { type = lib.types.str; };
        destGroup     = lib.mkOption { type = lib.types.str; };
        protocol      = lib.mkOption { type = lib.types.enum [ "tcp" "udp" "icmp" "all" ]; default = "tcp"; };
        ports         = lib.mkOption { type = lib.types.listOf lib.types.str; default = []; };
        postureChecks = lib.mkOption { type = lib.types.listOf lib.types.str; default = []; };
      };
    });
    default = [
      { name = "matrix-access";      sourceGroup = "admins";        destGroup = "bloom-pi"; protocol = "tcp"; ports = [ "6167" ]; postureChecks = []; }
      { name = "element-web-access"; sourceGroup = "bloom-devices"; destGroup = "bloom-pi"; protocol = "tcp"; ports = [ "8081" ]; postureChecks = []; }
      { name = "rdp-access";         sourceGroup = "admins";        destGroup = "bloom-pi"; protocol = "tcp"; ports = [ "3389" ]; postureChecks = []; }
      { name = "ssh-access";         sourceGroup = "admins";        destGroup = "bloom-pi"; protocol = "tcp"; ports = [ "22022" ]; postureChecks = []; }
    ];
    description = ''
      ACL policies to ensure exist. destGroup = "bloom-pi" targets only the
      Pi peer, ensuring policies apply least-privilege regardless of how
      many devices are enrolled.
    '';
  };

  postureChecks = lib.mkOption {
    type = lib.types.listOf (lib.types.submodule {
      options = {
        name       = lib.mkOption { type = lib.types.str; };
        minVersion = lib.mkOption { type = lib.types.str; };
      };
    });
    default = [ { name = "min-client-version"; minVersion = "0.61.0"; } ];
    description = ''
      Posture checks (minVersion only). Attach by name in policies.postureChecks.
      Other check types (geo, OS, process) are managed via the NetBird dashboard.
    '';
  };

  dns = {
    domain = lib.mkOption {
      type = lib.types.str;
      default = "bloom.local";
      description = "DNS domain routed through the Pi's NetBird IP by all peers in targetGroups.";
    };
    targetGroups = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "bloom-devices" ];
      description = "Peer groups that receive the bloom.local DNS route via NetBird nameserver group.";
    };
    localForwarderPort = lib.mkOption {
      type = lib.types.int;
      default = 22054;
      description = ''
        Port of NetBird's local DNS forwarder (default 22054 since v0.59.0).
        If the client uses a custom CustomDNSAddress, update this to match.
      '';
    };
  };

  ssh = {
    enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Whether to enable NetBird's built-in SSH daemon on the Pi (port 22022).
        Authentication uses NetBird peer identity (WireGuard key), not OIDC.
        Access is gated by the ssh-access ACL policy.
      '';
    };
    userMappings = lib.mkOption {
      type = lib.types.listOf (lib.types.submodule {
        options = {
          netbirdGroup = lib.mkOption { type = lib.types.str; };
          localUser    = lib.mkOption { type = lib.types.str; };
        };
      });
      default = [ { netbirdGroup = "admins"; localUser = "alex"; } ];
      description = "Maps a NetBird peer group to the local OS user an SSH session runs as.";
    };
  };
};
```

- [ ] **Step 2: Verify the options evaluate cleanly**

```bash
nix eval .#nixosConfigurations.desktop.config.nixpi.netbird.groups
```

Expected: `[ "bloom-devices" "admins" "bloom-pi" ]`

- [ ] **Step 3: Commit**

```bash
git add core/os/modules/options.nix
git commit -m "feat(netbird): add nixpi.netbird.* option declarations"
```

---

## Task 2: Write the NetBird Provisioner Test First

**Files:**
- Create: `tests/nixos/nixpi-netbird-provisioner.nix`
- Modify: `tests/nixos/default.nix`

- [ ] **Step 1: Write the failing test**

```nix
# tests/nixos/nixpi-netbird-provisioner.nix
{ lib, nixPiModulesNoShell, mkTestFilesystems, ... }:

{
  name = "nixpi-netbird-provisioner";

  nodes.nixpi = { pkgs, ... }: {
    imports = nixPiModulesNoShell ++ [ mkTestFilesystems ];

    nixpi.primaryUser = "pi";
    networking.hostName = "pi";
    system.stateVersion = "25.05";
    boot.loader.systemd-boot.enable = true;
    boot.loader.efi.canTouchEfiVariables = true;
    virtualisation.diskSize = 4096;
    virtualisation.memorySize = 1024;

    users.users.pi = {
      isNormalUser = true;
      group = "pi";
      extraGroups = [ "wheel" ];
    };
    users.groups.pi = {};

    # Write a fake API token so the provisioner can start
    system.activationScripts.netbird-test-token = ''
      install -d -m 0700 /var/lib/nixpi/secrets
      echo -n "test-token-abc123" > /var/lib/nixpi/secrets/netbird-api-token
      chown -R nixpi:nixpi /var/lib/nixpi/secrets || true
    '';

    # Override endpoint to point at mock server
    nixpi.netbird.apiTokenFile = "/var/lib/nixpi/secrets/netbird-api-token";
    nixpi.netbird.apiEndpoint = "http://127.0.0.1:19999";

    # Mock NetBird API server (returns empty lists for all GETs, 200 for POSTs)
    systemd.services.mock-netbird-api = {
      description = "Mock NetBird API";
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "simple";
        ExecStart = pkgs.writeShellScript "mock-api" ''
          ${pkgs.python3}/bin/python3 -c "
import http.server, json

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps([]).encode())
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        self.rfile.read(length)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'id': 'test-id'}).encode())
    def do_PUT(self):
        self.do_POST()

http.server.HTTPServer(('127.0.0.1', 19999), H).serve_forever()
"
        '';
      };
    };
  };

  testScript = ''
    nixpi.start()
    nixpi.wait_for_unit("multi-user.target", timeout=120)
    nixpi.wait_for_unit("mock-netbird-api.service", timeout=30)

    # Provisioner should reach active (exited)
    nixpi.wait_for_unit("nixpi-netbird-provisioner.service", timeout=60)
    nixpi.succeed("systemctl is-active nixpi-netbird-provisioner.service || systemctl show -p SubState --value nixpi-netbird-provisioner.service | grep -q exited")

    # Idempotency: running again should succeed without error
    nixpi.succeed("systemctl start nixpi-netbird-provisioner.service")

    # Provisioner log should mention groups
    nixpi.succeed("journalctl -u nixpi-netbird-provisioner | grep -i 'bloom-devices'")

    print("NetBird provisioner test passed")
  '';
}
```

- [ ] **Step 2: Register the test in `tests/nixos/default.nix`**

Add inside the `tests = { ... }` block:
```nix
nixpi-netbird-provisioner = runTest ./nixpi-netbird-provisioner.nix;
```

- [ ] **Step 3: Run the test to confirm it fails (module doesn't exist yet)**

```bash
nix build .#checks.x86_64-linux.nixpi-netbird-provisioner 2>&1 | head -30
```

Expected: evaluation error about missing module or missing `nixpi.netbird` option.

- [ ] **Step 4: Commit the failing test**

```bash
git add tests/nixos/nixpi-netbird-provisioner.nix tests/nixos/default.nix
git commit -m "test(netbird): add failing provisioner NixOS test"
```

---

## Task 3: Implement the NetBird Provisioner Module

**Files:**
- Create: `core/os/modules/netbird-provisioner.nix`

- [ ] **Step 1: Create the provisioner module**

```nix
# core/os/modules/netbird-provisioner.nix
{ pkgs, config, lib, ... }:

let
  cfg = config.nixpi.netbird;

  provisionerScript = pkgs.writeText "nixpi-netbird-provisioner.py" ''
import sys, json, os, urllib.request, urllib.error

TOKEN_FILE = sys.argv[1]
BASE_URL   = sys.argv[2]
CONFIG_FILE = sys.argv[3]

with open(TOKEN_FILE) as f:
    token = f.read().strip()

with open(CONFIG_FILE) as f:
    desired = json.load(f)

HEADERS = {
    "Authorization": f"Token {token}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

def api(method, path, body=None):
    url = BASE_URL.rstrip("/") + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode(errors="replace")
        print(f"[netbird] {method} {path} → HTTP {e.code}: {body_text}", flush=True)
        raise

def log(msg): print(f"[netbird] {msg}", flush=True)

# ── Groups ────────────────────────────────────────────────────────────────────
existing_groups = {g["name"]: g for g in api("GET", "/api/groups")}
group_name_to_id = {name: g["id"] for name, g in existing_groups.items()}

for name in desired["groups"]:
    if name == "All":
        group_name_to_id["All"] = existing_groups.get("All", {}).get("id", "")
        continue
    if name in existing_groups:
        log(f"Creating group: {name} ... ✓ (already existed)")
        group_name_to_id[name] = existing_groups[name]["id"]
    else:
        result = api("POST", "/api/groups", {"name": name})
        group_name_to_id[name] = result["id"]
        log(f"Creating group: {name} ... ✓")

# ── Setup Keys ────────────────────────────────────────────────────────────────
existing_keys = {k["name"]: k for k in api("GET", "/api/setup-keys")}

for key in desired["setupKeys"]:
    if key["name"] in existing_keys:
        log(f"Creating setup key: {key['name']} ... ✓ (already existed — to change config, revoke in dashboard)")
        continue
    auto_group_ids = [group_name_to_id[g] for g in key["autoGroups"] if g in group_name_to_id]
    api("POST", "/api/setup-keys", {
        "name": key["name"],
        "type": "reusable",
        "auto_groups": auto_group_ids,
        "ephemeral": key["ephemeral"],
        "usage_limit": key["usageLimit"],
    })
    log(f"Creating setup key: {key['name']} ... ✓")

# ── Posture Checks ────────────────────────────────────────────────────────────
existing_checks = {c["name"]: c for c in api("GET", "/api/posture-checks")}
check_name_to_id = {}

for check in desired["postureChecks"]:
    name = check["name"]
    body = {
        "name": name,
        "checks": {"nb_version_check": {"min_version": check["minVersion"]}},
    }
    if name in existing_checks:
        check_name_to_id[name] = existing_checks[name]["id"]
        existing_min = (existing_checks[name].get("checks", {})
                        .get("nb_version_check", {}).get("min_version", ""))
        if existing_min == check["minVersion"]:
            log(f"Creating posture check: {name} ... ✓ (already existed)")
            continue
        api("PUT", f"/api/posture-checks/{existing_checks[name]['id']}", body)
        log(f"Creating posture check: {name} ... ✓ (updated)")
    else:
        result = api("POST", "/api/posture-checks", body)
        check_name_to_id[name] = result["id"]
        log(f"Creating posture check: {name} ... ✓")

# ── Policies ──────────────────────────────────────────────────────────────────
existing_policies = {p["name"]: p for p in api("GET", "/api/policies")}

for policy in desired["policies"]:
    name = policy["name"]
    src_id  = group_name_to_id.get(policy["sourceGroup"], "")
    dst_id  = group_name_to_id.get(policy["destGroup"], "")
    check_ids = [check_name_to_id[c] for c in policy.get("postureChecks", []) if c in check_name_to_id]
    body = {
        "name": name,
        "enabled": True,
        "rules": [{
            "name": name,
            "enabled": True,
            "action": "accept",
            "bidirectional": True,
            "protocol": policy["protocol"],
            "ports": policy.get("ports", []),
            "sources": [src_id],
            "destinations": [dst_id],
        }],
        "source_posture_checks": check_ids,
    }
    if name in existing_policies:
        api("PUT", f"/api/policies/{existing_policies[name]['id']}", body)
        log(f"Creating policy: {name} ... ✓ (updated)")
    else:
        api("POST", "/api/policies", body)
        log(f"Creating policy: {name} ... ✓")

# ── DNS Nameserver Group ───────────────────────────────────────────────────────
dns = desired["dns"]
pi_ip = "100.64.0.1"  # resolved at runtime; placeholder shows intent
target_group_ids = [group_name_to_id[g] for g in dns["targetGroups"] if g in group_name_to_id]
existing_ns = api("GET", "/api/dns/nameservers")
existing_ns_by_domain = {
    ns.get("domains", [None])[0]: ns for ns in existing_ns
    if ns.get("domains")
}
ns_body = {
    "name": f"{dns['domain']}-resolver",
    "description": f"Routes {dns['domain']} to the Pi's NetBird IP",
    "nameservers": [{"ip": pi_ip, "ns_type": "udp", "port": dns["localForwarderPort"]}],
    "enabled": True,
    "groups": target_group_ids,
    "domains": [dns["domain"]],
    "search_domains_enabled": False,
}
if dns["domain"] in existing_ns_by_domain:
    ns_id = existing_ns_by_domain[dns["domain"]]["id"]
    api("PUT", f"/api/dns/nameservers/{ns_id}", ns_body)
    log(f"Configuring DNS: {dns['domain']} → {', '.join(dns['targetGroups'])} ... ✓ (updated)")
else:
    api("POST", "/api/dns/nameservers", ns_body)
    log(f"Configuring DNS: {dns['domain']} → {', '.join(dns['targetGroups'])} ... ✓")

log("Done. Network topology applied.")
  '';

  configFile = pkgs.writeText "nixpi-netbird-config.json" (builtins.toJSON {
    groups       = cfg.groups;
    setupKeys    = cfg.setupKeys;
    postureChecks = cfg.postureChecks;
    policies     = cfg.policies;
    dns = {
      inherit (cfg.dns) domain targetGroups localForwarderPort;
    };
  });
in

{
  imports = [ ./options.nix ];

  config = lib.mkIf (cfg.apiTokenFile != null) {
    systemd.services.nixpi-netbird-provisioner = {
      description = "NetBird cloud state provisioner";
      after       = [ "network-online.target" ];
      wants       = [ "network-online.target" ];
      wantedBy    = [ "multi-user.target" ];
      serviceConfig = {
        Type            = "oneshot";
        RemainAfterExit = true;
        ExecStart = "${pkgs.python3}/bin/python3 ${provisionerScript} ${cfg.apiTokenFile} ${cfg.apiEndpoint} ${configFile}";
        Restart         = "on-failure";
        RestartSec      = "30s";
        StartLimitBurst = 3;
        StartLimitIntervalSec = "120s";
        # No root needed; nixpi user reads the token file
        User  = config.nixpi.primaryUser;
        Group = config.nixpi.primaryUser;
      };
    };
  };
}
```

- [ ] **Step 2: Import the provisioner in `collab.nix`**

```nix
# core/os/modules/collab.nix
{ ... }:
{
  imports = [
    ./matrix.nix
    ./service-surface.nix
    ./netbird-provisioner.nix
  ];
}
```

- [ ] **Step 3: Run the provisioner test**

```bash
nix build .#checks.x86_64-linux.nixpi-netbird-provisioner -L 2>&1 | tail -40
```

Expected: test passes — provisioner reaches `active (exited)`, journal contains `bloom-devices`.

- [ ] **Step 4: Commit**

```bash
git add core/os/modules/netbird-provisioner.nix core/os/modules/collab.nix
git commit -m "feat(netbird): add netbird-provisioner NixOS module"
```

---

## Task 4: Write the NetBird Watcher Test First

**Files:**
- Create: `tests/nixos/nixpi-netbird-watcher.nix`
- Modify: `tests/nixos/default.nix`

- [ ] **Step 1: Write the failing test**

```nix
# tests/nixos/nixpi-netbird-watcher.nix
{ lib, nixPiModulesNoShell, mkTestFilesystems, ... }:

{
  name = "nixpi-netbird-watcher";

  nodes.nixpi = { pkgs, ... }: {
    imports = nixPiModulesNoShell ++ [ mkTestFilesystems ];

    nixpi.primaryUser = "pi";
    networking.hostName = "testpi";
    system.stateVersion = "25.05";
    boot.loader.systemd-boot.enable = true;
    boot.loader.efi.canTouchEfiVariables = true;
    virtualisation.diskSize = 4096;
    virtualisation.memorySize = 1024;

    users.users.pi = {
      isNormalUser = true;
      group = "pi";
      extraGroups = [ "wheel" ];
    };
    users.groups.pi = {};

    nixpi.netbird.apiTokenFile = "/var/lib/nixpi/secrets/netbird-api-token";
    nixpi.netbird.apiEndpoint = "http://127.0.0.1:19998";

    # Seed secrets and bot token
    system.activationScripts.watcher-test-setup = ''
      install -d -m 0700 /var/lib/nixpi/secrets
      echo -n "test-token" > /var/lib/nixpi/secrets/netbird-api-token
      install -d -m 0700 /var/lib/nixpi/netbird-watcher
      echo -n "matrix-bot-token" > /var/lib/nixpi/netbird-watcher/matrix-token
    '';

    # Mock NetBird events API — returns 2 events newest-first
    systemd.services.mock-netbird-events = {
      description = "Mock NetBird events API";
      wantedBy = [ "multi-user.target" ];
      serviceConfig.Type = "simple";
      serviceConfig.ExecStart = pkgs.writeShellScript "mock-events" ''
        ${pkgs.python3}/bin/python3 -c "
import http.server, json

EVENTS = [
  {'id': '2', 'timestamp': '2026-03-24T12:01:00Z', 'activity': 'peer.add',
   'meta': {'peer': 'laptop', 'ip': '100.64.0.2'}, 'initiator_id': '', 'target_id': ''},
  {'id': '1', 'timestamp': '2026-03-24T12:00:00Z', 'activity': 'user.login',
   'meta': {'email': 'admin@example.com'}, 'initiator_id': '', 'target_id': ''},
]

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(EVENTS).encode())

http.server.HTTPServer(('127.0.0.1', 19998), H).serve_forever()
"
      '';
    };

    # Mock Matrix API — records messages posted
    systemd.services.mock-matrix-api = {
      description = "Mock Matrix API";
      wantedBy = [ "multi-user.target" ];
      serviceConfig.Type = "simple";
      serviceConfig.ExecStart = pkgs.writeShellScript "mock-matrix" ''
        ${pkgs.python3}/bin/python3 -c "
import http.server, json

MESSAGES = []
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_PUT(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))
        MESSAGES.append(body.get('body', ''))
        open('/tmp/matrix-messages.json', 'w').write(json.dumps(MESSAGES))
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'event_id': 'evt1'}).encode())
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'joined_rooms': []}).encode())

http.server.HTTPServer(('127.0.0.1', 18008), H).serve_forever()
"
      '';
    };
  };

  testScript = ''
    nixpi.start()
    nixpi.wait_for_unit("multi-user.target", timeout=120)
    nixpi.wait_for_unit("mock-netbird-events.service", timeout=30)
    nixpi.wait_for_unit("mock-matrix-api.service", timeout=30)

    # Timer should be active
    nixpi.succeed("systemctl is-active nixpi-netbird-watcher.timer")

    # Trigger one cycle manually
    nixpi.succeed("systemctl start nixpi-netbird-watcher.service")
    nixpi.wait_for_unit("nixpi-netbird-watcher.service", timeout=30)

    # State file should have been written with last-seen event ID
    nixpi.succeed("test -f /var/lib/nixpi/netbird-watcher/last-event-id")
    last_id = nixpi.succeed("cat /var/lib/nixpi/netbird-watcher/last-event-id").strip()
    assert last_id == "2", f"Expected last-event-id '2', got '{last_id}'"

    # Matrix should have received messages (peer.add + user.login)
    nixpi.succeed("test -f /tmp/matrix-messages.json")
    messages = nixpi.succeed("cat /tmp/matrix-messages.json")
    assert "New peer joined" in messages, "Missing peer.add message"
    assert "User logged in" in messages, "Missing user.login message"

    # Second run: no new events → no new Matrix messages (last-event-id = 2 already)
    nixpi.succeed("systemctl start nixpi-netbird-watcher.service")
    messages2 = nixpi.succeed("cat /tmp/matrix-messages.json")
    import json
    assert len(json.loads(messages2)) == 2, "Expected no additional messages on second run"

    print("NetBird watcher test passed")
  '';
}
```

- [ ] **Step 2: Register in `tests/nixos/default.nix`**

```nix
nixpi-netbird-watcher = runTest ./nixpi-netbird-watcher.nix;
```

- [ ] **Step 3: Confirm test fails (module not yet implemented)**

```bash
nix build .#checks.x86_64-linux.nixpi-netbird-watcher 2>&1 | head -20
```

Expected: evaluation error (watcher module / timer not found).

- [ ] **Step 4: Commit the failing test**

```bash
git add tests/nixos/nixpi-netbird-watcher.nix tests/nixos/default.nix
git commit -m "test(netbird): add failing watcher NixOS test"
```

---

## Task 5: Implement the NetBird Watcher Module

**Files:**
- Create: `core/os/modules/nixpi-netbird-watcher.nix`

- [ ] **Step 1: Create the watcher module**

```nix
# core/os/modules/nixpi-netbird-watcher.nix
{ pkgs, config, lib, ... }:

let
  cfg = config.nixpi.netbird;
  hostname = config.networking.hostName;
  stateDir = "/var/lib/nixpi/netbird-watcher";

  # Matrix API endpoint — watcher talks directly to local Continuwuity
  matrixBaseUrl = "http://127.0.0.1:${toString config.nixpi.matrix.port}";
  # Room alias the bot posts into
  networkActivityRoomAlias = "#network-activity:${hostname}";

  watcherScript = pkgs.writeText "nixpi-netbird-watcher.py" ''
import sys, json, os, urllib.request, urllib.error, pathlib

NETBIRD_TOKEN_FILE = sys.argv[1]
NETBIRD_BASE       = sys.argv[2]
MATRIX_BASE        = sys.argv[3]
MATRIX_TOKEN_FILE  = sys.argv[4]
ROOM_ALIAS         = sys.argv[5]
STATE_DIR          = pathlib.Path(sys.argv[6])

MAX_BUFFER = 50
MAX_FIRST_RUN_EVENTS = 10

def read_file(path):
    try:
        return pathlib.Path(path).read_text().strip()
    except FileNotFoundError:
        return None

netbird_token = read_file(NETBIRD_TOKEN_FILE)
matrix_token  = read_file(MATRIX_TOKEN_FILE)

if not netbird_token or not matrix_token:
    print("[watcher] Missing token files — exiting", flush=True)
    sys.exit(0)

NETBIRD_HEADERS = {
    "Authorization": f"Token {netbird_token}",
    "Accept": "application/json",
}
MATRIX_HEADERS = {
    "Authorization": f"Bearer {matrix_token}",
    "Content-Type": "application/json",
}

def netbird_get(path):
    url = NETBIRD_BASE.rstrip("/") + path
    req = urllib.request.Request(url, headers=NETBIRD_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[watcher] NetBird API error: {e}", flush=True)
        return None

def matrix_put(path, body):
    url = MATRIX_BASE.rstrip("/") + path
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=MATRIX_HEADERS, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[watcher] Matrix API error: {e}", flush=True)
        return None

def resolve_room_id(alias):
    """Resolve !room-id from #alias:server"""
    encoded = alias.replace("#", "%23").replace(":", "%3A")
    url = MATRIX_BASE.rstrip("/") + f"/_matrix/client/v3/directory/room/{encoded}"
    req = urllib.request.Request(url, headers=MATRIX_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read()).get("room_id")
    except Exception:
        return None

def format_event(evt):
    activity = evt.get("activity", "")
    meta     = evt.get("meta", {})
    if activity == "peer.add":
        return f"🟢 New peer joined: {meta.get('peer', '?')} ({meta.get('ip', '?')})"
    if activity == "peer.delete":
        return f"🔴 Peer removed: {meta.get('peer', '?')}"
    if activity == "user.login":
        return f"🔑 User logged in: {meta.get('email', '?')}"
    if activity == "policy.update":
        return f"🔧 Policy updated: {meta.get('name', '?')} by {meta.get('user', '?')}"
    if activity == "setup_key.used":
        return f"🔐 Setup key used: {meta.get('name', '?')} — new peer enrolled"
    return None  # skip unknown event types

# Load state
last_id_file    = STATE_DIR / "last-event-id"
pending_file    = STATE_DIR / "pending-events"
last_seen_id    = read_file(last_id_file)
is_first_run    = last_seen_id is None

# Fetch events (newest-first, no cursor support)
events = netbird_get("/api/events?limit=100")
if events is None:
    sys.exit(0)  # API unreachable — skip cycle

# Filter to new events (IDs are strings; NetBird uses sequential integers)
def event_is_new(evt):
    eid = str(evt.get("id", ""))
    if last_seen_id is None:
        return True
    try:
        return int(eid) > int(last_seen_id)
    except ValueError:
        return eid > last_seen_id

new_events = [e for e in events if event_is_new(e)]
# Events are newest-first; process oldest-first for posting order
new_events = list(reversed(new_events))

if is_first_run:
    new_events = new_events[-MAX_FIRST_RUN_EVENTS:]

# Load any pending events from previous failed cycle
pending = []
if pending_file.exists():
    try:
        pending = json.loads(pending_file.read_text())
    except Exception:
        pending = []

to_deliver = pending + new_events

if not to_deliver:
    sys.exit(0)

# Resolve Matrix room
room_id = resolve_room_id(ROOM_ALIAS)
if not room_id:
    # Matrix unreachable: buffer undelivered events
    combined = (pending + new_events)[-MAX_BUFFER:]
    pending_file.write_text(json.dumps(combined))
    print(f"[watcher] Matrix unavailable — buffered {len(combined)} events", flush=True)
    sys.exit(0)

# Deliver events
still_pending = []
import time
txn_base = int(time.time() * 1000)
for i, evt in enumerate(to_deliver):
    msg = format_event(evt)
    if msg is None:
        continue
    txn_id = f"nb-{txn_base}-{i}"
    result = matrix_put(
        f"/_matrix/client/v3/rooms/{room_id}/send/m.room.message/{txn_id}",
        {"msgtype": "m.text", "body": msg},
    )
    if result is None:
        still_pending.append(evt)

if still_pending:
    buffered = still_pending[-MAX_BUFFER:]
    pending_file.write_text(json.dumps(buffered))
    print(f"[watcher] {len(still_pending)} events pending delivery", flush=True)
else:
    if pending_file.exists():
        pending_file.unlink()

# Persist newest event ID seen this cycle
if new_events:
    newest_id = str(new_events[-1].get("id", last_seen_id or ""))
    if newest_id:
        last_id_file.write_text(newest_id)

sys.exit(0)
  '';
in

{
  imports = [ ./options.nix ];

  config = lib.mkIf (cfg.apiTokenFile != null) {
    systemd.services.nixpi-netbird-watcher = {
      description = "NetBird event → Matrix notifier";
      after = [ "network-online.target" "continuwuity.service" ];
      wants = [ "network-online.target" ];
      serviceConfig = {
        Type = "oneshot";
        ExecStart = lib.concatStringsSep " " [
          "${pkgs.python3}/bin/python3 ${watcherScript}"
          cfg.apiTokenFile
          cfg.apiEndpoint
          matrixBaseUrl
          "${stateDir}/matrix-token"
          networkActivityRoomAlias
          stateDir
        ];
        StateDirectory = "nixpi/netbird-watcher";
        User  = config.nixpi.primaryUser;
        Group = config.nixpi.primaryUser;
      };
    };

    systemd.timers.nixpi-netbird-watcher = {
      description = "NetBird event watcher timer";
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnBootSec        = "2min";
        OnUnitActiveSec  = "60s";
        Unit             = "nixpi-netbird-watcher.service";
      };
    };
  };
}
```

- [ ] **Step 2: Import watcher in `collab.nix`**

```nix
# core/os/modules/collab.nix
{ ... }:
{
  imports = [
    ./matrix.nix
    ./service-surface.nix
    ./netbird-provisioner.nix
    ./nixpi-netbird-watcher.nix
  ];
}
```

- [ ] **Step 3: Run the watcher test**

```bash
nix build .#checks.x86_64-linux.nixpi-netbird-watcher -L 2>&1 | tail -50
```

Expected: test passes — timer active, messages delivered, last-event-id written, idempotent second run.

- [ ] **Step 4: Commit**

```bash
git add core/os/modules/nixpi-netbird-watcher.nix core/os/modules/collab.nix
git commit -m "feat(netbird): add nixpi-netbird-watcher timer + module"
```

---

## Task 6: Enable NetBird SSH and DNS in `network.nix`

**Files:**
- Modify: `core/os/modules/network.nix`

- [ ] **Step 1: Enable NetBird SSH daemon**

In the NetBird service block (after line 81), add:

```nix
services.netbird.clients.default.config.SSHAllowed =
  lib.mkIf config.nixpi.netbird.ssh.enable true;
```

- [ ] **Step 2: Add systemd-resolved DNS forwarding for bloom.local**

After the `services.fail2ban` block, add:

```nix
# Forward cfg.netbird.dns.domain to NetBird's local DNS forwarder.
# Domains=~bloom.local scopes this DNS server to bloom.local queries only —
# it is NOT used as a global fallback. Fail-open: if the forwarder is down,
# resolved falls back to upstream for all other domains automatically.
services.resolved.extraConfig = lib.mkIf (config.nixpi.netbird.apiTokenFile != null) ''
  DNS=127.0.0.1:${toString config.nixpi.netbird.dns.localForwarderPort}
  Domains=~${config.nixpi.netbird.dns.domain}
'';
```

- [ ] **Step 3: Add 22022 to exposed ports if NetBird SSH is enabled**

In the `exposedPorts` let binding, add:

```nix
++ lib.optionals (config.nixpi ? netbird && config.nixpi.netbird.ssh.enable) [ 22022 ]
```

- [ ] **Step 4: Verify evaluation**

```bash
nix eval .#nixosConfigurations.desktop.config.services.netbird.clients.default.config.SSHAllowed
```

Expected: `true`

- [ ] **Step 5: Commit**

```bash
git add core/os/modules/network.nix
git commit -m "feat(netbird): enable NetBird SSH daemon and bloom.local DNS forwarding"
```

---

## Task 7: Wire Wizard Steps in `firstboot.nix`

**Files:**
- Modify: `core/os/modules/firstboot.nix`

- [ ] **Step 1: Add the NetBird API token bootstrap helper**

In the `let` block alongside the other `bootstrapAction` definitions, add:

```nix
bootstrapNetbirdProvisioner = bootstrapAction "netbird-provisioner" "/run/current-system/sw/bin/systemctl";
bootstrapWriteNetbirdToken = pkgs.writeShellScriptBin "nixpi-bootstrap-write-netbird-token" ''
  set -euo pipefail
  if [ -f "${systemReadyFile}" ]; then
    echo "NixPI bootstrap access is disabled after setup completes" >&2
    exit 1
  fi
  token="''${1:-}"
  if [ -z "$token" ]; then
    echo "usage: nixpi-bootstrap-write-netbird-token <token>" >&2
    exit 1
  fi
  install -d -m 0700 "${stateDir}/secrets"
  printf '%s' "$token" > "${stateDir}/secrets/netbird-api-token"
  chmod 0600 "${stateDir}/secrets/netbird-api-token"
  echo "NetBird API token saved."
'';
bootstrapCreateNetworkActivityRoom = pkgs.writeShellScriptBin "nixpi-bootstrap-create-network-activity-room" ''
  set -euo pipefail
  if [ -f "${systemReadyFile}" ]; then
    echo "NixPI bootstrap access is disabled after setup completes" >&2
    exit 1
  fi
  # Register the netbird-watcher bot account via registration shared secret
  hostname="$(${pkgs.inetutils}/bin/hostname)"
  token_file="${stateDir}/secrets/matrix-registration-shared-secret"
  if [ ! -f "$token_file" ]; then
    echo "Matrix registration secret not found; skipping bot account creation" >&2
    exit 0
  fi
  reg_token="$(tr -d '\n' < "$token_file")"
  matrix_port="${toString config.nixpi.matrix.port}"
  bot_user="netbird-watcher"
  bot_pass="$(${pkgs.openssl}/bin/openssl rand -hex 16)"

  # Register bot account
  ${pkgs.curl}/bin/curl -sf -X POST "http://127.0.0.1:$matrix_port/_matrix/client/v3/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$bot_user\",\"password\":\"$bot_pass\",\"auth\":{\"type\":\"m.login.registration_token\",\"token\":\"$reg_token\"}}" \
    > /dev/null || true

  # Login to get access token
  access_token="$(${pkgs.curl}/bin/curl -sf -X POST "http://127.0.0.1:$matrix_port/_matrix/client/v3/login" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"$bot_user\"},\"password\":\"$bot_pass\"}" \
    | ${pkgs.jq}/bin/jq -r '.access_token')"

  # Save bot token for watcher service
  install -d -m 0700 "${stateDir}/netbird-watcher"
  printf '%s' "$access_token" > "${stateDir}/netbird-watcher/matrix-token"
  chmod 0600 "${stateDir}/netbird-watcher/matrix-token"

  # Create #network-activity room
  ${pkgs.curl}/bin/curl -sf -X POST "http://127.0.0.1:$matrix_port/_matrix/client/v3/createRoom" \
    -H "Authorization: Bearer $access_token" \
    -H "Content-Type: application/json" \
    -d "{\"room_alias_name\":\"network-activity\",\"name\":\"Network Activity\",\"topic\":\"NetBird peer connection events\",\"preset\":\"private_chat\"}" \
    > /dev/null || true

  echo ""
  echo "Network activity room created: #network-activity:$hostname"
  echo "Future peer connections, logins, and policy changes will appear there."
'';
```

- [ ] **Step 2: Add the new scripts to `environment.systemPackages`**

```nix
bootstrapNetbirdProvisioner
bootstrapWriteNetbirdToken
bootstrapCreateNetworkActivityRoom
```

- [ ] **Step 3: Add sudo rules**

Inside the `security.sudo.extraRules` commands list:

```nix
{ command = "/run/current-system/sw/bin/nixpi-bootstrap-write-netbird-token *";    options = [ "NOPASSWD" ]; }
{ command = "/run/current-system/sw/bin/nixpi-bootstrap-create-network-activity-room"; options = [ "NOPASSWD" ]; }
{ command = "/run/current-system/sw/bin/nixpi-bootstrap-netbird-provisioner start nixpi-netbird-provisioner.service"; options = [ "NOPASSWD" ]; }
```

- [ ] **Step 4: Verify evaluation**

```bash
nix eval .#nixosConfigurations.desktop.config.environment.systemPackages --apply 'map (p: p.name)' 2>/dev/null | grep -o 'nixpi-bootstrap-write-netbird-token[^"]*' | head -3
```

Expected: package name appears.

- [ ] **Step 5: Commit**

```bash
git add core/os/modules/firstboot.nix
git commit -m "feat(netbird): add wizard steps for API token, provisioner, and bot account"
```

---

## Task 8: Extend E2E Test

**Files:**
- Modify: `tests/nixos/nixpi-e2e.nix`

- [ ] **Step 1: Add checks after the `services` loop**

Add the following after the existing service verification block (after line 109 in current file):

```python
# NetBird watcher timer should be present (even without apiTokenFile configured)
# The timer is registered; it only activates when apiTokenFile is non-null.
nixpi.succeed("systemctl list-timers --all | grep -q 'nixpi-netbird-watcher' || true")

# If provisioner ran (token was configured), verify it completed
provisioner_state = nixpi.succeed(
    "systemctl show -p SubState --value nixpi-netbird-provisioner.service 2>/dev/null || echo skipped"
).strip()
print(f"Provisioner state: {provisioner_state}")

# Verify #network-activity room exists (created during wizard if apiTokenFile was set)
# In e2e, check via Matrix API
room_check = nixpi.succeed(
    "curl -sf http://127.0.0.1:6167/_matrix/client/v3/directory/room/%23network-activity%3Api"
    " -H 'Content-Type: application/json' 2>/dev/null || echo 'not-created'"
).strip()
print(f"network-activity room: {room_check}")

# Verify @netbird-watcher account exists in Continuwuity (if bot was provisioned)
watcher_check = nixpi.succeed(
    "curl -sf http://127.0.0.1:6167/_matrix/client/v3/profile/%40netbird-watcher%3Api"
    " 2>/dev/null || echo 'not-provisioned'"
).strip()
print(f"netbird-watcher account: {watcher_check}")

print("  - NetBird provisioner and watcher services registered")
```

- [ ] **Step 2: Run the e2e test to confirm nothing regressed**

```bash
nix build .#checks.x86_64-linux.nixpi-e2e -L 2>&1 | tail -30
```

Expected: all existing assertions pass, new NetBird lines print.

- [ ] **Step 3: Commit**

```bash
git add tests/nixos/nixpi-e2e.nix
git commit -m "test(netbird): extend e2e test with provisioner/watcher checks"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run all three NetBird-related tests**

```bash
nix build \
  .#checks.x86_64-linux.nixpi-netbird-provisioner \
  .#checks.x86_64-linux.nixpi-netbird-watcher \
  .#checks.x86_64-linux.nixpi-e2e \
  -L 2>&1 | tail -60
```

Expected: all three pass.

- [ ] **Step 2: Run the full options evaluation check**

```bash
nix eval .#nixosConfigurations.desktop.config.nixpi.netbird --apply builtins.attrNames
```

Expected: `[ "apiEndpoint" "apiTokenFile" "dns" "groups" "policies" "postureChecks" "setupKeys" "ssh" ]`

- [ ] **Step 3: Run smoke tests to check nothing broke**

```bash
nix build .#checks.x86_64-linux.smoke-matrix .#checks.x86_64-linux.smoke-firstboot .#checks.x86_64-linux.smoke-security -L 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat(netbird): complete NetBird deep integration

- nixpi.netbird.* options for declarative cloud state
- netbird-provisioner: converges groups, setup keys, posture checks, policies, DNS
- nixpi-netbird-watcher: polls events and posts to #network-activity Matrix room
- network.nix: NetBird SSH daemon + bloom.local DNS forwarding
- firstboot.nix: wizard steps for API token, provisioner run, bot account
- Tests: nixpi-netbird-provisioner, nixpi-netbird-watcher, e2e extension"
```

---

## Manual Acceptance Checklist

After deployment to a real Pi with a NetBird cloud account:

- [ ] Run `nixpi-bootstrap-write-netbird-token <token>` during wizard
- [ ] Provisioner streams step-by-step output; all groups/policies created
- [ ] Pi joins mesh via `bloom-pi` setup key → automatically lands in `bloom-pi` group
- [ ] Admin laptop joins via `admin-device` setup key → in `bloom-devices` + `admins`
- [ ] `ssh pi@bloom.local` resolves via NetBird DNS and connects via port 22022
- [ ] `#network-activity` room shows peer enrollment event
- [ ] After 60s, watcher posts any further events to the Matrix room
- [ ] Re-run provisioner (`systemctl start nixpi-netbird-provisioner`) → no duplicate resources created
