{ lib, pkgs, modulesPath, installerHelper, ... }:

{
  imports = [
    "${modulesPath}/installer/cd-dvd/installation-cd-minimal.nix"
  ];

  system.stateVersion = "25.05";
  nixpkgs.hostPlatform = "x86_64-linux";
  nixpkgs.config.allowUnfree = true;

  isoImage = {
    appendToMenuLabel = "NixPI Installer";
    edition = "nixpi";
    volumeID = "NIXPI_INSTALL";
  };

  image.fileName = "nixpi-installer-${pkgs.stdenv.hostPlatform.system}.iso";

  networking.hostName = "nixpi-installer";
  networking.networkmanager.enable = true;
  time.timeZone = "UTC";
  i18n.defaultLocale = "en_US.UTF-8";
  services.getty.autologinUser = lib.mkDefault "nixos";

  environment.systemPackages = with pkgs; [
    git
    just
    curl
    newt
  ] ++ [
    installerHelper
  ];
}
