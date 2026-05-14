/**
 * @element ds-topbar
 * @summary Top application bar — logo, center, actions.
 */

import { LitElement, html, css, type CSSResultGroup } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("ds-topbar")
export class DsTopbar extends LitElement {
	static styles: CSSResultGroup = css`
    :host { display: block; }

    header {
      width: 100%;
      height: 64px;
      background: var(--color-surface, #1a110f);
      border-bottom: 1px solid var(--color-outline-variant, #56423c);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 var(--space-margin, 32px);
      flex-shrink: 0;
      position: relative;
      z-index: 20;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: var(--space-base, 4px);
      cursor: pointer;
      transition: transform 0.1s ease;
    }

    .logo:active { transform: scale(0.95); }

    .logo-icon {
      color: var(--color-primary, #ffb59d);
      font-size: 24px;
    }

    .logo-text {
      font-family: var(--font-headline, 'Newsreader', serif);
      font-size: 28px;
      font-weight: 500;
      line-height: 1.3;
      color: var(--color-primary, #ffb59d);
      letter-spacing: -0.02em;
    }

    .center {
      flex: 1;
      max-width: 512px;
      margin: 0 var(--space-gutter, 24px);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 8px);
    }

    @media (max-width: 768px) {
      .center { display: none; }
    }
  `;

	render() {
		return html`
      <header part="base">
        <div class="logo">
          <slot name="logo">
            <span class="material-symbols-outlined logo-icon">terminal</span>
            <span class="logo-text">Ownloom</span>
          </slot>
        </div>
        <div class="center">
          <slot name="center"></slot>
        </div>
        <div class="actions">
          <slot name="actions"></slot>
        </div>
      </header>
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"ds-topbar": DsTopbar;
	}
}
