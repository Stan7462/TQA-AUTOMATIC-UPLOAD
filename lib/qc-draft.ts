import { normalizeQcLocation, type QcLocation } from "@/lib/qc-location";
import { fiscalMonthKey } from "@/lib/fiscal-month";

export type QcDraft = {
  techId: string;
  fiscalMonth: string;
  submissionId: string;
  redoSourceId: string | null;
  redoChanged: boolean;
  jobNumber: string;
  screenshot: Blob | null;
  photos: Blob[];
  location: QcLocation | null;
  updatedAt: number;
  recoveryWarning?: string;
};

type StoredImage = { type: string; bytes: ArrayBuffer };
type StoredQcDraft = Omit<QcDraft, "screenshot" | "photos" | "recoveryWarning"> & {
  formatVersion: 2;
  screenshot: StoredImage | null;
  photos: StoredImage[];
};

const DATABASE_NAME = "tqa-unfinished-qcs";
const DATABASE_VERSION = 2;
const STORE_NAME = "drafts";
const STORAGE_TIMEOUT_MS = 5_000;

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("Local storage is unavailable.")); return; }
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("Local storage did not respond in time."));
    }, STORAGE_TIMEOUT_MS);
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      reject(error);
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "techId" });
    };
    request.onsuccess = () => {
      if (finished) { request.result.close(); return; }
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.close();
        fail(new Error("The unfinished QC storage needs to be reset."));
        return;
      }
      finished = true;
      window.clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => fail(request.error ?? new Error("Could not open local storage."));
    request.onblocked = () => fail(new Error("Local storage is busy. Close other tabs and try again."));
  });
}

async function runDraftTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void) => void): Promise<T> {
  const db = await openDraftDatabase();
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try { transaction = db.transaction(STORE_NAME, mode); }
    catch (cause) { db.close(); reject(cause); return; }
    let result: T;
    const timer = window.setTimeout(() => {
      reject(new Error("Local storage did not respond in time."));
      try { transaction.abort(); } catch { /* Transaction may already be complete. */ }
      db.close();
    }, STORAGE_TIMEOUT_MS);
    transaction.oncomplete = () => { window.clearTimeout(timer); db.close(); resolve(result); };
    transaction.onerror = () => { window.clearTimeout(timer); db.close(); reject(transaction.error ?? new Error("Could not save the unfinished QC.")); };
    transaction.onabort = () => { window.clearTimeout(timer); db.close(); reject(transaction.error ?? new Error("Could not save the unfinished QC.")); };
    action(transaction.objectStore(STORE_NAME), (value) => { result = value; });
  });
}

function validDraftMetadata(draft: Partial<QcDraft>, techId: string) {
  return draft.techId === techId && typeof draft.jobNumber === "string" && draft.jobNumber.length <= 64 &&
    typeof draft.submissionId === "string" && /^[0-9a-f-]{36}$/.test(draft.submissionId) &&
    (draft.redoSourceId === undefined || draft.redoSourceId === null || (typeof draft.redoSourceId === "string" && /^[0-9a-f-]{36}$/.test(draft.redoSourceId))) &&
    (draft.redoChanged === undefined || typeof draft.redoChanged === "boolean");
}

function isStoredImage(value: unknown): value is StoredImage {
  if (!value || typeof value !== "object") return false;
  const image = value as Partial<StoredImage>;
  return typeof image.type === "string" && image.bytes instanceof ArrayBuffer;
}

async function restoreImage(value: unknown): Promise<Blob | null> {
  try {
    if (isStoredImage(value)) return new Blob([value.bytes.slice(0)], { type: value.type || "image/jpeg" });
    // Version 1 stored Blob objects directly. Copy their bytes while they are still
    // readable so iOS Safari no longer depends on a temporary file reference.
    if (value instanceof Blob) return new Blob([await value.arrayBuffer()], { type: value.type || "image/jpeg" });
  } catch {
    return null;
  }
  return null;
}

async function storeImage(image: Blob): Promise<StoredImage> {
  return { type: image.type || "image/jpeg", bytes: await image.arrayBuffer() };
}

export async function readQcDraft(techId: string): Promise<QcDraft | null> {
  const value = await runDraftTransaction<unknown>("readonly", (store, setResult) => {
    const request = store.get(techId);
    request.onsuccess = () => setResult(request.result);
  });
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<QcDraft> & { formatVersion?: number };
  const currentMonth = fiscalMonthKey();
  const draftMonth = typeof draft.fiscalMonth === "string" ? draft.fiscalMonth : typeof draft.updatedAt === "number" ? fiscalMonthKey(new Date(draft.updatedAt)) : "";
  if (draftMonth !== currentMonth) { await deleteQcDraft(techId); return null; }
  if (!validDraftMetadata(draft, techId) || !Array.isArray(draft.photos) || draft.photos.length > 7) return null;

  const screenshot = draft.screenshot == null ? null : await restoreImage(draft.screenshot);
  const restoredPhotos = await Promise.all(draft.photos.map(restoreImage));
  const photos = restoredPhotos.filter((photo): photo is Blob => photo !== null);
  const lostScreenshot = draft.screenshot != null && screenshot === null;
  const lostPhotos = draft.photos.length - photos.length;
  const recoveryWarning = lostScreenshot || lostPhotos
    ? `${lostScreenshot ? "Your saved account screenshot" : `${lostPhotos} saved live ${lostPhotos === 1 ? "photo" : "photos"}`} could not be restored. ${lostScreenshot ? "Replace the screenshot" : "Retake the missing photo"} before submitting.`
    : undefined;

  const restored: QcDraft = {
    techId,
    fiscalMonth: currentMonth,
    submissionId: draft.submissionId!,
    redoSourceId: draft.redoSourceId ?? null,
    redoChanged: draft.redoChanged ?? false,
    jobNumber: draft.jobNumber!,
    screenshot,
    photos,
    location: normalizeQcLocation(draft.location),
    updatedAt: typeof draft.updatedAt === "number" ? draft.updatedAt : Date.now(),
    recoveryWarning,
  };

  // Migrate readable version 1 drafts immediately to the iOS-safe byte format.
  if (draft.formatVersion !== 2 || lostScreenshot || lostPhotos) {
    try { await writeQcDraft(restored); }
    catch {
      restored.recoveryWarning = restored.recoveryWarning
        ? `${restored.recoveryWarning} The restored draft is open, but its phone backup could not be refreshed.`
        : "Your unfinished QC was restored, but its phone backup could not be refreshed. Keep this page open until you submit it.";
    }
  }
  return restored;
}

export async function writeQcDraft(draft: QcDraft): Promise<void> {
  const stored: StoredQcDraft = {
    techId: draft.techId,
    fiscalMonth: draft.fiscalMonth,
    submissionId: draft.submissionId,
    redoSourceId: draft.redoSourceId,
    redoChanged: draft.redoChanged,
    jobNumber: draft.jobNumber,
    screenshot: draft.screenshot ? await storeImage(draft.screenshot) : null,
    photos: await Promise.all(draft.photos.map(storeImage)),
    location: draft.location,
    updatedAt: draft.updatedAt,
    formatVersion: 2,
  };
  await runDraftTransaction<void>("readwrite", (store) => { store.put(stored); });
}

export async function deleteQcDraft(techId: string): Promise<void> {
  await runDraftTransaction<void>("readwrite", (store) => { store.delete(techId); });
}
