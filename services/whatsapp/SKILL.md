---
name: whatsapp
version: 0.3.0
description: WhatsApp messaging bridge via Baileys (containerized)
image: localhost/bloom-whatsapp:latest
---

# WhatsApp Bridge

Connects WhatsApp to Bloom via the channel protocol (Unix socket at `$XDG_RUNTIME_DIR/bloom/channels.sock`). Uses Baileys to connect directly to WhatsApp's WebSocket servers — no browser needed.

## Setup

1. Install the service package: `service_install(name="whatsapp")`
2. Watch logs for QR code: `journalctl --user -u bloom-whatsapp -f`
3. Scan the QR code with WhatsApp mobile app (Settings > Linked Devices > Link a Device)
4. Verify: `systemctl --user status bloom-whatsapp`

## Pairing

On first start, a QR code is printed to the service logs. View it with:

```bash
journalctl --user -u bloom-whatsapp -f
```

Scan the QR code with your WhatsApp mobile app to pair. Auth state persists in the `bloom-whatsapp-auth` volume — you only need to pair once.

## Sending Messages

Use the `/wa` command in Pi to send outbound WhatsApp messages.

## Troubleshooting

- **Won't start**: Check logs: `journalctl --user -u bloom-whatsapp -n 100`
- **Connection lost**: Restart: `systemctl --user restart bloom-whatsapp`
- **Auth expired**: Remove auth volume and re-scan QR:
  ```bash
  systemctl --user stop bloom-whatsapp
  podman volume rm bloom-whatsapp-auth
  systemctl --user start bloom-whatsapp
  ```

## Media Support

The bridge downloads audio, image, and video messages to `/var/lib/bloom/media/` (bind-mounted into the container at `/media/bloom`).
Media metadata is forwarded to Pi via the channel protocol with file paths.
Pi can use installed services (e.g., bloom-stt for transcription) to process media files.
