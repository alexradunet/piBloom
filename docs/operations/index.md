# Operations

> Deploy, operate, and maintain NixPI

## What's In This Section

This section covers operational procedures for NixPI:

- Installing and deploying NixPI
- First-boot setup procedures
- Testing and validation
- Day-to-day operations

## Operations Topics

| Topic | Description |
|-------|-------------|
| [Quick Deploy](./quick-deploy) | Build, deploy, and VM testing |
| [First Boot Setup](./first-boot-setup) | Initial setup procedures |
| [Live Testing](./live-testing) | Validation checklists |

## Quick Reference

### Common Commands

```bash
# Deploy
just iso             # Build installer ISO
cd ~/nixpi
git fetch upstream
git rebase upstream/main
sudo nixos-rebuild switch --flake /etc/nixos#$(hostname -s)
sudo nixos-rebuild switch --rollback

# VMs
just vm              # Run test VM
just vm-ssh          # SSH into VM
just vm-stop         # Stop VM

# Testing
just check-config    # Validate NixOS config
just check-boot      # VM boot test
```

## Related

- [Architecture](../architecture/) - System design
- [Codebase](../codebase/) - Implementation details
- [Reference](../reference/) - Deep technical docs
