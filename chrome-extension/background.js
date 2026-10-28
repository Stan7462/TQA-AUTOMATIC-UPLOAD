import { JOBS_URL, OBSERVATIONS_URL, TQA_APP_ORIGIN, completedObservationUrl, exactJobMatches, observationTypeAssignments, observationUrl, orderedPhotos, recoveryPhotoIndex, safeError } from "./core.js";

let activeRun = null;
let stopRequested = false;
const successWaiters = new Map();
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let logChain = Promise.resolve();
const DELAY_OPTIONS_SECONDS = [5, 15, 30, 60, 90, 120];
const DEFAULT_QC_DELAY_SECONDS = 30;
const DEFAULT_RIDE_ALONG_PERCENTAGE = 50;
const MAX_QC_ATTEMPTS = 3;
const INSTALLED_VERSION = chrome.runtime.getManifest().version;
let updateCheck = null;
function updateError(message,code='EXTENSION_UPDATE_REQUIRED') {const error=new Error(message);error.code=code;return error;}
async function saveUpdateInfo(info) {
  await chrome.storage.local.set({updateInfo:{...info,installedVersion:INSTALLED_VERSION,checkedAt:Date.now()}});
  const required=info.status==='update_required',unavailable=info.status==='unavailable';
  await chrome.action.setBadgeText({text:required?'UPD':unavailable?'?':''});
  if(required||unavailable)await chrome.action.setBadgeBackgroundColor({color:required?'#b43d44':'#946319'});
  await chrome.action.setTitle({title:required?`TQA update required: v${info.latestVersion}`:'TQA Catalyst Uploader'});
  return info;
}
async function checkForUpdate() {
  await storageReady;
  if(updateCheck)return updateCheck;
  updateCheck=(async()=>{
    try{
      const response=await fetch(`${TQA_APP_ORIGIN}/api/extension/version`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok||!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(data.version)||data.requiredVersion!==data.version)throw Error('Could not verify the latest extension version.');
      return await saveUpdateInfo({status:data.version===INSTALLED_VERSION?'current':'update_required',latestVersion:data.version});
    }catch{
      const {updateInfo}=await chrome.storage.local.get('updateInfo');
      if(updateInfo?.status==='update_required')return updateInfo;
      return await saveUpdateInfo({status:'unavailable',message:'Could not check for updates. Reconnect and check again before uploading.'});
    }
  })();
  try{return await updateCheck;}finally{updateCheck=null;}
}
async function assertCurrentVersion(){
  const info=await checkForUpdate();
  if(info.status==='update_required')throw updateError(`Update to v${info.latestVersion} before starting another QC. Open the TQA app to download the latest extension.`);
  if(info.status!=='current')throw updateError(info.message,'EXTENSION_VERSION_UNAVAILABLE');
}
async function initializeUpdates(){
  await chrome.alarms.create('extension-update-check',{periodInMinutes:5});
  await checkForUpdate();
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='extension-update-check')void checkForUpdate();});

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    await logEvent("error", "Extension panel", `Could not enable the persistent side panel: ${safeError(error)}`);
  }
}

chrome.runtime.onInstalled.addListener(() => { void configureSidePanel(); void initializeUpdates(); });
chrome.runtime.onStartup.addListener(() => { void configureSidePanel(); void initializeUpdates(); });
void configureSidePanel();
void initializeUpdates();

function logEvent(level, step, message) {
  const entry = { at: new Date().toISOString(), level, step, message: safeError(message) };
  logChain = logChain.catch(() => {}).then(async () => {
    await storageReady;
    const { logs = [] } = await chrome.storage.local.get("logs");
    await chrome.storage.local.set({ logs: [...logs, entry].slice(-200) });
  });
  return logChain;
}

async function stored() { await storageReady; return chrome.storage.local.get(["sessionToken", "connectedTechId", "tenantName", "queue", "run", "logs", "qcDelaySeconds", "rideAlongPercentage", "updateInfo"]); }
async function recovery(qcId, patch) {
  await storageReady;
  const { recoveryCheckpoints = {} } = await chrome.storage.local.get('recoveryCheckpoints');
  if (patch === null) delete recoveryCheckpoints[qcId];
  else if (patch) recoveryCheckpoints[qcId] = { ...recoveryCheckpoints[qcId], ...patch };
  if (patch !== undefined) await chrome.storage.local.set({ recoveryCheckpoints });
  return recoveryCheckpoints[qcId];
}
async function qcDelaySeconds() {
  const { qcDelaySeconds: saved } = await stored();
  return DELAY_OPTIONS_SECONDS.includes(saved) ? saved : DEFAULT_QC_DELAY_SECONDS;
}
function validRideAlongPercentage(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100 && value % 10 === 0;
}
async function rideAlongPercentage() {
  const { rideAlongPercentage: saved } = await stored();
  return validRideAlongPercentage(saved) ? saved : DEFAULT_RIDE_ALONG_PERCENTAGE;
}
async function authentication() {
  await storageReady;
  const { sessionToken, connectedTechId, tenantName } = await stored();
  if (/^[a-f0-9]{64}$/.test(sessionToken || "")) {
    return { available: true, mode: "session", header: `Session ${sessionToken}`, apiOrigin: TQA_APP_ORIGIN, connectedTechId, tenantName };
  }
  return { available: false, mode: "none", header: null, apiOrigin: null };
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
  if (!auth.available) throw new Error("Connect the extension with your Admin ID and password.");
  const method = options.method || "GET";
  await logEvent("info", "TQA API", `${method} ${path}`);
  let response;
  try {
    response = await fetch(`${auth.apiOrigin}${path}`, {
      ...options,
      cache: "no-store",
      headers: { Authorization: auth.header, 'X-TQA-Extension-Version':INSTALLED_VERSION, ...(options.body ? { "Content-Type": "application/json" } : {}) }
    });
  } catch (error) {
    await logEvent("error", "TQA API", `${method} ${path}: ${safeError(error)}`);
    throw error;
  }
  if (!response.ok) {
    let message = `TQA API returned HTTP ${response.status}`;
    let failure;
    try { failure=(await response.json()).error;message = failure?.message || message; } catch { /* keep status */ }
    if(failure?.code==='EXTENSION_UPDATE_REQUIRED'){
      await saveUpdateInfo({status:'update_required',latestVersion:failure.latestVersion});
      throw updateError(message);
    }
    await logEvent("error", "TQA API", `${method} ${path}: HTTP ${response.status}: ${message}`);
    if (response.status === 401 && auth.mode === "session") await chrome.storage.local.remove(["sessionToken", "queue"]);
    throw new Error(message);
  }
  await logEvent("success", "TQA API", `${method} ${path}: HTTP ${response.status}`);
  return response;
}

async function loadQueue() {
  const auth = await authentication();
  if (!auth.available) throw new Error("Connect the extension before refreshing the queue.");
  const qcs = [];
  const seen = new Set();
  let cursor = null;
  do {
    const url = new URL("/api/integrations/trust/qcs", auth.apiOrigin);
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

async function report(id, status, value, observationType) {
  const body = status === "uploaded"
    ? { status, externalReference: value, observationType }
    : { status, errorMessage: value.slice(0, 500) };
  return (await (await api(`/api/integrations/trust/qcs/${encodeURIComponent(id)}/upload`, {
    method: "PATCH", body: JSON.stringify(body)
  })).json()).qc;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitBeforeNextQc(jobNumber) {
  let seconds = await qcDelaySeconds();
  await setRun({
    stage: "waiting",
    waitTotalSeconds: seconds,
    waitRemainingSeconds: seconds,
    message: `Job ${jobNumber} uploaded successfully. Waiting ${seconds} seconds before the next QC.`
  });
  const waitStartedAt = Date.now();
  let previousRemaining = seconds;
  while (!stopRequested) {
    const configuredSeconds = await qcDelaySeconds();
    if (configuredSeconds !== seconds) {
      seconds = configuredSeconds;
      await setRun({ waitTotalSeconds: seconds });
    }
    const waitUntil = waitStartedAt + seconds * 1000;
    const remaining = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));
    if (remaining !== previousRemaining) {
      previousRemaining = remaining;
      await setRun({ waitRemainingSeconds: remaining });
    }
    if (remaining === 0) break;
    await delay(Math.min(500, waitUntil - Date.now()));
  }
  if (!stopRequested) {
    await setRun({ waitRemainingSeconds: 0 });
    await logEvent("info", "waiting", `${seconds}-second wait finished. Starting the next QC.`);
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

async function waitForObservationId(tabId, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url?.includes("/TechOps/observation")) {
      const id = new URL(tab.url).searchParams.get("id");
      if (/^\d+$/.test(id || "")) return id;
    }
    await delay(250);
  }
  throw new Error("Catalyst opened the failed observation without a readable observation ID.");
}

function waitForSuccess(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { successWaiters.delete(tabId); reject(new Error("No Observation Saved completion message appeared.")); }, timeoutMs);
    successWaiters.set(tabId, (message) => { clearTimeout(timer); successWaiters.delete(tabId); resolve(message); });
  });
}

async function photoBase64(url) {
  const auth = await authentication();
  const parsed = new URL(url);
  const expected = auth.available ? new URL(auth.apiOrigin) : null;
  if (!expected || parsed.hostname !== expected.hostname || !/^\/api\/integrations\/trust\/photos\//.test(parsed.pathname)) throw new Error("Unexpected photo URL from TQA API.");
  const blob = await (await api(parsed.pathname)).blob();
  if (blob.type && blob.type !== "image/jpeg") throw new Error("TQA returned a non-JPEG photo.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let encoded = "";
  for (let i = 0; i < bytes.length; i += 32768) encoded += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(encoded);
}

async function monthlyObservationType(qc) {
  const totals = await (await api("/api/integrations/trust/observation-totals")).json();
  const row = totals.technicians.find(row => row.techId === qc.techId);
  if (Number(row?.unknown) > 0) await logEvent("info", "monthly split", `Tech ${qc.techId}: ${row.unknown} older passing uploads have no recorded observation type. Monthly balancing uses confirmed known types; older types need reconciliation from Catalyst.`);
  return observationTypeAssignments([qc],await rideAlongPercentage(),Math.random,totals.technicians)[0].observationType;
}

async function processOne(qcSummary, tabId, index, total, attempt, observationType) {
  let photoCount = 0;
  let qc = null;
  await setRun({ currentQcId: qcSummary.id, jobId: null, jobNumber: qcSummary.jobNumber, techId: qcSummary.techId,
    index: index + 1, total, attempt, maxAttempts: MAX_QC_ATTEMPTS, photoIndex: 0, photoTotal: 0,
    observationType, stage: "loading QC", message: `Loading job ${qcSummary.jobNumber} as ${observationType} (attempt ${attempt} of ${MAX_QC_ATTEMPTS})` });
  try {
    qc = await detail(qcSummary.id);
    if (!["approved", "rejected"].includes(qc.reviewStatus) || !["ready", "failed"].includes(qc.uploadStatus)) {
      return { status: "skipped", jobNumber: qc.jobNumber };
    }
    const photos = qc.workflow === "follow_up" ? orderedPhotos(qc).filter((photo) => photo.kind === "live_photo") : orderedPhotos(qc);
    if (qc.workflow === "follow_up") {
      if (!/^\d+$/.test(qc.catalystObservationId || "")) throw new Error("The corrected QC is missing its Catalyst observation ID.");
      const followCheckpoint = await recovery(qc.id);
      if (followCheckpoint?.workflow === "follow_up" && followCheckpoint.completionConfirmed &&
          followCheckpoint.jobNumber === qc.jobNumber && followCheckpoint.techId === qc.techId &&
          followCheckpoint.externalReference === qc.catalystObservationId &&
          JSON.stringify(followCheckpoint.photoIds) === JSON.stringify(photos.map(photo => photo.id))) {
        return await reportFollowUp(qc, photos);
      }
      await setRun({ currentQcId: qc.id, jobNumber: qc.jobNumber, techId: qc.techId, photoTotal: photos.length, stage: "opening follow-up", message: `Opening failed Catalyst observation ${qc.catalystObservationId} for job ${qc.jobNumber}` });
      await navigate(tabId, completedObservationUrl(qc.catalystObservationId));
      const followUp = await pageCommand(tabId, "PREPARE_FOLLOW_UP", { jobNumber: qc.jobNumber, techId: qc.techId, photoCount: photos.length }, 90000);
      if (followUp?.completed) return await reportFollowUp(qc, photos);
      for (let i = 0; i < photos.length; i++) {
        if (stopRequested) throw new Error("Stopped by user before completing this follow-up.");
        await setRun({ stage: "uploading correction", photoIndex: i, message: `Uploading corrected photo ${i + 1} of ${photos.length} for job ${qc.jobNumber}` });
        const base64 = await photoBase64(photos[i].url);
        await pageCommand(tabId, "UPLOAD_FOLLOW_UP_PHOTO", { base64, fileName: photos[i].id }, 60000);
        photoCount = i + 1;
        await setRun({ photoIndex: photoCount });
      }
      await setRun({ stage: "saving follow-up", message: `Saving completed follow-up for job ${qc.jobNumber}` });
      await pageCommand(tabId, "SAVE_FOLLOW_UP", { note: "Issues are fixed.", photoCount: photos.length }, 45000);
      // Verify a fresh persisted record, rather than relying on an observation-only toast.
      await navigate(tabId, completedObservationUrl(qc.catalystObservationId));
      const verified = await pageCommand(tabId, "VERIFY_SAVED_FOLLOW_UP", { jobNumber: qc.jobNumber, techId: qc.techId, photoCount: photos.length }, 60000);
      if (!verified?.completed) throw new Error("Catalyst did not confirm the saved correction.");
      return await reportFollowUp(qc, photos);
    }
    await setRun({ currentQcId: qc.id, jobNumber: qc.jobNumber, techId: qc.techId, photoTotal: photos.length,
      stage: "finding job", message: `Finding job ${qc.jobNumber} (attempt ${attempt} of ${MAX_QC_ATTEMPTS})` });
    let checkpoint = await recovery(qc.id);
    observationType = qc.outcome === "fail" || qc.reviewStatus === "rejected" ? "After the Fact" : checkpoint?.observationType || await monthlyObservationType(qc);
    await setRun({observationType});
    let jobId = checkpoint?.jobId;
    if (!jobId) {
      await navigate(tabId, JOBS_URL);
      const search = await pageCommand(tabId, "FIND_JOB", { jobNumber: qc.jobNumber }, 45000);
      const matches = exactJobMatches(search.rows, qc.jobNumber, qc.techId);
      if (matches.length !== 1) {
        const reason = matches.length === 0 ? "No exact job number and Tech ID match in Catalyst." : "Multiple exact job number and Tech ID matches in Catalyst.";
        await report(qc.id, "failed", reason);
        await setRun({ stage: "failed", message: `Job ${qc.jobNumber}: ${reason}` });
        return { status: "failed", jobNumber: qc.jobNumber, reason };
      }
      jobId = matches[0].jobId;
      checkpoint = await recovery(qc.id, {jobId, jobNumber:qc.jobNumber, techId:qc.techId, observationType, photoIds:[], photoKeys:[], completionStarted:false});
    }
    if (checkpoint.jobNumber !== qc.jobNumber || checkpoint.techId !== qc.techId) throw new Error("Saved Catalyst job does not match this QC.");
    if (checkpoint.completionConfirmed) {
      await setRun({jobId,stage:"reporting",message:`Catalyst already saved job ${qc.jobNumber}; resuming success reporting only`});
      return await reportSavedObservation(qc, tabId, checkpoint);
    }
    await setRun({ stage: "opening observation", jobId, message: `Opening saved Catalyst job ID ${jobId}` });
    await navigate(tabId, observationUrl(jobId));
    const state = await pageCommand(tabId, "INSPECT_OBSERVATION", {jobNumber:qc.jobNumber, techId:qc.techId});
    let startPhoto;
    try { startPhoto = recoveryPhotoIndex(checkpoint, state, photos); }
    catch (error) {
      await setRun({status:"needs_review",stage:"needs review",message:safeError(error)});
      throw error;
    }
    photoCount = startPhoto;
    await setRun({photoIndex:startPhoto});
    const selectedType = observationType;
    if (checkpoint.observationType !== selectedType) checkpoint = await recovery(qc.id,{observationType:selectedType});
    await setRun({stage:"observation setup",message:`Selecting ${selectedType} and Customer Contact No for job ${qc.jobNumber}`});
    const prepared = await pageCommand(tabId, "PREPARE", { jobNumber: qc.jobNumber, techId: qc.techId, observationType:selectedType }, 60000);
    await recovery(qc.id,{technicianName:prepared.technicianName});
    for (let i = startPhoto; i < photos.length; i++) {
      if (stopRequested) throw new Error("Stopped by user before completing this QC.");
      await setRun({ stage: "uploading", photoIndex: i, message: `Uploading photo ${i + 1} of ${photos.length} for job ${qc.jobNumber}` });
      const base64 = await photoBase64(photos[i].url);
      await pageCommand(tabId, "UPLOAD_PHOTO", { base64, fileName: photos[i].id }, 60000);
      const savedState = await pageCommand(tabId, "INSPECT_OBSERVATION", {jobNumber:qc.jobNumber, techId:qc.techId});
      if (savedState.photoKeys.length !== i + 1) throw new Error("Catalyst photo count changed unexpectedly. Review before retrying.");
      await recovery(qc.id,{photoIds:photos.slice(0,i+1).map(photo=>photo.id),photoKeys:savedState.photoKeys});
      photoCount = i + 1;
      await setRun({ photoIndex: photoCount });
    }
    await setRun({ stage: "quality checks", message: `Setting checks for job ${qc.jobNumber}` });
    await pageCommand(tabId, "SET_CHECKS", { failures: qc.outcome === "fail" ? qc.failureReasons : [], supervisorComment: qc.outcome === "fail" ? qc.supervisorComment : "" }, 120000);
    if (stopRequested) throw new Error("Stopped by user before completing this QC.");
    await setRun({ stage: "completing", message: `Completing job ${qc.jobNumber}` });
    await recovery(qc.id,{completionStarted:true});
    const success = waitForSuccess(tabId);
    try { await pageCommand(tabId, "COMPLETE", {}, 10000); } catch { /* page can navigate before replying */ }
    const successMessage = await success;
    checkpoint = await recovery(qc.id,{completionConfirmed:true,successMessage});
    return await reportSavedObservation(qc, tabId, checkpoint);
  } catch (error) {
    if(['EXTENSION_UPDATE_REQUIRED','EXTENSION_VERSION_UNAVAILABLE'].includes(error.code))throw error;
    const reason = safeError(error);
    const { run } = await stored();
    const jobNumber = qc?.jobNumber || qcSummary.jobNumber || qcSummary.id;
    const mayBePartial = qc && run?.currentQcId === qc.id
      && (photoCount > 0 || /uploading|quality checks|completing|reporting/i.test(run.stage || ""));
    if (mayBePartial || run?.status === "needs_review") {
      await setRun({ status: "needs_review", stage: "needs review", message: `Job ${jobNumber} may be partially uploaded. Check Catalyst before retrying. ${reason}` });
      throw error;
    }
    try { await report(qcSummary.id, "failed", reason); } catch { /* preserve original error */ }
    await setRun({ stage: "failed", message: `Job ${jobNumber}: ${reason}` });
    return { status: "failed", jobNumber, reason };
  }
}

async function reportFollowUp(qc, photos) {
  await recovery(qc.id, { workflow: "follow_up", completionConfirmed: true, jobNumber: qc.jobNumber, techId: qc.techId,
    externalReference: qc.catalystObservationId, photoIds: photos.map(photo => photo.id) });
  await setRun({ stage: "reporting", message: `Saved correction verified; reporting job ${qc.jobNumber} to TQA` });
  const uploaded = await report(qc.id, "uploaded", qc.catalystObservationId);
  if (uploaded.uploadStatus !== "uploaded") throw new Error("TQA did not confirm follow-up upload status.");
  await recovery(qc.id, null);
  await setRun({ stage: "uploaded", message: `Job ${qc.jobNumber} correction saved and reported to TQA` });
  return { status: "uploaded", jobNumber: qc.jobNumber };
}

async function reportSavedObservation(qc, tabId, checkpoint) {
  await setRun({stage:"reporting",message:`Catalyst saved job ${qc.jobNumber}; reporting the confirmed save to TQA`});
  let reference = qc.outcome === "fail" ? checkpoint.externalReference : checkpoint.externalReference || checkpoint.jobId;
  if (qc.outcome === "fail" && !checkpoint.externalReference) {
    // The Observation Saved toast is Catalyst's authoritative completion signal.
    // Recover the observation ID when Catalyst's name search can find it, but do
    // not leave an already-saved Fail in the upload queue when that lookup fails.
    try {
      if (!checkpoint.technicianName) throw new Error("Catalyst technician name is missing for completed observation lookup.");
      await navigate(tabId, OBSERVATIONS_URL);
      const found = await pageCommand(tabId,"FIND_COMPLETED_OBSERVATION",{jobNumber:qc.jobNumber,techId:qc.techId,technicianName:checkpoint.technicianName},60000);
      reference = /^\d+$/.test(found?.observationId || "") ? found.observationId : await waitForObservationId(tabId);
    } catch (error) {
      await logEvent("info", "observation ID", `Job ${qc.jobNumber}: Observation Saved was confirmed. Catalyst observation ID lookup was skipped: ${safeError(error)}`);
    }
  }
  if (reference) await recovery(qc.id,{externalReference:reference});
  const uploaded = await report(qc.id,"uploaded",reference,qc.outcome === "fail" ? "After the Fact" : checkpoint.observationType);
  if (uploaded.uploadStatus !== "uploaded") throw new Error("TQA did not confirm uploaded status.");
  await recovery(qc.id,null);
  await setRun({stage:"uploaded",message:`Job ${qc.jobNumber}: Catalyst save confirmed and TQA updated`});
  return {status:"uploaded",jobNumber:qc.jobNumber};
}

async function runQueue(preferredQcId = null) {
  let tabId;
  try {
    await assertCurrentVersion();
    const queue = await loadQueue();
    // Record forced After-the-Fact failures before choosing types for passing
    // QCs, so this batch can also correct the resulting monthly imbalance.
    queue.sort((a,b)=>Number(b.outcome === "fail")-Number(a.outcome === "fail"));
    if (preferredQcId) queue.sort((a,b)=>Number(b.id===preferredQcId)-Number(a.id===preferredQcId));
    const percentage = await rideAlongPercentage();
    const pending = queue.map((qc,index)=>({qc,index,attempt:1,observationType:"After the Fact"}));
    await setRun({ status: "running", total: queue.length, index: 0, rideAlongPercentage: percentage,
      stage: "starting", message: `${queue.length} Catalyst QCs to process; using a ${percentage}% Ride Along target per technician for the fiscal month. Each QC uses the latest confirmed monthly totals. Failed QCs are After the Fact.` });
    if (!queue.length) {
      await setRun({ status: "done", stage: "done", message: "No QCs are ready to upload.",
        currentQcId: null, jobId: null, jobNumber: null, techId: null, index: 0, total: 0,
        photoIndex: 0, photoTotal: 0, attempt: null, maxAttempts: null, observationType: null });
      return;
    }
    const tab = await chrome.tabs.create({ url: JOBS_URL, active: true });
    tabId = tab.id;
    await setRun({ tabId });
    const exhausted = [];
    while (pending.length) {
      if (stopRequested) break;
      await assertCurrentVersion();
      const item = pending.shift();
      const result = await processOne(item.qc, tabId, item.index, queue.length, item.attempt, item.observationType);
      if ((await stored()).run?.status === "needs_review") return;
      // Recheck only after the current QC has saved and reported its result.
      await assertCurrentVersion();
      if (result.status === "uploaded" && !stopRequested) {
        // A completed first Fail can unlock its approved Fix during this same run.
        const unlocked = (await loadQueue()).filter(qc => qc.workflow === "follow_up" && !queue.some(known => known.id === qc.id));
        for (const qc of unlocked) {
          const index = queue.length;
          queue.push(qc);
          pending.push({ qc, index, attempt: 1, observationType: "After the Fact" });
        }
        if (unlocked.length) await setRun({ total: queue.length });
      }
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
    if (stopRequested) {
      await setRun({ status: "stopped", stage: "stopped", message: "Stopped." });
    } else {
      await setRun({ status: "done", stage: exhausted.length ? "done with failures" : "done", message: failedSummary,
        currentQcId: null, jobId: null, jobNumber: null, techId: null, index: queue.length, total: queue.length,
        photoIndex: 0, photoTotal: 0, attempt: null, maxAttempts: null, observationType: null });
    }
  } catch (error) {
    const { run } = await stored();
    if(['EXTENSION_UPDATE_REQUIRED','EXTENSION_VERSION_UNAVAILABLE'].includes(error.code)){
      await setRun({status:'update_required',stage:'update required',message:safeError(error)});
      return;
    }
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
      case "CHECK_UPDATE": return await checkForUpdate();
      case "OPEN_UPDATE": return await chrome.tabs.create({url:`${TQA_APP_ORIGIN}/extension`,active:true});
      case "GET_STATE": {
        const data = await stored();
        const auth = await authentication();
        return { queue: data.queue || [], run: data.run || {}, logs: data.logs || [], updateInfo:data.updateInfo||{status:'checking',installedVersion:INSTALLED_VERSION}, qcDelaySeconds: DELAY_OPTIONS_SECONDS.includes(data.qcDelaySeconds) ? data.qcDelaySeconds : DEFAULT_QC_DELAY_SECONDS, rideAlongPercentage: validRideAlongPercentage(data.rideAlongPercentage) ? data.rideAlongPercentage : DEFAULT_RIDE_ALONG_PERCENTAGE, hasAuth: auth.available, connectedTechId: auth.connectedTechId, tenantName: auth.tenantName };
      }
      case "CONNECT": {
        if (!/^[A-Z0-9_-]{4,32}$/.test(message.techId || "") || !((/^\d{5}$/.test(message.pin || "")) || ((message.pin || "").length >= 8 && /[A-Za-z]/.test(message.pin) && /\d/.test(message.pin)))) throw new Error("Enter the Admin ID and password.");
        const response = await fetch(`${TQA_APP_ORIGIN}/api/integrations/trust/login`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ techId: message.techId, password: message.pin }) });
        const body = await response.json().catch(() => null);
        if (!response.ok || !/^[a-f0-9]{64}$/.test(body?.sessionToken || "")) throw new Error(body?.error?.message || `TQA login returned HTTP ${response.status}.`);
        await storageReady;
        await chrome.storage.local.set({ sessionToken: body.sessionToken, connectedTechId: body.techId, tenantName: body.tenant?.name || "TQA", queue: [], run: {} });
        await chrome.storage.local.remove(["apiOrigin", "trustApiKey"]);
        await logEvent("success", "Authentication", `Connected to ${body.tenant?.name || "TQA"} as admin ${body.techId}.`);
        return { connected: true };
      }
      case "DISCONNECT": {
        if (activeRun) throw new Error("Stop the current upload before switching accounts.");
        await storageReady;
        await chrome.storage.local.remove(["apiOrigin", "sessionToken", "connectedTechId", "tenantName", "trustApiKey", "queue", "run"]);
        await logEvent("info", "Authentication", "Disconnected from the TQA account.");
        return { disconnected: true };
      }
      case "REFRESH": return { queue: await loadQueue() };
      case "SET_DELAY": {
        if (!DELAY_OPTIONS_SECONDS.includes(message.seconds)) throw new Error("Choose a wait time shown in the extension.");
        await storageReady;
        await chrome.storage.local.set({ qcDelaySeconds: message.seconds });
        await logEvent("info", "Settings", `Wait between QC uploads set to ${message.seconds} seconds.`);
        return { qcDelaySeconds: message.seconds };
      }
      case "SET_RIDE_ALONG_PERCENTAGE": {
        if (activeRun) throw new Error("Wait until the current upload run finishes before changing the Ride Along percentage.");
        if (!validRideAlongPercentage(message.percentage)) throw new Error("Choose a Ride Along percentage from 0% to 100% in 10% steps.");
        await storageReady;
        await chrome.storage.local.set({ rideAlongPercentage: message.percentage });
        await logEvent("info", "Settings", `Ride Along target set to ${message.percentage}% per technician's monthly observations. Failed QCs stay After the Fact.`);
        return { rideAlongPercentage: message.percentage };
      }
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
      case "ATTACH_EXISTING_JOB": {
        if (activeRun) throw new Error("Stop the upload before selecting an existing observation.");
        if (!/^\d+$/.test(message.jobId || "") || message.photosVerified !== true) throw new Error("Verify the existing photos and enter a numeric Catalyst job ID.");
        const qc = await detail(message.qcId);
        if (qc.workflow === "follow_up" || !["ready","failed"].includes(qc.uploadStatus)) throw new Error("This QC cannot use observation recovery.");
        const tab = await chrome.tabs.create({url:observationUrl(message.jobId),active:true});
        await navigate(tab.id,observationUrl(message.jobId));
        const state = await pageCommand(tab.id,"INSPECT_OBSERVATION",{jobNumber:qc.jobNumber,techId:qc.techId});
        const photos = orderedPhotos(qc);
        if (state.photoKeys.length !== photos.length) throw new Error("Existing photo count differs from this QC. No photos were added. Review Catalyst first.");
        await recovery(qc.id,{jobId:message.jobId,jobNumber:qc.jobNumber,techId:qc.techId,photoIds:photos.map(photo=>photo.id),photoKeys:state.photoKeys,completionStarted:false,observationType:"After the Fact"});
        await setRun({status:"stopped",stage:"ready",currentQcId:qc.id,jobId:message.jobId,jobNumber:qc.jobNumber,message:"Existing photos verified and retained. Resuming this QC now."});
        stopRequested = false;
        activeRun = runQueue(qc.id);
        return {attached:true};
      }
      case "RESUME_REVIEW": {
        const {run}=await stored();
        if (run?.status!=="needs_review" || !run.currentQcId || !(await recovery(run.currentQcId))) throw new Error("No saved progress is available to resume.");
        await setRun({status:"stopped",stage:"ready",message:"Saved progress retained. Start upload to check and resume the existing observation."});
        return {acknowledged:true};
      }
      case "ACK_REVIEW": {
        const { run } = await stored();
        if (run?.status !== "needs_review") throw new Error("There is no QC awaiting review.");
        if (run.currentQcId && await recovery(run.currentQcId)) await recovery(run.currentQcId,{photoIds:[],photoKeys:[],completionStarted:false});
        await setRun({ status: "stopped", stage: "ready", message: "Review acknowledged. Refresh the queue, then start a new run." });
        return { acknowledged: true };
      }
      case "CONFIRM_EXISTING_OBSERVATION": {
        if (activeRun) throw new Error("Stop the upload before confirming an existing observation.");
        if (!/^\d+$/.test(message.observationId || "")) throw new Error("Enter the completed Catalyst observation ID (id=). It is different from jobid=.");
        const qc = await detail(message.qcId);
        if (qc.workflow === "follow_up" || !["ready","failed"].includes(qc.uploadStatus)) throw new Error("This QC cannot use completed observation confirmation.");
        const url = completedObservationUrl(message.observationId);
        const tab = await chrome.tabs.create({url,active:true});
        await navigate(tab.id,url);
        const verified = await pageCommand(tab.id,"VERIFY_COMPLETED_OBSERVATION",{jobNumber:qc.jobNumber,techId:qc.techId,outcome:qc.outcome,photoCount:orderedPhotos(qc).length},45000);
        if (verified.observationId !== message.observationId) throw new Error("Catalyst opened a different observation. No status was changed.");
        const uploaded = await report(qc.id,"uploaded",verified.observationId);
        if (uploaded.uploadStatus !== "uploaded") throw new Error("TQA did not confirm uploaded status.");
        await recovery(qc.id,null);
        await loadQueue();
        await setRun({status:"done",stage:"uploaded",currentQcId:qc.id,jobNumber:qc.jobNumber,message:`Job ${qc.jobNumber}: existing Catalyst observation verified and TQA updated`});
        return {uploaded:true};
      }
      case "CONFIRM_REVIEWED_UPLOAD": {
        const { run } = await stored();
        if (run?.status !== "needs_review" || !run.currentQcId || !run.jobId) throw new Error("No matching Catalyst job is available to confirm.");
        const detailQc = await detail(run.currentQcId);
        let reference = run.jobId;
        if (detailQc.outcome === "fail") {
          const checkpoint = await recovery(run.currentQcId);
          if (!checkpoint?.technicianName) throw new Error("Cannot locate the completed failed observation safely. Its observation ID must be verified first.");
          const tab = await chrome.tabs.create({url:OBSERVATIONS_URL,active:true});
          await navigate(tab.id,OBSERVATIONS_URL);
          const found = await pageCommand(tab.id,"FIND_COMPLETED_OBSERVATION",{jobNumber:detailQc.jobNumber,techId:detailQc.techId,technicianName:checkpoint.technicianName},60000);
          reference = /^\d+$/.test(found?.observationId || "") ? found.observationId : await waitForObservationId(tab.id);
        }
        const qc = await report(run.currentQcId, "uploaded", reference);
        if (qc.uploadStatus !== "uploaded") throw new Error("TQA did not confirm uploaded status.");
        await recovery(run.currentQcId,null);
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
