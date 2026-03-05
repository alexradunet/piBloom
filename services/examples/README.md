# Service reference examples

This folder contains worked reference packages for Bloom service lifecycle patterns.

## Included examples

- `demo-api/`
  - Standard non-socket service package
  - Uses `PublishPort` pattern

- `demo-socket-echo/`
  - Socket-activated reference package
  - Demonstrates `.socket` + `.container` pairing

## Quickstart (copy/paste)

### 1) Standard example: `demo-api`

```bash
cp services/examples/demo-api/quadlet/* ~/.config/containers/systemd/
mkdir -p ~/Garden/Bloom/Skills/demo-api
cp services/examples/demo-api/SKILL.md ~/Garden/Bloom/Skills/demo-api/SKILL.md
systemctl --user daemon-reload
systemctl --user enable --now bloom-demo-api
systemctl --user status bloom-demo-api --no-pager
curl -s http://localhost:9080
```

### 2) Socket reference: `demo-socket-echo`

```bash
cp services/examples/demo-socket-echo/quadlet/* ~/.config/containers/systemd/
mkdir -p ~/Garden/Bloom/Skills/demo-socket-echo
cp services/examples/demo-socket-echo/SKILL.md ~/Garden/Bloom/Skills/demo-socket-echo/SKILL.md
systemctl --user daemon-reload
systemctl --user enable --now bloom-demo-socket-echo.socket
systemctl --user status bloom-demo-socket-echo.socket --no-pager
```

## Cleanup / Uninstall (copy/paste)

Run after testing to remove demo services:

```bash
systemctl --user disable --now bloom-demo-api 2>/dev/null || true
systemctl --user disable --now bloom-demo-socket-echo.socket 2>/dev/null || true
systemctl --user disable --now bloom-demo-socket-echo 2>/dev/null || true
rm -f ~/.config/containers/systemd/bloom-demo-api.container
rm -f ~/.config/containers/systemd/bloom-demo-socket-echo.container
rm -f ~/.config/containers/systemd/bloom-demo-socket-echo.socket
rm -rf ~/Garden/Bloom/Skills/demo-api
rm -rf ~/Garden/Bloom/Skills/demo-socket-echo
systemctl --user daemon-reload
```

## Production reference

For a real in-tree socket-activated service, see:

- `../whisper/quadlet/`
