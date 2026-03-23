# Pi Extensions

> Pi-facing tools and session hooks

## Responsibilities

Extensions are grouped by domain, not by transport:

- `nixpi/` owns directory bootstrap and blueprint seeding
- `os/` owns system operations and local proposal workflows
- `objects/` owns durable markdown memory
- `episodes/` owns append-only episodic memory
- `persona/` owns prompt injection, compaction state, and guardrails

## Structural rule

Each extension should keep:

1. `index.ts` for registration and hook wiring
2. one or two action modules for real business logic
3. no extra files unless they clearly own reusable behavior

If a helper only exists to format a standard text response or wire a trivial tool, move that concern into `core/lib/extension-tools.ts` instead of duplicating it per extension.
| Tool | Purpose |
|------|---------|
| `object_create` | Create durable object |
| `object_read` | Read object by slug |
| `object_update` | Update existing object |
| `object_find` | Search objects |
| `object_list` | List all objects |

**Object Schema** (required fields):
- `type` - Object type (fact, preference, project, etc.)
- `slug` - Unique identifier
- `title` - Human-readable title
- `summary` - Brief description
- `scope` - Global, host, project, room, agent
- `confidence` - low, medium, high
- `status` - active, stale, superseded, archived
- `created` - ISO timestamp
- `modified` - ISO timestamp

---

### Episodes Extension (`core/pi/extensions/episodes/`)

**Purpose**: Episodic memory capture and promotion.

| File | Why | What | How / Notes |
|------|-----|------|-------------|
| `index.ts` | Extension entry | Tool registration | Exports extension manifest |
| `actions.ts` | Core actions | `episode_create`, `episode_promote`, etc. | Episode operations |

**Key Tools**:
| Tool | Purpose |
|------|---------|
| `episode_create` | Create episode file |
| `episode_promote` | Promote to durable object |
| `episode_consolidate` | Merge episodes into object |
| `episode_list` | List recent episodes |

**Episode Storage**: `~/nixpi/Episodes/YYYY-MM-DD/<slug>.md`

---

### Persona Extension (`core/pi/extensions/persona/`)

**Purpose**: Persona injection, post-wizard persona gating, and shell guardrails.

| File | Why | What | How / Notes |
|------|-----|------|-------------|
| `index.ts` | Extension entry | Tool registration | Exports extension manifest |
| `actions.ts` | Core actions | Persona and guardrail operations | Injection and validation |
| `types.ts` | Type definitions | Shared types | TypeScript interfaces |

**Key Tools**:
| Tool | Purpose |
|------|---------|
| `persona_status` | Get current persona |
| `guardrails_check` | Validate command against guardrails |

---

## Extension Registration

Extensions are registered in `package.json`:

```json
{
  "pi": {
    "extensions": [
      "./core/pi/extensions/persona",
      "./core/pi/extensions/os",
      "./core/pi/extensions/episodes",
      "./core/pi/extensions/objects",
      "./core/pi/extensions/nixpi"
    ]
  }
}
```

Each extension exports a manifest with:
- `name` - Extension identifier
- `version` - Extension version
- `tools` - Array of tool definitions
- `hooks` - Lifecycle hooks (optional)

## Common Extension Patterns

### Tool Definition Pattern

```typescript
export const myTool = {
  name: "tool_name",
  description: "What this tool does",
  parameters: Type.Object({
    param: Type.String(),
  }),
  async execute(context, args) {
    // Implementation
    return { result: "success" };
  },
};
```

### Extension Entry Pattern

```typescript
export default {
  name: "my-extension",
  version: "0.1.0",
  tools: [myTool, anotherTool],
  async onLoad(context) {
    // Initialization
  },
};
```

## Related Tests

| Test File | Coverage |
|-----------|----------|
| `tests/extensions/nixpi.test.ts` | NixPI extension |
| `tests/extensions/os.test.ts` | OS extension |
| `tests/extensions/os-update.test.ts` | OS update operations |
| `tests/extensions/os-proposal.test.ts` | OS proposal flow |
| `tests/extensions/objects.test.ts` | Objects extension |
| `tests/extensions/episodes.test.ts` | Episodes extension |
| `tests/extensions/setup.test.ts` | Setup extension |
| `tests/extensions/persona.test.ts` | Persona extension |

---

## Related

- [Core Library](./core-lib) - Utilities used by extensions
- [Tests](./tests) - Test coverage details
