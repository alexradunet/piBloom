# Infrastructure

> Runtime services and access infrastructure

## Operator-Facing Runtime

NixPI exposes a remote web app through the built-in host services.

### Configuration

| Setting | Value |
|---------|-------|
| Chat backend service | `nixpi-chat.service` |
| Browser terminal service | `nixpi-ttyd.service` |
| Public entrypoint | `nginx` on `/` and `/terminal/` |
| Internal backend probe | `http://127.0.0.1:8080/` |

### Troubleshooting

```bash
# Public surface
systemctl status nginx.service
systemctl status nixpi-ttyd.service

# Chat backend
systemctl status nixpi-chat.service
journalctl -u nixpi-chat.service -n 100

# Restart services
sudo systemctl restart nginx.service
sudo systemctl restart nixpi-chat.service
sudo systemctl restart nixpi-ttyd.service
```

## Access Network (NetBird)

NetBird is the required remote-access layer for the supported deployment path.

### Setup

NetBird is configured during bootstrap or first-boot setup. You can connect with:

- **Web login (OAuth)** for interactive enrollment
- **Setup key** for headless or automated setup
- **Manual later setup** with `sudo netbird up`

### Adding Peers

Install NetBird on your laptop, phone, or admin workstation from <https://netbird.io/download> and sign in with the same account. Devices on the same account can then reach the NixPI host through the private mesh.

### Operations

```bash
netbird status
journalctl -u netbird.service -n 100
sudo netbird up
sudo systemctl restart netbird.service
```

## Related

- [Security Model](./security-model)
- [Quick Deploy](../operations/quick-deploy)
- [First Boot Setup](../operations/first-boot-setup)
