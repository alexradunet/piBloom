# Git server runbook

Git is served directly from the Nazar host via SSH bare repos. No web UI, no database.

## Layout

- Host: `nazar` / `10.10.10.1` (NAT bridge) / `10.44.0.1` (private/sshuttle)
- Port: `10022`
- Repository root: `/persist/git/repositories`
- Default namespace: `/persist/git/repositories/nazar`
- Compatibility symlink: `/nazar -> /persist/git/repositories/nazar`

## Access

Admin SSH keys are declared in `nix/users/admin-keys.nix` and written to `/etc/ssh/authorized_keys.d/git` by NixOS. The `git` user is restricted to `git-shell` (no PTY, no port forwarding, no X11).

Keep `git.nazar.studio` private behind sshuttle and use port `10022`.

### Firewall

VMs may reach `10.10.10.1:10022` through a narrow exception in the host nftables guard chain. This is the only VM-to-host connection allowed; all other VM-to-host traffic remains blocked.

## Creating a repository

On the host:

```bash
sudo nazar-git-init nazar/new-repo.git
# or, for the default nazar namespace:
sudo nazar-git-init new-repo
```

From a client:

```bash
git remote add origin ssh://git@git.nazar.studio:10022/nazar/new-repo.git
git push -u origin main
```

## Validate

```bash
git ls-remote ssh://git@10.10.10.1:10022/nazar/nazar.git
git ls-remote ssh://git@10.44.0.1:10022/nazar/nazar.git
git ls-remote ssh://git@git.nazar.studio:10022/nazar/nazar.git
```
