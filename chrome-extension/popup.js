const $ = (id) => document.getElementById(id);
const DELAY_OPTIONS = [5, 15, 30, 60, 90, 120];
let state = {};

async function send(command, data = {}) {
  const response = await chrome.runtime.sendMessage({ command, ...data });
  if (!response?.ok) throw new Error(response?.error || "Extension did not respond.");
  return response.result;
}

function render() {
  const queue = state.queue || [];
  const run = state.run || {};
  const runStatus = run.status || "ready";
  $("auth-title").textContent = state.hasAuth ? (state.tenantName || "TQA admin connected") : "Connect your TQA app";
  $("auth-status").textContent = state.hasAuth
    ? `${state.tenantName || "TQA"} · Admin ${state.connectedTechId}`
    : "Use your Admin ID and password.";
  $("auth-card").classList.toggle("missing", !state.hasAuth);
  $("login-form").hidden = state.hasAuth;
  $("disconnect").hidden = !state.hasAuth;
  $("run-state").textContent = runStatus === "running" ? "Uploading" : runStatus === "needs_review" ? "Needs review" : ["failed", "error"].includes(runStatus) ? "Attention" : "Ready";
  $("run-state").className = `state-pill ${runStatus}`;
  $("total").textContent = String(queue.length);
  $("status").textContent = run.stage === "waiting" && Number.isFinite(run.waitRemainingSeconds)
    ? `Next QC begins in ${run.waitRemainingSeconds} second${run.waitRemainingSeconds === 1 ? "" : "s"}.`
    : run.message || "Ready.";
  $("counts").textContent = run.status === "running" || run.status === "needs_review"
    ? `QC ${run.index || 0} of ${run.total || 0} · Photo ${run.photoIndex || 0} of ${run.photoTotal || 0}`
    : "";
  $("progress").max = Math.max(1, run.total || queue.length);
  $("progress").value = Math.min(run.index || 0, run.total || queue.length || 1);
  $("start").disabled = !state.hasAuth || run.status === "running" || run.status === "needs_review";
  $("stop").disabled = run.status !== "running";
  $("ack-review").hidden = run.status !== "needs_review";
  $("confirm-reviewed").hidden = run.status !== "needs_review" || !run.jobId;
  const delaySeconds = DELAY_OPTIONS.includes(state.qcDelaySeconds) ? state.qcDelaySeconds : 30;
  $("qc-delay").value = String(DELAY_OPTIONS.indexOf(delaySeconds));
  $("delay-value").textContent = `${delaySeconds} seconds`;
  const rideAlongPercentage = Number.isInteger(state.rideAlongPercentage) ? state.rideAlongPercentage : 50;
  $("ride-along-percentage").value = String(rideAlongPercentage);
  $("ride-along-percentage").disabled = run.status === "running";
  $("ride-along-value").textContent = `${rideAlongPercentage}%`;
  $("queue").replaceChildren();
  if (!queue.length) {
    const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "No uploadable QCs loaded."; $("queue").append(empty);
  }
  for (const qc of queue) {
    const card = document.createElement("div"); card.className = "qc";
    const meta = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = `Job ${qc.jobNumber}`;
    const details = document.createElement("small"); details.textContent = `Tech ${qc.techId} · ${qc.photos.length} photos`;
    const badge = document.createElement("span"); badge.className = `badge ${qc.uploadStatus}`; badge.textContent = qc.uploadStatus === "failed" ? "Retry needed" : qc.uploadStatus === "uploaded" ? "Uploaded" : "Ready";
    meta.append(name, details); card.append(meta, badge); $("queue").append(card);
  }
  const logs = state.logs || [];
  $("log-count").textContent = String(logs.length);
  $("logs").replaceChildren();
  if (!logs.length) {
    const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "No activity recorded yet."; $("logs").append(empty);
  }
  for (const entry of [...logs].reverse()) {
    const item = document.createElement("article"); item.className = `log-entry ${entry.level}`;
    const meta = document.createElement("div"); meta.className = "log-meta";
    const time = document.createElement("time"); time.textContent = new Date(entry.at).toLocaleTimeString();
    const step = document.createElement("strong"); step.textContent = entry.step;
    const level = document.createElement("span"); level.textContent = entry.level.toUpperCase();
    meta.append(time, step, level);
    const message = document.createElement("pre"); message.textContent = entry.message;
    item.append(meta, message); $("logs").append(item);
  }
}

async function refreshState() {
  const result = await send("GET_STATE");
  state = result;
  render();
}

async function action(callback) {
  try { await callback(); await refreshState(); }
  catch (error) { $("status").textContent = error.message; }
}

$("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void action(async () => {
    const techId = $("admin-tech-id").value.trim().toUpperCase();
    const pin = $("admin-pin").value.trim();
    await send("CONNECT", { techId, pin });
    $("admin-pin").value = "";
    await send("REFRESH");
  });
});
$("disconnect").addEventListener("click", () => action(() => send("DISCONNECT")));

$("refresh").addEventListener("click", () => action(() => send("REFRESH")));
$("start").addEventListener("click", () => action(() => send("START")));
$("stop").addEventListener("click", () => action(() => send("STOP")));
$("ack-review").addEventListener("click", () => action(() => send("ACK_REVIEW")));
$("confirm-reviewed").addEventListener("click", () => action(() => send("CONFIRM_REVIEWED_UPLOAD")));
$("clear-log").addEventListener("click", () => action(() => send("CLEAR_LOGS")));
$("copy-log").addEventListener("click", () => action(async () => {
  const text = (state.logs || []).map((entry) => `${entry.at} [${entry.level.toUpperCase()}] ${entry.step}: ${entry.message}`).join("\n");
  await navigator.clipboard.writeText(text);
}));
$("qc-delay").addEventListener("input", () => {
  const seconds = DELAY_OPTIONS[Number($("qc-delay").value)] || 30;
  $("delay-value").textContent = `${seconds} seconds`;
});
$("qc-delay").addEventListener("change", () => action(() => {
  const seconds = DELAY_OPTIONS[Number($("qc-delay").value)] || 30;
  return send("SET_DELAY", { seconds });
}));
$("ride-along-percentage").addEventListener("input", () => {
  $("ride-along-value").textContent = `${$("ride-along-percentage").value}%`;
});
$("ride-along-percentage").addEventListener("change", () => action(() => {
  const percentage = Number($("ride-along-percentage").value);
  return send("SET_RIDE_ALONG_PERCENTAGE", { percentage });
}));
chrome.storage.onChanged.addListener(() => { void refreshState(); });
void (async () => {
  try {
    await refreshState();
    if (state.hasAuth) { await send("REFRESH"); await refreshState(); }
  } catch (error) { $("status").textContent = error.message; }
})();
