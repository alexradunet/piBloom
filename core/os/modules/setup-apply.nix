# core/os/modules/setup-apply.nix
# Installs nixpi-setup-apply system-wide for the web wizard backend.
{ pkgs, ... }:

let
  setupApplyPackage = pkgs.callPackage ../pkgs/nixpi-setup-apply { };
in

{
  environment.systemPackages = [ setupApplyPackage ];
}
