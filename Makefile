.PHONY: dev start check build

dev:
	node --watch server.js

start:
	node server.js

check:
	node --check server.js
	node --check public/app.js
	nix flake check --no-build

build:
	nix build .#nixpi --no-link
