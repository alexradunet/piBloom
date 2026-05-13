{ pkgs, ... }:
let
  pi = pkgs.callPackage ../../packages/pi { };
in
{
  environment.systemPackages = [ pi ];

  environment.sessionVariables = {
    PI_TELEMETRY = "0";
    PI_SKIP_VERSION_CHECK = "1";
  };
}
