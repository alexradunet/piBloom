{
  nixPiModulesNoShell,
  mkTestFilesystems,
  mkManagedUserConfig,
  ...
}:

{
  name = "nixpi-update";

  nodes.machine = _: {
    imports = nixPiModulesNoShell ++ [
      mkTestFilesystems
      (mkManagedUserConfig { username = "tester"; })
    ];

    nixpi.primaryUser = "tester";
    networking.hostName = "nixpi-update-test";
    system.stateVersion = "25.05";
  };

  testScript = ''
    machine = machines[0]

    machine.start()
    machine.wait_for_unit("multi-user.target", timeout=300)

    machine.succeed("systemctl cat nixos-upgrade.service >/dev/null")
    machine.succeed("systemctl cat nixpi-update.timer >/dev/null")

    machine.succeed("systemctl show nixpi-update.timer -p Unit --value | grep -qx 'nixos-upgrade.service'")
    machine.succeed("systemctl cat nixpi-update.timer | grep -q '^OnBootSec=5min$'")
    machine.succeed("systemctl cat nixpi-update.timer | grep -q '^OnUnitActiveSec=6h$'")

    machine.succeed("systemctl show nixpi-update.service -p Names --value | grep -q 'nixos-upgrade.service'")
    machine.succeed("systemctl show nixpi-update.service -p FragmentPath --value | grep -q 'nixos-upgrade.service'")
    machine.succeed(
        "script=$(systemctl cat nixos-upgrade.service | sed -n 's/^ExecStart=//p' | awk '{print $1}' | head -n1); "
        + "test -n \"$script\"; "
        + "grep -q -- '--flake /etc/nixos#nixos' \"$script\""
    )
    machine.succeed(
        "script=$(systemctl cat nixos-upgrade.service | sed -n 's/^ExecStart=//p' | awk '{print $1}' | head -n1); "
        + "test -n \"$script\"; "
        + "grep -q -- '--impure' \"$script\""
    )

    print('Native nixpi-update unit wiring looks correct!')
  '';
}
