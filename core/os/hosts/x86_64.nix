# core/os/hosts/x86_64.nix
# Temporary compatibility wrapper for legacy x86_64 host imports.
{ ... }:

{
  imports = [ ./vps.nix ];
}
