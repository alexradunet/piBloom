# core/os/modules/matrix.nix
{ pkgs, config, lib, ... }:

let
  resolved = import ../lib/resolve-primary-user.nix { inherit lib config; };
  primaryHome = resolved.resolvedPrimaryHome;
  stateDir = config.nixpi.stateDir;
  secretDir = "${stateDir}/secrets";
  setupCompleteFile = "${primaryHome}/.nixpi/.setup-complete";
  matrixBindsLocally =
    config.nixpi.matrix.bindAddress == "127.0.0.1"
    || config.nixpi.matrix.bindAddress == "::1"
    || config.nixpi.matrix.bindAddress == "localhost";
  generatedRegistrationSecretFile = "${secretDir}/matrix-registration-shared-secret";
  generatedMacaroonSecretFile = "${secretDir}/matrix-macaroon-secret-key";
  registrationSecretFile =
    if config.nixpi.matrix.registrationSharedSecretFile != null then
      config.nixpi.matrix.registrationSharedSecretFile
    else
      generatedRegistrationSecretFile;
  macaroonSecretFile =
    if config.nixpi.matrix.macaroonSecretKeyFile != null then
      config.nixpi.matrix.macaroonSecretKeyFile
    else
      generatedMacaroonSecretFile;
in
{
  imports = [ ./options.nix ];

  assertions = [
    {
      assertion = config.nixpi.matrix.bindAddress != "";
      message = "nixpi.matrix.bindAddress must not be empty.";
    }
  ];

  systemd.tmpfiles.rules = [
    "d ${secretDir} 0750 root matrix-synapse -"
    "d /var/lib/matrix-synapse 0750 matrix-synapse matrix-synapse -"
    "d /var/lib/matrix-synapse/media_store 0750 matrix-synapse matrix-synapse -"
  ];

  services.matrix-synapse = {
    enable = true;
    
    settings = {
      server_name = config.networking.hostName;
      public_baseurl = "http://localhost:${toString config.nixpi.matrix.port}";
      
      listeners = [
        {
          port = config.nixpi.matrix.port;
          bind_addresses = [ config.nixpi.matrix.bindAddress ];
          type = "http";
          tls = false;
          x_forwarded = false;
          resources = [
            {
              names = [ "client" "federation" ];
              compress = true;
            }
          ];
        }
      ];
      
      # Use SQLite for simplicity (suitable for single-user/embedded use)
      database.name = "sqlite3";
      database.args = {
        database = "/var/lib/matrix-synapse/homeserver.db";
      };
      
      # Registration settings
      enable_registration = config.nixpi.matrix.enableRegistration;
      enable_registration_without_verification = config.nixpi.matrix.enableRegistration;
      suppress_key_server_warning = true;
      
      # Don't require email verification
      registrations_require_3pid = [];
      
      # Disable federation (private homeserver)
      federation_domain_whitelist = [];
      
      # Limit request size for file uploads
      max_upload_size = config.nixpi.matrix.maxUploadSize;
      
      # Disable presence (reduces resource usage)
      use_presence = false;
      
      # URL preview settings
      url_preview_enabled = false;
    };
    
    # Extra configuration lines for runtime secrets
    extraConfigFiles = [ "/var/lib/matrix-synapse/extra.yaml" ];
  };

  # Override the systemd service to add bootstrap script and ensure proper ordering
  systemd.services.matrix-synapse = {
    serviceConfig = {
      # Ensure data directory exists with proper permissions
      PermissionsStartOnly = true;
      StateDirectory = "matrix-synapse";
      StateDirectoryMode = "0750";
    };
    preStart = ''
      TOKEN_FILE="${registrationSecretFile}"
      MACAROON_FILE="${macaroonSecretFile}"
      if [ ! -f "$TOKEN_FILE" ]; then
        ${pkgs.openssl}/bin/openssl rand -hex 32 > "$TOKEN_FILE"
        chown root:matrix-synapse "$TOKEN_FILE"
        chmod 0640 "$TOKEN_FILE"
      fi

      if [ ! -f "$MACAROON_FILE" ]; then
        ${pkgs.openssl}/bin/openssl rand -hex 32 > "$MACAROON_FILE"
        chown root:matrix-synapse "$MACAROON_FILE"
        chmod 0640 "$MACAROON_FILE"
      fi
      
      # Render a stable runtime secret config for Synapse from the selected
      # operator-managed or generated secret files.
      if [ -f "$TOKEN_FILE" ] && [ -f "$MACAROON_FILE" ]; then
        SECRET=$(cat "$TOKEN_FILE")
        MACAROON_SECRET=$(cat "$MACAROON_FILE")
        ENABLE_REGISTRATION="${if config.nixpi.matrix.keepRegistrationAfterSetup then (if config.nixpi.matrix.enableRegistration then "true" else "false") else "dynamic"}"
        ENABLE_REGISTRATION_WITHOUT_VERIFICATION="false"
        if [ "$ENABLE_REGISTRATION" = "dynamic" ]; then
          if [ -f "${setupCompleteFile}" ]; then
            ENABLE_REGISTRATION="false"
          else
            ENABLE_REGISTRATION="${if config.nixpi.matrix.enableRegistration then "true" else "false"}"
          fi
        fi
        if [ "$ENABLE_REGISTRATION" = "true" ]; then
          ENABLE_REGISTRATION_WITHOUT_VERIFICATION="${if config.nixpi.matrix.enableRegistration then "true" else "false"}"
        fi
        cat > /var/lib/matrix-synapse/extra.yaml <<EOF
registration_shared_secret: "$SECRET"
macaroon_secret_key: "$MACAROON_SECRET"
enable_registration: $ENABLE_REGISTRATION
enable_registration_without_verification: $ENABLE_REGISTRATION_WITHOUT_VERIFICATION
EOF
        chown root:matrix-synapse /var/lib/matrix-synapse/extra.yaml
        chmod 0640 /var/lib/matrix-synapse/extra.yaml
      fi
    '';
  };

  # Ensure openssl is available for bootstrap
  environment.systemPackages = [ pkgs.openssl ];

  warnings = lib.optional
    (config.nixpi.matrix.enableRegistration
      && !config.nixpi.security.enforceServiceFirewall
      && !matrixBindsLocally) ''
    nixPI Matrix registration is enabled while Synapse is listening on
    `${config.nixpi.matrix.bindAddress}` without the trusted-interface firewall
    restriction. Registration should be disabled or Matrix should be kept local.
  '';
}
