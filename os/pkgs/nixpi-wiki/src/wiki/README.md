# NixPI Wiki core

NixPI Wiki stores structured frontmatter next to human-readable plain Markdown notes and keeps generated metadata indexes current.

It is intentionally only a wiki memory layer. It does not know about deployment-specific systems, client adapters, identity/voice layers, or prompt policy.

## Tools

Generic tools exposed by the CLI/dispatcher:

- `wiki_status`
- `wiki_search`
- `wiki_ensure_object`
- `wiki_daily`
- `wiki_ingest`
- `wiki_lint`
- `wiki_rebuild`
- `wiki_decay_pass`
- `wiki_session_capture`

## Initialize a root

```bash
nixpi-wiki init --root ~/NixPI/work-wiki --workspace work --domain work
```

The command copies the bundled generic seed, creates canonical folders, writes generated metadata, and prints environment setup hints. Existing files are kept.

## Storage path

Use NixPI environment variables:

```text
NIXPI_WIKI_WORKSPACE=work
NIXPI_WIKI_ROOT=/path/to/work/wiki
NIXPI_WIKI_DEFAULT_DOMAIN=work
NIXPI_WIKI_HOST=workstation
```

If no root is configured, the default root is:

```text
~/wiki
```

There is one wiki root per workspace. Domains are frontmatter labels inside that root, not separate vaults.

## Canonical folders

```text
pages/home/                         dashboards and navigation
pages/planner/tasks/                task context/archive notes; live state is CalDAV VTODO
pages/planner/calendar/             event context/archive notes; live state is CalDAV VEVENT
pages/planner/reminders/            reminder context/archive notes; live alarms are CalDAV VALARM
pages/planner/reviews/              weekly/monthly reviews
pages/projects/<slug>/              finite outcomes
pages/areas/<slug>/                 ongoing responsibilities
pages/resources/knowledge/          evergreen concepts
pages/resources/people/             person objects
pages/resources/technical/          hosts, services, tools
pages/sources/                      captured evidence and research
pages/journal/daily/                daily notes
pages/journal/weekly/ monthly/      periodic reflections
pages/archives/                     inactive material
```

## Metadata

Generated metadata lives under `meta/` and can be rebuilt with:

```bash
nixpi-wiki mutate wiki_rebuild '{"domain":"work"}'
```

Read tools rebuild missing generated metadata when needed.

## Safety model

- Read-only tools can run with `nixpi-wiki call`.
- Wiki writes should use `nixpi-wiki mutate` or `nixpi-wiki call ... --yes`.
- Protected raw/proposal paths are adapter policy; core tools expose structured mutation paths.
