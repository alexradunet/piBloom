_:

let
  moduleSets = import ./module-sets.nix;
in
{
  imports = moduleSets.nixpi;
}
