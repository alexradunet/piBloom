# NixPI Codebase Guide

> Compact entrypoint for the active subsystems

This section is intentionally brief. The repository itself is the source of truth for file layout; these pages only describe the subsystem boundaries that matter when making changes.

## Subsystems

```
NixPI/
├── core/     # runtime, extensions, NixOS modules, scripts
├── tests/    # TypeScript unit/integration and NixOS VM coverage
├── docs/     # maintainer-facing explanations
└── tools/    # local VM helpers
```

Read in this order for most changes:

1. [Root Files](./root-files)
2. [OS Modules](./os)
3. [Daemon](./daemon)
4. [Pi Extensions](./pi-extensions)
5. [Tests](./tests)

## Related

- [Architecture Overview](../architecture/) - High-level subsystem boundaries
- [Runtime Flows](../architecture/runtime-flows) - End-to-end flows
