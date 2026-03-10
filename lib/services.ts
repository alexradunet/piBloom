/** Service lifecycle — barrel re-export from focused sub-modules. */

export { loadServiceCatalog, servicePreflightErrors } from "./services-catalog.js";
export {
	buildLocalImage,
	detectRunningServices,
	downloadServiceModels,
	findLocalServicePackage,
	installServicePackage,
} from "./services-install.js";
export type { Manifest, ManifestService, ServiceCatalogEntry } from "./services-manifest.js";
export { loadManifest, saveManifest } from "./services-manifest.js";
export {
	commandCheckArgs,
	commandExists,
	commandMissingError,
	hasSubidRange,
	validatePinnedImage,
	validateServiceName,
} from "./services-validation.js";
