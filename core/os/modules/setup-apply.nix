# core/os/modules/setup-apply.nix
# Installs nixpi-setup-apply system-wide for the web wizard backend.
{ setupApplyPackage, ... }:

{
  environment.systemPackages = [ setupApplyPackage ];
}
