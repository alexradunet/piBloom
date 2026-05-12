# PaperMC Minecraft VM Runbook

This runbook documents the declarative PaperMC VM in the Nazar mono-repo.

## Current production state

```text
VMID: 110
Proxmox name: minecraft
Guest OS: NixOS 26.05 pre-release from this flake
Service: PaperMC via services.minecraft-server
Paper version: 26.1.2 build 62
Java: OpenJDK 25 headless
NAT IP: 10.10.10.30
Public forwarding: enabled on `nazar` for TCP/25565 and UDP/24454; public DNS for `mc.nazar.studio` still must be an explicit A record to `167.235.12.22`
Service DNS: mc.nazar.studio over NetBird/private access
Client fallback: connect from a NetBird-allowed client or through the host-side NetBird forward
State path: /var/lib/minecraft
Minecraft port: 25565/tcp
Simple Voice Chat port: 24454/udp
Backup job: minecraft-daily, daily 03:40, keep-last=7
```

Runtime world/plugin data is mutable state under `/var/lib/minecraft`. The VM OS and service configuration are declarative in this repository.

## Declarative source

```text
flake.nix
/root/nazar/nix/fleet/vms.nix
/root/minecraft/nix/hosts/minecraft/
/root/nazar/nix/modules/common/*.nix
/root/minecraft/nix/modules/minecraft-papermc.nix
/root/nazar/systemd/minecraft-netbird-forward.service
/root/nazar/scripts/proxmox/minecraft-netbird-forward
/root/nazar/systemd/minecraft-public-forward.service      # public exposure toggle, enabled on nazar for Minecraft only
/root/nazar/scripts/proxmox/minecraft-public-forward      # public exposure toggle, enabled on nazar for Minecraft only
```

Evaluate/build from the Proxmox host, where Nix is installed as tooling only:

```bash
. /etc/profile.d/nix.sh
nix flake check --no-build
nix build .#nixosConfigurations.minecraft.config.system.build.toplevel
nix build .#minecraft-qcow2
```

`result/nixos-minecraft.qcow2` is the generated importable Proxmox disk image.

## Current private access and optional public exposure

The current deployed posture exposes **only Minecraft gameplay traffic publicly**. `minecraft-netbird-forward.service` remains enabled on `nazar` and forwards Minecraft traffic arriving on `wt0` to VM 110 for NetBird clients. `minecraft-public-forward.service` is also enabled and forwards public traffic arriving on `enp0s31f6` to VM 110.

Current private path:

```text
NetBird-allowed client -> nazar wt0:25565/tcp,24454/udp -> 10.10.10.30
mc.nazar.studio        -> 100.124.39.100 in the NetBird/private DNS model
```

Do not point public DNS at `10.10.10.30`; that is the private VM address behind Nazar.

Public hostname access requires pointing `mc.nazar.studio` at the public Nazar IP. Only the game and voice-chat ports should be forwarded publicly:

```text
25565/tcp  Minecraft Java server
24454/udp  Simple Voice Chat
```

Keep SSH and administration private over NetBird.

If public exposure is enabled, Hetzner Robot firewall must also allow inbound TCP 25565 and UDP 24454 to the host. Use an unrestricted TCP rule for 25565; do **not** restrict TCP flags to only `syn`, because Minecraft needs the full TCP connection after the initial SYN.

```text
Name:              minecraft
Version:           IPv4
Protocol:          TCP
Source IP:         0.0.0.0/0
Destination IP:    167.235.12.22
Source port:       any
Destination port:  25565
TCP flags:         any / empty / unrestricted
Action:            accept
```

```text
Name:              minecraft-voice
Version:           IPv4
Protocol:          UDP
Source IP:         0.0.0.0/0
Destination IP:    167.235.12.22
Source port:       any
Destination port:  24454
Action:            accept
```

## STOP before destructive operations

Do not run destructive Proxmox commands until the user gives final confirmation in the live session.

Destructive commands include:

```bash
qm stop 110
qm destroy 110 --purge
```

## Create VM 110 from qcow2

After final confirmation only:

```bash
qm create 110 \
  --name minecraft \
  --memory 4096 \
  --balloon 1024 \
  --cores 2 \
  --cpu host \
  --numa 1 \
  --machine q35 \
  --bios seabios \
  --ostype l26 \
  --scsihw virtio-scsi-single \
  --agent enabled=1 \
  --serial0 socket \
  --vga std \
  --tablet 1 \
  --net0 virtio=BC:24:11:0A:4B:10,bridge=vmbr1

qm importdisk 110 result/nixos-minecraft.qcow2 local --format qcow2
qm set 110 --virtio0 local:110/vm-110-disk-0.qcow2,discard=on
qm set 110 --boot 'order=virtio0'
qm resize 110 virtio0 50G
qm set 110 --onboot 1
qm set 110 --startup order=30
qm start 110
```

The NixOS config uses the static IP `10.10.10.30`. The image grows the root partition on first boot.

Do not add `firewall=1` to `net0` unless matching Proxmox VM firewall policy is also declared/tested. During initial deployment, enabling the Proxmox NIC firewall blocked VM outbound internet and prevented PaperMC from downloading its Mojang runtime jar.

## Host port forwards on the Proxmox host

The current NetBird-private host-side service is:

```text
/root/nazar/systemd/minecraft-netbird-forward.service
/root/nazar/scripts/proxmox/minecraft-netbird-forward
```

It should be installed/enabled on `nazar` for private Minecraft access from allowed NetBird peers.

The optional public host-side service is:

```text
/root/nazar/systemd/minecraft-public-forward.service
/root/nazar/scripts/proxmox/minecraft-public-forward
```

Install the public service on `nazar` only after deciding to expose the server publicly:

```bash
install -m 0755 /root/nazar/scripts/proxmox/minecraft-public-forward /usr/local/sbin/minecraft-public-forward
install -m 0644 /root/nazar/systemd/minecraft-public-forward.service /etc/systemd/system/minecraft-public-forward.service
systemctl daemon-reload
systemctl enable --now minecraft-public-forward.service
```

The Proxmox host firewall should also explicitly allow only the public gameplay ports on `enp0s31f6` while keeping the default-deny policy for unrelated public/admin ports:

```text
IN ACCEPT -i enp0s31f6 -p tcp -dport 25565
IN ACCEPT -i enp0s31f6 -p udp -dport 24454
```

Validate host forwarding and counters:

```bash
iptables -t nat -L PREROUTING -n -v --line-numbers | grep -E '25565|24454'
iptables -L FORWARD -n -v --line-numbers | grep -E '25565|24454'
```

For UDP, a generic online UDP probe may report timeout because UDP is connectionless and Simple Voice Chat expects its own ping packet. It should still increment Nazar's public UDP DNAT/FORWARD counters if the Hetzner Robot/provider firewall allows the packet to reach the host. If UDP `51820` probes increment but UDP `24454` does not, fix the Hetzner Robot UDP `24454` rule.

Rollback public exposure:

```bash
systemctl disable --now minecraft-public-forward.service
rm -f /etc/systemd/system/minecraft-public-forward.service /usr/local/sbin/minecraft-public-forward
systemctl daemon-reload
```

## Validate guest service

```bash
qm status 110
qm agent 110 ping
ssh alex@minecraft systemctl status minecraft-server --no-pager
ssh alex@minecraft sudo journalctl -u minecraft-server -n 100 --no-pager
```

Minecraft console input through the NixOS FIFO:

```bash
echo "say hello from NixOS" | ssh alex@minecraft 'sudo tee /run/minecraft-server.stdin >/dev/null'
```

From a Minecraft Java client on an allowed NetBird peer:

```text
mc.nazar.studio
```

The public direct fallback is:

```text
167.235.12.22:25565
```

Until public DNS has an explicit `mc.nazar.studio A 167.235.12.22` record, use the direct IP fallback outside NetBird.

Use Minecraft Java Edition. Bedrock/mobile/console clients will not connect to this Paper Java server without an additional compatibility proxy such as Geyser/Floodgate, which is not currently deployed.

## Optional public validation

Use this section only if public exposure is intentionally enabled. Normal deployed state is NetBird-private.

DNS checks:

```bash
dig +short mc.nazar.studio A @1.1.1.1
dig +short mc.nazar.studio A @8.8.8.8
dig +short mc.nazar.studio A @9.9.9.9
```

Expected:

```text
167.235.12.22
```

Port-forward counters on Nazar:

```bash
iptables -t nat -L PREROUTING -n -v --line-numbers | grep 25565
iptables -L FORWARD -n -v --line-numbers | grep 25565
```

External status checks:

```bash
curl -fsS https://api.mcstatus.io/v2/status/java/mc.nazar.studio
curl -fsS https://api.mcsrvstat.us/3/mc.nazar.studio
```

Expected result when public exposure is enabled:

```text
online: true
version: Paper 26.1.2
protocol: 775
motd: Nazar Minecraft
players: 0/10 or current count
```

If direct IP works but `mc.nazar.studio` says "Unknown host" in the Minecraft client, this is client-side DNS cache/propagation. Use `167.235.12.22:25565` temporarily, restart the Minecraft launcher/client, flush DNS, or switch the client/router DNS to `1.1.1.1` or `8.8.8.8`.

## Configuration changes

Server settings and the pinned PaperMC artifact live in:

```text
/root/nazar/nix/fleet/vms.nix
/root/minecraft/nix/modules/minecraft-papermc.nix
```

PaperMC is pinned declaratively with a URL and SHA-256 hash. The custom wrapper uses OpenJDK 25 because Paper/Minecraft 26.1 and newer require Java 25 or above. Updating means changing `paperVersion`, `paperUrl`, and `paperHash` in `/root/nazar/nix/fleet/vms.nix`, then rebuilding from the flake.

Current defaults:

```text
PaperMC package: fixed-output Paper jar from the PaperMC Downloads Service
Paper version: 26.1.2 build 62
Java: OpenJDK 25 headless
RAM default: -Xms1G -Xmx2500M unless overridden by `/root/nazar/nix/fleet/vms.nix`
max players: 10
world seed for new worlds: 298649991203052898
operator/admin: Cicorrel (`4e885f75-ebd3-46e6-b716-8bcec8e19534`), permission level 4
whitelist: enabled when declarative whitelist entries/operators exist; operators are included by default
RCON: supported on TCP/25575 with password loaded from a systemd credential, not the Nix store
state: /var/lib/minecraft
```

Whitelist is declarative. Add Minecraft username-to-UUID entries under `fleet.vms.minecraft.minecraft.whitelist`. Operators are included in the whitelist by default via `whitelistOperators = true`, and the module automatically sets `white-list=true` when whitelist/operator entries exist. Set `enableWhitelist = false` only if the server should intentionally allow all authenticated Minecraft accounts.

Operators/admins are also declarative. Add entries under `fleet.vms.minecraft.minecraft.operators`:

```nix
operators = [
  {
    name = "Cicorrel";
    uuid = "4e885f75-ebd3-46e6-b716-8bcec8e19534";
    level = 4;
    bypassesPlayerLimit = true;
  }
];
```

The module writes `/var/lib/minecraft/ops.json` on service start and sets `op-permission-level` in `server.properties`.

Game rules can be declared under `fleet.vms.minecraft.minecraft.gameRules`. Current rule:

```nix
gameRules = {
  keep_inventory = true;
};
```

The module sends declared game rules through `/run/minecraft-server.stdin` shortly after the server starts. This keeps player inventories on death without needing a graves plugin. For current Paper/Minecraft versions, use snake_case rule names such as `keep_inventory`.

The world seed is declarative via `levelSeed` in `/root/nazar/nix/fleet/vms.nix`, which writes `level-seed` in `server.properties`. Minecraft only uses `level-seed` when creating a new world. Changing it does not rewrite an already-generated world; to fully use a new seed, first back up and then intentionally reset the mutable world directories under `/var/lib/minecraft`.

World reset record:

```text
2026-05-10T21:35:58Z: reset `/var/lib/minecraft/world` so seed 298649991203052898 is active.
Backup: /var/backups/minecraft/world-reset-20260510T213558Z.tar.zst
SHA-256: 7db63bd0e0c5d442ee9285e1b8a7a7e6a3447b6b7a13ea6ce9f8833f6d9aa425
Also reset squaremap generated tiles/data so the map starts fresh for the new world.
Verified server log: Seed: [298649991203052898]
```

## RCON

The module supports private RCON without putting the RCON password in the Nix store:

```nix
minecraft = {
  rcon = {
    enable = true;
    port = 25575;
    passwordFile = "/run/secrets/minecraft-rcon-password";
    broadcastToOps = false;
  };
};
```

The password is loaded through `systemd.services.minecraft-server.serviceConfig.LoadCredential` and injected into `server.properties` immediately before startup.

For access via `mc.nazar.studio` over NetBird, Nazar must forward TCP/25575 from the host NetBird interface (`wt0`) to VM 110 (`10.10.10.30:25575`). Do not expose TCP/25575 on the public interface. The VM firewall opens the RCON TCP port when RCON is enabled, but public reachability still depends on the host-side forwarding policy.

Example client usage from a NetBird-allowed client:

```bash
mcrcon -H mc.nazar.studio -P 25575 -p '<password>' list
```

## Declarative PaperMC plugins

PaperMC plugin jars can be managed declaratively from `/root/nazar/nix/fleet/vms.nix` with `fleet.vms.minecraft.minecraft.plugins`.

Each plugin is a fixed-output download pinned by URL and SHA-256 hash:

```nix
minecraft = {
  plugins = [
    {
      name = "ViaVersion.jar";
      url = "https://example.invalid/ViaVersion.jar";
      hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    }
  ];
};
```

Get the Nix hash for a plugin jar with:

```bash
url='https://example.invalid/plugin.jar'
nix store prefetch-file --json --hash-type sha256 "$url" | jq -r .hash
```

Deployment behavior:

Currently pinned plugins:

```text
SimpleVoiceChat bukkit-2.6.17  -> SimpleVoiceChat.jar
ToolStats 2.0.4                -> ToolStats.jar
squaremap 1.3.13               -> squaremap.jar
SimpleTPA 2.0                  -> SimpleTPA.jar
Timberella 1.2.0               -> Timberella.jar
Chunky 1.5.3                   -> Chunky.jar
```

Plugin-generated configuration files can also be pinned when they are important for reproducibility:

```nix
minecraft = {
  pluginConfigs."voicechat/voicechat-server.properties" = ''
    port=24454
    bind_address=
    voice_host=
    allow_pings=true
  '';
};
```

Paths are relative to `/var/lib/minecraft/plugins/` and must not contain absolute, dot-prefixed, or `..` components. Only declare configs you intentionally want Nix to overwrite on every service start; leave plugin runtime data mutable.

Deployment behavior:

- Plugin jars are fetched into the Nix store.
- Nix-managed jars are symlinked into `/var/lib/minecraft/plugins/` before the server starts.
- The manifest `/var/lib/minecraft/plugins/.nix-managed-plugins` tracks only Nix-managed plugin symlinks.
- Plugin config/data directories under `/var/lib/minecraft/plugins/` remain mutable state and must be backed up unless explicitly managed through `pluginConfigs`.
- Removing a plugin from the Nix list removes the old Nix-managed symlink on the next service start.
- Manual plugin jars are not removed unless they reuse the same filename as a Nix-managed plugin.

Prefer stable release jar URLs from Hangar, Modrinth, GitHub releases, or the plugin's official download source. Disable plugin auto-updaters where possible so the running plugin code remains the Nix-pinned jar.

Simple Voice Chat notes:

- Players need the Simple Voice Chat client mod installed on their Minecraft client.
- The server uses UDP `24454` by default.
- The checked-in Proxmox forwarding script forwards UDP `24454` to VM 110.
- The VM NixOS firewall opens UDP `24454` when `voiceChatPort = 24454` is set in `/root/nazar/nix/fleet/vms.nix`.
- `voice_host=` can stay empty for this direct, no-proxy setup; clients then use the Minecraft server address they connected to. Set `voice_host` only if clients must be told a different hostname/port.
- The plugin's `allow_pings=true` setting lets the official `svc ping <host>:24454` CLI perform an application-level UDP check.
- If voice chat does not connect but normal Minecraft does, check the Hetzner Robot UDP 24454 firewall rule and the generated plugin config under `/var/lib/minecraft/plugins/voicechat/`.

Apply updates to the running VM from Nazar with the fleet orchestrator:

```bash
. /etc/profile.d/nix.sh
cd /root/nazar
nix flake check --no-build
nix run .#deploy-minecraft
ssh alex@minecraft 'systemctl --failed --no-pager; systemctl is-active minecraft-server'
```

The normal `nixosConfigurations.minecraft` target is intentionally aligned with the deployed qcow2/legacy-GRUB VM shape so deploy-rs/nixos-rebuild switches work. The separate `minecraftImage` target remains the importable qcow2 builder. If deploy-rs is unavailable, a manual `nixos-rebuild --target-host alex@10.10.10.30 --use-remote-sudo` remains a fallback.

## Backups

Back up the full VM and/or at minimum `/var/lib/minecraft`.

Current Proxmox backup job:

```text
id: minecraft-daily
schedule: 03:40
storage: local
mode: snapshot
compression: zstd
prune: keep-last=7
```

The VM module enables a daily `minecraft-save-all-flush.timer` by default at 03:35, five minutes before the documented 03:40 Proxmox backup job. It sends `save-all flush` through `/run/minecraft-server.stdin` when the server is active. Override with:

```nix
minecraft.backupFlush = {
  enable = true;
  onCalendar = "*-*-* 03:35:00";
};
```

Recommended before manual backups:

```bash
echo "save-all flush" | ssh alex@minecraft 'sudo tee /run/minecraft-server.stdin >/dev/null'
```

Document any Proxmox backup job after creation with:

```bash
pvesh get /cluster/backup --output-format yaml
```
