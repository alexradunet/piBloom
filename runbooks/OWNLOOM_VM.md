# OwnLoom VM Runbook

`ownloom` is the private self-evolving personal agent and web app VM.

- VM: `ownloom`
- Private DNS: `ownloom.nazar.studio` -> `10.44.0.1` from WireGuard dnsmasq
- VM IP: `10.10.10.40`
- Host proxy: nginx on WireGuard `10.44.0.1:80` -> `10.10.10.40:80`
- NixPi: `ownloom.nazar.studio/nixpi/` and `nixpi-ownloom.nazar.studio` -> `10.10.10.40:4815` through host nginx/WireGuard
- State: `/persist/microvms/ownloom`
- Repo checkout: `/home/alex/ownloom`
- DAV wiki scope: `http://10.10.10.41/files/wiki/ownloom/`

## Secrets

OwnLoom uses a dedicated DAV user named `ownloom`. Provision the DAV password
inside the VM at:

```bash
sudo install -d -m 0700 -o root -g root /var/lib/ownloom/secrets
printf '%s' 'REPLACE_WITH_PASSWORD' | sudo tee /var/lib/ownloom/secrets/ownloom-dav-password >/dev/null
sudo chmod 0400 /var/lib/ownloom/secrets/ownloom-dav-password
```

Do not commit DAV passwords or API keys to git. The DAV server must have a
matching htpasswd entry for user `ownloom` before the web app can use the wiki.

## Deploy

From `/root/nazar` on the host:

```bash
nix flake lock --update-input ownloom
nix flake check --no-build
nix run .#deploy-ownloom
systemctl status microvm@ownloom
```

## Validate private access

From a WireGuard client:

```bash
dig @10.44.0.1 ownloom.nazar.studio +short
curl -I http://ownloom.nazar.studio/
curl -I http://ownloom.nazar.studio/nixpi/
curl -I http://nixpi-ownloom.nazar.studio/
```

From the host:

```bash
curl -I -H 'Host: ownloom.nazar.studio' http://10.44.0.1/
```

OwnLoom must not be exposed publicly.

## Self-evolution workflow

OwnLoom may edit, test, commit, activate, and push its own repo/VM changes:

```bash
nazar-vm-repo-bootstrap
cd /home/alex/ownloom
pi
nix flake check --no-build
git status
git add <files>
git commit -m "Improve OwnLoom ..."
nazar-vm-switch
curl -f http://127.0.0.1/ || systemctl status ownloom-web nginx
git push
```

Rollback inside the VM:

```bash
sudo nixos-rebuild switch --rollback
```

## Authority boundary

OwnLoom may change its own service repo and VM-local configuration. It must not
autonomously change host firewall, WireGuard peers, public exposure, VMID/IP/MAC,
shared networking, or other VMs. Host/fleet changes should be proposed as a
branch or patch for human review in `/root/nazar`.

The phase-1 web UI and NixPi are WireGuard-private and can drive Pi/self-evolution workflows as `alex`; keep the WireGuard peer set trusted and small.
