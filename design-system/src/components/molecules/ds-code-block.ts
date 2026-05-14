/**
 * @element ds-code-block
 * @summary Syntax-highlighted code block with copy button.
 */

import { LitElement, html, css, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ds-code-block")
export class DsCodeBlock extends LitElement {
	static styles: CSSResultGroup = css`
    :host { display: block; margin: 8px 0; }

    .code-block {
      background: #0d0807;
      border: 1px solid var(--color-outline-variant, #56423c);
      border-radius: var(--radius-default, 4px);
      overflow: hidden;
    }

    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: var(--color-surface-container, #271d1a);
      border-bottom: 1px solid var(--color-outline-variant, #56423c);
    }

    .code-lang {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 12px;
      color: var(--color-on-surface-variant, #dcc1b8);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .copy-btn {
      background: none;
      border: none;
      color: var(--color-on-surface-variant, #dcc1b8);
      cursor: pointer;
      padding: 4px;
      border-radius: var(--radius-default, 4px);
      transition: color 0.15s ease;
      display: flex;
      align-items: center;
    }

    .copy-btn:hover {
      color: var(--color-primary, #ffb59d);
    }

    .copy-btn.copied {
      color: var(--color-tertiary, #76d5dc);
    }

    pre {
      margin: 0;
      padding: 12px 16px;
      overflow-x: auto;
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 13px;
      line-height: 1.5;
      color: var(--color-tertiary-fixed, #93f2f9);
    }

    code {
      background: transparent;
      padding: 0;
    }
  `;

	@property({ type: String }) language = "";
	@property({ type: String }) code = "";

	private _copied = false;

	private _copy() {
		navigator.clipboard.writeText(this.code).then(() => {
			this._copied = true;
			this.requestUpdate();
			setTimeout(() => {
				this._copied = false;
				this.requestUpdate();
			}, 2000);
		});
	}

	render() {
		return html`
      <div class="code-block">
        <div class="code-header">
          <span class="code-lang">${this.language || "code"}</span>
          <button
            class="copy-btn ${this._copied ? "copied" : ""}"
            @click="${this._copy}"
            title="Copy"
          >
            <span class="material-symbols-outlined" style="font-size:16px">
              ${this._copied ? "check" : "content_copy"}
            </span>
          </button>
        </div>
        <pre><code>${this.code}</code></pre>
      </div>
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"ds-code-block": DsCodeBlock;
	}
}
