{
  config,
  lib,
  ...
}: let
  wanAddresses = config.systemd.network.networks."10-wan".address or [];
  primaryAddress =
    if wanAddresses == []
    then ""
    else builtins.head wanAddresses;
in {
  imports =
    lib.optional (builtins.pathExists ./networking.private.nix) ./networking.private.nix;

  networking = {
    useDHCP = false;
    useNetworkd = true;
  };

  systemd.network = {
    enable = true;
    networks."10-wan" = {
      matchConfig.Name = "en*";
      networkConfig = {
        DNS = [
          "1.1.1.1"
          "9.9.9.9"
        ];
        IPv6AcceptRA = false;
      };
    };
  };

  # The real WAN address and gateway are kept in hosts/ownloom-vps/networking.private.nix
  # (gitignored). See networking.private.nix.example for the expected shape.
  assertions = [
    {
      assertion = primaryAddress != "";
      message = "hosts/ownloom-vps/networking.nix: no WAN address found. Create hosts/ownloom-vps/networking.private.nix from the .example file before installing.";
    }
  ];
}
