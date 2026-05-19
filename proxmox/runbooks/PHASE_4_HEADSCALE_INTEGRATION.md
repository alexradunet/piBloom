# Phase 4 — Headscale private access layer

Date: 2026-05-19

## Goal

Deploy Headscale as Nazar's self-hosted Tailscale control plane so operator devices can join a private tailnet and reach internal management services without exposing them publicly.

This implements the decision from:

```text
proxmox/runbooks/PHASE_4_PRIVATE_ACCESS_RESEARCH.md
```

## Current status

Implemented on 2026-05-19:

```text
Headscale VM: 101
Hostname: headscale
Private IP: 10.10.10.11/24 on vmbr1
Gateway: 10.10.10.1
CPU: 1 vCPU
RAM: 1024 MiB
Disk: 16 GiB qcow2 on Proxmox local storage
OS: NixOS
Config source: /home/alex/repos/ownloom/infra#headscale
State: /var/lib/headscale
Database: SQLite, /var/lib/headscale/db.sqlite
Public hostname intended: https://headscale.nazar.studio
```

Public DNS for `headscale.nazar.studio` was **not present** at deployment time, so the internal service and Caddy route are configured, but public trusted HTTPS will only become usable after the DNS record below is added.

## Architecture

```text
Public internet
  |
  | 80/tcp, 443/tcp
  v
Proxmox host: 167.235.12.22
  |
  | nft DNAT public 80/443 -> 10.10.10.10
  v
edge VM 100: 10.10.10.10, NixOS + Caddy
  |
  | reverse_proxy headscale.nazar.studio -> 10.10.10.11:8080
  v
headscale VM 101: 10.10.10.11, NixOS + Headscale
  |
  +-- future tailnet clients:
      - operator laptop
      - optional edge/subnet-router node for 10.10.10.0/24
      - optional Proxmox host node
      - future Git/monitoring VMs
```

Public exposure remains:

```text
22/tcp   Proxmox SSH
80/tcp   Caddy HTTP redirect / ACME
443/tcp  Caddy HTTPS
```

Headscale listens on `10.10.10.11:8080` inside the private Proxmox service network. It is not DNATed directly from the public internet.

## DNS required

Add this public DNS record in Gandi:

```text
Type: A
Name: headscale
Value: 167.235.12.22
TTL: 300
```

Verification command:

```bash
curl -fsS 'https://cloudflare-dns.com/dns-query?name=headscale.nazar.studio&type=A' \
  -H 'accept: application/dns-json'
```

Expected answer after propagation:

```json
{"name":"headscale.nazar.studio","type":1,"data":"167.235.12.22"}
```

At deployment time, Cloudflare returned NXDOMAIN for `headscale.nazar.studio`, and Caddy logged ACME failures for that hostname. That is expected until the DNS record exists.

## NixOS configuration

Headscale host configuration:

```text
infra/hosts/headscale/configuration.nix
```

Important settings:

```nix
services.headscale = {
  enable = true;
  address = "0.0.0.0";
  port = 8080;

  settings = {
    server_url = "https://headscale.nazar.studio";

    database = {
      type = "sqlite";
      sqlite.path = "/var/lib/headscale/db.sqlite";
    };

    dns = {
      magic_dns = true;
      base_domain = "tailnet.nazar.studio";
      override_local_dns = false;
      nameservers.global = [ "1.1.1.1" "9.9.9.9" ];
      extra_records = [
        { name = "proxmox.tailnet.nazar.studio"; type = "A"; value = "10.10.10.1"; }
        { name = "edge.tailnet.nazar.studio"; type = "A"; value = "10.10.10.10"; }
        { name = "headscale.tailnet.nazar.studio"; type = "A"; value = "10.10.10.11"; }
      ];
    };
  };
};
```

Edge Caddy integration:

```text
infra/hosts/edge/configuration.nix
```

```nix
services.caddy.virtualHosts."headscale.nazar.studio".extraConfig = ''
  reverse_proxy 10.10.10.11:8080
'';
```

## Deployment commands used

Build the Headscale qcow image locally:

```bash
cd /home/alex/repos/ownloom/infra
nix build .#headscale-qcow --print-out-paths
```

Copy the generated qcow2 to Proxmox:

```bash
scp -i /home/alex/.ssh/proxmox_root_ed25519 \
  -o IdentitiesOnly=yes \
  /nix/store/4ng9rgpyc65ggsaq5q2l8qwy369fk08f-nixos-disk-image/nixos.qcow2 \
  root@167.235.12.22:/var/lib/vz/template/iso/headscale-nixos.qcow2
```

Create/import/start VM 101:

```bash
ssh proxmox-root '
qm create 101 \
  --name headscale \
  --memory 1024 \
  --cores 1 \
  --cpu host \
  --ostype l26 \
  --net0 virtio,bridge=vmbr1 \
  --agent enabled=1 \
  --serial0 socket \
  --vga std \
  --onboot 1 \
  --description "NixOS Headscale coordination server. Private IP 10.10.10.11 on vmbr1. Managed by /home/alex/repos/ownloom/infra#headscale."

qm importdisk 101 /var/lib/vz/template/iso/headscale-nixos.qcow2 local --format qcow2
qm set 101 --virtio0 local:101/vm-101-disk-0.qcow2 --boot order=virtio0
qm resize 101 virtio0 16G
qm start 101
'
```

Deploy the updated edge Caddy route:

```bash
cd /home/alex/repos/ownloom/infra

NIX_SSHOPTS='-o ProxyJump=proxmox -i /home/alex/.ssh/proxmox_alex_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' \
  nixos-rebuild switch \
  --flake .#edge \
  --target-host alex@10.10.10.10 \
  --sudo \
  --no-reexec
```

## Bootstrap user and preauth key

A Headscale user was created:

```text
ID: 1
Username: alex
```

A reusable preauth key was generated with a 24 hour expiration. Do not commit preauth keys to Git. Generate a fresh key when enrolling a client:

```bash
ssh -i /home/alex/.ssh/proxmox_alex_ed25519 \
  -o IdentitiesOnly=yes \
  -J proxmox \
  alex@10.10.10.11 \
  'sudo headscale preauthkeys create --user 1 --reusable --expiration 24h'
```

## Client enrollment

After `headscale.nazar.studio` resolves publicly and Caddy has issued a trusted certificate, install/start Tailscale on the client and run:

```bash
tailscale up \
  --login-server=https://headscale.nazar.studio \
  --auth-key=<fresh-headscale-preauth-key>
```

Then verify on the Headscale VM:

```bash
ssh -i /home/alex/.ssh/proxmox_alex_ed25519 \
  -o IdentitiesOnly=yes \
  -J proxmox \
  alex@10.10.10.11 \
  'sudo headscale nodes list'
```

## Verification results

Timestamp: `2026-05-19T15:04:41Z`

### Proxmox VM state

Command:

```bash
ssh proxmox-root 'qm list; qm agent 101 ping; qm guest cmd 101 network-get-interfaces'
```

Result summary:

```text
VM 101 headscale running, 1024 MiB RAM, 16.00 GiB boot disk
QEMU guest agent: ok
ens18: 10.10.10.11/24
```

### Headscale service health

Command:

```bash
ssh -i /home/alex/.ssh/proxmox_alex_ed25519 \
  -o IdentitiesOnly=yes \
  -J proxmox \
  alex@10.10.10.11 \
  'systemctl is-active headscale; curl -sS http://127.0.0.1:8080/health'
```

Result:

```text
active
{"status":"pass"}
```

### Private network reachability

Command:

```bash
ssh proxmox-root 'curl -sS --max-time 5 http://10.10.10.11:8080/health'
```

Result:

```json
{"status":"pass"}
```

### Edge Caddy route

Command:

```bash
ssh proxmox-root 'curl -sSI --max-time 5 -H "Host: headscale.nazar.studio" http://10.10.10.10/health'
```

Result:

```text
HTTP/1.1 308 Permanent Redirect
Location: https://headscale.nazar.studio/health
Server: Caddy
```

The redirect proves Caddy loaded the `headscale.nazar.studio` site. Full HTTPS verification is pending the public DNS record.

## Operations

### Check service

```bash
ssh -i /home/alex/.ssh/proxmox_alex_ed25519 \
  -o IdentitiesOnly=yes \
  -J proxmox \
  alex@10.10.10.11 \
  'systemctl status headscale --no-pager -l'
```

### Check generated server config

NixOS keeps `/etc/headscale/config.yaml` as a minimal CLI config for socket access. The full generated server config is passed directly to the systemd service from the Nix store. To inspect its path:

```bash
ssh -i /home/alex/.ssh/proxmox_alex_ed25519 \
  -o IdentitiesOnly=yes \
  -J proxmox \
  alex@10.10.10.11 \
  'systemctl cat headscale | grep "serve --config"'
```

Do not run plain `headscale configtest` without `-c`; on NixOS that reads the minimal CLI config rather than the full server config.

### List users, keys, and nodes

```bash
ssh -i /home/alex/.ssh/proxmox_alex_ed25519 \
  -o IdentitiesOnly=yes \
  -J proxmox \
  alex@10.10.10.11 \
  'sudo headscale users list; sudo headscale preauthkeys list --user 1; sudo headscale nodes list'
```

### Backup

Back up the Headscale state directory:

```bash
ssh proxmox-root 'tar -C /var/lib/vz -czf /var/lib/vz/headscale-vm101-config-backup.tgz images/101'
ssh -i /home/alex/.ssh/proxmox_alex_ed25519 \
  -o IdentitiesOnly=yes \
  -J proxmox \
  alex@10.10.10.11 \
  'sudo tar -C /var/lib -czf /tmp/headscale-state.tgz headscale'
scp -o ProxyJump=proxmox \
  -i /home/alex/.ssh/proxmox_alex_ed25519 \
  alex@10.10.10.11:/tmp/headscale-state.tgz ./headscale-state.tgz
```

Critical service state is under:

```text
/var/lib/headscale
```

## Rollback

Remove the public Caddy route by deleting this block from `infra/hosts/edge/configuration.nix` and redeploying edge:

```nix
virtualHosts."headscale.nazar.studio".extraConfig = ''
  reverse_proxy 10.10.10.11:8080
'';
```

Stop Headscale VM 101:

```bash
ssh proxmox-root 'qm shutdown 101 --timeout 60 || qm stop 101'
```

Destroy VM 101 only if its state is no longer needed:

```bash
ssh proxmox-root 'qm destroy 101 --purge'
```

## Remaining work

1. Add public DNS record `headscale.nazar.studio A 167.235.12.22` in Gandi.
2. Verify Caddy obtains a trusted certificate:

   ```bash
   curl -fsSI --max-time 30 https://headscale.nazar.studio/health
   curl -fsS --max-time 30 https://headscale.nazar.studio/health
   ```

3. Enroll the operator laptop with a fresh preauth key.
4. Decide the subnet-router node for `10.10.10.0/24`. Recommended next step: enroll `edge` or a tiny dedicated router VM as the subnet router rather than exposing Proxmox UI publicly.
