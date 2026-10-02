export function setupGalleryPreview() {
  const gallery = document.querySelector("[data-gallery-preview]");
  if (!gallery) return;

  const buttons = gallery.querySelectorAll("[data-preview-state]");
  const panels = gallery.querySelectorAll("[data-gallery-state]");

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const selectedState = button.dataset.previewState;

      for (const control of buttons) {
        control.setAttribute("aria-pressed", String(control === button));
      }
      for (const panel of panels) {
        const selected = panel.dataset.galleryState === selectedState;
        panel.hidden = !selected;
      }
    });
  }
}
