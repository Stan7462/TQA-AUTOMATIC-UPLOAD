(() => {
  if (window.__tqaCatalystContentLoaded) return;
  window.__tqaCatalystContentLoaded = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element) => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  const buttons = () => [...document.querySelectorAll("button")].filter(visible);
  const button = (name) => buttons().find((item) => clean(item.textContent) === name);
  function pageLog(level, step, message) {
    void chrome.runtime.sendMessage({ command: "PAGE_LOG", level, step, message }).catch(() => {});
  }
  pageLog("info", "loaded", `Content script ready at ${location.href}`);

  async function waitFor(predicate, description, ms = 25000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const result = predicate();
      if (result) return result;
      await sleep(200);
    }
    throw new Error(`Timed out waiting for ${description}.`);
  }

  function nativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function rowData(row) {
    const cells = [...row.querySelectorAll(".ag-cell, [role='gridcell']")];
    const byColumn = (names, fallback) => {
      const found = cells.find((cell) => names.some((name) => clean(cell.getAttribute("col-id")).toLowerCase().includes(name)));
      return clean((found || cells[fallback])?.textContent);
    };
    return {
      jobId: byColumn(["jobid", "job_id"], 0).replace(/\D/g, ""),
      jobNumber: byColumn(["jobno", "jobnumber", "job_no"], 1),
      techId: byColumn(["techid", "tech_id"], 4)
    };
  }

  function gridRows() {
    return [...document.querySelectorAll(".ag-center-cols-container .ag-row, .ag-body-viewport .ag-row")]
      .filter(visible).map(rowData).filter((row) => row.jobId);
  }

  async function findJob(jobNumber) {
    if (!location.pathname.endsWith("/jobs")) throw new Error("Open the Catalyst Jobs Pool first.");
    const radios = await waitFor(() => {
      const options = [...document.querySelectorAll("input[type='radio']")];
      return options.length >= 3 ? options : null;
    }, "Catalyst search mode options");
    pageLog("info", "job search", `Found ${radios.length} search mode radios; selecting Account/Job Search.`);
    if (!radios[1].checked) radios[1].click();
    const input = await waitFor(() => document.querySelector("#job-no") || [...document.querySelectorAll("input")].find((el) => /account\/job/i.test(el.placeholder || "")), "Account/Job No field");
    nativeValue(input, String(jobNumber));
    pageLog("info", "job search", `Entered job number ${jobNumber}; field now reads ${input.value}.`);
    const search = buttons().find((item) => /\bSearch\b/i.test(clean(item.textContent)));
    if (!search) throw new Error("Catalyst Search button was not found.");
    search.click();
    pageLog("info", "job search", "Clicked Search; waiting for grid results.");
    const searchStarted = Date.now();
    const rows = await waitFor(() => {
      const text = document.body.innerText;
      const count = /Rows:\s*(\d+)\s+of\s+(\d+)/i.exec(text);
      if (!count) return null;
      const list = gridRows();
      if (Number(count[2]) === 0 && Date.now() - searchStarted > 700) return { list, total: 0 };
      if (list.some((row) => row.jobNumber === String(jobNumber))) return { list, total: Number(count[2]) };
      return null;
    }, "Catalyst job search results", 30000);
    pageLog("info", "job search", `Grid reported ${rows.total} rows; ${rows.list.length} rows were readable.`);
    if (rows.total > rows.list.length) throw new Error("Catalyst virtualized some search rows; the exact match cannot be verified safely.");
    return { rows: rows.list, total: rows.total };
  }

  function detailValue(label) {
    const leaf = [...document.querySelectorAll(".page-content div")]
      .find((element) => element.children.length === 0 && clean(element.textContent) === label);
    if (leaf?.nextElementSibling) return clean(leaf.nextElementSibling.textContent);
    const lines = document.body.innerText.split("\n").map(clean);
    const index = lines.indexOf(label);
    return index >= 0 ? lines[index + 1] || "" : "";
  }

  async function selectCombo(index, option) {
    const combo = [...document.querySelectorAll("[role='combobox']")].filter(visible)[index];
    const control = combo?.closest(".react-select__control");
    if (!combo || !control) throw new Error(`Catalyst dropdown ${index + 1} was not found.`);
    combo.focus();
    if (combo.getAttribute("aria-expanded") !== "true") {
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, view: window }));
    }
    try {
      await waitFor(() => combo.getAttribute("aria-expanded") === "true", `dropdown ${index + 1} to open`, 3000);
    } catch {
      combo.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true }));
      await waitFor(() => combo.getAttribute("aria-expanded") === "true", `dropdown ${index + 1} to open by keyboard`, 3000);
    }
    const listboxId = combo.getAttribute("aria-controls");
    const listbox = await waitFor(() => document.getElementById(listboxId) || document.querySelector("[role='listbox']"),
      `dropdown ${index + 1} options`, 5000);
    const choices = [...listbox.querySelectorAll("[role='option']")];
    const item = choices.find((node) => clean(node.textContent).toLowerCase() === option.toLowerCase());
    if (!item) throw new Error(`Catalyst dropdown ${index + 1} has no ${option} option. Available: ${choices.map((node) => clean(node.textContent)).join(", ") || "none"}.`);
    pageLog("info", "dropdown", `Selecting ${option} from dropdown ${index + 1}.`);
    item.click();
    await waitFor(() => clean(document.getElementById(combo.id)?.closest(".react-select__control")?.querySelector(".react-select__single-value")?.textContent).toLowerCase() === option.toLowerCase(),
      `${option} selection to appear in dropdown ${index + 1}`, 5000);
  }

  async function prepare(jobNumber, techId) {
    if (!location.pathname.includes("/observation/")) throw new Error("Catalyst observation page is not open.");
    const expectedJob = String(jobNumber).trim();
    const expectedTech = String(techId).trim();
    try {
      await waitFor(() => detailValue("Job Number") === expectedJob && detailValue("Tech Number") === expectedTech,
        "matching observation job number and Tech ID", 15000);
    } catch {
      throw new Error(`Catalyst observation identifiers did not match. Expected job ${expectedJob}, Tech ID ${expectedTech}; observed job ${detailValue("Job Number") || "(not loaded)"}, Tech ID ${detailValue("Tech Number") || "(not loaded)"}.`);
    }
    pageLog("success", "observation match", `Verified job ${expectedJob} and Tech ID ${expectedTech} on the observation page.`);
    await waitFor(() => [...document.querySelectorAll("[role='combobox']")].filter(visible).length >= 2,
      "Observation type and Customer Contact fields");
    await selectCombo(0, "After the Fact");
    await selectCombo(1, "No");
    return { prepared: true };
  }

  function decodeImage(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function uploadPhoto(base64, fileName) {
    const input = document.querySelector("input[type='file']#formFile") || document.querySelector("input[type='file']");
    if (!input) throw new Error("Catalyst Upload Image File control was not found.");
    const file = new File([decodeImage(base64)], fileName, { type: "image/jpeg" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const upload = await waitFor(() => button("Upload")?.disabled === false && button("Upload"), "enabled Upload button");
    const before = document.body.innerText;
    const beforeImages = document.querySelectorAll("img").length;
    upload.click();
    await waitFor(() => {
      const text = document.body.innerText;
      if (/upload (failed|error)|failed to upload|invalid image/i.test(text) && text !== before) throw new Error("Catalyst rejected the image upload.");
      const newPhoto = document.querySelectorAll("img").length > beforeImages || (text !== before && text.includes(fileName));
      const successToast = /image (uploaded|saved)|upload (successful|complete)/i.test(text) && text !== before;
      const resetAfterUpload = input.files.length === 0 && button("Upload")?.disabled === true && text !== before;
      return newPhoto || successToast || resetAfterUpload;
    }, `Catalyst confirmation for ${fileName}`, 45000);
    return { uploaded: fileName };
  }

  async function setChecks() {
    const rows = [...document.querySelectorAll("tr, [role='row']")].filter(visible);
    const qcRows = rows.filter((row) => /^TQA\d+$/m.test(clean(row.querySelector("td, [role='cell']")?.textContent)));
    if (qcRows.length < 7) throw new Error(`Only ${qcRows.length} TQA checks were found; expected at least 7.`);
    for (const row of qcRows) {
      const radios = [...row.querySelectorAll("input[type='radio']")];
      if (radios.length < 2) throw new Error("A TQA row is missing Displayed and Not Displayed options.");
      if (!radios[0].checked) radios[0].click();
      if (!radios[0].checked) throw new Error("A TQA Displayed option did not stay selected.");
    }
    return { displayed: qcRows.length };
  }

  async function complete() {
    const completeButton = button("Complete");
    if (!completeButton || completeButton.disabled) throw new Error("Catalyst Complete button is unavailable.");
    completeButton.click();
    const modal = await waitFor(() => [...document.querySelectorAll("[role='dialog'], .modal")]
      .find((node) => visible(node) && /Complete Confirmation/i.test(node.textContent)), "Complete Confirmation dialog");
    const ok = [...modal.querySelectorAll("button")].find((node) => clean(node.textContent) === "OK");
    if (!ok) throw new Error("Complete Confirmation OK button was not found.");
    ok.click();
    return { clicked: true };
  }

  let lastSuccess = "";
  function reportSuccessToast() {
    const candidates = document.querySelectorAll("[role='alert'], .Toastify__toast, [class*='toast'], [class*='Toast']");
    for (const node of candidates) {
      if (!visible(node)) continue;
      const text = clean(node.textContent);
      if (!/Observation Saved/i.test(text) || text === lastSuccess) continue;
      lastSuccess = text;
      chrome.runtime.sendMessage({ command: "OBSERVATION_SAVED", text: "Observation Saved" }).catch(() => {});
      break;
    }
  }
  new MutationObserver(reportSuccessToast).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  reportSuccessToast();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      switch (message.command) {
        case "PING": return { url: location.href };
        case "FIND_JOB": return findJob(message.jobNumber);
        case "PREPARE": return prepare(message.jobNumber, message.techId);
        case "UPLOAD_PHOTO": return uploadPhoto(message.base64, message.fileName);
        case "SET_CHECKS": return setChecks();
        case "COMPLETE": return complete();
        default: throw new Error("Unknown Catalyst command.");
      }
    })().then((result) => {
      if (message.command !== "PING") pageLog("success", message.command, "Page command completed.");
      sendResponse({ ok: true, result });
    }, (error) => {
      pageLog("error", message.command, error.message);
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  });
})();
