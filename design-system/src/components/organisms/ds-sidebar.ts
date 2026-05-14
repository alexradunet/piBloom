/**
 * @element ds-sidebar
 * @summary Left sidebar organism — session navigation with header/footer slots.
 */

import { LitElement, html, css, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";

interface SidebarSection {
	label: string;
	items: SidebarItem[];
}

interface SidebarItem {
	icon: string;
	label: string;
	href: string;
	active?: boolean;
}

@customElement("ds-sidebar")
export class DsSidebar extends LitElement {
	static styles: CSSResultGroup = css`
    :host { display: block; }

    nav {
      height: 100%;
      width: 256px;
      background: var(--color-surface-container-lowest, #150c0a);
      border-right: 1px dashed var(--color-outline-variant, #56423c);
      display: flex;
      flex-direction: column;
      padding: var(--space-md, 24px) 0;
    }

    .header {
      padding: 0 var(--space-sm, 16px) var(--space-sm, 16px);
      margin: 0 var(--space-sm, 16px) var(--space-sm, 16px);
      border-bottom: 1px dashed var(--color-outline-variant, #56423c);
    }

    .header-title {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: var(--typo-label-md-size, 14px);
      letter-spacing: var(--typo-label-md-tracking, 0.05em);
      font-weight: 500;
      color: var(--color-on-surface, #f1dfd9);
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 0 var(--space-sm, 16px);
    }

    .section + .section {
      margin-top: var(--space-md, 24px);
    }

    .section-label {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-on-surface-variant, #dcc1b8);
      margin-bottom: var(--space-xs, 8px);
    }

    .footer {
      padding: var(--space-sm, 16px) var(--space-sm, 16px) 0;
      margin-top: auto;
      border-top: 1px dashed var(--color-outline-variant, #56423c);
    }

    /* Scrollbar */
    .content::-webkit-scrollbar { width: 4px; }
    .content::-webkit-scrollbar-track { background: transparent; }
    .content::-webkit-scrollbar-thumb { background: var(--color-outline-variant, #56423c); border-radius: 2px; }
  `;

	@property({ type: Array }) sections: SidebarSection[] = [];

	render() {
		return html`
      <nav part="base">
        <div class="header">
          <slot name="header">
            <span class="header-title">Sessions</span>
          </slot>
        </div>
        <div class="content">
          <slot></slot>
          ${this.sections.map(
						(section) => html`
            <div class="section">
              <div class="section-label">${section.label}</div>
              ${section.items.map(
								(item) => html`
                <ds-nav-item
                  icon="${item.icon}"
                  label="${item.label}"
                  href="${item.href}"
                  ?active="${item.active}"
                ></ds-nav-item>
              `,
							)}
            </div>
          `,
					)}
        </div>
        <div class="footer">
          <slot name="footer"></slot>
        </div>
      </nav>
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"ds-sidebar": DsSidebar;
	}
}
