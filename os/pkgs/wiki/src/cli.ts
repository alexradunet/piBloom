#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { buildWikiContext, callWikiTool } from "./tools/dispatcher.ts";
import { getToolManifestEntry, toolManifest } from "./tools/manifest.ts";
import { getWikiRoot, getWorkspaceProfile, normalizeDomain } from "./wiki/paths.ts";
import { absolutePath, initWikiRoot, renderInitText } from "./lib/seed-init.ts";

function usage(exitCode = 0): never {
  const text = `ownloom-wiki — portable plain-Markdown LLM wiki CLI\n\nUsage:\n  ownloom-wiki list [--json]\n  ownloom-wiki describe <tool> [--json]\n  ownloom-wiki call <tool> [json-params | @file | -] [--json] [--yes]\n  ownloom-wiki mutate <tool> [json-params | @file | -] [--json]\n  ownloom-wiki init [--root <path>] [--workspace <name>] [--domain <domain>] [--json]\n  ownloom-wiki context [--format markdown|json]\n  ownloom-wiki doctor [--domain <domain>] [--json]\n\nExamples:\n  ownloom-wiki list\n  ownloom-wiki call wiki_status '{"domain":"work"}'\n  echo '{"query":"memory","domain":"work"}' | ownloom-wiki call wiki_search - --json\n  ownloom-wiki mutate wiki_ingest '{"content":"note","channel":"journal"}'\n  ownloom-wiki init --root ~/ownloom/work-wiki --workspace work --domain work\n  ownloom-wiki context --format markdown\n  ownloom-wiki doctor\n`;
  console.error(text);
  process.exit(exitCode);
}


function subcommandUsage(command: string, exitCode = 0): never {
  const snippets: Record<string, string> = {
    list: `Usage: ownloom-wiki list [--json]

Show the available wiki tools. Human output is grouped by risk; --json returns the stable manifest array.`,
    describe: `Usage: ownloom-wiki describe <tool> [--json]

Show one tool manifest entry, including risk, mutation flags, and parameter metadata.`,
    call: `Usage: ownloom-wiki call <tool> [json-params | @file | -] [--json] [--yes]

Run a read-only or explicitly approved tool. Wiki mutations are refused unless --yes or OWNLOOM_WIKI_ALLOW_MUTATION=1 is provided. Prefer 'ownloom-wiki mutate <tool> ...' for intentional wiki writes.`,
    mutate: `Usage: ownloom-wiki mutate <tool> [json-params | @file | -] [--json]

Run a tool with wiki/cache mutation policy enabled. Use for intentional writes such as wiki_ingest, wiki_ensure_object, wiki_daily append, wiki_rebuild, or wiki_session_capture.`,
    init: `Usage: ownloom-wiki init [--root <path>] [--workspace <name>] [--domain <domain>] [--json]

Create an idempotent plain-Markdown wiki root from the bundled generic seed, create canonical folders, rebuild generated metadata, and print environment setup hints.`,
    context: `Usage: ownloom-wiki context [--format markdown|json] [--json]

Print the current host/wiki context for reuse by any LLM harness.`,
    doctor: `Usage: ownloom-wiki doctor [--domain <domain>] [--json]

Run a small local health check: wiki status, frontmatter lint, Node runtime, optional Git cleanliness, and optional body-search availability. JSON output includes remediation hints only for failing checks.`,
  };
  console.error(snippets[command] ?? "Unknown subcommand.");
  process.exit(exitCode);
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function commandOk(command: string, args: string[] = []): { ok: boolean; output: string } {
  try {
    const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 });
    return { ok: true, output: output.trim() };
  } catch (err: any) {
    return { ok: false, output: String(err?.stderr || err?.message || err) };
  }
}

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  remediation?: string;
}

function runInit(args: string[]): void {
  const root = absolutePath(flagValue(args, "--root") ?? getWikiRoot());
  const workspace = flagValue(args, "--workspace") ?? process.env.OWNLOOM_WIKI_WORKSPACE ?? "ownloom";
  const domain = flagValue(args, "--domain") ?? process.env.OWNLOOM_WIKI_DEFAULT_DOMAIN ?? "technical";
  const stats = initWikiRoot({ root, workspace, domain });

  if (hasFlag(args, "--json")) console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
  else console.log(renderInitText(stats));
}

async function runDoctor(args: string[], json: boolean): Promise<void> {
  const checks: DoctorCheck[] = [];
  const domain = normalizeDomain(flagValue(args, "--domain")) ?? getWorkspaceProfile().defaultDomain;
  const repo = process.env.OWNLOOM_WIKI_REPO_ROOT ?? process.cwd();
  checks.push({ name: "runtime", ok: true, detail: `node ${process.version}` });
  checks.push({ name: "repo-root", ok: existsSync(repo), detail: repo, remediation: "Run from an existing workspace directory or set OWNLOOM_WIKI_REPO_ROOT." });

  const git = commandOk("git", ["-C", repo, "status", "--short"]);
  if (git.ok) {
    checks.push({ name: "git", ok: git.output.length === 0, detail: git.output || "clean", remediation: "Review, commit, stash, or revert local changes before expecting a clean doctor result." });
  } else {
    checks.push({ name: "git", ok: true, detail: "git unavailable or not a repository; skipped" });
  }

  const wikiStatus = await callWikiTool("wiki_status", { domain });
  checks.push({ name: "wiki-status", ok: !wikiStatus.isError, detail: wikiStatus.content[0]?.text.split("\n")[0] ?? "no output", remediation: `Run ownloom-wiki mutate wiki_rebuild '{"domain":"${domain}"}' and inspect OWNLOOM_WIKI_ROOT.` });
  const frontmatter = await callWikiTool("wiki_lint", { mode: "frontmatter", domain });
  checks.push({ name: "wiki-frontmatter", ok: !frontmatter.isError && /Lint: 0 issues/.test(frontmatter.content[0]?.text ?? ""), detail: frontmatter.content[0]?.text ?? "no output", remediation: `Run ownloom-wiki call wiki_lint '{"mode":"frontmatter","domain":"${domain}"}' --json and fix listed pages.` });

  const bodySearchBin = process.env.OWNLOOM_WIKI_BODY_SEARCH_BIN;
  if (bodySearchBin) {
    const bodySearch = commandOk(bodySearchBin, ["--version"]);
    checks.push({ name: "body-search", ok: bodySearch.ok, detail: bodySearch.ok ? bodySearch.output.split("\n")[0] || bodySearchBin : bodySearch.output, remediation: `Install or correct OWNLOOM_WIKI_BODY_SEARCH_BIN (${bodySearchBin}).` });
  } else {
    checks.push({ name: "body-search", ok: true, detail: "not configured; curation lint will fall back to local heuristics" });
  }

  const ok = checks.every((check) => check.ok);
  if (json) {
    const jsonChecks = checks.map((check) => check.ok ? { name: check.name, ok: check.ok, detail: check.detail } : check);
    console.log(JSON.stringify({ ok, checks: jsonChecks }, null, 2));
  } else {
    console.log(`ownloom wiki doctor: ${ok ? "ok" : "review"}`);
    for (const check of checks) {
      console.log(`- ${check.ok ? "ok" : "review"} ${check.name}: ${check.detail}`);
      if (!check.ok && check.remediation) console.log(`  remediation: ${check.remediation}`);
    }
  }
  if (!ok) process.exitCode = 2;
}

function parseJsonParams(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const source = value === "-"
    ? readFileSync(0, "utf8")
    : value.startsWith("@")
      ? readFileSync(value.slice(1), "utf8")
      : value;
  const trimmed = source.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool parameters must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "help" || command === "--help" || command === "-h") usage(0);

  if (command === "list") {
    if (hasFlag(args, "--help") || hasFlag(args, "-h")) subcommandUsage("list", 0);
    if (hasFlag(args, "--json")) {
      console.log(JSON.stringify(toolManifest, null, 2));
      return;
    }
    const groups = [
      { label: "Read tools", tools: toolManifest.filter((tool) => tool.risk === "read" && !tool.mutatesWiki && !tool.mutatesCache) },
      { label: "Wiki-write tools", tools: toolManifest.filter((tool) => tool.risk === "wiki-write" || tool.mutatesWiki) },
      { label: "Other write/high-impact tools", tools: toolManifest.filter((tool) => tool.risk !== "read" && tool.risk !== "wiki-write" && !tool.mutatesWiki) },
    ].filter((group) => group.tools.length > 0);
    for (const group of groups) {
      console.log(`${group.label}:`);
      for (const tool of group.tools) {
        const risk = tool.requiresConfirmation ? `${tool.risk}, confirm` : tool.risk;
        console.log(`  ${tool.name}\t${risk}\t${tool.description}`);
      }
    }
    return;
  }

  if (["describe", "call", "mutate", "init", "context", "doctor"].includes(command) && (hasFlag(args, "--help") || hasFlag(args, "-h"))) {
    subcommandUsage(command, 0);
  }

  if (command === "describe") {
    const name = args[1];
    if (!name) usage(1);
    const entry = getToolManifestEntry(name);
    if (!entry) throw new Error(`Unknown wiki tool: ${name}`);
    if (hasFlag(args, "--json")) console.log(JSON.stringify(entry, null, 2));
    else {
      console.log(`# ${entry.name}`);
      console.log(`Label: ${entry.label}`);
      console.log(`Risk: ${entry.risk}`);
      console.log(`Mutates wiki: ${entry.mutatesWiki ? "yes" : "no"}`);
      console.log(`Mutates cache: ${entry.mutatesCache ? "yes" : "no"}`);
      console.log(`Requires confirmation: ${entry.requiresConfirmation ? "yes" : "no"}`);
      console.log(`\n${entry.description}`);
      console.log(`\nParameters:\n${JSON.stringify(entry.parameters, null, 2)}`);
    }
    return;
  }

  if (command === "call" || command === "mutate") {
    const name = args[1];
    if (!name) usage(1);
    const entry = getToolManifestEntry(name);
    if (!entry) throw new Error(`Unknown wiki tool: ${name}`);
    const paramsArg = args.find((arg, index) => index >= 2 && !arg.startsWith("--"));
    const params = parseJsonParams(paramsArg);
    const wikiWrite = Boolean(entry.mutatesWiki);
    const envAllowsMutation = process.env.OWNLOOM_WIKI_ALLOW_MUTATION === "1";
    const envAllowsCacheMutation = process.env.OWNLOOM_WIKI_ALLOW_CACHE_MUTATION === "1" || envAllowsMutation;
    const allowMutation = command === "mutate" || hasFlag(args, "--yes") || envAllowsMutation;
    const allowCacheMutation = command === "mutate" || hasFlag(args, "--yes") || envAllowsCacheMutation;
    if ((wikiWrite || entry.requiresConfirmation || entry.risk === "system-write" || entry.risk === "high-impact") && !allowMutation) {
      throw new Error(`Refusing ${entry.risk} tool ${name} without mutation approval. Safe next step: use 'ownloom-wiki mutate ${name} ...' for intentional writes, or add --yes/OWNLOOM_WIKI_ALLOW_MUTATION=1 in a reviewed automation path.`);
    }
    if (entry.mutatesCache && !allowCacheMutation) {
      throw new Error(`Refusing cache-write tool ${name} without cache mutation approval. Safe next step: use 'ownloom-wiki mutate ${name} ...' or OWNLOOM_WIKI_ALLOW_CACHE_MUTATION=1.`);
    }
    const result = await callWikiTool(name, params, {
      policy: {
        allowMutation,
        allowCacheMutation,
        allowHighImpact: allowMutation,
      },
    });
    if (hasFlag(args, "--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.content.map((item) => item.text).join("\n"));
    }
    if (result.isError) process.exitCode = 2;
    return;
  }

  if (command === "init") {
    runInit(args);
    return;
  }

  if (command === "context") {
    const format = (flagValue(args, "--format") ?? (hasFlag(args, "--json") ? "json" : "markdown")) as "markdown" | "json";
    if (format !== "markdown" && format !== "json") throw new Error("--format must be markdown or json");
    console.log(buildWikiContext(format));
    return;
  }

  if (command === "doctor") {
    await runDoctor(args, hasFlag(args, "--json"));
    return;
  }


  usage(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
