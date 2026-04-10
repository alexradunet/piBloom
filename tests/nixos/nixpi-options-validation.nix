{
  lib,
  nixPiModulesNoShell,
  mkTestFilesystems,
  mkManagedUserConfig,
  ...
}:

{
  name = "nixpi-options-validation";

  nodes = {
    defaults =
      { config, options, ... }:
      {
        imports = nixPiModulesNoShell ++ [
          mkTestFilesystems
          (mkManagedUserConfig { username = "pi"; })
        ];

        networking.hostName = "nixpi-defaults-test";

        environment.etc = {
          "nixpi-tests/ssh-password-auth".text =
            if config.services.openssh.settings.PasswordAuthentication then "yes" else "no";
          "nixpi-tests/has-ssh-cidr-option".text =
            if lib.hasAttrByPath [ "nixpi" "security" "ssh" "allowedSourceCIDRs" ] options then "yes" else "no";
          "nixpi-tests/ssh-source-cidrs".text =
            builtins.concatStringsSep "," config.nixpi.security.ssh.allowedSourceCIDRs;
        };
      };

    overrides =
      { config, options, ... }:
      {
        imports = nixPiModulesNoShell ++ [
          mkTestFilesystems
          (mkManagedUserConfig { username = "pi"; })
        ];

        networking.hostName = "nixpi-overrides-test";

        nixpi = {
          agent.autonomy = "observe";
          security = {
            fail2ban.enable = false;
            ssh = {
              allowedSourceCIDRs = [
                "198.51.100.10/32"
                "2001:db8::/48"
              ];
            };
          };
        };

        environment.etc = {
          "nixpi-tests/ssh-password-auth".text =
            if config.services.openssh.settings.PasswordAuthentication then "yes" else "no";
          "nixpi-tests/has-ssh-cidr-option".text =
            if lib.hasAttrByPath [ "nixpi" "security" "ssh" "allowedSourceCIDRs" ] options then "yes" else "no";
          "nixpi-tests/ssh-source-cidrs".text =
            builtins.concatStringsSep "," config.nixpi.security.ssh.allowedSourceCIDRs;
        };
      };
  };

  testScript = ''
    defaults = machines[0]
    overrides = machines[1]

    defaults.start()
    defaults.wait_for_unit("multi-user.target", timeout=300)

    defaults.succeed("id pi")
    defaults.succeed("systemctl cat nixpi-broker.service >/dev/null")
    defaults.succeed("systemctl cat nixpi-update.timer >/dev/null")

    defaults.succeed("nixpi-brokerctl status | jq -r .defaultAutonomy | grep -qx maintain")

    defaults.fail("systemctl is-active fail2ban")
    defaults.succeed("grep -qx 'no' /etc/nixpi-tests/ssh-password-auth")
    defaults.succeed("grep -qx 'yes' /etc/nixpi-tests/has-ssh-cidr-option")

    overrides.start()
    overrides.wait_for_unit("multi-user.target", timeout=300)

    overrides.fail("systemctl is-active fail2ban")
    overrides.succeed("grep -qx 'no' /etc/nixpi-tests/ssh-password-auth")
    overrides.succeed("nixpi-brokerctl status | jq -r .defaultAutonomy | grep -qx observe")
    overrides.succeed("grep -qx 'yes' /etc/nixpi-tests/has-ssh-cidr-option")
    overrides.succeed("grep -qx '198.51.100.10/32,2001:db8::/48' /etc/nixpi-tests/ssh-source-cidrs")

    print("All nixpi-options-validation tests passed!")
  '';
}
