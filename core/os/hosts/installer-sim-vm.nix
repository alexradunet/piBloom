{ pkgs, ... }:

{
  system.stateVersion = "25.05";
  nixpkgs.hostPlatform = "x86_64-linux";
  nixpkgs.config.allowUnfree = true;

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.kernelParams = [ "console=tty0" "console=ttyS0,115200" ];

  networking.hostName = "nixos-installer";
  networking.networkmanager.enable = true;

  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = true;
      PermitRootLogin = "no";
    };
  };

  time.timeZone = "UTC";
  i18n.defaultLocale = "en_US.UTF-8";

  users.users.alex = {
    isNormalUser = true;
    description = "Installer simulation user";
    initialPassword = "cico";
    extraGroups = [ "wheel" "networkmanager" ];
    shell = pkgs.bash;
  };

  security.sudo.wheelNeedsPassword = false;

  environment.systemPackages = with pkgs; [
    git
    just
    curl
  ];

  fileSystems."/mnt/host-repo" = {
    device = "host-repo";
    fsType = "9p";
    options = [ "trans=virtio" "ro" "nofail" ];
  };
}
