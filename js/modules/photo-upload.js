const BUCKET_NAME = "photos";

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function formatFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function getImageDimensions(file) {
  if (typeof createImageBitmap !== "function") return null;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

function setMessage(element, message, state = "info") {
  element.textContent = message;
  element.dataset.state = state;
}

export function setupDashboardPhotoUpload(client, getAuthorizedUser) {
  const uploadArea = document.querySelector("[data-photo-upload]");
  if (!uploadArea) return;

  const fileInput = uploadArea.querySelector("[data-photo-files]");
  const selectButton = uploadArea.querySelector("[data-photo-select]");
  const uploadButton = uploadArea.querySelector("[data-photo-upload-button]");
  const clearButton = uploadArea.querySelector("[data-photo-clear]");
  const albumInput = uploadArea.querySelector("[data-photo-album]");
  const fileList = uploadArea.querySelector("[data-photo-file-list]");
  const progress = uploadArea.querySelector("[data-photo-progress]");
  const progressLabel = uploadArea.querySelector("[data-photo-progress-label]");
  const message = uploadArea.querySelector("[data-photo-message]");

  if (!fileInput || !selectButton || !uploadButton || !clearButton || !fileList || !progress || !progressLabel || !message) {
    throw new Error("The dashboard photo upload interface is incomplete.");
  }

  let selectedFiles = [];
  let uploading = false;

  function renderFiles() {
    fileList.replaceChildren();

    for (const entry of selectedFiles) {
      const row = document.createElement("li");
      row.className = "photo-upload__file";
      const details = document.createElement("span");
      details.className = "photo-upload__file-details";
      const name = document.createElement("strong");
      name.textContent = entry.file.name;
      const size = document.createElement("span");
      size.textContent = formatFileSize(entry.file.size);
      const state = document.createElement("span");
      state.className = "photo-upload__file-state";
      state.textContent = entry.status;
      details.append(name, size);
      row.append(details, state);

      if (entry.detail) {
        const detail = document.createElement("span");
        detail.className = "photo-upload__file-error";
        detail.textContent = entry.detail;
        row.append(detail);
      }

      fileList.append(row);
    }

    const savedCount = selectedFiles.filter((entry) => entry.saved).length;
    progress.max = Math.max(1, selectedFiles.length);
    progress.value = savedCount;
    progress.hidden = selectedFiles.length === 0;
    progressLabel.textContent = selectedFiles.length
      ? `Saved ${savedCount} of ${selectedFiles.length} photos`
      : "";
    const hasUnrecordedStorageUpload = selectedFiles.some((entry) => entry.storageUploaded && !entry.saved);
    selectButton.disabled = uploading || hasUnrecordedStorageUpload;
    fileInput.disabled = uploading || hasUnrecordedStorageUpload;
    clearButton.disabled = uploading || selectedFiles.length === 0 || hasUnrecordedStorageUpload;
    uploadButton.disabled = uploading || selectedFiles.length === 0 || selectedFiles.every((entry) => entry.saved);
    uploadButton.textContent = selectedFiles.some((entry) => entry.storageUploaded && !entry.saved)
      ? "Retry unfinished uploads"
      : "Upload photos";
    if (albumInput) {
      albumInput.disabled = uploading || hasUnrecordedStorageUpload;
    }
  }

  selectButton.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    if (!files.length) return;

    const images = files.filter((file) => file.type.startsWith("image/"));
    const rejectedCount = files.length - images.length;
    if (!images.length) {
      selectedFiles = [];
      renderFiles();
      setMessage(message, "Select image files to upload. No files were added.", "error");
      return;
    }

    if (typeof globalThis.crypto?.randomUUID !== "function") {
      selectedFiles = [];
      renderFiles();
      setMessage(message, "Secure upload IDs are unavailable in this browser. Use a modern browser over HTTPS and try again.", "error");
      return;
    }

    selectedFiles = images.map((file) => ({
      file,
      id: globalThis.crypto.randomUUID(),
      storagePath: null,
      storageUploaded: false,
      saved: false,
      album: undefined,
      status: "Ready",
      detail: ""
    }));
    renderFiles();

    const rejectedMessage = rejectedCount
      ? ` ${rejectedCount} non-image ${rejectedCount === 1 ? "file was" : "files were"} not selected.`
      : "";
    setMessage(message, `${images.length} image ${images.length === 1 ? "is" : "are"} ready to upload.${rejectedMessage}`, rejectedCount ? "error" : "info");
  });

  clearButton.addEventListener("click", () => {
    if (uploading) return;
    selectedFiles = [];
    fileInput.value = "";
    renderFiles();
    setMessage(message, "Selection cleared.");
  });

  uploadButton.addEventListener("click", async () => {
    if (uploading || !selectedFiles.some((entry) => !entry.saved)) return;

    uploading = true;
    renderFiles();
    setMessage(message, "Verifying administrator access…");

    let user;
    try {
      user = await getAuthorizedUser();
    } catch (error) {
      uploading = false;
      renderFiles();
      setMessage(message, `Could not verify administrator access: ${getErrorMessage(error)}`, "error");
      return;
    }

    if (!user?.id) {
      uploading = false;
      renderFiles();
      setMessage(message, "Your administrator session is no longer authorized. Returning to sign in…", "error");
      window.location.replace("login.html");
      return;
    }

    const album = albumInput?.value.trim() ?? "";
    for (const entry of selectedFiles) {
      if (!entry.saved && entry.album === undefined) entry.album = album;
    }
    let processed = 0;
    const failures = [];

    for (const entry of selectedFiles) {
      if (entry.saved) {
        processed += 1;
        continue;
      }

      entry.detail = "";
      entry.status = entry.storageUploaded ? "Saving photo details…" : "Uploading original…";
      renderFiles();
      progressLabel.textContent = `Processing ${processed + 1} of ${selectedFiles.length}: ${entry.file.name}`;

      try {
        if (!entry.storageUploaded) {
          entry.storagePath = `${user.id}/${entry.id}/${encodeURIComponent(entry.file.name)}`;
          const { error } = await client.storage
            .from(BUCKET_NAME)
            .upload(entry.storagePath, entry.file, {
              contentType: entry.file.type,
              upsert: false
            });
          if (error) throw new Error(`Storage upload failed: ${error.message}`);
          entry.storageUploaded = true;
        }

        const dimensions = await getImageDimensions(entry.file);
        const photoRecord = {
          id: entry.id,
          user_id: user.id,
          file_name: entry.file.name,
          storage_path: entry.storagePath,
          mime_type: entry.file.type,
          file_size: entry.file.size
        };
        if (dimensions) {
          photoRecord.width = dimensions.width;
          photoRecord.height = dimensions.height;
        }
        if (entry.album) photoRecord.album = entry.album;

        const { error } = await client
          .from("photos")
          .upsert(photoRecord, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw new Error(`Photo details could not be saved: ${error.message}`);

        entry.saved = true;
        entry.status = "Saved";
      } catch (error) {
        entry.status = entry.storageUploaded ? "Uploaded; details not saved" : "Upload failed";
        entry.detail = entry.storageUploaded
          ? `The original is in private Storage at ${entry.storagePath}, but its database record was not confirmed. Retry to save the record without uploading another copy. ${getErrorMessage(error)}`
          : getErrorMessage(error);
        failures.push(entry.file.name);
      }

      renderFiles();
      processed += 1;
    }

    uploading = false;
    renderFiles();

    if (failures.length) {
      setMessage(message, `${selectedFiles.length - failures.length} of ${selectedFiles.length} photos saved. Fix the listed issue${failures.length === 1 ? "" : "s"} and retry; photos with uploaded originals will reuse the same Storage path and record ID.`, "error");
      return;
    }

    setMessage(message, `${selectedFiles.length} ${selectedFiles.length === 1 ? "photo was" : "photos were"} uploaded and recorded successfully.`, "success");
  });

  renderFiles();
}
