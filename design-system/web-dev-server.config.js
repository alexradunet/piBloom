/** @web/dev-server.config.js */

export default {
	rootDir: ".",
	port: 4820,
	open: false,
	nodeResolve: {
		exportConditions: ["development"],
		fileExtensions: [".ts", ".js", ".mjs"],
	},
	watch: true,
	preserveSymlinks: true,
};
