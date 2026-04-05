export function createShell(): HTMLDivElement {
	const root = document.createElement("div");
	root.id = "nixpi-shell";

	const chatPane = document.createElement("section");
	chatPane.id = "chat-pane";

	const chatPlaceholder = document.createElement("nixpi-chat");
	chatPane.append(chatPlaceholder);

	const terminalPane = document.createElement("aside");
	terminalPane.id = "terminal-pane";

	const header = document.createElement("header");
	header.textContent = "Terminal";

	const terminalFrame = document.createElement("iframe");
	terminalFrame.src = "/terminal/";
	terminalFrame.title = "Pi terminal";

	terminalPane.append(header, terminalFrame);
	root.append(chatPane, terminalPane);

	return root;
}
