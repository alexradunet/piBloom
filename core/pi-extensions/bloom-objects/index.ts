/**
 * bloom-objects — Flat-file object store with YAML frontmatter in ~/Bloom/Objects/.
 *
 * @tools memory_create, memory_update, memory_upsert, memory_read, memory_query, memory_search, memory_link, memory_list
 * @see {@link ../../AGENTS.md#bloom-objects} Extension reference
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { listObjects, queryObjects, searchObjects } from "./actions-query.js";
import { createObject, linkObjects, readObject, updateObject, upsertObject } from "./actions.js";

const fieldValueSchema = Type.Union([
	Type.String(),
	Type.Number(),
	Type.Boolean(),
	Type.Null(),
	Type.Array(Type.String()),
]);

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "memory_create",
		label: "Memory Create",
		description: "Create a new markdown object in ~/Bloom/Objects/",
		parameters: Type.Object({
			type: Type.String({
				description: "Object type (e.g. task, note, project)",
			}),
			slug: Type.String({
				description: "URL-friendly identifier (e.g. fix-bike-tire)",
			}),
			fields: Type.Optional(
				Type.Record(Type.String(), fieldValueSchema, {
					description: "Additional frontmatter fields",
				}),
			),
			body: Type.Optional(Type.String({ description: "Optional markdown body content" })),
			path: Type.Optional(
				Type.String({
					description: "Optional file path relative to home dir (default: Bloom/Objects/{slug}.md)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			return createObject(params);
		},
	});

	pi.registerTool({
		name: "memory_update",
		label: "Memory Update",
		description: "Update an existing markdown object in ~/Bloom/Objects/",
		parameters: Type.Object({
			type: Type.String({ description: "Object type" }),
			slug: Type.String({ description: "Object slug" }),
			fields: Type.Optional(Type.Record(Type.String(), fieldValueSchema)),
			body: Type.Optional(Type.String({ description: "Optional replacement markdown body" })),
			path: Type.Optional(Type.String({ description: "Optional direct file path relative to home dir" })),
		}),
		async execute(_toolCallId, params) {
			return updateObject(params);
		},
	});

	pi.registerTool({
		name: "memory_upsert",
		label: "Memory Upsert",
		description: "Create or update a markdown object in ~/Bloom/Objects/",
		parameters: Type.Object({
			type: Type.String({ description: "Object type" }),
			slug: Type.String({ description: "Object slug" }),
			fields: Type.Optional(Type.Record(Type.String(), fieldValueSchema)),
			body: Type.Optional(Type.String({ description: "Optional markdown body content" })),
			path: Type.Optional(Type.String({ description: "Optional direct file path relative to home dir" })),
		}),
		async execute(_toolCallId, params) {
			return upsertObject(params);
		},
	});

	pi.registerTool({
		name: "memory_read",
		label: "Memory Read",
		description: "Read a markdown object from ~/Bloom/Objects/",
		parameters: Type.Object({
			type: Type.String({ description: "Object type" }),
			slug: Type.String({ description: "Object slug" }),
			path: Type.Optional(Type.String({ description: "Optional direct file path relative to home dir" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			return readObject(params);
		},
	});

	pi.registerTool({
		name: "memory_query",
		label: "Memory Query",
		description: "Rank matching objects by metadata and content heuristics",
		parameters: Type.Object({
			text: Type.Optional(Type.String({ description: "Optional free-text query" })),
			type: Type.Optional(Type.String({ description: "Object type filter" })),
			tags: Type.Optional(Type.Array(Type.String({ description: "Tag filter" }))),
			scope: Type.Optional(Type.String({ description: "Scope filter: global, host, project, room, agent" })),
			scope_value: Type.Optional(
				Type.String({ description: "Optional concrete scope value, e.g. project name or room id" }),
			),
			status: Type.Optional(Type.String({ description: "Status filter: active, stale, superseded, archived" })),
			link_to: Type.Optional(Type.String({ description: "Return only objects linked to this ref" })),
			preferred_scopes: Type.Optional(
				Type.Array(
					Type.Object({
						scope: Type.String({ description: "Preferred scope kind" }),
						value: Type.Optional(Type.String({ description: "Optional preferred scope value" })),
					}),
				),
			),
			limit: Type.Optional(Type.Number({ description: "Max ranked results", default: 10 })),
		}),
		async execute(_toolCallId, params, signal) {
			return queryObjects(params, signal);
		},
	});

	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description: "Search markdown files for a pattern (simple string match)",
		parameters: Type.Object({
			pattern: Type.String({
				description: "Text pattern to search for",
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			return searchObjects(params, signal);
		},
	});

	pi.registerTool({
		name: "memory_link",
		label: "Memory Link",
		description: "Add bidirectional links between two objects",
		parameters: Type.Object({
			ref_a: Type.String({
				description: "First object reference (type/slug)",
			}),
			ref_b: Type.String({
				description: "Second object reference (type/slug)",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			return linkObjects(params);
		},
	});

	pi.registerTool({
		name: "memory_list",
		label: "Memory List",
		description: "List objects, optionally filtered by type or frontmatter fields",
		parameters: Type.Object({
			type: Type.Optional(Type.String({ description: "Object type to filter by" })),
			directory: Type.Optional(Type.String({ description: "Directory to walk (default: ~/Bloom/Objects/)" })),
			filters: Type.Optional(
				Type.Record(Type.String(), Type.String(), {
					description: "Frontmatter field filters",
				}),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			return listObjects(params, signal);
		},
	});
}
