# SSH-only Git server runbook

Git is served directly from the Nazar host, not from a MicroVM. There is no Forgejo, no database, and no Git web UI.

## Layout

- Host: `nazar` / `10.10.10.1` (NAT bridge) / `10.44.0.1` (private/sshuttle)
- Port: `10022`
- Repository root: `/persist/git/repositories`
- Default namespace: `/persist/git/repositories/nazar`
- Compatibility symlink: `/nazar -> /persist/git/repositories/nazar`

## Access

The `git` user uses `git-shell`. SSH keys come from:

- declarative admin public keys in `nix/users/admin-keys.nix`
- VM-generated Git keys under `/persist/microvms/*/git-ssh/id_ed25519.pub`

The authorized keys file is rebuilt every 15 minutes by `nazar-git-authorized-keys.timer` and stored at `/var/lib/nazar/git-authorized_keys`.

There is no Git HTTP endpoint. Keep `git.nazar.studio` private behind sshuttle and use port `10022`.

### Firewall

VMs may reach `10.10.10.1:10022` through a narrow exception in the host nftables guard chain. This is the only VM-to-host connection allowed; all other VM-to-host traffic remains blocked. The endpoint restricts the `git` user to `git-shell` only (no PTY, no port forwarding, no X11).

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
systemctl is-active nazar-git-authorized-keys.timer
```

`git-shell` may reject an interactive `ssh git@...`; that is expected. Git commands such as `git ls-remote`, `git fetch`, and `git push` are the supported interface.
