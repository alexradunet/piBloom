interface LineParserState {
	lines: string[];
	index: number;
	parts: string[];
}

export function renderMatrixHtml(text: string): string {
	const normalized = text.replace(/\r\n/g, "\n").trim();
	if (!normalized) return "<p></p>";

	const state: LineParserState = {
		lines: normalized.split("\n"),
		index: 0,
		parts: [],
	};

	while (state.index < state.lines.length) {
		const line = state.lines[state.index] ?? "";
		if (!line.trim()) {
			state.index += 1;
			continue;
		}

		const parsed =
			tryParseCodeBlock(state, line) ??
			tryParseHeading(state, line) ??
			tryParseBlockquote(state, line) ??
			tryParseUnorderedList(state, line) ??
			tryParseOrderedList(state, line) ??
			parseParagraph(state);

		if (parsed) {
			state.parts.push(parsed);
		}
	}

	return state.parts.join("");
}

function tryParseCodeBlock(state: LineParserState, line: string): string | null {
	if (!line.startsWith("```")) return null;

	const fence = line.slice(3).trim();
	const codeLines: string[] = [];
	state.index += 1;

	while (state.index < state.lines.length && !(state.lines[state.index] ?? "").startsWith("```")) {
		codeLines.push(state.lines[state.index] ?? "");
		state.index += 1;
	}
	if (state.index < state.lines.length) state.index += 1;

	const classAttr = fence ? ` class="language-${escapeHtmlAttribute(fence)}"` : "";
	return `<pre><code${classAttr}>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
}

function tryParseHeading(state: LineParserState, line: string): string | null {
	const match = line.match(/^(#{1,6})\s+(.+)$/);
	if (!match) return null;

	const level = match[1]?.length ?? 1;
	const content = match[2] ?? "";
	state.index += 1;
	return `<h${level}>${renderInlineMarkdown(content)}</h${level}>`;
}

function tryParseBlockquote(state: LineParserState, line: string): string | null {
	if (!line.startsWith(">")) return null;

	const quoteLines: string[] = [];
	while (state.index < state.lines.length) {
		const current = state.lines[state.index] ?? "";
		if (!current.trim()) {
			state.index += 1;
			break;
		}
		if (!current.startsWith(">")) break;
		quoteLines.push(current.replace(/^>\s?/, ""));
		state.index += 1;
	}

	const paragraphs = quoteLines.map((entry) => `<p>${renderInlineMarkdown(entry)}</p>`).join("");
	return `<blockquote>${paragraphs}</blockquote>`;
}

function tryParseUnorderedList(state: LineParserState, line: string): string | null {
	const match = line.match(/^(\s*)[-*+]\s+(.+)$/);
	if (!match) return null;

	const items: string[] = [];
	while (state.index < state.lines.length) {
		const current = state.lines[state.index] ?? "";
		const itemMatch = current.match(/^(\s*)[-*+]\s+(.+)$/);
		if (!itemMatch) break;
		items.push(`<li>${renderInlineMarkdown(itemMatch[2] ?? "")}</li>`);
		state.index += 1;
	}
	return `<ul>${items.join("")}</ul>`;
}

function tryParseOrderedList(state: LineParserState, line: string): string | null {
	const match = line.match(/^\s*\d+[.)]\s+(.+)$/);
	if (!match) return null;

	const items: string[] = [];
	while (state.index < state.lines.length) {
		const current = state.lines[state.index] ?? "";
		const itemMatch = current.match(/^\s*\d+[.)]\s+(.+)$/);
		if (!itemMatch) break;
		items.push(`<li>${renderInlineMarkdown(itemMatch[1] ?? "")}</li>`);
		state.index += 1;
	}
	return `<ol>${items.join("")}</ol>`;
}

function isBlockStart(line: string): boolean {
	return (
		line.startsWith("```") ||
		line.startsWith(">") ||
		/^#{1,6}\s+/.test(line) ||
		/^(\s*)[-*+]\s+/.test(line) ||
		/^\s*\d+[.)]\s+/.test(line)
	);
}

function parseParagraph(state: LineParserState): string {
	const paragraphLines: string[] = [];
	while (state.index < state.lines.length) {
		const current = state.lines[state.index] ?? "";
		if (!current.trim()) {
			state.index += 1;
			break;
		}
		if (isBlockStart(current)) break;
		paragraphLines.push(current);
		state.index += 1;
	}
	return `<p>${renderInlineMarkdown(paragraphLines.join("\n"))}</p>`;
}

function renderInlineMarkdown(text: string): string {
	let html = escapeHtml(text);

	html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
	html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
	html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
	html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
	html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
	html = html.replace(/\n/g, "<br>");

	return html;
}

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
	return escapeHtml(value).replaceAll('"', "&quot;");
}
