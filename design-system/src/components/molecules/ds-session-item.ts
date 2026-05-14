/**
 * @element ds-session-item
 * @summary Session list item for sidebar.
 */

import { LitElement, html, css, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ds-session-item")
export class DsSessionItem extends LitElement {
	static styles: CSSResultGroup = css`
    :host { display: block; }

    .item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-radius: var(--radius-default, 4px);
      border-left: 2px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .item:hover {
      background: var(--color-surface-container, #271d1a);
      color: var(--color-primary, #ffb59d);
    }

    .item.active {
      border-left-color: var(--color-primary, #ffb59d);
      background: var(--color-surface-container, #271d1a);
      padding-left: 10px;
    }

    .title {
      font-family: var(--font-body, 'Work Sans', sans-serif);
      font-size: 14px;
      color: var(--color-on-surface, #f1dfd9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .subtitle {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 11px;
      color: var(--color-on-surface-variant, #dcc1b8);
      margin-top: 2px;
    }

    .menu { opacity: 0; transition: opacity 0.15s; }
    .item:hover .menu, .item.active .menu { opacity: 1; }
  `;

	@property({ type: String }) title = "";
	@property({ type: String }) subtitle = "";
	@property({ type: Boolean, reflect: true }) active = false;

	render() {
		return html`
      <div class="item ${this.active ? "active" : ""}" @click="${this._onClick}">
        <div style="overflow:hidden">
          <div class="title">${this.title}</div>
          <div class="subtitle">${this.subtitle}</div>
        </div>
        <span class="menu material-symbols-outlined" style="font-size:18px;color:var(--color-on-surface-variant)">more_vert</span>
      </div>
    `;
	}

	private _onClick(_e: Event) {
		this.dispatchEvent(
			new CustomEvent("select", {
				detail: { title: this.title },
				bubbles: true,
				composed: true,
			}),
		);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"ds-session-item": DsSessionItem;
	}
}
