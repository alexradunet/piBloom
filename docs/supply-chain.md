# Supply Chain And Image Policy

> 📖 [Emoji Legend](LEGEND.md)

Audience: maintainers changing packaged images, install flows, or image trust policy.

## 🌱 Why This Policy Exists

Bloom packages software that runs on user-owned hosts.

Image sourcing rules exist to make package trust decisions explicit and to avoid silent drift from mutable remote tags.

## 🛡️ How The Current Policy Works

For packaged services and bridges, prefer:

1. digests
2. explicit non-`latest` tags

Disallowed by policy for normal remote images:

- implicit `latest`
- `latest*`

This rule is enforced by `validatePinnedImage()` for `service_scaffold`.

### Current Exception

`services/catalog.yaml` intentionally includes one mutable local-build image:

- `code-server` -> `localhost/bloom-code-server:latest`

Reason:

- the service is built locally from repository source before installation
- Bloom rebuilds the local image during install instead of trusting an already-present mutable tag
- the mutable tag refers to a local artifact, not to a remote registry trust decision

### What `service_install` Does Today

Depending on the package, installation may:

- copy Quadlet and skill assets from the bundled package
- rebuild a local image for `localhost/*` refs
- download declared model artifacts into Podman volumes
- update `~/Bloom/manifest.yaml`

Installation is not fully hermetic today. It is reproducible at the package-layout level, but some flows still depend on the local host and network.

## 📚 Reference

Current repo sources of truth:

- `services/catalog.yaml` for packaged service and bridge image refs
- `services/*/quadlet/` for runtime unit behavior
- `core/os/Containerfile` and `justfile` for the Bloom OS image

Review checklist:

- are remote runtime images pinned
- are local-image exceptions documented
- do docs describe actual installation behavior, including local builds and downloads
- does `services/catalog.yaml` still match the packaged services in the repo

## 🔗 Related

- [service-architecture.md](service-architecture.md)
- [../services/catalog.yaml](../services/catalog.yaml)
