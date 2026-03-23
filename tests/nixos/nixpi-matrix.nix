{ lib, nixPiModules, nixPiModulesNoShell, piAgent, appPackage, setupPackage, mkTestFilesystems, ... }:

{
  name = "nixpi-matrix";

  nodes.server = { ... }: {
    imports = nixPiModules ++ [ mkTestFilesystems ];
    _module.args = { inherit piAgent appPackage setupPackage; };
    nixpi.primaryUser = "tester";

    virtualisation.diskSize = 20480;
    virtualisation.memorySize = 4096;

    boot.loader.systemd-boot.enable = true;
    boot.loader.efi.canTouchEfiVariables = true;
    networking.hostName = "nixpi-matrix-test";
    time.timeZone = "UTC";
    i18n.defaultLocale = "en_US.UTF-8";
    networking.networkmanager.enable = true;
    system.stateVersion = "25.05";
  };

  testScript = ''
    server = machines[0]

    server.start()

    server.wait_for_unit("multi-user.target", timeout=300)

    server.wait_until_succeeds("ip -4 addr show dev eth1 | grep -q 'inet '", timeout=60)

    server.wait_for_unit("continuwuity.service", timeout=60)

    server.succeed("curl -sf http://localhost:6167/_matrix/client/versions")

    server.succeed("test -f /var/lib/nixpi/secrets/matrix-registration-shared-secret")
    server.succeed("grep -q 'server_name = \"nixpi-matrix-test\"' /var/lib/continuwuity/continuwuity.toml")

    token_perms = server.succeed("stat -c '%a' /var/lib/nixpi/secrets/matrix-registration-shared-secret").strip()
    assert token_perms == "640", f"Unexpected token permissions: {token_perms}"

    token = server.succeed("cat /var/lib/nixpi/secrets/matrix-registration-shared-secret").strip()
    assert len(token) > 0, "Registration token is empty"

    service_content = server.succeed("systemctl cat continuwuity.service")
    assert "continuwuity" in service_content, "Missing continuwuity unit content"

    status = server.succeed("systemctl show continuwuity.service -p User --value").strip()
    assert status in ["continuwuity", ""] or "dynamic" in status.lower(), f"Unexpected service user: {status}"

    server.succeed("test -d /var/lib/continuwuity")

    old_token = token
    server.succeed("systemctl restart continuwuity.service")
    server.wait_for_unit("continuwuity.service", timeout=60)
    server.succeed("curl -sf http://localhost:6167/_matrix/client/versions")
    new_token = server.succeed("cat /var/lib/nixpi/secrets/matrix-registration-shared-secret").strip()
    assert old_token == new_token, "Matrix registration secret changed across restart"

    server.succeed("systemctl list-dependencies multi-user.target | grep -q continuwuity")

    print("All nixpi-matrix tests passed!")
  '';
}
