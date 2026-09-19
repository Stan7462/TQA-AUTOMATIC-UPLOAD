"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ChevronRight, FileSpreadsheet, Inbox, Search, Upload, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AdminShell from "@/app/admin-shell";

type Status = "Needs review" | "Reviewed" | "Ignored";
type Item = { id: number; date: string; sender: string; name: string; phone: string; confidence: string; status: Status };
type QcItem = { id: string; techId: string; jobNumber: string; screenshotId: string; photoIds: string[]; status: "pending" | "approved" | "rejected"; trustUploadStatus: "ready" | "failed" | "uploaded"; submittedAt: number; reviewedAt: number | null; reviewNote: string | null };
type QcCounts = { pending: number; approved: number; uploaded: number; rejected: number };
type QcFilter = QcItem["status"] | "uploaded" | null;
type WebContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown }, options: { signal: AbortSignal }) => void | Promise<void> };
const aliases: Record<string, string[]> = {
  date: ["date", "timestamp", "received at", "received_at"],
  sender: ["sender", "from", "username", "telegram sender"],
  name: ["name", "full name", "customer name"],
  phone: ["phone", "phone number", "telephone", "mobile"],
  confidence: ["confidence", "score", "confidence score"],
  status: ["review status", "review_status", "status"],
};

function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = ""; if (row.some(Boolean)) rows.push(row); row = [];
    } else cell += ch;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error("The CSV has an unclosed quote.");
  return rows;
}
function normalizeStatus(value: string): Status {
  const status = value.toLowerCase().trim();
  if (["reviewed", "approved", "complete", "done"].includes(status)) return "Reviewed";
  if (["ignored", "rejected", "skip"].includes(status)) return "Ignored";
  return "Needs review";
}
function toItems(data: Record<string, unknown>[]): Item[] {
  return data.map((raw, id) => {
    const values = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.toLowerCase().trim(), String(value ?? "").trim()]));
    const get = (field: string) => aliases[field].map((key) => values[key]).find((value) => value !== undefined) ?? "";
    return { id, date: get("date"), sender: get("sender"), name: get("name"), phone: get("phone"), confidence: get("confidence"), status: normalizeStatus(get("status")) };
  }).filter((item) => item.name || item.phone);
}
function csvCell(value: string) { return '"' + value.replaceAll('"', '""') + '"'; }
function statusClass(status: Status) { return "status status-" + status.toLowerCase().replaceAll(" ", "-"); }
function qcStatus(status: QcItem["status"]): Status { return status === "approved" ? "Reviewed" : status === "rejected" ? "Ignored" : "Needs review"; }
function qcStatusLabel(status: QcItem["status"]) { return status === "pending" ? "Needs approval" : status === "approved" ? "Approved" : "Rejected"; }

export default function Home() {
  const [rows, setRows] = useState<Item[]>([]);
  const [qcRows, setQcRows] = useState<QcItem[]>([]);
  const [qcCounts, setQcCounts] = useState<QcCounts>({ pending: 0, approved: 0, uploaded: 0, rejected: 0 });
  const [qcLoading, setQcLoading] = useState(true);
  const [qcError, setQcError] = useState("");
  const [filename, setFilename] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QcFilter>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => {
    const search = query.toLowerCase();
    return [
      ...[...qcRows].sort((a, b) => b.submittedAt - a.submittedAt || b.id.localeCompare(a.id)).filter((item) => (filter === null || (filter === "uploaded" ? item.status === "approved" && item.trustUploadStatus === "uploaded" : item.status === filter)) && [item.techId, item.jobNumber, item.id, "QC submission"].join(" ").toLowerCase().includes(search)).map((item) => ({ kind: "qc" as const, item })),
      ...(filter === null ? rows.filter((item) => [item.name, item.phone, item.sender].join(" ").toLowerCase().includes(search)).map((item) => ({ kind: "import" as const, item })) : []),
    ];
  }, [rows, qcRows, filter, query]);
  const pending = qcCounts.pending;
  const reviewed = qcCounts.approved;
  const uploaded = qcCounts.uploaded;
  const rejected = qcCounts.rejected;
  const total = qcCounts.pending + qcCounts.approved + qcCounts.rejected;
  const queueTitle = filter === "pending" ? "Needs review" : filter === "approved" ? "Approved / reviewed" : filter === "uploaded" ? "Uploaded to Catalyst" : filter === "rejected" ? "Rejected" : "All records";

  useEffect(() => {
    const controller = new AbortController();
    async function loadQcs() {
      try {
        let cursor: string | null = null;
        const found: QcItem[] = [];
        do {
          const url: string = "/api/qc-submissions?status=all&pageSize=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
          const response = await fetch(url, { cache: "no-store", signal: controller.signal });
          const result = await response.json() as { error?: string; submissions?: QcItem[]; nextCursor?: string | null; counts?: QcCounts };
          if (!response.ok) throw new Error(result.error || "Could not load QC records");
          found.push(...(result.submissions ?? []));
          if (!controller.signal.aborted) {
            setQcRows([...found]);
            if (result.counts) setQcCounts(result.counts);
          }
          cursor = result.nextCursor ?? null;
        } while (cursor && !controller.signal.aborted);
      } catch (cause) {
        if (!controller.signal.aborted) setQcError(cause instanceof Error ? cause.message : "Could not load QC records");
      } finally { if (!controller.signal.aborted) setQcLoading(false); }
    }
    void loadQcs();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<WebContext["registerTool"]>[0]) => {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Unsupported browser. */ }
    };
    register({
      name: "list_extracted_records", title: "List extracted records",
      description: "Read the records currently imported into the review workspace.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({ records: rows }),
    });
    register({
      name: "import_extracted_records", title: "Import extracted records",
      description: "Import a batch of Telegram image extraction results for review. Replaces the current queue.",
      inputSchema: { type: "object", properties: { records: { type: "array", items: { type: "object", properties: { date: { type: "string" }, sender: { type: "string" }, name: { type: "string" }, phone: { type: "string" }, confidence: { type: "string" }, status: { type: "string" } }, additionalProperties: false } } }, required: ["records"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => {
        const records = (input as { records?: unknown }).records;
        if (!Array.isArray(records) || !records.every((item) => item && typeof item === "object" && !Array.isArray(item))) throw new Error("records must be a list of objects");
        const imported = toItems(records);
        if (!imported.length) throw new Error("No names or phone numbers were found");
        setRows(imported); setFilename("Agent import"); setFilter(null); setQuery(""); setError("");
        return { imported: imported.length };
      },
    });
    register({
      name: "review_extracted_record", title: "Review extracted record",
      description: "Correct a name or phone number and set the review status of an imported record.",
      inputSchema: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, phone: { type: "string" }, status: { type: "string", enum: ["Needs review", "Reviewed", "Ignored"] } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => {
        const change = input as { id: number; name?: string; phone?: string; status?: Status };
        if (!Number.isInteger(change.id) || !rows.some((item) => item.id === change.id)) throw new Error("Record not found");
        if (change.status && !["Needs review", "Reviewed", "Ignored"].includes(change.status)) throw new Error("Invalid status");
        setRows((current) => current.map((item) => item.id === change.id ? { ...item, ...(change.name === undefined ? {} : { name: change.name }), ...(change.phone === undefined ? {} : { phone: change.phone }), ...(change.status === undefined ? {} : { status: change.status }) } : item));
        return { updated: change.id };
      },
    });
    return () => lifecycle.abort();
  }, [rows]);

  async function importFile(file?: File) {
    if (!file) return;
    setError("");
    try {
      const text = await file.text(); let data: Record<string, unknown>[];
      if (file.name.toLowerCase().endsWith(".json")) {
        const json = JSON.parse(text); if (!Array.isArray(json)) throw new Error("The JSON file must contain a list of records.");
        data = json;
      } else if (file.name.toLowerCase().endsWith(".csv")) {
        const [head, ...body] = csvRows(text); if (!head || !body.length) throw new Error("The CSV file has no data rows.");
        data = body.map((line) => Object.fromEntries(head.map((key, index) => [key, line[index] ?? ""])));
      } else throw new Error("Choose a CSV or JSON file. Export an Excel workbook as CSV first.");
      const imported = toItems(data);
      if (!imported.length) throw new Error("No names or phone numbers were found. Check the column headings.");
      setRows(imported); setFilename(file.name); setFilter(null); setQuery("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The file could not be read."); }
    if (input.current) input.current.value = "";
  }
  function update(id: number, changes: Partial<Item>) {
    setRows((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  }
  function exportFile() {
    const lines = [["Date", "Sender", "Name", "Phone", "Confidence", "Review Status"],
      ...rows.map((item) => [item.date, item.sender, item.name, item.phone, item.confidence, item.status])];
    const blob = new Blob(["\uFEFF", lines.map((line) => line.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = (filename.replace(/\.(csv|json)$/i, "") || "tqa-results") + "-reviewed.csv";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <AdminShell active="records">
      <section className="intro">
        <div><small className="kicker">REVIEW WORKSPACE</small><h1>All records</h1><p>Technician QCs and imported extraction results in one place.</p></div>
        <div className="all-data-tools"><div className="all-data-buttons"><button className="button light" onClick={() => input.current?.click()}><Upload size={18} /> Import results</button><button className="button dark" disabled={!rows.length} onClick={exportFile}><ArrowDownToLine size={18} /> Export imported CSV</button><input className="hidden" ref={input} type="file" accept=".csv,.json" aria-label="Import CSV or JSON results" onChange={(event) => importFile(event.target.files?.[0])} /></div><div className="source"><span className="source-icon"><FileSpreadsheet size={22} /></span><span><small>Current file</small><strong>{filename || "No file imported"}</strong></span></div></div>
      </section>
      <section className="metrics status-metrics" aria-label="Filter QC records by status">
        <button type="button" className={`metric metric-link status-metric${filter === "pending" ? " active" : ""}`} onClick={() => setFilter((current) => current === "pending" ? null : "pending")} aria-pressed={filter === "pending"} aria-controls="qc-record-queue"><span>Needs review</span><strong>{pending}</strong><small>Awaiting a decision <ChevronRight size={15}/></small></button>
        <button type="button" className={`metric metric-link status-metric${filter === null ? " active" : ""}`} onClick={() => setFilter(null)} aria-pressed={filter === null} aria-controls="qc-record-queue"><span>All records</span><strong>{total}</strong><small>All technician QCs <ChevronRight size={15}/></small></button>
        <button type="button" className={`metric metric-link status-metric${filter === "approved" ? " active" : ""}`} onClick={() => setFilter((current) => current === "approved" ? null : "approved")} aria-pressed={filter === "approved"} aria-controls="qc-record-queue"><span>Approved / reviewed</span><strong>{reviewed}</strong><small>Approved QCs <ChevronRight size={15}/></small></button>
        <button type="button" className={`metric metric-link status-metric${filter === "uploaded" ? " active" : ""}`} onClick={() => setFilter((current) => current === "uploaded" ? null : "uploaded")} aria-pressed={filter === "uploaded"} aria-controls="qc-record-queue"><span>Uploaded to Catalyst</span><strong>{uploaded}</strong><small>Uploaded QCs <ChevronRight size={15}/></small></button>
        <button type="button" className={`metric metric-link status-metric${filter === "rejected" ? " active" : ""}`} onClick={() => setFilter((current) => current === "rejected" ? null : "rejected")} aria-pressed={filter === "rejected"} aria-controls="qc-record-queue"><span>Rejected</span><strong>{rejected}</strong><small>Rejected QCs <ChevronRight size={15}/></small></button>
      </section>
      <section className="content single-panel" id="qc-record-queue">
        <div className="list-panel">
          <div className="panel-heading"><div><small className="kicker">QUEUE</small><h2>{queueTitle}</h2></div><span>{visible.length} shown</span></div>
          <div className="toolbar">
            <label className="search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Tech ID, job number, name, or phone" aria-label="Search records" /></label>
          </div>
          {error && <div className="error" role="alert"><X size={18}/>{error}</div>}
          {qcError && <div className="error" role="alert"><X size={18}/>QC records could not load: {qcError}</div>}
          {qcLoading && !qcRows.length && !rows.length ? <div className="no-results">Loading QC records…</div> : filter === null && !rows.length && !qcRows.length ? <div className="empty" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); importFile(event.dataTransfer.files[0]); }}>
            <div className="empty-icon"><Inbox size={30}/></div><h3>Bring in your extraction results</h3><p>Import a CSV or JSON file with name and phone columns. You can export an Excel workbook as CSV first.</p><button className="button dark" onClick={() => input.current?.click()}><Upload size={18}/> Choose a file</button><small>Or drop it here</small>
          </div> : !visible.length ? <div className="no-results">No QCs match this status or search.</div> : <div className="table-wrap"><Table><TableHeader><TableRow><TableHead>RECORD</TableHead><TableHead>TECH / SENDER</TableHead><TableHead>DATE</TableHead><TableHead>CONFIDENCE</TableHead><TableHead>STATUS</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{visible.map((entry) => entry.kind === "qc" ? <TableRow key={`qc-${entry.item.id}`}><TableCell><strong>Job {entry.item.jobNumber || "—"}</strong><small>Screenshot + {entry.item.photoIds.length} live photos</small></TableCell><TableCell>Tech ID {entry.item.techId}</TableCell><TableCell>{new Date(entry.item.submittedAt).toLocaleString()}</TableCell><TableCell>—</TableCell><TableCell><span className={statusClass(qcStatus(entry.item.status))}>{qcStatusLabel(entry.item.status)}</span>{entry.item.status === "approved" && entry.item.trustUploadStatus === "uploaded" && <span className="qc-trust-status uploaded">Catalyst: Uploaded</span>}</TableCell><TableCell><a className="open-row" aria-label={`View photos for job ${entry.item.jobNumber || "unknown"}`} href={`/records/all?search=${encodeURIComponent(`${entry.item.techId} ${entry.item.jobNumber}`)}`}><ChevronRight size={18}/></a></TableCell></TableRow> : <TableRow key={`import-${entry.item.id}`}><TableCell><input className="import-record-input" aria-label={`Name for imported record ${entry.item.id + 1}`} value={entry.item.name} placeholder="Name" onChange={(event) => update(entry.item.id, { name: event.target.value })}/><input className="import-record-input" aria-label={`Phone for imported record ${entry.item.id + 1}`} value={entry.item.phone} placeholder="Phone" onChange={(event) => update(entry.item.id, { phone: event.target.value })}/></TableCell><TableCell>{entry.item.sender || "—"}</TableCell><TableCell>{entry.item.date || "—"}</TableCell><TableCell>{entry.item.confidence || "—"}</TableCell><TableCell><select className="import-record-status" aria-label={`Status for imported record ${entry.item.id + 1}`} value={entry.item.status} onChange={(event) => update(entry.item.id, { status: event.target.value as Status })}><option>Needs review</option><option>Reviewed</option><option>Ignored</option></select></TableCell><TableCell></TableCell></TableRow>)}</TableBody></Table></div>}
        </div>
      </section>
  </AdminShell>;
}
