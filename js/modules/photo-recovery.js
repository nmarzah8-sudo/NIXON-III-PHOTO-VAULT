const BUCKET_NAME = "photos";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXISTING_UPLOAD_PATHS = [
  "52676cfc-d791-438f-b8cb-38e059a2a28f/6f9eb520-f29e-4b1b-9972-e598944d351d/1000127553.jpg",
  "52676cfc-d791-438f-b8cb-38e059a2a28f/20840bac-c0a8-4a84-9ecb-c68501c6bb1a/1000127559.jpg",
  "52676cfc-d791-438f-b8cb-38e059a2a28f/140d6532-c43a-48b8-9fb0-2bb2f1d47a4f/1000128593.jpg"
];

function parseUploadPath(path) {
  const segments = path.split("/");
  if (segments.length !== 3 || !segments.every((segment) => segment.length > 0)) {
    throw new Error("The stored path has an unexpected format.");
  }

  const [userId, photoId, encodedFileName] = segments;
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(photoId)) {
    throw new Error("The user or photo ID in the stored path is not a valid UUID.");
  }

  let fileName;
  try {
    fileName = decodeURIComponent(encodedFileName);
  } catch {
    throw new Error("The filename in the stored path is invalid.");
  }

  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    throw new Error("The filename in the stored path is invalid.");
  }

  return { userId, photoId, fileName };
}

function getVerifiedObjectMetadata(info) {
  const metadata = info?.metadata ?? {};
  const rawSize = metadata.size
    ?? metadata.contentLength
    ?? metadata.content_length
    ?? metadata["content-length"]
    ?? info?.size
    ?? info?.contentLength;
  const fileSize = typeof rawSize === "number"
    ? rawSize
    : typeof rawSize === "string" && /^\d+$/.test(rawSize)
      ? Number(rawSize)
      : NaN;
  const rawMimeType = metadata.mimetype
    ?? metadata.mimeType
    ?? metadata.contentType
    ?? metadata["content-type"]
    ?? info?.mimetype
    ?? info?.mimeType
    ?? info?.contentType;
  const mimeType = typeof rawMimeType === "string" ? rawMimeType.trim().toLowerCase() : "";

  if (!Number.isSafeInteger(fileSize) || fileSize < 0 || !mimeType.startsWith("image/")) {
    throw new Error("Private Storage did not provide a verifiable image MIME type and file size. No metadata was saved.");
  }

  return { fileSize, mimeType };
}

async function findExistingRecord(client, photoId, storagePath) {
  const { data: recordById, error: idError } = await client
    .from("photos")
    .select("id,user_id,storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (idError) throw idError;

  const { data: recordByPath, error: pathError } = await client
    .from("photos")
    .select("id,user_id,storage_path")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (pathError) throw pathError;

  for (const record of [recordById, recordByPath]) {
    if (!record) continue;
    if (record.id === photoId && record.storage_path === storagePath) {
      return record;
    }
    throw new Error("A photo record already uses this ID or Storage path, but does not match this upload. No changes were made.");
  }

  return null;
}

async function recoverUpload(client, getAuthorizedUser, storagePath) {
  const user = await getAuthorizedUser();
  if (!user?.id || !UUID_PATTERN.test(user.id)) {
    throw new Error("An authenticated administrator session could not be verified.");
  }

  const { userId, photoId, fileName } = parseUploadPath(storagePath);
  if (user.id.toLowerCase() !== userId.toLowerCase()) {
    throw new Error("This existing upload does not belong to the authenticated administrator.");
  }

  const existingRecord = await findExistingRecord(client, photoId, storagePath);
  if (existingRecord) {
    if (existingRecord.user_id !== user.id) {
      throw new Error("The existing photo record has a different owner. No changes were made.");
    }
    return { fileName, saved: true, message: "Metadata already exists; no insert was made." };
  }

  const { data: objectInfo, error: infoError } = await client.storage
    .from(BUCKET_NAME)
    .info(storagePath);
  if (infoError) throw new Error(`Could not verify private Storage metadata: ${infoError.message}`);

  const { fileSize, mimeType } = getVerifiedObjectMetadata(objectInfo);
  const { error: insertError } = await client.from("photos").insert({
    id: photoId,
    user_id: user.id,
    file_name: fileName,
    storage_path: storagePath,
    mime_type: mimeType,
    file_size: fileSize,
    width: null,
    height: null,
    album: null
  });

  if (insertError) {
    const recordAfterInsert = await findExistingRecord(client, photoId, storagePath);
    if (recordAfterInsert?.user_id === user.id) {
      return { fileName, saved: true, message: "Metadata already exists; no duplicate was created." };
    }
    throw new Error(`Metadata was not saved: ${insertError.message}`);
  }

  return { fileName, saved: true, message: "Metadata saved. The existing Storage object was not uploaded again." };
}

export function setupDashboardPhotoRecovery(client, getAuthorizedUser) {
  const section = document.querySelector("[data-photo-recovery]");
  const list = section?.querySelector("[data-photo-recovery-list]");
  if (!section || !list) return;

  for (const storagePath of EXISTING_UPLOAD_PATHS) {
    const { fileName } = parseUploadPath(storagePath);
    const item = document.createElement("li");
    item.className = "photo-recovery__item";

    const details = document.createElement("div");
    details.className = "photo-recovery__details";
    const name = document.createElement("strong");
    name.textContent = fileName;
    const path = document.createElement("code");
    path.textContent = storagePath;
    details.append(name, path);

    const action = document.createElement("button");
    action.className = "button button--outline photo-recovery__action";
    action.type = "button";
    action.textContent = "Recover metadata";

    const status = document.createElement("p");
    status.className = "photo-recovery__status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Metadata not checked.";

    let recovering = false;
    action.addEventListener("click", async () => {
      if (recovering) return;
      recovering = true;
      action.disabled = true;
      status.dataset.state = "info";
      status.textContent = `${fileName}: checking private object metadata…`;

      try {
        const result = await recoverUpload(client, getAuthorizedUser, storagePath);
        status.dataset.state = "success";
        status.textContent = `${result.fileName}: ${result.message}`;
        action.textContent = "Metadata saved";
      } catch (error) {
        status.dataset.state = "error";
        status.textContent = `${fileName}: metadata not saved. ${error instanceof Error ? error.message : "An unexpected error occurred."}`;
        action.disabled = false;
        action.textContent = "Retry recovery";
      } finally {
        recovering = false;
      }
    });

    item.append(details, action, status);
    list.append(item);
  }
}