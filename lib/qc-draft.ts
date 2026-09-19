export type QcDraft = {
  techId: string;
  submissionId: string;
  jobNumber: string;
  screenshot: Blob | null;
  photos: Blob[];
  updatedAt: number;
};

const DATABASE_NAME = "tqa-unfinished-qcs";
const STORE_NAME = "drafts";

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("Local storage is unavailable.")); return; }
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "techId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
    request.onblocked = () => reject(new Error("Local storage is busy. Close other tabs and try again."));
  });
}

async function runDraftTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void) => void): Promise<T> {
  const db = await openDraftDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    let result: T;
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Could not save the unfinished QC.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Could not save the unfinished QC.")); };
    action(transaction.objectStore(STORE_NAME), (value) => { result = value; });
  });
}

export async function readQcDraft(techId: string): Promise<QcDraft | null> {
  const value = await runDraftTransaction<unknown>("readonly", (store, setResult) => {
    const request = store.get(techId);
    request.onsuccess = () => setResult(request.result);
  });
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<QcDraft>;
  if (draft.techId !== techId || typeof draft.jobNumber !== "string" || draft.jobNumber.length > 64 ||
      typeof draft.submissionId !== "string" || !/^[0-9a-f-]{36}$/.test(draft.submissionId) ||
      (draft.screenshot !== null && !(draft.screenshot instanceof Blob)) ||
      !Array.isArray(draft.photos) || draft.photos.length > 7 || !draft.photos.every((photo) => photo instanceof Blob)) return null;
  return draft as QcDraft;
}

export async function writeQcDraft(draft: QcDraft): Promise<void> {
  await runDraftTransaction<void>("readwrite", (store) => { store.put(draft); });
}

export async function deleteQcDraft(techId: string): Promise<void> {
  await runDraftTransaction<void>("readwrite", (store) => { store.delete(techId); });
}
