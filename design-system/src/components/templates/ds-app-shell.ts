/**
 * @element ds-app-shell
 * @summary App shell template — topbar + sidebar + main + telemetry.
 * Responsive: sidebar overlays on mobile, telemetry hides.
 */

import { LitElement, html, css, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ds-app-shell")
export class DsAppShell extends LitElement {
	static styles: CSSResultGroup = css`
    :host { display: block; height: 100vh; overflow: hidden; }

    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: 64px 1fr;
      grid-template-columns: 256px 1fr 288px;
      grid-template-areas:
        "topbar topbar topbar"
        "sidebar main telemetry";
      background: var(--color-background, #1a110f);
    }

    .topbar    { grid-area: topbar; }
    .sidebar   { grid-area: sidebar; }
    .main      { grid-area: main; overflow: hidden; display: flex; flex-direction: column; }
    .telemetry { grid-area: telemetry; }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-margin, 32px);
    }

    .overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 40;
    }

    /* Mobile responsive */
    @media (max-width: 1024px) {
      .shell {
        grid-template-columns: 1fr;
        grid-template-areas:
          "topbar"
          "main";
      }

      .sidebar {
        position: fixed;
        left: 0; top: 64px; bottom: 0;
        z-index: 50;
        transform: translateX(-100%);
        transition: transform 0.3s ease;
      }

      .sidebar.open {
        transform: translateX(0);
      }

      .overlay.open {
        display: block;
      }

      .telemetry { display: none; }
    }
  `;

	@property({ type: Boolean, reflect: true }) sidebarOpen = false;

	private _closeSidebar() {
		this.sidebarOpen = false;
	}

	render() {
		return html`
      <div class="shell">
        <div class="topbar">
          <slot name="topbar"></slot>
        </div>
        <div class="overlay ${this.sidebarOpen ? "open" : ""}" @click="${this._closeSidebar}"></div>
        <div class="sidebar ${this.sidebarOpen ? "open" : ""}">
          <slot name="sidebar"></slot>
        </div>
        <div class="main">
          <slot name="status"></slot>
          <div class="content">
            <slot></slot>
          </div>
          <slot name="input"></slot>
        </div>
        <div class="telemetry">
          <slot name="telemetry"></slot>
        </div>
      </div>
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"ds-app-shell": DsAppShell;
	}
}
