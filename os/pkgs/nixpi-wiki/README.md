# NixPI Wiki

Portable plain-Markdown LLM wiki CLI and core tools.

NixPI Wiki is a memory substrate only. It stores, searches, lints, ingests, captures session summaries, and rebuilds wiki knowledge. It does not own identity, voice, client-session policy, or deployment-specific tools.

## CLI

```bash
nixpi-wiki list
nixpi-wiki init --root ~/NixPI/work-wiki --workspace work --domain work
nixpi-wiki context --format markdown
nixpi-wiki call wiki_status '{"domain":"work"}'
nixpi-wiki call wiki_search '{"query":"memory","domain":"work"}'
nixpi-wiki mutate wiki_ingest '{"content":"note","channel":"journal"}'
nixpi-wiki mutate wiki_session_capture '{"summary":"Worked on NixPI wiki docs."}'
```

## Environment

```text
NIXPI_WIKI_ROOT=/path/to/wiki
NIXPI_WIKI_WORKSPACE=work
NIXPI_WIKI_DEFAULT_DOMAIN=work
NIXPI_WIKI_HOST=workstation
NIXPI_WIKI_BODY_SEARCH_BIN=rga
```

If `NIXPI_WIKI_ROOT` is not set, NixPI Wiki uses:

```text
~/wiki
```

## Install standalone

From a local checkout or packed tarball:

```bash
cd os/pkgs/nixpi-wiki
npm run build
npm pack
npm install -g ./nixpi-wiki-0.1.0.tgz
nixpi-wiki init --root ~/work-wiki --workspace work --domain work
```

Local project usage:

```bash
npm install nixpi-wiki
npx nixpi-wiki init --root ./wiki --workspace work --domain work
```

## Initialize a wiki

```bash
nixpi-wiki init --root ~/NixPI/work-wiki --workspace work --domain work
export NIXPI_WIKI_ROOT="$HOME/NixPI/work-wiki"
export NIXPI_WIKI_WORKSPACE="work"
export NIXPI_WIKI_DEFAULT_DOMAIN="work"
nixpi-wiki doctor --json
```

`init` is idempotent. It copies only missing seed files, creates canonical folders, and rebuilds generated metadata.

## Tool boundary

Generic tools:

```text
wiki_status
wiki_search
wiki_ensure_object
wiki_daily
wiki_ingest
wiki_lint
wiki_rebuild
wiki_decay_pass
wiki_session_capture
```

Deployment-specific audits, system operations, identity/voice layers, and client adapters belong in packages that depend on NixPI Wiki.
