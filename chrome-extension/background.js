import { API_ORIGIN, JOBS_URL, exactJobMatches, observationUrl, orderedPhotos, safeError } from "./core.js";

let activeRun = null;
let stopRequested = false;
const successWaiters = new Map();
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let logChain = Promise.resolve();
const BETWEEN_QC_DELAY_MS = 20_000;
const MAX_QC_ATTEMPTS = 3;

function logEvent(level, step, message) {
  const entry = { at: new Date().toISOString(), level, step, message: safeError(message) };
  logChain = logChain.catch(() => {}).then(async () => {
    await storageReady;
    const { logs = [] } = await chrome.storage.local.get("logs");
    await chrome.storage.local.set({ logs: [...logs, entry].slice(-200) });
  });
  return logChain;
}

async function stored() { await storageReady; return chrome.storage.local.get(["trustApiKey", "queue", "run", "logs"]); }
async function authentication() {
  await storageReady;
  const { trustApiKey } = await chrome.storage.local.get("trustApiKey");
  if (/^tqa_trust_[a-f0-9]{64}$/.test(trustApiKey || "")) {
    return { available: true, mode: "key", header: `Bearer ${trustApiKey}` };
  }
  const session = await chrome.cookies.get({ url: API_ORIGIN, name: "tqa_tech_session" });
  if (/^[a-f0-9]{64}$/.test(session?.value || "")) {
    return { available: true, mode: "session", header: `Session ${session.value}` };
  }
  return { available: false, mode: "none", header: null };
}
async function setRun(patch) {
  await storageReady;
  const { run = {} } = await chrome.storage.local.get("run");
  await chrome.storage.local.set({ run: { ...run, ...patch, updatedAt: new Date().toISOString() } });
  if (patch.message) {
    const level = ["error", "needs_review"].includes(patch.status) || ["failed", "needs review"].includes(patch.stage)
      ? "error" : ["done", "uploaded"].includes(patch.stage) ? "success" : "info";
    await logEvent(level, patch.stage || run.stage || "run", patch.message);
  }
}

async function api(path, options = {}) {
  const auth = await authentication();
  if (!auth.available) throw new Error("Sign in to the TQA website as admin, then reopen the extension.");
  const method = options.method || "GET";
  await logEvent("info", "TQA API", `${method} ${path}`);
  let response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      ...options,
      cache: "no-store",
      headers: { Authorization: auth.header, ...(options.body ? { "Content-Type": "application/json" } : {}) }
    });
  } catch (error) {
    await logEvent("error", "TQA API", `${method} ${path}: ${safeError(error)}`);
    throw error;
  }
  if (!response.ok) {
    let message = `TQA API returned HTTP ${response.status}`;
    try { message = (await response.json()).error?.message || message; } catch { /* keep status */ }
    await logEvent("error", "TQA API", `${method} ${path}: HTTP ${response.status}: ${message}`);
    throw new Error(message);
  }
  await logEvent("success", "TQA API", `${method} ${path}: HTTP ${response.status}`);
  return response;
}

async function loadQueue() {
  const qcs = [];
  const seen = new Set();
  let cursor = null;
  do {
    const url = new URL("/api/integrations/trust/qcs", API_ORIGIN);
    url.searchParams.set("uploadStatus", "uploadable");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const body = await (await api(url.pathname + url.search)).json();
    for (const qc of body.qcs) if (!seen.has(qc.id)) { seen.add(qc.id); qcs.push(qc); }
    cursor = body.nextCursor;
  } while (cursor);
  await chrome.storage.local.set({ queue: qcs });
  return qcs;
}

async function detail(id) {
  return (await (await api(`/api/integrations/trust/qcs/${encodeURIComponent(id)}`)).json()).qc;
}

async function report(id, status, value) {
  const body = status === "uploaded"
    ? { status, externalReference: value }
    : { status, errorMessage: value.slice(0, 500) };
  return (await (await api(`/api/integrations/trust/qcs/${encodeURIComponent(id)}/upload`, {
    method: "PATCH", body: JSON.stringify(body)
  })).json()).qc;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitBeforeNextQc(jobNumber) {
  await setRun({
    stage: "waiting",
    message: `Job ${jobNumber} uploaded successfully. Waiting 20 seconds before the next QC.`
  });
  const waitUntil = Date.now() + BETWEEN_QC_DELAY_MS;
  while (!stopRequested && Date.now() < waitUntil) {
    await delay(Math.min(500, waitUntil - Date.now()));
  }
  if (!stopRequested) {
    await logEvent("info", "waiting", "20-second wait finished. Starting the next QC.");
  }
}
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}
async function pageCommand(tabId, command, data = {}, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  let lastError;
  const quiet = command === "PING";
  if (!quiet) await logEvent("info", "Catalyst page", `Sending ${command} to tab ${tabId}`);
  while (Date.now() < until) {
    try {
      const response = await withTimeout(chrome.tabs.sendMessage(tabId, { command, ...data }),
        Math.max(1, until - Date.now()), `${command} did not respond within ${timeoutMs} ms.`);
      if (response?.ok) {
        if (!quiet) await logEvent("success", "Catalyst page", `${command} completed in tab ${tabId}`);
        return response.result;
      }
      if (response?.error) throw new Error(response.error);
    } catch (error) {
      lastError = error;
      if (!/Receiving end does not exist|message port closed|Could not establish connection/i.test(String(error))) {
        if (!quiet) await logEvent("error", "Catalyst page", `${command} in tab ${tabId}: ${safeError(error)}`);
        throw error;
      }
    }
    await delay(250);
  }
  const error = new Error(`${command} could not connect to the Catalyst page within ${timeoutMs} ms. Last error: ${safeError(lastError || "No content-script response")}`);
  if (!quiet) await logEvent("error", "Catalyst page", error.message);
  throw error;
}

async function navigate(tabId, url) {
  await logEvent("info", "Navigation", `Opening ${url}`);
  await chrome.tabs.update(tabId, { url, active: true });
  const until = Date.now() + 30000;
  let lastPingError = "";
  while (Date.now() < until) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete" && tab.url?.startsWith(url)) {
      try {
        await pageCommand(tabId, "PING", {}, 1500);
        await logEvent("success", "Navigation", `Ready: ${tab.url}`);
        return;
      } catch (error) { lastPingError = safeError(error); }
    }
    await delay(250);
  }
  const tab = await chrome.tabs.get(tabId);
  const error = new Error(`Catalyst page did not become ready within 30 seconds. Expected: ${url}. Actual: ${tab.url || "unknown"}. Tab status: ${tab.status || "unknown"}.${lastPingError ? ` Last page response: ${lastPingError}` : ""}`);
  await logEvent("error", "Navigation", error.message);
  throw error;
}

function waitForSuccess(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { successWaiters.delete(tabId); reject(new Error("No Observation Saved completion message appeared.")); }, timeoutMs);
    successWaiters.set(tabId, (message) => { clearTimeout(timer); successWaiters.delete(tabId); resolve(message); });
  });
}

async function photoBase64(url) {
  const parsed = new URL(url);
  if (parsed.origin !== API_ORIGIN || !/^\/api\/integrations\/trust\/photos\//.test(parsed.pathname)) throw new Error("Unexpected photo URL from TQA API.");
  const blob = await (await api(parsed.pathname)).blob();
  if (blob.type && blob.type !== "image/jpeg") throw new Error("TQA returned a non-JPEG photo.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let encoded = "";
  for (let i = 0; i < bytes.length; i += 32768) encoded += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(encoded);
}

async function processOne(qcSummary, tabId, index, total, attempt) {
  let photoCount = 0;
  let qc = null;
  await setRun({ currentQcId: qcSummary.id, jobId: null, jobNumber: qcSummary.jobNumber, techId: qcSummary.techId,
    index: index + 1, total, attempt, maxAttempts: MAX_QC_ATTEMPTS, photoIndex: 0, photoTotal: 0,
    stage: "loading QC", message: `Loading job ${qcSummary.jobNumber} (attempt ${attempt} of ${MAX_QC_ATTEMPTS})` });
  try {
    qc = await detail(qcSummary.id);
    if (qc.reviewStatus !== "approved" || !["ready", "failed"].includes(qc.uploadStatus)) {
      return { status: "skipped", jobNumber: qc.jobNumber };
    }
    const photos = orderedPhotos(qc);
    await setRun({ currentQcId: qc.id, jobNumber: qc.jobNumber, techId: qc.techId, photoTotal: photos.length,
      stage: "finding job", message: `Finding job ${qc.jobNumber} (attempt ${attempt} of ${MAX_QC_ATTEMPTS})` });
    await navigate(tabId, JOBS_URL);
    const search = await pageCommand(tabId, "FIND_JOB", { jobNumber: qc.jobNumber }, 45000);
    const matches = exactJobMatches(search.rows, qc.jobNumber, qc.techId);
    if (matches.length !== 1) {
      const reason = matches.length === 0 ? "No exact job number and Tech ID match in Catalyst." : "Multiple exact job number and Tech ID matches in Catalyst.";
      await report(qc.id, "failed", reason);
      await setRun({ stage: "failed", message: `Job ${qc.jobNumber}: ${reason}` });
      return { status: "failed", jobNumber: qc.jobNumber, reason };
    }
    const jobId = matches[0].jobId;
    await setRun({ stage: "opening observation", jobId, message: `Opening Catalyst job ID ${jobId}` });
    await navigate(tabId, observationUrl(jobId));
    await pageCommand(tabId, "PREPARE", { jobNumber: qc.jobNumber, techId: qc.techId });
    for (let i = 0; i < photos.length; i++) {
      if (stopRequested) throw new Error("Stopped by user before completing this QC.");
      await setRun({ stage: "uploading", photoIndex: i, message: `Uploading photo ${i + 1} of ${photos.length} for job ${qc.jobNumber}` });
      const base64 = await photoBase64(photos[i].url);
      await pageCommand(tabId, "UPLOAD_PHOTO", { base64, fileName: photos[i].id }, 60000);
      photoCount = i + 1;
      await setRun({ photoIndex: photoCount });
    }
    await setRun({ stage: "quality checks", message: `Setting checks for job ${qc.jobNumber}` });
    await pageCommand(tabId, "SET_CHECKS");
    if (stopRequested) throw new Error("Stopped by user before completing this QC.");
    await setRun({ stage: "completing", message: `Completing job ${qc.jobNumber}` });
    const success = waitForSuccess(tabId);
    try { await pageCommand(tabId, "COMPLETE", {}, 10000); } catch { /* page can navigate before replying */ }
    const successMessage = await success;
    await setRun({ stage: "reporting", message: `${successMessage}; reporting to TQA` });
    const uploaded = await report(qc.id, "uploaded", jobId);
    if (uploaded.uploadStatus !== "uploaded") throw new Error("TQA did not confirm uploaded status.");
    await setRun({ stage: "uploaded", message: `Job ${qc.jobNumber}: ${successMessage}` });
    return { status: "uploaded", jobNumber: qc.jobNumber };
  } catch (error) {
    const reason = safeError(error);
    const { run } = await stored();
    const jobNumber = qc?.jobNumber || qcSummary.jobNumber || qcSummary.id;
    const mayBePartial = qc && run?.currentQcId === qc.id
      && (photoCount > 0 || /uploading|quality checks|completing|reporting/i.test(run.stage || ""));
    if (mayBePartial) {
      await setRun({ status: "needs_review", stage: "needs review", message: `Job ${jobNumber} may be partially uploaded. Check Catalyst before retrying. ${reason}` });
      throw error;
    }
    try { await report(qcSummary.id, "failed", reason); } catch { /* preserve original error */ }
    await setRun({ stage: "failed", message: `Job ${jobNumber}: ${reason}` });
    return { status: "failed", jobNumber, reason };
  }
}

async function runQueue() {
  let tabId;
  try {
    const queue = await loadQueue();
    await setRun({ status: "running", total: queue.length, index: 0, stage: "starting", message: `${queue.length} approved QCs to process` });
    if (!queue.length) { await setRun({ status: "done", stage: "done", message: "No approved QCs are ready to upload." }); return; }
    const tab = await chrome.tabs.create({ url: JOBS_URL, active: true });
    tabId = tab.id;
    await setRun({ tabId });
    const pending = queue.map((qc, index) => ({ qc, index, attempt: 1 }));
    const exhausted = [];
    while (pending.length) {
      if (stopRequested) break;
      const item = pending.shift();
      const result = await processOne(item.qc, tabId, item.index, queue.length, item.attempt);
      if ((await stored()).run?.status === "needs_review") return;
      if (result.status === "failed" && !stopRequested) {
        if (item.attempt < MAX_QC_ATTEMPTS) {
          pending.push({ ...item, attempt: item.attempt + 1 });
          await setRun({ stage: "requeued", message: `Job ${result.jobNumber} failed attempt ${item.attempt} of ${MAX_QC_ATTEMPTS} and was moved to the end of the queue.` });
        } else {
          exhausted.push(result.jobNumber);
          await setRun({ stage: "failed", message: `Job ${result.jobNumber} failed after ${MAX_QC_ATTEMPTS} attempts. Continuing the queue.` });
        }
      } else if (result.status === "uploaded" && pending.length && !stopRequested) {
        await waitBeforeNextQc(result.jobNumber);
      }
    }
    await loadQueue();
    const failedSummary = exhausted.length
      ? `Queue finished. ${exhausted.length} QC${exhausted.length === 1 ? "" : "s"} failed after ${MAX_QC_ATTEMPTS} attempts: ${exhausted.join(", ")}.`
      : "Queue finished.";
    await setRun({ status: stopRequested ? "stopped" : "done", stage: exhausted.length ? "done with failures" : "done",
      message: stopRequested ? "Stopped." : failedSummary });
  } catch (error) {
    const { run } = await stored();
    if (run?.status !== "needs_review") await setRun({ status: "error", stage: "error", message: safeError(error) });
  } finally {
    activeRun = null;
    stopRequested = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.command === "PAGE_LOG") {
    if (sender.tab?.id != null) void logEvent(["error", "success"].includes(message.level) ? message.level : "info",
      `Catalyst tab ${sender.tab.id}: ${message.step || "page"}`, message.message || "Page event");
    sendResponse({ ok: true });
    return;
  }
  if (message?.command === "OBSERVATION_SAVED") {
    if (sender.tab?.id != null) {
      void logEvent("success", "Catalyst completion", `Tab ${sender.tab.id}: ${message.text || "Observation Saved"}`);
      successWaiters.get(sender.tab.id)?.(message.text || "Observation Saved");
    }
    sendResponse({ ok: true });
    return;
  }
  (async () => {
    switch (message?.command) {
      case "GET_STATE": {
        const data = await stored();
        const auth = await authentication();
        return { queue: data.queue || [], run: data.run || {}, logs: data.logs || [], hasAuth: auth.available, authMode: auth.mode };
      }
      case "SAVE_KEY": {
        if (!/^tqa_trust_[a-f0-9]{64}$/.test(message.key || "")) throw new Error("Invalid TQA API key format.");
        await storageReady;
        await chrome.storage.local.set({ trustApiKey: message.key });
        await logEvent("info", "Settings", "TQA API key saved in extension storage.");
        return { saved: true };
      }
      case "REFRESH": return { queue: await loadQueue() };
      case "CLEAR_LOGS": {
        await logChain;
        await chrome.storage.local.set({ logs: [] });
        return { cleared: true };
      }
      case "START": {
        if (activeRun) throw new Error("An upload run is already active.");
        const { run } = await stored();
        if (["running", "needs_review"].includes(run?.status)) throw new Error("Review the interrupted Catalyst job before starting another run.");
        stopRequested = false;
        activeRun = runQueue();
        return { started: true };
      }
      case "STOP": {
        stopRequested = true;
        await logEvent("info", "Run", "Stop requested by user.");
        return { stopping: true };
      }
      case "ACK_REVIEW": {
        const { run } = await stored();
        if (run?.status !== "needs_review") throw new Error("There is no QC awaiting review.");
        await setRun({ status: "stopped", stage: "ready", message: "Review acknowledged. Refresh the queue, then start a new run." });
        return { acknowledged: true };
      }
      case "CONFIRM_REVIEWED_UPLOAD": {
        const { run } = await stored();
        if (run?.status !== "needs_review" || !run.currentQcId || !run.jobId) throw new Error("No matching Catalyst job is available to confirm.");
        const qc = await report(run.currentQcId, "uploaded", run.jobId);
        if (qc.uploadStatus !== "uploaded") throw new Error("TQA did not confirm uploaded status.");
        await loadQueue();
        await setRun({ status: "done", stage: "uploaded", message: `Job ${run.jobNumber} marked uploaded after your Catalyst review.` });
        return { uploaded: true };
      }
      default: throw new Error("Unknown extension command.");
    }
  })().then((result) => sendResponse({ ok: true, result }), (error) => sendResponse({ ok: false, error: safeError(error) }));
  return true;
});

async function checkInterruptedRun() {
  const { run } = await stored();
  if (!activeRun && run?.status === "running") await setRun({ status: "needs_review", stage: "interrupted", message: "Chrome interrupted an upload. Check the current QC in Catalyst before retrying." });
}
void checkInterruptedRun();
