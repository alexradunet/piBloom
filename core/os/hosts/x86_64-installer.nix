# core/os/hosts/x86_64-installer.nix
# Graphical installer ISO configuration for Bloom OS.
# Uses Calamares GUI installer with GNOME desktop (auto-starts Calamares via GDM).
# Custom calamares-nixos-extensions override provides Bloom-specific wizard pages.
{ lib, pkgs, modulesPath, bloomApp, piAgent, nixpkgsSrc, bloomSrc, ... }:

{
  imports = [
    # Calamares + GNOME installer base — handles GDM autologin, Calamares
    # autostart, polkit agent, and display manager out of the box.
    "${modulesPath}/installer/cd-dvd/installation-cd-graphical-calamares-gnome.nix"
  ];

  # Allow unfree packages (required for proprietary firmware and drivers)
  nixpkgs.config.allowUnfree = true;

  # Enable all firmware for maximum hardware compatibility.
  # The base installer sets hardware.enableAllHardware which includes
  # redistributable firmware; we extend this to ALL firmware (including
  # non-free) to support the widest range of WiFi cards and hardware.
  hardware.enableAllFirmware = true;

  # Graphics drivers for Calamares GUI - needed for offline operation
  # Include all common GPU drivers so the installer works on Intel, AMD, and basic VMs
  hardware.graphics = {
    enable = true;
    enable32Bit = true;
  };
  # Software rendering fallback for problematic hardware
  environment.variables.LIBGL_ALWAYS_SOFTWARE = "0";  # Use hardware accel when available
  # Qt platform plugin for Calamares - use xcb for stability (force override base module)
  environment.variables.QT_QPA_PLATFORM = lib.mkForce "xcb";
  environment.variables.QT_QPA_PLATFORMTHEME = "gtk2";

  # Replace upstream calamares-nixos-extensions with our custom Bloom version.
  # Use prev.callPackage so package.nix receives the pre-overlay pkgs and the
  # pre-overlay calamares-nixos-extensions — prevents infinite recursion.
  nixpkgs.overlays = [
    (final: prev: {
      calamares-nixos-extensions = prev.callPackage ../../calamares/package.nix {
        upstreamCalamares = prev.calamares-nixos-extensions;
      };
    })
  ];

  # Support all locales (Calamares needs this for the locale selection step)
  i18n.supportedLocales = [ "all" ];

  # Extra tools available in the live environment.
  # bloomApp and piAgent are included here so their store paths are already in
  # the ISO squashfs.  The installer's `nix build` step (which evaluates the
  # same flake.lock pinned at ISO build time) then reuses these paths from the
  # host store instead of re-fetching and rebuilding, which would exhaust the
  # live ISO's tmpfs.
  environment.systemPackages = with pkgs; [
    gparted
    bloomApp
    piAgent
    # Hardware diagnostic tools for troubleshooting
    pciutils      # lspci - check PCI devices (WiFi cards, etc.)
    usbutils      # lsusb - check USB devices
    iw            # wireless tools - iw dev, iw list
    wirelesstools # wireless-tools - iwconfig, iwpriv
    hdparm        # disk diagnostics
    # Graphics debugging tools for offline installer issues
    mesa-demos    # glxinfo, etc.
    libGL         # Explicitly include libGL
  ];

  # Offline installation: embed flake input source trees in the squashfs.
  # During installation, `nix build --no-update-lock-file` resolves inputs via
  # the bundled flake.lock.  Nix looks up each narHash → store path; if the
  # path exists (because it's in the squashfs), the download is skipped.
  # This makes installation work with no internet connection.
  environment.etc."bloom/offline/nixpkgs".source = nixpkgsSrc;
  environment.etc."bloom/offline/bloom".source   = bloomSrc;

  # ISO-specific settings
  isoImage.volumeID  = lib.mkDefault "BLOOM_INSTALLER";
  image.fileName     = lib.mkDefault "bloom-os-installer.iso";

  boot.kernelParams = [
    # copytoram omitted: loading the full squashfs (which includes
    # nixpkgs and bloom source trees for offline installation) into RAM
    # would exhaust memory on low-RAM machines and is unnecessary for an
    # installer that reads from USB only during initial boot.
    "quiet"
    "splash"
  ];

  environment.etc."issue".text = ''
    Welcome to Bloom OS Installer!

    The installer will launch automatically on the desktop.

    For help, visit: https://github.com/alexradunet/piBloom

  '';

  programs.firefox.preferences = {
    "browser.startup.homepage" = "https://github.com/alexradunet/piBloom";
  };

  # Explicitly load WiFi drivers — udev auto-load is unreliable on live ISOs.
  # Covers the most common x86 mini-PC and laptop WiFi chips:
  #   rtw89_*   — Realtek RTL8852BE/RTL8851BE (Beelink EQ14, etc.)
  #   rtw88_*   — Realtek RTL8822BE/RTL8822CE (older Realtek PCIe)
  #   iwlwifi   — Intel WiFi (AX200/AX201/AX210/AX211, etc.)
  #   mt7921e   — MediaTek MT7921 PCIe (common in recent AMD/Intel laptops)
  #   ath11k_pci — Qualcomm Wi-Fi 6 (QCA6390, WCN6855, etc.)
  #   brcmfmac  — Broadcom FullMAC (some OEM laptops)
  boot.kernelModules = [
    "rtw89_8852be" "rtw89_pci"
    "rtw88_8822be" "rtw88_8822ce" "rtw88_pci"
    "iwlwifi"
    "mt7921e"
    "ath11k_pci"
    "brcmfmac"
  ];

  networking.hostName          = lib.mkDefault "bloom-installer";
  networking.networkmanager.enable = true;
  networking.wireless.enable   = lib.mkForce false;
  services.libinput.enable     = true;
}
