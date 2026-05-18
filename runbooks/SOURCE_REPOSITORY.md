# Source repository

Nazar's canonical Git repository is hosted on Codeberg, not on the Nazar host.

## Canonical remote

- Web: <https://codeberg.org/NazarStudio/Nazar>
- HTTPS Git: `https://codeberg.org/NazarStudio/Nazar.git`
- SSH Git: `git@codeberg.org:NazarStudio/Nazar.git`

The same locations are declared in `nix/fleet/host.nix` under `repository`.

## Policy

- Do not run a Git server on `nazar`.
- Do not recreate `git.nazar.studio` or `/persist/git` in the NixOS host config.
- Use Codeberg for pushes, pulls, issues, and repository browsing.
- Keep host SSH for administration and sshuttle only.

## Local remote setup

```bash
git remote add codeberg https://codeberg.org/NazarStudio/Nazar.git
# or, with SSH configured:
git remote add codeberg git@codeberg.org:NazarStudio/Nazar.git
```

Validate access with:

```bash
git ls-remote https://codeberg.org/NazarStudio/Nazar.git
```
