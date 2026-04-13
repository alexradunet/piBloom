# NixPI Pi Gateway

A small TypeScript gateway framework that connects transport modules to Pi using the Pi SDK.

Today the first module is Signal. Tomorrow it can be something less obsessed with QR codes.

## Architecture

- `pi-gateway` is the generic channel ingress/egress layer
- transport modules normalize inbound messages and deliver replies
- Pi SDK provides persistent session handling per chat
- `signal-cli` remains the native Signal transport daemon used by the Signal module

## Current module set

- `signal`

## Config shape

```yaml
gateway:
  dbPath: /absolute/path/to/gateway.db
  piSessionDir: /absolute/path/to/pi-sessions
  maxReplyChars: 1400
  maxReplyChunks: 4

pi:
  cwd: /absolute/path/to/workspace

modules:
  signal:
    enabled: true
    account: "+15550001111"
    httpUrl: http://127.0.0.1:8080
    allowedNumbers:
      - "+15550002222"
    adminNumbers:
      - "+15550002222"
    directMessagesOnly: true
```

## Development

```bash
cd /var/lib/nixpi/pi-nixpi/Agents/pi-gateway
npm install
npm run build
npm run dev -- ./pi-gateway.example.yml
```

## Runtime split

- `nixpi-gateway.service` runs the generic gateway core
- `nixpi-signal-daemon.service` runs native `signal-cli` for the Signal module

## Built-in chat commands

- `help`
- `reset`

Everything else is forwarded to Pi.
