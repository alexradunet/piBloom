# nixpi

Nazar's private web interface for [Pi Coding Agent](https://github.com/badlogic/pi-mono).

`nixpi` is a lightweight Express/WebSocket application that spawns `pi --mode rpc` and exposes the existing Pi RPC functionality in a browser: streaming chat, session management, model switching, thinking levels, image input, command palette, session export, and optional Whisper speech-to-text.

## Why this exists

NixPi is the base web surface around Pi for Nazar and OwnLoom. It is intended to run:

- on the `nazar` host for host-side development/operator work;
- inside each Nazar MicroVM for VM-local Pi sessions;
- behind WireGuard/private DNS only when deployed as infrastructure.

It deliberately reuses Pi RPC instead of replacing Pi internals.

## Quick start

```bash
npm install
NIXPI_CWD="$PWD" npm start
# open http://localhost:4815
```

Or via the CLI entry point:

```bash
npm install -g .
nixpi
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `NIXPI_PORT` | `4815` | Server port |
| `NIXPI_HOST` | `0.0.0.0` | Server bind address |
| `NIXPI_CWD` | `$HOME` | Working directory for Pi |
| `NIXPI_PI_BIN` | `pi` | Path to Pi binary |
| `OPENAI_API_KEY` | unset | Optional Whisper speech-to-text key |

## Nix/NixOS

This flake exports:

- `packages.x86_64-linux.nixpi`
- `overlays.default`
- `nixosModules.nixpi`

Example NixOS module usage:

```nix
{
  imports = [ inputs.nixpi.nixosModules.nixpi ];

  services.nixpi = {
    enable = true;
    user = "alex";
    group = "users";
    home = "/home/alex";
    workingDirectory = "/home/alex";
    host = "127.0.0.1";
    port = 4815;
    piBinary = "/run/current-system/sw/bin/pi";
  };
}
```

## Architecture

```text
Browser ←→ WebSocket ←→ nixpi (Express) ←→ Pi (`pi --mode rpc`)
```

NixPi keeps state in the normal Pi session directory for the configured `HOME` and `NIXPI_CWD`. It does not require browser-held provider secrets; Pi uses its local configuration.

## Development checks

```bash
npm install
node --check server.js
node --check bin/nixpi.js
nix flake check --no-build
```

## License

[MIT](LICENSE). NixPi is derived from the original `wgnr-pi` MIT project; original copyright notices are preserved in the license.
