/**
 * Showcase entry point
 * Imports design tokens + all components for the storybook-style page.
 */

// ── Tokens ──
import "../src/tokens/design-tokens.css";

// ── Atoms ──
import "../src/components/atoms/ds-button";
import "../src/components/atoms/ds-input";
import "../src/components/atoms/ds-badge";
import "../src/components/atoms/ds-divider";
import "../src/components/atoms/ds-avatar";
import "../src/components/atoms/ds-icon";
import "../src/components/atoms/ds-progress";

// ── Molecules ──
import "../src/components/molecules/ds-card";
import "../src/components/molecules/ds-chat-bubble";
import "../src/components/molecules/ds-code-block";
import "../src/components/molecules/ds-nav-item";
import "../src/components/molecules/ds-session-item";

// ── Organisms ──
import "../src/components/organisms/ds-sidebar";
import "../src/components/organisms/ds-topbar";
import "../src/components/organisms/ds-telemetry-panel";

// ── Templates ──
import "../src/components/templates/ds-app-shell";

// ── TOC scroll spy ──
function setupToc() {
	const tocLinks = document.querySelectorAll(".toc-link");
	const sections = document.querySelectorAll(".category");

	// Smooth scroll on click
	tocLinks.forEach((link) => {
		link.addEventListener("click", (e) => {
			e.preventDefault();
			const target = document.querySelector(link.getAttribute("href")!);
			if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
		});
	});

	// Highlight active section on scroll
	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const id = entry.target.getAttribute("id");
					tocLinks.forEach((l) =>
						l.classList.toggle("active", l.getAttribute("href") === `#${id}`),
					);
				}
			});
		},
		{ rootMargin: "-40% 0px -50% 0px" },
	);

	sections.forEach((s) => observer.observe(s));
}

document.addEventListener("DOMContentLoaded", setupToc);
