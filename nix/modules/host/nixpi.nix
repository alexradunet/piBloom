{
  inputs,
  pkgs,
  ...
}:
let
  pi = pkgs.callPackage ../../packages/pi { };
in
{
  imports = [
    inputs.nixpi.nixosModules.nixpi
    ../common/pi-default-packages.nix
  ];

  services.nixpi = {
    enable = true;
    user = "alex";
    group = "users";
    home = "/home/alex";
    workingDirectory = "/home/alex";
    host = "127.0.0.1";
    port = 4815;
    piBinary = "${pi}/bin/pi";
  };

  # NixPi spawns `node` for its RPC/web worker path; keep that executable in
  # the unit PATH in addition to the wrapped entrypoint's absolute Node path.
  systemd.services.nixpi = {
    path = [ pkgs.nodejs_22 ];
    environment.NPM_CONFIG_PREFIX = "/home/alex/.pi/npm-global";
  };
}
