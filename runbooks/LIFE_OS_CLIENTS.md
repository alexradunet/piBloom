# Life OS Clients

This runbook describes how NixOS laptops and future clients consume Life OS over the private Tailscale network.

## Design

Life OS data lives on Nazar under `/srv/life`. Nazar exposes that tree as a private WebDAV endpoint:

```text
http://100.92.138.94/life/
```

The endpoint is intended for Tailscale clients only. Public HTTP remains blocked by the host firewall; TCP/80 is allowed only on `tailscale0` by the Nazar Tailscale firewall module.

Client machines enable `nazar.lifeOs.client`, which provides:

- Tailscale dependency assertions.
- `davfs2` support.
- A lazy WebDAV automount at `/home/alex/LifeOS`.
- Desktop consumer apps:
  - Obsidian
  - Thunderbird
  - KOrganizer
  - KAddressBook
  - Kontact
  - Merkuro when available in nixpkgs

## Enable on a NixOS client

Import the shared modules from the host configuration:

```nix
{
  imports = [
    ../../modules/laptop/tailscale.nix
    ../../modules/laptop/life-os-client.nix
  ];

  nazar.lifeOs.client = {
    enable = true;
    davUrl = "http://100.92.138.94/life/";
  };
}
```

The module intentionally keeps Tailscale in client mode. Do not enable subnet routing or exit-node behavior unless it is explicitly designed and reviewed.

## Rebuild

From the client checkout:

```bash
cd /home/alex/repos/nazar
sudo nixos-rebuild switch --flake .#alex-laptop
```

## Tailscale enrollment

If the client has not joined the tailnet yet:

```bash
sudo tailscale up --hostname=alex-laptop --ssh=false
```

Verify:

```bash
systemctl is-active tailscaled
sudo tailscale status
sudo tailscale ip -4
ping 100.92.138.94
```

Future clients can use `services.tailscale.authKeyFile` for declarative auto-enrollment, but the auth key must be supplied by a runtime secret mechanism such as agenix or sops-nix, never directly in Nix.

## WebDAV mount verification

The client mount is lazy. Accessing the path should trigger the mount:

```bash
systemctl status home-alex-LifeOS.automount --no-pager -l
ls -la /home/alex/LifeOS
findmnt /home/alex/LifeOS
```

Expected `findmnt` result:

```text
/home/alex/LifeOS ... davfs ...
```

If the mount fails, inspect:

```bash
journalctl -u home-alex-LifeOS.mount --no-pager -l
journalctl -u home-alex-LifeOS.automount --no-pager -l
curl -I http://100.92.138.94/life/
```

## Desktop use

### Obsidian

Open Obsidian and use one of these as a vault depending on how you want to browse the data:

```text
/home/alex/LifeOS
/home/alex/LifeOS/notes
```

For now this is a direct WebDAV-backed mount. If Obsidian becomes slow or has file-locking issues, switch the module later to local sync instead of direct mount.

### KDE PIM

Use KOrganizer, KAddressBook, Kontact, or Merkuro for human calendar/contact/task UI.

KDE Akonadi DAV account provisioning is not currently generated declaratively. Add DAV accounts manually in the KDE UI if needed.

### Thunderbird

Thunderbird is installed as a reliable DAV client and debugging fallback. It can be pointed manually at the same Life OS DAV endpoint.

## Security notes

- The WebDAV endpoint is private-by-network: reachable through Tailscale, not public internet.
- Do not expose TCP/80 or TCP/443 globally just to make DAV work.
- Do not put DAV credentials, Tailscale auth keys, OAuth tokens, or private certificates into Nix expressions.
- If DAV authentication is added later, place credentials in a runtime secret file and wire it through agenix/sops-nix.
