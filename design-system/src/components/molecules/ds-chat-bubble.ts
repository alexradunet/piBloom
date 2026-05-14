/**
 * @element ds-chat-bubble
 * @summary Chat message bubble — AI, user, system, or error.
 */

import { LitElement, html, css, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";

function simpleMd(text: string): string {
	if (!text) return "";
	let r = String(text);
	r = r.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
	r = r.replace(/`([^`]+)`/g, "<code>$1</code>");
	r = r.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	r = r.replace(/\*([^*]+)\*/g, "<em>$1</em>");
	r = r.replace(
		/\[([^\]]+)\]\(([^)]+)\)/g,
		'<a href="$2" target="_blank">$1</a>',
	);
	const paragraphs = r.split(/\n\n+/);
	return paragraphs
		.map((p) => {
			p = p.trim();
			if (!p) return "";
			if (p.startsWith("<")) return p;
			return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
		})
		.join("");
}

@customElement("ds-chat-bubble")
export class DsChatBubble extends LitElement {
	static styles: CSSResultGroup = css`
    :host { display: block; }

    .bubble-row {
      display: flex;
      gap: var(--space-sm, 16px);
      align-items: flex-start;
    }

    .bubble-row.user { flex-direction: row-reverse; }

    .avatar-wrap {
      flex-shrink: 0;
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 11px;
      font-weight: 500;
    }

    .avatar.ai {
      background: var(--color-surface-container, #271d1a);
      border: 1px solid var(--color-outline-variant, #56423c);
      color: var(--color-primary, #ffb59d);
    }

    .avatar.user {
      background: var(--color-primary-container, #b85736);
      border: 1px solid var(--color-primary, #ffb59d);
      color: var(--color-on-primary-container, #fffaf9);
    }

    .bubble {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: var(--radius-lg, 8px);
      font-family: var(--font-body, 'Work Sans', sans-serif);
      font-size: var(--typo-body-md-size, 16px);
      line-height: var(--typo-body-md-line, 1.5);
      color: var(--color-on-surface, #f1dfd9);
    }

    .bubble.ai {
      background: transparent;
      border: none;
      padding: 0;
      max-width: none;
    }

    .bubble.user {
      background: var(--color-surface-container-high, #322824);
      border: 1px solid var(--color-outline-variant, #56423c);
      border-radius: var(--radius-lg, 8px) var(--radius-lg, 8px) var(--radius-xs, 2px) var(--radius-lg, 8px);
    }

    .bubble.system {
      max-width: none;
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: var(--typo-label-sm-size, 12px);
      color: var(--color-on-surface-variant, #dcc1b8);
    }

    .bubble.error {
      max-width: none;
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: var(--typo-label-sm-size, 12px);
      color: var(--color-error, #ffb4ab);
    }

    .bubble-content ::slotted(img),
    .bubble-content img {
      max-width: 100%;
      border-radius: var(--radius-default, 4px);
    }

    .bubble-content a {
      color: var(--color-primary, #ffb59d);
      text-decoration: underline;
    }

    .bubble-content code {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 13px;
      background: rgba(118, 213, 220, 0.1);
      padding: 1px 4px;
      border-radius: 2px;
    }

    .bubble-content pre {
      background: #0d0807;
      border: 1px solid var(--color-outline-variant, #56423c);
      border-radius: var(--radius-default, 4px);
      padding: 12px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .bubble-content pre code {
      background: transparent;
      padding: 0;
    }
  `;

	@property({ type: String }) sender:
		| "user"
		| "assistant"
		| "system"
		| "error" = "assistant";
	@property({ type: String }) content = "";

	__getAvatar(): string {
		switch (this.sender) {
			case "user":
				return "OP";
			case "assistant":
				return '<span class="material-symbols-outlined" style="font-size:16px">auto_awesome</span>';
			case "system":
				return '<span class="material-symbols-outlined" style="font-size:16px">info</span>';
			case "error":
				return '<span class="material-symbols-outlined" style="font-size:16px;color:#ffb4ab">error</span>';
		}
		return "";
	}

	render() {
		const isUser = this.sender === "user";
		const isSys = this.sender === "system" || this.sender === "error";

		if (isSys) {
			return html`
        <div class="bubble-row ${this.sender}">
          <div class="bubble ${this.sender}">${this.content}</div>
        </div>
      `;
		}

		return html`
      <div class="bubble-row ${this.sender}">
        <div class="avatar-wrap">
          <div class="avatar ${this.sender}">
            ${
							this.sender === "assistant"
								? html`<span class="material-symbols-outlined" style="font-size:16px">auto_awesome</span>`
								: html`<span>OP</span>`
						}
          </div>
        </div>
        <div class="bubble ${this.sender}">
          <div class="bubble-content">
            ${unsafeHTML(simpleMd(this.content))}
          </div>
          <slot></slot>
        </div>
      </div>
    `;
	}
}

import { unsafeHTML } from "lit/directives/unsafe-html.js";

declare global {
	interface HTMLElementTagNameMap {
		"ds-chat-bubble": DsChatBubble;
	}
}
