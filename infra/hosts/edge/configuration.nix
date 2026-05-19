{ ... }:

{
  imports = [
    ../../modules/common.nix
    ../../modules/proxmox-vm.nix
  ];

  networking.hostName = "edge";

  networking.interfaces.ens18.ipv4.addresses = [
    {
      address = "10.10.10.10";
      prefixLength = 24;
    }
  ];

  networking.defaultGateway = "10.10.10.1";
  networking.nameservers = [
    "1.1.1.1"
    "9.9.9.9"
  ];

  networking.firewall = {
    enable = true;
    allowedTCPPorts = [
      22
      80
      443
    ];
  };

  services.caddy = {
    enable = true;
    virtualHosts."nazar.studio".extraConfig = ''
      respond "Nazar edge is online\n"
    '';
    virtualHosts."www.nazar.studio".extraConfig = ''
      redir https://nazar.studio{uri} permanent
    '';
  };

  system.stateVersion = "25.11";
}
