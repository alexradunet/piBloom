# Phase 3 — DNS-backed HTTPS cutover

Date: 2026-05-19

## Goal

Complete the public edge cutover by serving `nazar.studio` over trusted HTTPS from the `edge` NixOS VM behind Proxmox DNAT.

## Starting state

Phase 2 had already established:

```text
Public IP: 167.235.12.22
Public bridge: vmbr0
Private bridge: vmbr1 = 10.10.10.1/24
Edge VM: 100
Edge private IP: 10.10.10.10
Public 80/tcp -> Proxmox DNAT -> 10.10.10.10:80
Public 443/tcp -> Proxmox DNAT -> 10.10.10.10:443
Caddy: active on edge
```

Before this phase, Caddy used raw-port placeholder virtual hosts:

```nix
virtualHosts.":80".extraConfig = ''
  respond "Nazar edge is online\n"
'';
virtualHosts.":443".extraConfig = ''
  tls internal
  respond "Nazar edge is online\n"
'';
```

That was sufficient for HTTP forwarding verification, but not for public trusted HTTPS.

## DNS records verified

The domain is managed at Gandi. Public recursive resolvers now see both apex and `www` pointed at the Proxmox public IP.

Cloudflare DNS-over-HTTPS:

```bash
curl -fsS 'https://cloudflare-dns.com/dns-query?name=nazar.studio&type=A' \
  -H 'accept: application/dns-json'
```

Result:

```json
{"name":"nazar.studio","type":1,"TTL":300,"data":"167.235.12.22"}
```

Google DNS-over-HTTPS:

```bash
curl -fsS 'https://dns.google/resolve?name=nazar.studio&type=A'
curl -fsS 'https://dns.google/resolve?name=www.nazar.studio&type=A'
```

Results:

```text
nazar.studio      A 167.235.12.22 TTL 300
www.nazar.studio  A 167.235.12.22 TTL 300
```

No `AAAA` record is configured or required in the current IPv4-only edge path.

## Caddy configuration change

Modified:

```text
/home/alex/repos/ownloom/infra/hosts/edge/configuration.nix
```

Replaced the raw-port/internal-TLS placeholders with named virtual hosts:

```nix
services.caddy = {
  enable = true;
  virtualHosts."nazar.studio".extraConfig = ''
    respond "Nazar edge is online\n"
  '';
  virtualHosts."www.nazar.studio".extraConfig = ''
    redir https://nazar.studio{uri} permanent
  '';
};
```

Expected behavior:

- `http://nazar.studio/` redirects to `https://nazar.studio/`.
- `https://nazar.studio/` returns the edge health response.
- `https://www.nazar.studio/` permanently redirects to `https://nazar.studio/`.
- Caddy obtains and renews public certificates automatically via ACME.

## Validation before deploy

Command:

```bash
cd /home/alex/repos/ownloom/infra
nix flake check --no-build
```

Result:

```text
all checks passed!
```

## Deployment command used

```bash
cd /home/alex/repos/ownloom/infra

NIX_SSHOPTS='-o ProxyJump=proxmox -i /home/alex/.ssh/proxmox_alex_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' \
  nixos-rebuild switch \
  --flake .#edge \
  --target-host alex@10.10.10.10 \
  --sudo \
  --no-reexec
```

New current system after deploy:

```text
/nix/store/qjahbmr82h0pdky1l0p4qmcdb1v6sb9m-nixos-system-edge-25.11.20260514.d7a713c
```

## Verification results

Timestamp: `2026-05-19T14:21:46Z`

### Public HTTP apex redirect

Command:

```bash
curl -fsSI --max-time 15 http://nazar.studio/
```

Result:

```text
HTTP/1.1 308 Permanent Redirect
Location: https://nazar.studio/
Server: Caddy
```

### Public HTTPS apex

Command:

```bash
curl -fsSI --max-time 30 https://nazar.studio/
curl -fsS --max-time 30 https://nazar.studio/
```

Result:

```text
HTTP/2 200
Server: Caddy
Nazar edge is online\n
```

Because this command used normal `curl` without `-k`, the certificate chain was trusted by the client.

### Public HTTPS www redirect

Command:

```bash
curl -fsSI --max-time 30 https://www.nazar.studio/
```

Result:

```text
HTTP/2 301
Location: https://nazar.studio/
Server: Caddy
```

### Edge service health

Command:

```bash
ssh -i /home/alex/.ssh/proxmox_alex_ed25519 \
  -o IdentitiesOnly=yes \
  -J proxmox \
  alex@10.10.10.10 \
  'systemctl is-active caddy && systemctl status caddy --no-pager -l | sed -n "1,30p"'
```

Result:

```text
active
caddy.service: active (running)
ExecReload ... caddy reload ... status=0/SUCCESS
```

## Rollback

To roll back to the Phase 2 placeholder health config, restore the raw-port virtual hosts in `/home/alex/repos/ownloom/infra/hosts/edge/configuration.nix`:

```nix
services.caddy = {
  enable = true;
  virtualHosts.":80".extraConfig = ''
    respond "Nazar edge is online\n"
  '';
  virtualHosts.":443".extraConfig = ''
    tls internal
    respond "Nazar edge is online\n"
  '';
};
```

Then redeploy:

```bash
cd /home/alex/repos/ownloom/infra

NIX_SSHOPTS='-o ProxyJump=proxmox -i /home/alex/.ssh/proxmox_alex_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' \
  nixos-rebuild switch \
  --flake .#edge \
  --target-host alex@10.10.10.10 \
  --sudo \
  --no-reexec
```

If the goal is to remove public exposure entirely, also remove the `prerouting` DNAT for `80` and `443` from Proxmox `/etc/nftables.conf`, validate with `nft -c -f /etc/nftables.conf`, and reload `nftables`.

## Completion state

Completed:

- [x] `nazar.studio` DNS A record points to `167.235.12.22`.
- [x] `www.nazar.studio` DNS A record points to `167.235.12.22`.
- [x] Caddy uses named virtual hosts for apex and `www`.
- [x] `nix flake check --no-build` passes.
- [x] Deployment to `edge` succeeds.
- [x] `http://nazar.studio/` redirects to HTTPS.
- [x] `https://nazar.studio/` returns the Nazar edge health response with trusted TLS.
- [x] `https://www.nazar.studio/` redirects to apex.
- [x] Caddy remains active after reload.
- [x] Rollback path is documented.

## Next recommended phase

With the public edge now live, the next phase should add the first private management service behind the edge strategy. Good candidates:

1. Headscale or another private access layer for management-plane services.
2. Forgejo/Git service, with public HTTPS through Caddy and a deliberate decision about Git SSH exposure.
3. Monitoring/logging for Proxmox and edge before adding more guests.
