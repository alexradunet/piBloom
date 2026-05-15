# Nazar integration plan

NixPi is integrated into Nazar as a private, sshuttle-routed Pi web surface.

## Constraints from Nazar runbooks

- Private services stay behind sshuttle and host nginx on `10.44.0.1`.
- Do not publish public DNS or public HTTP for NixPi endpoints.
- The `nazar` host owns VM lifecycle, VMID/IP/MAC, NAT/firewall, WireGuard peers, and public exposure.
- NixPi runs centrally on the host; VM work is reached through configured workspaces rather than VM-local NixPi services.
- DAV data remains isolated in `dav-server`; NixPi should not co-locate DAV state or secrets.

## Recommended production shape

1. Publish this repo to the Git server as `ssh://alex@git.nazar.studio/nazar/nixpi.git`.
2. Add it to `nazar/flake.nix`:

   ```nix
   nixpi = {
     url = "git+ssh://alex@git.nazar.studio/nazar/nixpi.git";
     inputs.nixpkgs.follows = "nixpkgs";
   };
   ```

3. Import `inputs.nixpi.nixosModules.nixpi` on the `nazar` host.
4. Run one host-local `nixpi` service as `alex`, with `NIXPI_PI_BIN` pointed at the pinned Pi package.
5. Persist Pi/NixPi session state in the host `alex` profile.
6. Bind the host service to `127.0.0.1:4815` and proxy it from host nginx on the private sshuttle listener only.

## Suggested routing

Canonical route:

- `nixpi.nazar.studio` -> host `nazar` NixPi service

The record resolves to `10.44.0.1` from configured laptops and should not exist in public DNS. Do not use `nazar.studio/nixpi/`; `nazar.studio` is the public static dashboard.

## Declarative exposure

Nazar keeps HTTP exposure policy in `nix/fleet/exposure.nix`. A route with `access = "private"` is only served on the sshuttle-routed private listener. A route with `access = "public"` is also served on the public IPv4 listener and opens TCP/80. Keep NixPi private unless a separate auth/hardening review happens. Future routes such as `/subagent/` should be enabled by adding a route in that exposure file rather than ad-hoc nginx edits.

## Security stance

NixPi is an operator surface: it can drive Pi tools as `alex` in the configured working directory. Until NixPi has service-level authentication/authorization, keep it available only to a small trusted WireGuard peer set.

## Validation checklist

From `/root/nazar` after the input is locked:

```bash
nix flake check --no-build
nix run .#deploy-git
nix run .#deploy-minecraft
nix run .#deploy-dav-server
```

From a configured sshuttle client:

```bash
getent hosts nixpi.nazar.studio
curl -I http://nixpi.nazar.studio/
```
