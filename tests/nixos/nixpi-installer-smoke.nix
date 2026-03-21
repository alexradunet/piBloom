{ pkgs, installerHelper, self, ... }:

pkgs.testers.runNixOSTest {
  name = "nixpi-installer-smoke";
  node.pkgsReadOnly = false;

  nodes.installer =
    { ... }:
    let
      targetDisk = "/tmp/shared/nixpi-installer-target.qcow2";
    in
    {
      imports = [
        "${pkgs.path}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
      ];

      system.stateVersion = "25.05";
      networking.hostName = "nixpi-installer-test";
      networking.networkmanager.enable = true;
      services.getty.autologinUser = "nixos";

      virtualisation.diskImage = null;
      virtualisation.memorySize = 6144;
      virtualisation.cores = 2;
      virtualisation.graphics = false;
      virtualisation.useEFIBoot = true;
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

      environment.systemPackages = [
        installerHelper
        pkgs.dosfstools
        pkgs.jq
        pkgs.parted
      ];

      system.extraDependencies = [
        self.checks.${pkgs.system}.installer-generated-config
      ];
    };

  testScript = ''
    import os
    import shlex
    import subprocess

    installer = machines[0]
    target_disk_image = "/tmp/shared/nixpi-installer-target.qcow2"
    target_mount = "/mnt"
    qemu_img = "${pkgs.qemu}/bin/qemu-img"

    os.makedirs(os.path.dirname(target_disk_image), exist_ok=True)
    if os.path.exists(target_disk_image):
        os.unlink(target_disk_image)
    subprocess.run([qemu_img, "create", "-f", "qcow2", target_disk_image, "20G"], check=True)

    installer.start()
    installer.wait_for_unit("multi-user.target", timeout=300)
    installer.wait_until_succeeds(
        "lsblk -dnbo NAME,SIZE,TYPE,RO | awk '$3 == \"disk\" && $4 == 0 && $2 == 21474836480 { found = 1 } END { exit found ? 0 : 1 }'",
        timeout=120,
    )

    target_disk_device = installer.succeed(
        "lsblk -dnbpo NAME,SIZE,TYPE,RO | awk '$3 == \"disk\" && $4 == 0 && $2 == 21474836480 { print $1; exit }'"
    ).strip()
    assert target_disk_device, "failed to resolve target disk device"
    installer.succeed(
        "bash -lc "
        + shlex.quote(
            "nixpi-installer --disk "
            + target_disk_device
            + " --hostname installer-vm --primary-user installer --yes --system "
            + shlex.quote("${self.checks.${pkgs.system}.installer-generated-config}")
            + " > /tmp/nixpi-installer.log 2>&1 || { cat /tmp/nixpi-installer.log >&2; exit 1; }"
        )
    )
    installer.wait_until_succeeds("test -f /tmp/nixpi-installer-artifacts.json", timeout=60)
    installer.succeed("cat /tmp/nixpi-installer-artifacts.json | jq -e '.flake_install_ref == \"" + target_mount + "/etc/nixos#installer-vm\"'")

    installer.succeed("test -f " + target_mount + "/etc/nixos/configuration.nix")
    installer.succeed("test -f " + target_mount + "/etc/nixos/nixpi-install.nix")
    installer.succeed("test -f " + target_mount + "/etc/nixos/nixpi-host.nix")
    installer.succeed("test -f " + target_mount + "/etc/nixos/flake.nix")
    installer.succeed("grep -q 'nixpi.primaryUser = \"installer\";' " + target_mount + "/etc/nixos/nixpi-install.nix")
    installer.succeed("grep -q 'nixpi.install.mode = \"managed-user\";' " + target_mount + "/etc/nixos/nixpi-install.nix")
    installer.succeed("grep -q 'networking.hostName = \"installer-vm\";' " + target_mount + "/etc/nixos/nixpi-host.nix")
    installer.succeed("grep -q 'imports = \\[' " + target_mount + "/etc/nixos/configuration.nix")

    installer.succeed("nixos-enter --root " + target_mount + " -c 'getent passwd installer'")
    installer.succeed("nixos-enter --root " + target_mount + " -c 'getent passwd agent'")
    installer.succeed("nixos-enter --root " + target_mount + " -c 'command -v setup-wizard.sh'")
    installer.succeed("nixos-enter --root " + target_mount + " -c 'test -d /etc/nixos/nixpi'")
  '';
}
