{
  pkgs,
  lib,
  ...
}: let
  wsCheckScript = pkgs.writeScript "ws-check.py" ''
    import socket, base64, os
    s = socket.socket()
    s.connect(("127.0.0.1", 8081))
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((
        "GET / HTTP/1.1\r\n"
        "Host: 127.0.0.1:8081\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    ).encode())
    resp = s.recv(4096).decode(errors="replace")
    assert "101" in resp, f"Expected 101 Switching Protocols, got: {resp!r}"
    s.close()
    print("WebSocket upgrade: OK")
  '';

  # Full round-trip: send a /help message and assert the builtin reply arrives.
  # The /help command is handled inline by the Router (no Pi SDK call needed),
  # so the test is deterministic and does not require a provider credential.
  wsRoundtripScript = pkgs.writeScript "ws-roundtrip.py" (builtins.readFile ./ws-roundtrip-check.py);
in
  pkgs.testers.runNixOSTest {
    name = "gateway-loopback";

    nodes.vm = {...}: {
      # Gateway module imports paths itself; no explicit import needed.
      imports = [
        ../../features/nixos/service-gateway/module.nix
      ];

      networking.hostName = "gateway-test";
      system.stateVersion = "26.05";

      # Gateway runs as the ownloom human user (default "human" from paths).
      users.users.human = {
        isSystemUser = true;
        group = "users";
        home = "/home/human";
        createHome = true;
      };

      # Credential setup — created by tmpfiles-setup before any service starts.
      systemd.tmpfiles.rules = [
        "d /run/secrets 0755 root root -"
        "f /run/secrets/synthetic_api_key 0600 root root - fake-key-for-test"
        "d /home/human/.pi 0700 human users -"
        "d /home/human/.pi/agent 0700 human users -"
      ];

      services.ownloom-gateway = {
        enable = true;
        user = "human";
        group = "users";
        settings = {
          # /var/lib/ownloom-gateway is created by StateDirectory before ExecStartPre
          # runs, so WorkingDirectory is guaranteed to exist.
          pi.cwd = "/var/lib/ownloom-gateway";
          # /tmp is always present; the wiki dir only needs to be a valid path.
          wiki.dir = "/tmp";
          # Disable audio transcription to avoid pulling whisper-cpp, ffmpeg,
          # and the 163 MB ggml-base.bin model into the test closure.
          audioTranscription = {
            enabled = false;
            command = "false";
            ffmpegCommand = "false";
            modelPath = "/dev/null";
          };
          transports.websocket = {
            enable = true;
            host = "127.0.0.1";
            port = 8081;
          };
        };
      };

      # Strip heavy packages that are only needed for operational message
      # handling (nixos-rebuild, podman), not for startup + WebSocket binding.
      systemd.services.ownloom-gateway.path = lib.mkForce [
        pkgs.pi
        pkgs.coreutils
        pkgs.findutils
        pkgs.gnugrep
        pkgs.git
        pkgs.openssh
        pkgs.nodejs
        pkgs.ownloom-planner
      ];

      environment.systemPackages = [pkgs.curl pkgs.python3];
    };

    testScript = ''
      vm.start()
      vm.wait_for_unit("ownloom-gateway.service")
      vm.wait_for_open_port(8081)

      # HTTP server on the same port should respond (200 bundled UI or 404
      # fallback — either confirms the process is alive and serving).
      code = vm.succeed(
          "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/"
      ).strip()
      assert code in ("200", "404"), f"Unexpected HTTP status: {code!r}"

      # WebSocket upgrade must be accepted (101 Switching Protocols).
      vm.succeed("python3 ${wsCheckScript}")

      # Full message round-trip: /help is a builtin that the Router handles
      # without calling Pi SDK. Confirms end-to-end WebSocket message routing.
      vm.succeed(
          "python3 ${wsRoundtripScript} 127.0.0.1 8081 '/help' '/reset'"
      )
    '';
  }
