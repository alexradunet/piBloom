{
  nixPiModulesNoShell,
  mkTestFilesystems,
  mkManagedUserConfig,
  ...
}:

{
  name = "nixpi-options-validation";

  nodes = {
    defaults = _: {
      imports = nixPiModulesNoShell ++ [
        mkTestFilesystems
        (mkManagedUserConfig { username = "pi"; })
      ];

      networking.hostName = "nixpi-defaults-test";
    };

    overrides = _: {
      imports = nixPiModulesNoShell ++ [
        mkTestFilesystems
        (mkManagedUserConfig { username = "pi"; })
      ];

      networking.hostName = "nixpi-overrides-test";

      nixpi = {
        services.home.port = 9090;
        security = {
          fail2ban.enable = false;
          ssh.passwordAuthentication = true;
        };
      };
    };
  };

  testScript = ''
    defaults = machines[0]
    overrides = machines[1]

    defaults.start()
    defaults.wait_for_unit("multi-user.target", timeout=300)

    defaults.succeed("id pi")

    defaults.wait_until_succeeds("curl -skf https://localhost/ | grep -q 'NixPI'", timeout=60)

    broker_cfg = defaults.succeed(
        "systemctl show nixpi-broker.service -p Environment --value"
        " | grep -oP 'NIXPI_BROKER_CONFIG=\\K\\S+'"
    ).strip()
    defaults.succeed(f"grep -q maintain {broker_cfg}")

    defaults.succeed("systemctl is-active fail2ban")
    defaults.succeed("sshd -T | grep -i 'passwordauthentication no'")

    overrides.start()
    overrides.wait_for_unit("multi-user.target", timeout=300)

    overrides.fail("systemctl is-active fail2ban")
    overrides.succeed("sshd -T | grep -i 'passwordauthentication yes'")

    print("All nixpi-options-validation tests passed!")
  '';
}
