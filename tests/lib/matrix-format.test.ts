import { describe, expect, it } from "vitest";
import { renderMatrixHtml } from "../../core/lib/matrix-format.js";

describe("renderMatrixHtml", () => {
	it("renders headings, inline markdown, and paragraphs", () => {
		expect(renderMatrixHtml("# Hello\n\nThis is **bold** and `code`.")).toBe(
			"<h1>Hello</h1><p>This is <strong>bold</strong> and <code>code</code>.</p>",
		);
	});

	it("renders lists, quotes, and links", () => {
		expect(renderMatrixHtml("> quote\n\n- one\n- [two](https://example.com)")).toBe(
			'<blockquote><p>quote</p></blockquote><ul><li>one</li><li><a href="https://example.com">two</a></li></ul>',
		);
	});

	it("escapes HTML while preserving fenced code blocks", () => {
		expect(renderMatrixHtml("```ts\nconst x = '<tag>';\n```")).toBe(
			"<pre><code class=\"language-ts\">const x = '&lt;tag&gt;';</code></pre>",
		);
	});
});
