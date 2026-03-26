{ lib, nixPiModulesNoShell, piAgent, appPackage, setupPackage, mkTestFilesystems, ... }:

{
  name = "nixpi-daemon";

  nodes = {
    nixpi = { pkgs, ... }: let
      username = "pi";
      homeDir = "/home/${username}";
    in {
      imports = nixPiModulesNoShell ++ [ mkTestFilesystems ];
      _module.args = { inherit piAgent appPackage setupPackage; };
      nixpi.primaryUser = username;

      virtualisation.diskSize = 10240;
      virtualisation.memorySize = 2048;

      networking.hostName = "nixpi-agent";
      time.timeZone = "UTC";
      i18n.defaultLocale = "en_US.UTF-8";
      networking.networkmanager.enable = true;
      system.stateVersion = "25.05";
      boot.loader.systemd-boot.enable = true;
      boot.loader.efi.canTouchEfiVariables = true;
      users.users.${username} = {
        isNormalUser = true;
        group = username;
        extraGroups = [ "wheel" "networkmanager" ];
        home = homeDir;
        shell = pkgs.bash;
      };
      users.groups.${username} = {};

      systemd.tmpfiles.rules = [
        "d ${homeDir}/.nixpi 0755 ${username} ${username} -"
        "d ${homeDir}/.nixpi/wizard-state 0755 ${username} ${username} -"
        "f ${homeDir}/.nixpi/wizard-state/system-ready 0644 ${username} ${username} -"
      ];

      system.activationScripts.nixpi-daemon-creds = lib.stringAfter [ "users" ] ''
        install -d -m 0700 -o ${username} -g ${username} ${homeDir}/.pi
      '';
    };
  };

  testScript = ''
    import json

    nixpi = machines[0]
    username = "pi"
    home = "/home/pi"

    nixpi.start()
    nixpi.wait_for_unit("multi-user.target", timeout=300)

    nixpi.succeed("mkdir -p /home/pi/.pi")
    nixpi.succeed(
        "cat > /home/pi/.pi/matrix-credentials.json <<'CREDS'\n"
        + "{\n"
        + '  "homeserver": "https://matrix.org",\n'
        + '  "botUserId": "@testdaemon:matrix.org",\n'
        + '  "botAccessToken": "test_access_token_daemon"\n'
        + "}\n"
        + "CREDS"
    )
    nixpi.succeed("chown -R pi:pi /home/pi/.pi")

    nixpi.succeed(
        "mkdir -p " + home + "/.nixpi/wizard-state && touch " + home + "/.nixpi/wizard-state/system-ready && chown -R "
        + username + ":" + username + " " + home + "/.nixpi"
    )
    nixpi.succeed("mkdir -p /srv/nixpi && chown -R " + username + ":" + username + " /srv/nixpi")

    nixpi.succeed("systemctl start nixpi-daemon.service || true")

    nixpi.succeed("test -f /etc/systemd/system/nixpi-daemon.service")
    nixpi.succeed("test -d /usr/local/share/nixpi")
    nixpi.succeed("test -f /usr/local/share/nixpi/dist/core/daemon/index.js")

    nixpi.wait_until_succeeds(
        "systemctl is-active nixpi-daemon.service | grep -Eq 'active|activating'",
        timeout=30,
    )
    daemon_status = nixpi.succeed("systemctl is-active nixpi-daemon.service || true").strip()
    journal = nixpi.succeed("journalctl -u nixpi-daemon.service -n 20 --no-pager || true")
    print("nixpi-daemon status: " + daemon_status)
    print("nixpi-daemon journal: " + journal)
    assert daemon_status in ["active", "activating"], "Unexpected nixpi-daemon status: " + daemon_status

    service_unit = nixpi.succeed("systemctl cat nixpi-daemon.service")
    exec_start = nixpi.succeed("systemctl show -p ExecStart --value nixpi-daemon.service")
    environment = nixpi.succeed("systemctl show -p Environment --value nixpi-daemon.service")
    working_directory = nixpi.succeed("systemctl show -p WorkingDirectory --value nixpi-daemon.service").strip()
    assert "node" in exec_start and "/usr/local/share/nixpi/dist/core/daemon/index.js" in exec_start, \
        "Unexpected ExecStart in nixpi-daemon service: " + exec_start
    assert "NIXPI_DIR=/home/pi/nixpi" in environment, "Expected NIXPI_DIR workspace environment in nixpi-daemon service"
    assert "NIXPI_CANONICAL_REPO_DIR=/srv/nixpi" in environment, "Expected canonical repo environment in nixpi-daemon service"
    assert "PI_CODING_AGENT_DIR=/home/pi/.pi" in environment, \
        "Expected PI_CODING_AGENT_DIR environment in nixpi-daemon service"
    assert working_directory == "/srv/nixpi", "Unexpected WorkingDirectory: " + working_directory
    nixpi.succeed("ls -la /usr/local/share/nixpi/")

    nixpi.succeed("test -f /home/pi/.pi/matrix-credentials.json")
    creds = json.loads(nixpi.succeed("cat /home/pi/.pi/matrix-credentials.json"))
    assert creds["homeserver"] == "https://matrix.org", "Credentials missing homeserver"
    assert creds["botUserId"] == "@testdaemon:matrix.org", "Credentials missing botUserId"
    assert creds["botAccessToken"] == "test_access_token_daemon", "Credentials missing botAccessToken"

    print("All nixpi-daemon tests passed!")
    print("Note: Full daemon connection test requires complete Matrix network setup")
  '';
}
