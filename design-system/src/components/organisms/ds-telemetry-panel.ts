/**
 * @element ds-telemetry-panel
 * @summary Right telemetry panel with tabs, stats, nodes, event log, diagnostics.
 */

import { LitElement, html, css, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";

interface LogEntry {
	time: string;
	text: string;
	type?: "info" | "warn" | "error";
}

interface Metric {
	label: string;
	value: number;
	max: number;
}

interface NodeStatus {
	name: string;
	status: string;
	color: "tertiary" | "secondary" | "error";
}

@customElement("ds-telemetry-panel")
export class DsTelemetryPanel extends LitElement {
	static styles: CSSResultGroup = css`
    :host { display: block; height: 100%; }

    aside {
      height: 100%;
      width: 288px;
      background: var(--color-surface-container-low, #231916);
      border-left: 1px dashed var(--color-outline-variant, #56423c);
      display: flex;
      flex-direction: column;
      padding: var(--space-md, 24px) 0;
    }

    .header {
      padding: 0 var(--space-sm, 16px) var(--space-sm, 16px);
      margin: 0 var(--space-sm, 16px) var(--space-sm, 16px);
      border-bottom: 1px solid var(--color-outline-variant, #56423c);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .header-title {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: var(--typo-label-md-size, 14px);
      letter-spacing: var(--typo-label-md-tracking, 0.05em);
      font-weight: 500;
      color: var(--color-on-surface, #f1dfd9);
      margin: 0 0 2px 0;
    }

    .header-version {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 11px;
      color: var(--color-on-surface-variant, #dcc1b8);
    }

    .sensor {
      width: 28px;
      height: 28px;
      border: 1px solid var(--color-outline-variant, #56423c);
      border-radius: var(--radius-default, 4px);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-surface-container, #271d1a);
    }

    .sensor-icon {
      color: var(--color-tertiary, #76d5dc);
      font-size: 16px;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .tabs {
      display: flex;
      border-bottom: 1px solid var(--color-outline-variant, #56423c);
      padding: 0 var(--space-sm, 16px);
      margin-bottom: var(--space-sm, 16px);
    }

    .tab {
      padding: 6px 10px;
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 12px;
      color: var(--color-on-surface-variant, #dcc1b8);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
      background: none;
      border-top: none;
      border-left: none;
      border-right: none;
    }

    .tab:hover {
      color: var(--color-on-surface, #f1dfd9);
      background: var(--color-surface-container-highest, #3e322f);
    }

    .tab.active {
      color: var(--color-tertiary-fixed-dim, #76d5dc);
      border-bottom-color: var(--color-tertiary-fixed-dim, #76d5dc);
      font-weight: 700;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 0 var(--space-sm, 16px);
    }

    .section {
      margin-bottom: var(--space-md, 24px);
    }

    .section-title {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-on-surface-variant, #dcc1b8);
      margin-bottom: var(--space-xs, 8px);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .section-title .material-symbols-outlined { font-size: 14px; }

    .node-list {
      background: var(--color-surface, #1a110f);
      border: 1px solid var(--color-outline-variant, #56423c);
      border-radius: var(--radius-default, 4px);
      padding: var(--space-xs, 8px) var(--space-sm, 12px);
    }

    .node-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
    }

    .node-name {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 12px;
      color: var(--color-on-surface, #f1dfd9);
    }

    .node-status {
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .node-status.tertiary  { color: var(--color-tertiary, #76d5dc); }
    .node-status.secondary { color: var(--color-secondary-fixed-dim, #e9c267); }
    .node-status.error     { color: var(--color-error, #ffb4ab); }

    .event-log {
      background: var(--color-surface-container-lowest, #150c0a);
      border: 1px solid var(--color-outline-variant, #56423c);
      border-radius: var(--radius-default, 4px);
      padding: var(--space-xs, 8px) var(--space-sm, 12px);
      height: 160px;
      overflow-y: auto;
      font-family: var(--font-label, 'JetBrains Mono', monospace);
      font-size: 11px;
      line-height: 1.5;
    }

    .event-log .entry {
      padding: 1px 0;
    }

    .event-log .entry.info  { color: var(--color-on-surface, #f1dfd9); }
    .event-log .entry.warn  { color: var(--color-error, #ffb4ab); }
    .event-log .entry.error { color: var(--color-error, #ffb4ab); }
    .event-log .entry.dim   { color: var(--color-on-surface-variant, #dcc1b8); }

    .panel-body::-webkit-scrollbar { width: 4px; }
    .panel-body::-webkit-scrollbar-track { background: transparent; }
    .panel-body::-webkit-scrollbar-thumb { background: var(--color-outline-variant, #56423c); border-radius: 2px; }
  `;

	@property({ type: String }) activeTab = "Context";
	@property({ type: Array }) tabs: string[] = [
		"Context",
		"Telemetry",
		"Status",
	];
	@property({ type: Array }) nodes: NodeStatus[] = [];
	@property({ type: Array }) metrics: Metric[] = [];
	@property({ type: Array }) logs: LogEntry[] = [];

	render() {
		return html`
      <aside part="base">
        <div class="header">
          <div>
            <h2 class="header-title">Telemetry</h2>
            <p class="header-version">v1.0.4-alpha</p>
          </div>
          <div class="sensor">
            <span class="material-symbols-outlined sensor-icon">sensors</span>
          </div>
        </div>

        <div class="tabs">
          ${this.tabs.map(
						(tab) => html`
            <button
              class="tab ${tab === this.activeTab ? "active" : ""}"
              @click="${() => {
								this.activeTab = tab;
							}}"
            >${tab}</button>
          `,
					)}
        </div>

        <div class="panel-body">
          ${this._renderTabContent()}
        </div>
      </aside>
    `;
	}

	private _renderTabContent() {
		return html`
      <slot></slot>

      ${
				this.nodes.length
					? html`
        <div class="section">
          <div class="section-title">
            <span class="material-symbols-outlined">account_tree</span>
            Active Nodes
          </div>
          <div class="node-list">
            ${this.nodes.map(
							(n) => html`
              <div class="node-row">
                <span class="node-name">${n.name}</span>
                <span class="node-status ${n.color}">${n.status}</span>
              </div>
            `,
						)}
          </div>
        </div>
      `
					: ""
			}

      ${
				this.logs.length
					? html`
        <div class="section">
          <div class="section-title">
            <span class="material-symbols-outlined">terminal</span>
            Event Log
          </div>
          <div class="event-log">
            ${this.logs.map(
							(l) => html`
              <div class="entry ${l.type || "dim"}">[${l.time}] ${l.text}</div>
            `,
						)}
          </div>
        </div>
      `
					: ""
			}

      ${
				this.metrics.length
					? html`
        <div class="section">
          <div class="section-title">
            <span class="material-symbols-outlined">speed</span>
            Diagnostics
          </div>
          ${this.metrics.map(
						(m) => html`
            <ds-progress
              .value="${m.value}"
              .max="${m.max}"
              .label="${m.label}"
            ></ds-progress>
          `,
					)}
        </div>
      `
					: ""
			}
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"ds-telemetry-panel": DsTelemetryPanel;
	}
}
