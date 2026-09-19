const $ = (id) => document.getElementById(id);
let state = {};

async function send(command, data = {}) {
  const response = await chrome.runtime.sendMessage({ command, ...data });
  if (!response?.ok) throw new Error(response?.error || "Extension did not respond.");
  return response.result;
}

function render() {
  const queue = state.queue || [];
  const run = state.run || {};
  $("key-status").textContent = state.hasKey ? "Key saved in this Chrome profile" : "No key saved";
  $("total").textContent = String(queue.length);
  $("status").textContent = run.message || "Ready.";
  $("counts").textContent = run.status === "running" || run.status === "needs_review"
    ? `QC ${run.index || 0} of ${run.total || 0} · Photo ${run.photoIndex || 0} of ${run.photoTotal || 0}`
    : "";
  $("progress").max = Math.max(1, run.total || queue.length);
  $("progress").value = Math.min(run.index || 0, run.total || queue.length || 1);
  $("start").disabled = !state.hasKey || run.status === "running" || run.status === "needs_review";
  $("stop").disabled = run.status !== "running";
  $("ack-review").hidden = run.status !== "needs_review";
  $("confirm-reviewed").hidden = run.status !== "needs_review" || !run.jobId;
  $("queue").replaceChildren();
  if (!queue.length) {
    const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "No uploadable QCs loaded."; $("queue").append(empty);
  }
  for (const qc of queue) {
    const card = document.createElement("div"); card.className = "qc";
    const meta = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = `Job ${qc.jobNumber}`;
    const details = document.createElement("small"); details.textContent = `Tech ${qc.techId} · ${qc.photos.length} photos`;
    const badge = document.createElement("span"); badge.className = `badge ${qc.uploadStatus}`; badge.textContent = qc.uploadStatus;
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
  state = { ...result, hasKey: result.hasKey };
  render();
}

async function action(callback) {
  try { await callback(); await refreshState(); }
  catch (error) { $("status").textContent = error.message; }
}

$("save-key").addEventListener("click", () => action(async () => {
  await send("SAVE_KEY", { key: $("key").value.trim() });
  $("key").value = "";
  await send("REFRESH");
}));
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
chrome.storage.onChanged.addListener(() => { void refreshState(); });
void (async () => {
  try {
    await refreshState();
    if (state.hasKey) { await send("REFRESH"); await refreshState(); }
  } catch (error) { $("status").textContent = error.message; }
})();
