{ pkgs, lib, installerPkgs, ... }:

let
  smokeCalamaresExtensions = installerPkgs.calamares-nixos-extensions.overrideAttrs (old: {
    postInstall = (old.postInstall or "") + ''
      cat > $out/etc/calamares/modules/welcome.conf <<'EOF'
      showReleaseNotesUrl: false

      requirements:
          requiredStorage: 1
          requiredRam: 3.0

          check:
              - ram
              - power
              - screen

          required:
              - ram
      EOF

      cat >> $out/etc/calamares/modules/partition.conf <<'EOF'

      initialPartitioningChoice: erase
      initialSwapChoice: none
      EOF

      cat > $out/etc/calamares/modules/users.conf <<'EOF'
      defaultGroups:
          - users
          - networkmanager
          - wheel

      setRootPassword: false
      doReusePassword: true
      doAutologin: false

      passwordRequirements:
          minLength: 8
          maxLength: 64
          libpwquality:
              - minlen=8
              - maxrepeat=3
              - maxsequence=3
              - usersubstr=4
              - badwords=linux

      allowWeakPasswords: true
      allowWeakPasswordsDefault: false

      user:
        shell: /run/current-system/sw/bin/bash
        forbidden_names: [ root ]

      hostname:
        location: None
        writeHostsFile: false
        template: "installer-vm"
        forbidden_names: [ localhost ]

      presets:
          fullName:
              value: "NixPI Tester"
              editable: false
          loginName:
              value: "installer"
              editable: false
      EOF
    '';
  });
  smokeCalamares = installerPkgs.calamares-nixos.override {
    calamares-nixos-extensions = smokeCalamaresExtensions;
  };
in
pkgs.testers.runNixOSTest {
  name = "nixpi-installer-smoke";
  enableOCR = true;

  nodes.installer =
    { ... }:
    let
      targetDisk = "/tmp/shared/nixpi-installer-target.qcow2";
    in
    {
      imports = [
        "${pkgs.path}/nixos/modules/installer/cd-dvd/installation-cd-graphical-calamares-gnome.nix"
      ];

      nixpkgs.overlays = lib.mkForce [
        (_final: _prev: {
          calamares-nixos = smokeCalamares;
          calamares-nixos-extensions = smokeCalamaresExtensions;
        })
      ];

      services.desktopManager.gnome.enable = lib.mkForce false;
      services.xserver.windowManager.openbox.enable = true;
      services.displayManager.gdm.enable = lib.mkForce false;
      services.xserver.displayManager.lightdm.enable = true;
      services.displayManager.defaultSession = "none+openbox";
      services.displayManager.autoLogin = {
        enable = true;
        user = "nixos";
      };

      users.users.nixos = {
        isNormalUser = true;
        extraGroups = [ "wheel" "networkmanager" ];
        password = "";
      };

      programs.partition-manager.enable = true;
      services.resolved.enable = true;
      i18n.supportedLocales = [ "all" ];
      system.stateVersion = "25.05";
      networking.hostName = "nixpi-installer-test";
      networking.networkmanager.enable = true;
      time.timeZone = "UTC";
      i18n.defaultLocale = "en_US.UTF-8";

      virtualisation.diskImage = null;
      virtualisation.memorySize = 6144;
      virtualisation.cores = 2;
      virtualisation.graphics = true;
      virtualisation.resolution = {
        x = 1440;
        y = 900;
      };
      virtualisation.qemu.drives = [
        {
          name = "target";
          file = targetDisk;
          driveExtraOpts = {
            format = "qcow2";
            cache = "writeback";
            werror = "report";
          };
          deviceExtraOpts = {
            serial = "nixpi-installer-target";
          };
        }
      ];

      environment.systemPackages = with pkgs; [
        xdotool
        wmctrl
        xwininfo
        xhost
      ] ++ [
        smokeCalamares
        smokeCalamaresExtensions
        pkgs.glibcLocales
      ];
    };

  testScript = ''
    import os
    import shlex
    import subprocess
    import time

    installer = machines[0]
    target_disk_image = "/tmp/shared/nixpi-installer-target.qcow2"
    target_mount = "/mnt/nixpi-installer-target"
    calamares_session_log = "/root/.cache/calamares/session.log"
    qemu_img = "${pkgs.qemu}/bin/qemu-img"

    os.makedirs(os.path.dirname(target_disk_image), exist_ok=True)
    if os.path.exists(target_disk_image):
        os.unlink(target_disk_image)
    subprocess.run([qemu_img, "create", "-f", "qcow2", target_disk_image, "20G"], check=True)

    def calamares_key(key, pause=0.4):
        installer.send_key(key)
        time.sleep(pause)

    def calamares_type(text, pause=0.8):
        installer.send_chars(text)
        time.sleep(pause)

    def next_page():
        calamares_key("alt-n", pause=1.0)

    def x11(command):
        installer.succeed("su - nixos -c " + shlex.quote("DISPLAY=:0 " + command))

    def user_shell(command):
        installer.succeed("su - nixos -c " + shlex.quote(command))

    installer.start()
    installer.wait_for_unit("display-manager.service", timeout=300)
    installer.wait_for_x(timeout=300)
    installer.wait_until_succeeds("nm-online -q --timeout=60", timeout=300)
    installer.succeed("ip -brief addr")
    installer.succeed("ip route")
    installer.succeed("resolvectl status")
    installer.wait_until_succeeds(
        "lsblk -dnbo NAME,SIZE,TYPE,RO | awk '$3 == \"disk\" && $4 == 0 && $2 == 21474836480 { found = 1 } END { exit found ? 0 : 1 }'",
        timeout=120,
    )
    installer.succeed("lsblk -o NAME,SIZE,TYPE,RO,SERIAL,MODEL")
    installer.succeed("ls -l /dev/disk/by-id || true")
    installer.succeed("blkid || true")
    target_disk_device = installer.succeed(
        "lsblk -dnbpo NAME,SIZE,TYPE,RO | awk '$3 == \"disk\" && $4 == 0 && $2 == 21474836480 { print $1; exit }'"
    ).strip()
    assert target_disk_device, "failed to resolve target disk device"
    installer.succeed("rm -f /tmp/calamares.log")
    installer.succeed("su - nixos -c 'DISPLAY=:0 xhost +SI:localuser:root'")
    installer.succeed(
        "sh -lc " +
        shlex.quote(
            "DISPLAY=:0 "
            "XAUTHORITY=/home/nixos/.Xauthority "
            "XDG_RUNTIME_DIR=/run/user/1000 "
            "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus "
            "${smokeCalamares}/bin/calamares "
            ">/tmp/calamares.log 2>&1 &"
        )
    )
    installer.wait_until_succeeds("pgrep -fa '${smokeCalamares}/bin/calamares'", timeout=60)
    try:
        installer.wait_until_succeeds(
            "su - nixos -c 'DISPLAY=:0 wmctrl -lx | grep -i calamares'",
            timeout=30,
        )
    except Exception:
        print(installer.succeed("sh -c 'pgrep -fa calamares || true'"))
        print(installer.succeed("sh -c 'journalctl --no-pager -b _COMM=calamares || true'"))
        print(installer.succeed("sh -c 'cat /tmp/calamares.log || true'"))
        print(installer.succeed("su - nixos -c 'sh -c \"DISPLAY=:0 wmctrl -lx || true\"'"))
        print(installer.succeed("su - nixos -c 'sh -c \"DISPLAY=:0 xwininfo -root -tree || true\"'"))
        print(user_shell("sh -c 'journalctl --user --no-pager -b | tail -n 200 || true'"))
        print(user_shell("sh -c 'cat ~/.xsession-errors 2>/dev/null || true'"))
        raise

    x11("wmctrl -lx")
    time.sleep(5.0)
    installer.screenshot("installer-welcome")

    next_page()
    time.sleep(2.0)
    next_page()
    time.sleep(2.0)
    next_page()

    time.sleep(2.0)
    calamares_key("tab")
    calamares_type("TestPass123!")
    calamares_key("tab")
    calamares_type("TestPass123!")
    installer.screenshot("installer-users")
    next_page()

    time.sleep(2.0)
    next_page()

    time.sleep(2.0)
    next_page()

    time.sleep(2.0)
    installer.screenshot("installer-partition")
    next_page()

    time.sleep(2.0)
    installer.screenshot("installer-summary")
    next_page()
    time.sleep(2.0)
    installer.screenshot("installer-confirm")
    calamares_key("alt-i", pause=2.0)
    calamares_key("ret", pause=2.0)

    installer.wait_until_succeeds("test -f " + calamares_session_log, timeout=120)
    try:
        installer.wait_until_succeeds(
            "grep -Eq 'Starting job \"nixos\"|Job added:.*nixos|exec.*nixos' " + calamares_session_log,
            timeout=60,
        )
    except Exception:
        installer.screenshot("installer-install-start-timeout")
        print(installer.succeed("cat " + calamares_session_log))
        print(installer.succeed("sh -c 'cat /tmp/calamares.log || true'"))
        print(user_shell("sh -c 'DISPLAY=:0 wmctrl -l || true'"))
        print(user_shell("sh -c 'DISPLAY=:0 xwininfo -root -tree || true'"))
        raise
    session_log = installer.succeed("cat " + calamares_session_log)
    print(session_log)
    assert "Installation failed" not in session_log, session_log
    assert "Bad main script file" not in session_log, session_log
    assert "SyntaxError: invalid syntax" not in session_log, session_log

    target_partitions = installer.succeed(
        "lsblk -lnpo NAME,TYPE " + target_disk_device + " | awk '$2 == \"part\" { print $1 }'"
    ).splitlines()
    assert target_partitions, "expected at least one target partition, got: " + repr(target_partitions)
    target_boot_partition = target_partitions[0] if len(target_partitions) >= 2 else ""
    target_root_partition = target_partitions[-1]

    installer.wait_until_succeeds("lsblk -no FSTYPE " + target_disk_device + " | grep -q .", timeout=300)
    installer.wait_until_succeeds("blkid " + target_root_partition, timeout=300)

    installer.succeed("mkdir -p " + target_mount)
    installer.succeed("mount " + target_root_partition + " " + target_mount)
    try:
        installer.wait_until_succeeds(
            "test -f " + target_mount + "/etc/nixos/configuration.nix",
            timeout=1200,
        )
    except Exception:
        print(installer.succeed("cat " + calamares_session_log))
        print(installer.succeed("sh -c 'pgrep -fa \"calamares|nixos-install|install -D\" || true'"))
        print(installer.succeed("sh -c 'cat /tmp/calamares.log || true'"))
        raise
    if target_boot_partition:
        installer.succeed("mkdir -p " + target_mount + "/boot")
        installer.succeed("mount " + target_boot_partition + " " + target_mount + "/boot")

    installer.wait_until_succeeds("test -f " + target_mount + "/etc/nixos/nixpi-install.nix", timeout=1200)
    installer.wait_until_succeeds("test -f " + target_mount + "/etc/nixos/nixpi-host.nix", timeout=1200)
    installer.wait_until_succeeds("test -f " + target_mount + "/etc/nixos/flake.nix", timeout=1200)

    installer.succeed("test -f " + target_mount + "/etc/nixos/configuration.nix")
    installer.succeed("test -f " + target_mount + "/etc/nixos/nixpi-install.nix")
    installer.succeed("test -f " + target_mount + "/etc/nixos/nixpi-host.nix")
    installer.succeed("test -f " + target_mount + "/etc/nixos/flake.nix")
    installer.succeed("grep -q 'nixpi.primaryUser = \"installer\";' " + target_mount + "/etc/nixos/nixpi-install.nix")
    installer.succeed("grep -q 'nixosConfigurations\\.\"' " + target_mount + "/etc/nixos/flake.nix")

    installer.screenshot("installer-finished")
  '';
}
