{ pkgs, lib, self, ... }:

let
  defaultInputRef =
    if self ? rev then "github:alexradunet/nixpi/${self.rev}" else "github:alexradunet/nixpi";
  fakeRebuild = pkgs.writeShellScript "fake-nixos-rebuild" ''
    printf '%s\0' "$@" > /tmp/nixpi-bootstrap-host.rebuild-args
  '';
  bootstrapPackage = self.packages.${pkgs.stdenv.hostPlatform.system}.nixpi-bootstrap-host;
in
{
  name = "nixpi-bootstrap-host";

  nodes.machine = { ... }: {
    networking.hostName = lib.mkForce "machine";
  };

  testScript = ''
    machine = machines[0]

    machine.start()
    machine.wait_for_unit("multi-user.target", timeout=300)

    machine.succeed("mkdir -p /etc/nixos")
    machine.succeed("printf '%s\\n' '{ ... }: {' '  system.stateVersion = \"25.05\";' '}' > /etc/nixos/configuration.nix")
    machine.succeed("printf '%s\\n' '{ ... }: { }' > /etc/nixos/hardware-configuration.nix")

    machine.succeed(
        "NIXPI_BOOTSTRAP_ROOT=/etc/nixos "
        + "NIXPI_NIXOS_REBUILD=${fakeRebuild} "
        + "${bootstrapPackage}/bin/nixpi-bootstrap-host "
        + "--primary-user alex "
        + "--ssh-allowed-cidr 198.51.100.10/32 "
        + "--hostname vm-host "
        + "--timezone Europe/Bucharest "
        + "--keyboard us"
    )

    machine.succeed("grep -F 'networking.hostName = \"vm-host\";' /etc/nixos/nixpi-host.nix")
    machine.succeed("grep -F 'nixpi.bootstrap.ssh.enable = true;' /etc/nixos/nixpi-host.nix")
    machine.succeed("grep -F 'nixpi.primaryUser = \"alex\";' /etc/nixos/nixpi-host.nix")
    machine.succeed("grep -F 'nixpi.timezone = \"Europe/Bucharest\";' /etc/nixos/nixpi-host.nix")
    machine.succeed("grep -F 'nixpi.keyboard = \"us\";' /etc/nixos/nixpi-host.nix")
    machine.succeed("grep -F 'users.users.root.hashedPassword =' /etc/nixos/nixpi-host.nix")
    machine.succeed("grep -F 'nixpi.nixosModules.nixpi' /etc/nixos/nixpi-integration.nix")
    machine.succeed("grep -F './nixpi-host.nix' /etc/nixos/nixpi-integration.nix")
    machine.succeed("grep -F 'inputs.nixpi.url = \"${defaultInputRef}\";' /etc/nixos/flake.nix")
    machine.succeed("grep -F 'system = \"x86_64-linux\";' /etc/nixos/flake.nix")
    machine.succeed("grep -F 'specialArgs = { inherit nixpi; };' /etc/nixos/flake.nix")
    machine.succeed("grep -F './nixpi-integration.nix' /etc/nixos/flake.nix")
    machine.succeed("grep -F './hardware-configuration.nix' /etc/nixos/flake.nix")
    machine.fail("grep -F 'system = builtins.currentSystem;' /etc/nixos/flake.nix")
    machine.fail("grep -F 'inputs.nixpi.url = \"path:/nix/store/' /etc/nixos/flake.nix")
    machine.succeed("grep -F 'primary_user=alex' /root/nixpi-bootstrap-passwords.txt")
    machine.succeed("grep -F 'root_password=' /root/nixpi-bootstrap-passwords.txt")
    machine.succeed("printf '%s\\n' '{ preserved = true; }' > /etc/nixos/nixpi-host.nix")
    machine.fail(
        "NIXPI_BOOTSTRAP_ROOT=/etc/nixos "
        + "NIXPI_NIXOS_REBUILD=${fakeRebuild} "
        + "${bootstrapPackage}/bin/nixpi-bootstrap-host "
        + "--primary-user alex "
        + "--ssh-allowed-cidr 198.51.100.10/32 "
        + "--hostname rerun-host "
        + "> /tmp/nixpi-bootstrap-rerun.out 2> /tmp/nixpi-bootstrap-rerun.err"
    )
    machine.succeed("grep -F '{ preserved = true; }' /etc/nixos/nixpi-host.nix")
    machine.succeed("grep -F 'Refusing to overwrite existing /etc/nixos/nixpi-host.nix.' /tmp/nixpi-bootstrap-rerun.err")
    machine.succeed("grep -F -- '--force' /tmp/nixpi-bootstrap-rerun.err")
    machine.fail(
        "mkdir -p /tmp/nixpi-bootstrap-staging && "
        + "NIXPI_BOOTSTRAP_ROOT=/tmp/nixpi-bootstrap-staging "
        + "${bootstrapPackage}/bin/nixpi-bootstrap-host "
        + "--primary-user alex "
        + "--ssh-allowed-cidr 198.51.100.10/32 "
        + "> /tmp/nixpi-bootstrap-staging.out 2> /tmp/nixpi-bootstrap-staging.err"
    )
    machine.succeed("grep -F 'NIXPI_BOOTSTRAP_ROOT is for tests/staging only' /tmp/nixpi-bootstrap-staging.err")
    machine.succeed("grep -F '/etc/nixos#nixos' /tmp/nixpi-bootstrap-staging.err")
    machine.fail("test -e /tmp/nixpi-bootstrap-staging/nixpi-host.nix")
    machine.succeed("${pkgs.python3}/bin/python3 - <<'PY'\nfrom pathlib import Path\nargs = Path('/tmp/nixpi-bootstrap-host.rebuild-args').read_text(encoding='utf-8').split('\\0')\nassert [arg for arg in args if arg] == ['switch', '--flake', '/etc/nixos#nixos', '--impure']\nPY")
  '';
}
