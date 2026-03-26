{ pkgs, lib, self }:

{
  mkBaseNode = extraConfig: {
    virtualisation.diskSize = 20480;
    virtualisation.memorySize = 4096;
    virtualisation.graphics = false;

    boot.loader.systemd-boot.enable = true;
    boot.loader.efi.canTouchEfiVariables = true;
    networking.hostName = lib.mkDefault "nixos";
    time.timeZone = "UTC";
    i18n.defaultLocale = "en_US.UTF-8";
    networking.networkmanager.enable = true;
    system.stateVersion = "25.05";
  } // extraConfig;

  mkManagedUserConfig = {
    username,
    homeDir ? "/home/${username}",
    extraGroups ? [ "wheel" "networkmanager" ],
  }: {
    nixpi.primaryUser = username;

    users.users.${username} = {
      isNormalUser = true;
      group = username;
      inherit extraGroups;
      home = homeDir;
      shell = pkgs.bash;
    };
    users.groups.${username} = {};
  };

  mkPrefillActivation = {
    username,
    homeDir ? "/home/${username}",
    matrixUsername ? "testuser",
    matrixPassword ? "testpassword123",
  }: lib.stringAfter [ "users" ] ''
    mkdir -p ${homeDir}/.nixpi
    cat > ${homeDir}/.nixpi/prefill.env << 'EOF'
PREFILL_USERNAME=${matrixUsername}
PREFILL_MATRIX_PASSWORD=${matrixPassword}
EOF
    chown -R ${username}:${username} ${homeDir}/.nixpi
    chmod 755 ${homeDir}/.nixpi
    chmod 644 ${homeDir}/.nixpi/prefill.env
  '';

  mkTestFilesystems = {
    fileSystems."/" = { device = "/dev/vda"; fsType = "ext4"; };
    fileSystems."/boot" = { device = "/dev/vda1"; fsType = "vfat"; };
  };

  nixPiModules = [
    self.nixosModules.nixpi
  ];

  nixPiModulesNoShell = [
    self.nixosModules.nixpi-no-shell
  ];

  testUtils = pkgs.writeShellScriptBin "nixpi-test-utils" ''
    wait_for_unit_active() {
      local unit="$1"
      local timeout="''${2:-30}"
      local elapsed=0
      
      while ! systemctl is-active "$unit" 2>/dev/null | grep -q active; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ "$elapsed" -ge "$timeout" ]; then
          echo "Timeout waiting for unit $unit"
          return 1
        fi
      done
    }
    
    register_matrix_user() {
      local username="$1"
      local password="$2"
      local homeserver="''${3:-http://localhost:6167}"
      local token="''${4:-}"
      if [ -z "$token" ]; then
        token=$(get_matrix_token)
      fi

      local result
      result=$(curl -s -X POST "''${homeserver}/_matrix/client/v3/register" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$username\",\"password\":\"$password\",\"inhibit_login\":false}")

      if echo "$result" | grep -q '"access_token"'; then
        echo "$result"
        return 0
      fi

      local attempt session auth_payload
      for attempt in 1 2 3 4; do
        session=$(jq -r '.session // empty' <<< "$result")
        if [ -z "$session" ]; then
          break
        fi

        auth_payload=$(
          jq -c \
            --arg session "$session" \
            --arg token "$token" \
            '
            def completed: (.completed // []);
            first(
              (.flows // [])[]?.stages[]? as $stage
              | select((completed | index($stage)) | not)
              | if $stage == "m.login.registration_token" and ($token | length) > 0 then
                  { type: $stage, session: $session, token: $token }
                elif $stage == "m.login.dummy" then
                  { type: $stage, session: $session }
                else
                  empty
                end
            ) // (
              if ((completed | index("m.login.registration_token")) | not) and ($token | length) > 0 then
                { type: "m.login.registration_token", session: $session, token: $token }
              elif ((completed | index("m.login.dummy")) | not) then
                { type: "m.login.dummy", session: $session }
              else
                empty
              end
            )
            ' <<< "$result"
        )

        if [ -z "$auth_payload" ] || [ "$auth_payload" = "null" ]; then
          break
        fi

        result=$(jq -cn \
          --arg username "$username" \
          --arg password "$password" \
          --argjson auth "$auth_payload" \
          '{ username: $username, password: $password, inhibit_login: false, auth: $auth }' \
          | curl -sf -X POST "''${homeserver}/_matrix/client/v3/register" \
              -H "Content-Type: application/json" \
              -d @-)

        if echo "$result" | grep -q '"access_token"'; then
          echo "$result"
          return 0
        fi
      done

      printf '%s\n' "$result" >&2
      return 1
    }
    
    # Get Matrix registration token from file
    get_matrix_token() {
      local token_file="/var/lib/nixpi/secrets/matrix-registration-shared-secret"
      if [ -f "$token_file" ]; then
        cat "$token_file"
      else
        echo ""
      fi
    }
    
    # Check if Matrix homeserver is ready
    matrix_ready() {
      local homeserver="''${1:-http://localhost:6167}"
      curl -sf "''${homeserver}/_matrix/client/versions" >/dev/null 2>&1
    }
    
    # Wait for Matrix homeserver to be ready
    wait_for_matrix() {
      local homeserver="''${1:-http://localhost:6167}"
      local timeout="''${2:-60}"
      local elapsed=0
      
      while ! matrix_ready "$homeserver"; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ "$elapsed" -ge "$timeout" ]; then
          echo "Timeout waiting for Matrix homeserver"
          return 1
        fi
      done
    }
  '';

}
