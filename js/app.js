import { config } from "./config.js";
import { setupMobileNavigation } from "./modules/navigation.js";
import { setupPortraits } from "./modules/portraits.js";
import { setupGallery } from "./modules/gallery-preview.js";
import { setupAuthentication } from "./modules/authentication.js";

setupMobileNavigation();
setupPortraits(config);
setupAuthentication();
setupGallery();
