# Minecraft VM

Declarative NixOS host profile for the PaperMC server on `nazar`.

```text
VMID:        110
hostname:    minecraft
Proxmox:     minecraft
NAT IP:      10.10.10.30
service DNS: mc.nazar.studio
state path:  /var/lib/minecraft
ports:       25565/tcp (Minecraft) + 24454/udp (Simple Voice Chat)
```

Runtime world/plugin data is intentionally mutable state under `/var/lib/minecraft` and must be backed up separately from this repo.

See `runbooks/MINECRAFT_PAPERMC_VM.md` for build, deploy, DNS, firewall, and backup notes.
