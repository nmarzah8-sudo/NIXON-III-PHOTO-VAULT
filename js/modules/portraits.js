export function setupPortraits(config) {
  for (const image of document.querySelectorAll("[data-portrait]")) {
    const placeholder = image.parentElement?.querySelector("[data-portrait-placeholder]");
    if (!config.portraitPath) continue;

    image.addEventListener("load", () => {
      image.hidden = false;
      if (placeholder) placeholder.hidden = true;
    }, { once: true });

    image.addEventListener("error", () => {
      image.hidden = true;
      if (placeholder) placeholder.hidden = false;
    }, { once: true });

    image.src = config.portraitPath;
  }
}
