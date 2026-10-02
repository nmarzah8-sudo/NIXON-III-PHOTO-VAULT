import { getSupabaseClient } from "../supabase-client.js";

const BUCKET_NAME = "photos";
const PHOTO_FIELDS = "id,file_name,storage_path,mime_type,file_size,width,height,album,created_at";

function waitForAuthorizedPage() {
  if (!document.body.classList.contains("auth-pending")) return Promise.resolve();

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (document.body.classList.contains("auth-pending")) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  });
}

function formatCreatedAt(value) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function createPhotoCard(photo, objectUrl) {
  const card = document.createElement("article");
  card.className = "photo-card";

  const frame = document.createElement("div");
  frame.className = "photo-card__image-frame";
  const image = document.createElement("img");
  image.className = "photo-card__image";
  image.src = objectUrl;
  image.alt = photo.file_name || "Photo in the private archive";
  image.loading = "lazy";
  frame.append(image);

  const details = document.createElement("div");
  details.className = "photo-card__details";
  const name = document.createElement("strong");
  name.className = "photo-card__name";
  name.textContent = photo.file_name || "Untitled photo";
  details.append(name);

  const metadata = document.createElement("div");
  metadata.className = "photo-card__metadata";
  if (typeof photo.album === "string" && photo.album.trim()) {
    const album = document.createElement("span");
    album.textContent = photo.album;
    metadata.append(album);
  }

  const dateLabel = formatCreatedAt(photo.created_at);
  if (dateLabel) {
    const date = document.createElement("time");
    date.dateTime = photo.created_at;
    date.textContent = dateLabel;
    metadata.append(date);
  }

  if (Number.isFinite(photo.width) && Number.isFinite(photo.height)) {
    const dimensions = document.createElement("span");
    dimensions.textContent = `${photo.width} × ${photo.height}`;
    metadata.append(dimensions);
  }

  if (metadata.childElementCount) details.append(metadata);
  card.append(frame, details);
  return card;
}

export function setupGallery() {
  const gallery = document.querySelector("[data-private-gallery]");
  if (!gallery) return;

  const panels = gallery.querySelectorAll("[data-gallery-state]");
  const photosSection = gallery.querySelector("[data-gallery-photos]");
  const photoGrid = gallery.querySelector("[data-photo-grid]");
  const errorMessage = gallery.querySelector("[data-gallery-error-message]");
  const objectUrls = new Set();

  if (!photosSection || !photoGrid || !errorMessage || !panels.length) {
    throw new Error("The Gallery interface is incomplete.");
  }

  function revokeObjectUrls() {
    for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
    objectUrls.clear();
  }

  function clearPhotos() {
    revokeObjectUrls();
    photoGrid.replaceChildren();
    photosSection.hidden = true;
  }

  function showState(state) {
    for (const panel of panels) panel.hidden = panel.dataset.galleryState !== state;
    photosSection.hidden = state !== "photos";
  }

  async function loadPhotos() {
    showState("loading");
    clearPhotos();

    try {
      await waitForAuthorizedPage();
      const client = await getSupabaseClient();
      const { data: photos, error: queryError } = await client
        .from("photos")
        .select(PHOTO_FIELDS)
        .order("created_at", { ascending: false });
      if (queryError) throw new Error(`Could not retrieve photo records: ${queryError.message}`);
      if (!Array.isArray(photos)) throw new Error("The photo query returned an invalid response.");
      if (photos.length === 0) {
        showState("empty");
        return;
      }

      const photosWithBlobs = await Promise.all(photos.map(async (photo) => {
        if (typeof photo.storage_path !== "string" || !photo.storage_path) {
          throw new Error(`The Storage path for ${photo.file_name || "a photo"} is missing.`);
        }
        const { data: blob, error } = await client.storage
          .from(BUCKET_NAME)
          .download(photo.storage_path);
        if (error) throw new Error(`Could not retrieve ${photo.file_name || "a photo"} from private Storage: ${error.message}`);
        if (!(blob instanceof Blob)) {
          throw new Error(`Private Storage returned invalid photo data for ${photo.file_name || "a photo"}.`);
        }
        return { photo, blob };
      }));

      for (const { photo, blob } of photosWithBlobs) {
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.add(objectUrl);
        photoGrid.append(createPhotoCard(photo, objectUrl));
      }
      showState("photos");
    } catch (error) {
      clearPhotos();
      errorMessage.textContent = error instanceof Error ? error.message : "An unexpected error occurred while loading photos.";
      showState("error");
    }
  }

  window.addEventListener("pagehide", revokeObjectUrls);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void loadPhotos();
  });
  void loadPhotos();
}
