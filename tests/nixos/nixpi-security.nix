{ mkTestFilesystems, ... }:

let
  mkNode =
    {
      hostName,
      username,
      bootstrapEnable ? true,
      sshEnable ? bootstrapEnable,
      temporaryAdminEnable ? bootstrapEnable,
    }:
    {
      ...
    }:
    let
      homeDir = "/home/${username}";
    in
    {
      imports = [
        ../../core/os/hosts/vps.nix
        mkTestFilesystems
      ];

      nixpi = {
        primaryUser = username;
        security = {
          enforceServiceFirewall = true;
          fail2ban.enable = !bootstrapEnable;
          ssh.allowedSourceCIDRs = [ "192.0.2.10/32" ];
        };
        bootstrap.enable = bootstrapEnable;
        bootstrap.ssh.enable = sshEnable;
        bootstrap.temporaryAdmin.enable = temporaryAdminEnable;
      };

      networking.hostName = hostName;
      systemd.tmpfiles.rules = [ "d ${homeDir}/.nixpi 0755 ${username} ${username} -" ];
    };
in
{
  name = "nixpi-security";

  nodes = {
    bootstrap = mkNode {
      hostName = "nixpi-bootstrap";
      username = "pi";
      bootstrapEnable = true;
    };

    steady = mkNode {
      hostName = "nixpi-steady";
      username = "pi";
      bootstrapEnable = false;
      sshEnable = true;
      temporaryAdminEnable = false;
    };

    client =
      { pkgs, ... }:
      {
        virtualisation.diskSize = 5120;
        virtualisation.memorySize = 1024;

        boot.loader.systemd-boot.enable = true;
        boot.loader.efi.canTouchEfiVariables = true;
        networking.hostName = "client";
        time.timeZone = "UTC";
        i18n.defaultLocale = "en_US.UTF-8";
        networking.networkmanager.enable = true;
        system.stateVersion = "25.05";

        environment.systemPackages = with pkgs; [
          curl
          netcat
        ];
      };
  };

  testScript = ''
    bootstrap = machines[0]
    client = machines[1]
    steady = machines[2]

    bootstrap.start()
    bootstrap.wait_for_unit("multi-user.target", timeout=300)
    bootstrap.fail("systemctl is-active fail2ban")
    bootstrap.wait_for_unit("nixpi-app-setup.service", timeout=120)
    bootstrap.wait_for_unit("sshd.service", timeout=60)
    bootstrap.succeed("sshd -T | grep -qx 'passwordauthentication no'")
    bootstrap.succeed("sshd -T | grep -qx 'permitrootlogin no'")
    bootstrap.fail("grep -q '^AllowUsers .*root' /etc/ssh/sshd_config")
    bootstrap.succeed("grep -q '^AllowUsers .*pi' /etc/ssh/sshd_config")
    bootstrap.succeed("ip addr add 192.0.2.20/24 dev eth1")
    bootstrap.succeed("sudo -u pi -- sudo -n true")
    bootstrap.succeed("test -f /home/pi/.pi/settings.json")

    steady.start()
    steady.wait_for_unit("multi-user.target", timeout=300)
    steady.wait_for_unit("nixpi-app-setup.service", timeout=120)
    steady.wait_for_unit("sshd.service", timeout=60)
    steady.succeed("sshd -T | grep -qx 'passwordauthentication no'")
    steady.succeed("sshd -T | grep -qx 'permitrootlogin no'")
    steady.fail("grep -q '^AllowUsers .*root' /etc/ssh/sshd_config")
    steady.succeed("grep -q '^AllowUsers .*pi' /etc/ssh/sshd_config")
    steady.succeed("ip addr add 192.0.2.21/24 dev eth1")
    steady.fail("sudo -u pi -- sudo -n true")
    steady.succeed("sudo -u pi -- bash -lc 'nixpi-brokerctl status >/tmp/steady-broker-status.json'")
    steady.wait_for_unit("fail2ban.service", timeout=60)
    steady.succeed("test -f /home/pi/.pi/settings.json")
    steady.succeed("command -v pi")

    client.start()
    client.wait_for_unit("multi-user.target", timeout=120)
    client.wait_until_succeeds("ip -4 addr show dev eth1 | grep -q 'inet '", timeout=60)
    client.succeed("ip addr add 192.0.2.10/24 dev eth1")
    client.succeed("ip addr add 192.0.2.11/24 dev eth1")

    client.succeed("nc -z -w 2 -s 192.0.2.10 192.0.2.20 22")
    client.succeed("nc -z -w 2 -s 192.0.2.10 192.0.2.21 22")
    client.fail("nc -z -w 2 -s 192.0.2.11 192.0.2.20 22")
    client.fail("nc -z -w 2 -s 192.0.2.11 192.0.2.21 22")

    steady.succeed("fail2ban-client status sshd | grep -q 'Status for the jail: sshd'")
    steady.succeed("fail2ban-client get sshd ignoreip | grep -q '192.0.2.10/32'")

    print("NixPI security exposure policy tests passed!")
  '';
}
