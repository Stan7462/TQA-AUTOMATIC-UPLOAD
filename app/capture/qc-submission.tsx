"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronRight, FileText, FileWarning, ImagePlus, LogOut, RotateCcw, Send, Trash2, X } from "lucide-react";
import { sixDigitJobNumber } from "@/lib/job-number-ocr";
import { fiscalDeadline, fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";
import { deleteQcDraft, readQcDraft, writeQcDraft, type QcDraft } from "@/lib/qc-draft";

const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024;
const MAX_PHOTOS = 7;
const MONTHLY_QC_GOAL = 5;
const MAX_CAMERA_ZOOM = 5;
type QcCounts = { captured: number; uploaded: number; rejected: number };

function drawCaptureTimestamp(context: CanvasRenderingContext2D, width: number, height: number, takenAt: Date) {
  const date = `${takenAt.getFullYear()}-${String(takenAt.getMonth() + 1).padStart(2, "0")}-${String(takenAt.getDate()).padStart(2, "0")}`;
  const minutesFromUtc = -takenAt.getTimezoneOffset();
  const offset = `UTC${minutesFromUtc < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutesFromUtc) / 60)).padStart(2, "0")}:${String(Math.abs(minutesFromUtc) % 60).padStart(2, "0")}`;
  const time = `${String(takenAt.getHours()).padStart(2, "0")}:${String(takenAt.getMinutes()).padStart(2, "0")}:${String(takenAt.getSeconds()).padStart(2, "0")} ${offset}`;
  const fontSize = Math.min(40, Math.max(20, Math.round(width * 0.035)));
  const padding = Math.round(fontSize * 0.45);
  const lineHeight = Math.round(fontSize * 1.25);
  const margin = Math.max(8, Math.round(width * 0.018));
  context.font = `700 ${fontSize}px system-ui, sans-serif`;
  const boxWidth = Math.min(width - margin * 2, Math.ceil(Math.max(context.measureText(date).width, context.measureText(time).width) + padding * 2));
  const boxHeight = lineHeight * 2 + padding * 2;
  const top = height - margin - boxHeight;
  context.fillStyle = "rgba(8, 25, 38, 0.82)";
  context.fillRect(margin, top, boxWidth, boxHeight);
  context.fillStyle = "#fff";
  context.textBaseline = "top";
  context.fillText(date, margin + padding, top + padding, boxWidth - padding * 2);
  context.fillText(time, margin + padding, top + padding + lineHeight, boxWidth - padding * 2);
}

async function compactJpeg(source: HTMLCanvasElement, maxDimension = 1600): Promise<Blob> {
  const longest = Math.max(source.width, source.height);
  let dimension = Math.min(longest, maxDimension);
  while (dimension >= 240 || dimension === longest) {
    const scale = Math.min(1, dimension / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.68, 0.55, 0.42, 0.3]) {
      const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (jpeg && jpeg.size >= 500 && jpeg.size <= MAX_IMAGE_BYTES) return jpeg;
    }
    dimension = Math.floor(dimension * 0.78);
  }
  throw new Error("This image could not be reduced to 30 KB. Try another image.");
}

async function savedImageAsJpeg(blob: Blob): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  let temporaryUrl: string | null = null;
  try { source = await createImageBitmap(blob); }
  catch {
    temporaryUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.src = temporaryUrl;
    try { await image.decode(); }
    catch { URL.revokeObjectURL(temporaryUrl); throw new Error("A saved picture could not be opened. Retake it and try again."); }
    source = image;
  }
  const bitmap = typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
  try {
    const width = bitmap ? (source as ImageBitmap).width : (source as HTMLImageElement).naturalWidth;
    const height = bitmap ? (source as ImageBitmap).height : (source as HTMLImageElement).naturalHeight;
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
    return await compactJpeg(canvas);
  } finally {
    if (bitmap) (source as ImageBitmap).close();
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
  }
}

function ImagePreview({ blob, alt, interactive = true }: { blob: Blob; alt: string; interactive?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  if (!url) return null;
  return interactive ? <button type="button" className="image-preview-trigger" aria-label={`Enlarge ${alt}`}><img src={url} alt=""/></button> : <img src={url} alt={alt}/>;
}

async function screenshotAsJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size > MAX_SCREENSHOT_BYTES) {
    throw new Error("Choose an account screenshot image smaller than 15 MB.");
  }
  let source: ImageBitmap | HTMLImageElement;
  let temporaryUrl: string | null = null;
  try {
    source = await createImageBitmap(file);
  } catch {
    temporaryUrl = URL.createObjectURL(file);
    const image = new Image();
    image.src = temporaryUrl;
    try { await image.decode(); } catch {
      URL.revokeObjectURL(temporaryUrl);
      throw new Error("This screenshot could not be opened. Choose a JPG or PNG image.");
    }
    source = image;
  }
  const bitmap = typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
  const width = bitmap ? (source as ImageBitmap).width : (source as HTMLImageElement).naturalWidth;
  const height = bitmap ? (source as ImageBitmap).height : (source as HTMLImageElement).naturalHeight;
  if (!width || !height) throw new Error("This screenshot could not be opened.");
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (bitmap) (source as ImageBitmap).close();
  if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
  return compactJpeg(canvas);
}

async function recognizeJobNumber(file: File, onProgress: (progress: number) => void): Promise<string | null> {
  let worker: import("tesseract.js").Worker | undefined;
  let ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scan = async () => {
    const { createWorker } = await import("tesseract.js");
    if (ended) return null;
    worker = await createWorker("eng", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr",
      langPath: "/ocr",
      // The caller handles recognition failures and preserves manual entry.
      errorHandler: () => {},
      logger: (message) => {
        if (!ended && message.status === "recognizing text") onProgress(Math.max(1, Math.min(99, Math.round(message.progress * 100))));
      },
    });
    if (ended) { await worker.terminate(); return null; }
    const result = await worker.recognize(file);
    return sixDigitJobNumber(result.data.text, result.data.confidence);
  };
  try {
    return await Promise.race([
      scan(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Job-number scan timed out.")), 30_000); }),
    ]);
  } finally {
    ended = true;
    clearTimeout(timer);
    if (worker) await worker.terminate();
  }
}

class UploadFailure extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); }
}

async function imageBase64(image: Blob): Promise<string> {
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}

async function sendQcStep(body: Record<string, string | number>): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("/api/qc-upload", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new UploadFailure(result?.error || "Could not save this picture.", response.status >= 500);
      return;
    } catch (cause) {
      const failure = cause instanceof UploadFailure ? cause : new UploadFailure(controller.signal.aborted ? "The upload timed out." : "The connection dropped during upload.", true);
      if (!failure.retryable || attempt === 2) throw failure;
      await new Promise((resolve) => window.setTimeout(resolve, 1200 * (attempt + 1)));
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

function QcRequirements() {
  return <details className="qc-requirements">
    <summary><FileText size={20}/><span>QC Requirements and rules.</span><ChevronRight className="qc-requirements-chevron" size={19}/></summary>
    <div className="qc-requirements-content">
      <h2>📸 QC PHOTO REQUIREMENTS</h2>
      <p><strong>Each technician must submit 5 QCs per month.</strong></p>
      <section>
        <h3>🏠 SINGLE DWELLING UNIT — 5 PHOTOS REQUIRED</h3>
        <ol>
          <li><strong>TAP 🤳</strong><ul><li>New connector</li><li>Drop tag</li><li>All TAP ports used or terminated</li><li>No splitters</li></ul></li>
          <li><strong>GROUND BLOCK 🤳</strong><ul><li>Connected to house box</li><li>New connectors</li><li>Green ground wire</li><li>Green ground tag</li></ul></li>
          <li><strong>GROUND CLAMP / STRAP 🤳</strong><ul><li>Connected to electrical meter</li><li>Green ground tag</li></ul></li>
          <li><strong>JOB SCREENSHOT 🤳</strong><ul><li>Job address visible</li><li>Signal passing while closing the job</li></ul></li>
          <li><strong>HOUSE 🤳</strong><ul><li>Full house photo</li><li>House number clearly visible</li></ul></li>
        </ol>
      </section>
      <section>
        <h3>🏢 APARTMENTS — 3 PHOTOS REQUIRED</h3>
        <ol>
          <li><strong>TAP 🤳</strong><ul><li>New connector</li><li>Drop tag</li><li>All TAP ports used or terminated</li><li>No splitters</li></ul></li>
          <li><strong>JOB SCREENSHOT 🤳</strong><ul><li>Job address visible</li><li>Signal passing while closing the job</li></ul></li>
          <li><strong>APARTMENT DOOR 🤳</strong><ul><li>Apartment door visible</li><li>Apartment number clearly visible</li></ul></li>
        </ol>
      </section>
      <p className="qc-requirements-warning">⚠️ QC WILL NOT BE ACCEPTED IF ANY REQUIRED PHOTO OR ITEM IS MISSING.</p>
    </div>
  </details>;
}

export default function QcSubmission({ signedInTechId }: { signedInTechId: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const pinchCooldownUntil = useRef(0);
  const techId = signedInTechId;
  const draftRef = useRef<QcDraft | null>(null);
  if (!draftRef.current) draftRef.current = { techId, submissionId: crypto.randomUUID(), jobNumber: "", screenshot: null, photos: [], updatedAt: Date.now() };
  const draftWrites = useRef<Promise<void>>(Promise.resolve());
  const draftTimer = useRef<number | null>(null);
  const draftRevision = useRef(0);
  const screenshotProcessing = useRef(false);
  const clearingDraft = useRef(false);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const resetCancel = useRef<HTMLButtonElement>(null);
  const [resetConfirmation, setResetConfirmation] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [submissionId, setSubmissionId] = useState(draftRef.current.submissionId);
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [taking, setTaking] = useState(false);
  const [processingScreenshot, setProcessingScreenshot] = useState(false);
  const [screenshotReading, setScreenshotReading] = useState(0);
  const [screenshotReadingMessage, setScreenshotReadingMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [today, setToday] = useState<Date | null>(null);
  const [progress, setProgress] = useState<{ techId: string; month: string; approved: number } | null>(null);
  const [progressError, setProgressError] = useState("");
  const [qcCounts, setQcCounts] = useState<QcCounts | null>(null);
  const [flash, setFlash] = useState(0);
  const [captured, setCaptured] = useState<{ blob: Blob; number: number } | null>(null);
  useEffect(() => {
    let active = true;
    void readQcDraft(techId).then((draft) => {
      if (!active) return;
      if (draft) {
        const savedJobNumber = draft.jobNumber.replace(/\D/g, "").slice(0, 6);
        draftRef.current = { ...draft, jobNumber: savedJobNumber };
        setSubmissionId(draft.submissionId);
        setJobNumber(savedJobNumber);
        setScreenshot(draft.screenshot);
        setPhotos(draft.photos);
        setDraftStatus("saved");
      }
      setDraftReady(true);
    }).catch(() => {
      if (active) { setDraftReady(true); setDraftStatus("failed"); }
    });
    return () => { active = false; if (draftTimer.current !== null) window.clearTimeout(draftTimer.current); };
  }, [techId]);

  useEffect(() => {
    if (!resetConfirmation || !resetDialog.current) return;
    const dialog = resetDialog.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    resetCancel.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [resetConfirmation]);

  function queueDraftSave(next: QcDraft): Promise<boolean> {
    const snapshot = { ...next, updatedAt: Date.now() };
    draftRef.current = snapshot;
    const revision = ++draftRevision.current;
    setDraftStatus("saving");
    const pending = draftWrites.current.then(() => writeQcDraft(snapshot)).then(() => {
      if (revision === draftRevision.current) setDraftStatus("saved");
      return true;
    }).catch(() => {
      if (revision === draftRevision.current) setDraftStatus("failed");
      return false;
    });
    draftWrites.current = pending.then(() => undefined);
    return pending;
  }

  function changeJobNumber(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setJobNumber(digits);
    draftRef.current = { ...draftRef.current!, jobNumber: digits };
    setDraftStatus("saving");
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => { draftTimer.current = null; void queueDraftSave(draftRef.current!); }, 300);
  }


  function saveJobNumberNow() {
    if (draftTimer.current === null) return;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
    void queueDraftSave(draftRef.current!);
  }
  useEffect(() => { setToday(new Date()); const timer = window.setInterval(() => setToday(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!captured) return; const timer = window.setTimeout(() => setCaptured(null), 820); return () => window.clearTimeout(timer); }, [captured]);
  useEffect(() => {
    if (!cameraOn) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") stopCamera(); };
    window.addEventListener("keydown", onKeyDown);
    const preview = video.current;
    if (preview && stream.current) {
      preview.srcObject = stream.current;
      void preview.play().catch(() => { stopCamera(); setError("The camera could not start. Close other camera apps and try again."); });
    }
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [cameraOn]);
  useEffect(() => {
    let controller: AbortController | null = null;
    async function refreshQcCounts() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const response = await fetch("/api/profile?count=1", { cache: "no-store", signal: current.signal });
        if (!response.ok) throw new Error("Could not load QC counts.");
        const result = await response.json() as { techId: string } & QcCounts;
        if (!current.signal.aborted && result.techId === techId) setQcCounts({ captured: result.captured, uploaded: result.uploaded, rejected: result.rejected });
      } catch {
        if (!current.signal.aborted) setQcCounts(null);
      }
    }
    void refreshQcCounts();
    const interval = window.setInterval(() => void refreshQcCounts(), 30_000);
    const onFocus = () => void refreshQcCounts();
    const onVisible = () => { if (document.visibilityState === "visible") void refreshQcCounts(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller?.abort(); window.clearInterval(interval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, [techId]);
  const deadline = today ? fiscalDeadline(today) : null;
  const validTechId = /^[A-Z0-9_-]{3,32}$/.test(techId);
  const month = today ? fiscalMonthKey(today) : null;
  const approvedQcs = progress?.techId === techId && progress.month === month ? progress.approved : null;
  const remainingQcs = approvedQcs === null ? null : Math.max(0, MONTHLY_QC_GOAL - approvedQcs);
  const validJobNumber = /^\d{1,6}$/.test(jobNumber);
  const submitHint = processingScreenshot ? "Reading your screenshot…" : !screenshot ? "Add your account screenshot." : !validJobNumber ? "Check or enter the job number." : photos.length < 2 ? `Take ${2 - photos.length} more live ${photos.length === 1 ? "photo" : "photos"}.` : taking ? "Finishing your photo…" : cameraOn ? "Close the camera to submit." : "";
  const ready = validTechId && validJobNumber && !!screenshot && photos.length >= 2 && photos.length <= MAX_PHOTOS;

  useEffect(() => {
    if (!validTechId || !month) { setProgress(null); setProgressError(""); return; }
    let controller: AbortController | null = null;
    setProgress(null); setProgressError("");
    async function refresh() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const { start, end } = fiscalMonthBounds(month!);
      try {
        const response = await fetch(`/api/qc-progress?techId=${encodeURIComponent(techId)}&start=${start}&end=${end}`, { cache: "no-store", signal: current.signal });
        const result = await response.json() as { approved?: number; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load approved QC progress.");
        if (!current.signal.aborted) { setProgress({ techId, month: month!, approved: result.approved ?? 0 }); setProgressError(""); }
      } catch (cause) {
        if (!current.signal.aborted) setProgressError(cause instanceof Error ? cause.message : "Could not load approved QC progress.");
      }
    }
    const first = window.setTimeout(() => void refresh(), 350);
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(first); window.clearInterval(interval); controller?.abort(); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, [techId, validTechId, month]);

  function stopCamera() {
    pinch.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraReady(false);
    setCameraOn(false);
  }
  async function startNewQc() {
    if (!draftReady || busy || taking || screenshotProcessing.current || logoutBusy || clearingDraft.current) return;
    if (!resetConfirmation) return;
    clearingDraft.current = true;
    setBusy(true);
    setResetError("");
    setResetMessage("");
    stopCamera();
    try {
      const nextId = crypto.randomUUID();
      if (draftTimer.current !== null) {
        window.clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      // Delete after queued saves so an older write cannot restore this draft.
      ++draftRevision.current;
      const removal = draftWrites.current.then(() => deleteQcDraft(techId));
      draftWrites.current = removal.catch(() => undefined);
      await removal;
      draftRef.current = { techId, submissionId: nextId, jobNumber: "", screenshot: null, photos: [], updatedAt: Date.now() };
      setSubmissionId(nextId);
      setJobNumber("");
      setScreenshot(null);
      setPhotos([]);
      setSubmitted(false);
      setScreenshotReading(0);
      setScreenshotReadingMessage("");
      setUploadProgress(null);
      setUploadLabel("");
      setError("");
      setLogoutError("");
      setCameraZoom(1);
      setCaptured(null);
      setFlash(0);
      pinchCooldownUntil.current = 0;
      setDraftStatus("idle");
      setResetMessage("Ready for a new QC. Upload the next job’s screenshot.");
      setResetConfirmation(false);
    } catch {
      setDraftStatus("failed");
      setResetError("Could not clear the saved draft. Your pictures are still here; please try again.");
    } finally {
      clearingDraft.current = false;
      setBusy(false);
    }
  }

  async function logOut() {
    if (busy || taking || processingScreenshot || logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError("");
    try {
      if (draftTimer.current !== null) {
        window.clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      if (!submitted && !await queueDraftSave(draftRef.current!)) {
        throw new Error("Could not save your unfinished QC on this phone. Keep this page open and try again.");
      }
      await draftWrites.current;
      stopCamera();
      const response = await fetch("/api/profile/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not log out. Check your connection and try again.");
      window.location.replace("/login");
    } catch (cause) {
      setLogoutError(cause instanceof Error ? cause.message : "Could not log out.");
      setLogoutBusy(false);
    }
  }
  function pinchDistance(touches: React.TouchList) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }
  function beginPinch(touches: React.TouchList) {
    if (touches.length !== 2) return;
    pinch.current = { distance: Math.max(1, pinchDistance(touches)), zoom: cameraZoom };
    pinchCooldownUntil.current = Date.now() + 350;
  }
  function movePinch(touches: React.TouchList) {
    if (touches.length !== 2) { pinch.current = null; return; }
    if (!pinch.current) beginPinch(touches);
    if (!pinch.current) return;
    const nextZoom = Math.min(MAX_CAMERA_ZOOM, Math.max(1, pinch.current.zoom * pinchDistance(touches) / pinch.current.distance));
    setCameraZoom(Math.round(nextZoom * 100) / 100);
    pinchCooldownUntil.current = Date.now() + 350;
  }
  useEffect(() => () => stream.current?.getTracks().forEach((track) => track.stop()), []);

  async function chooseScreenshot(file?: File) {
    if (!file || screenshotProcessing.current) return;
    const previousStatus = draftStatus;
    screenshotProcessing.current = true;
    setResetMessage("");
    setResetError("");
    setProcessingScreenshot(true);
    setScreenshotReading(0);
    setScreenshotReadingMessage("Reading the job number from this screenshot…");
    setDraftStatus("saving");
    setError("");
    try {
      // Decode/validate the screenshot first; OCR still reads the original file.
      const image = await screenshotAsJpeg(file);
      let detectedJobNumber: string | null = null;
      let recognitionFailed = false;
      try {
        detectedJobNumber = await recognizeJobNumber(file, setScreenshotReading);
      } catch {
        recognitionFailed = true;
      }
      if (draftTimer.current !== null) { window.clearTimeout(draftTimer.current); draftTimer.current = null; }
      const existingJobNumber = draftRef.current!.jobNumber;
      const nextJobNumber = existingJobNumber || detectedJobNumber || "";
      await queueDraftSave({ ...draftRef.current!, jobNumber: nextJobNumber, screenshot: image });
      if (!existingJobNumber && detectedJobNumber) setJobNumber(detectedJobNumber);
      setScreenshot(image);
      setScreenshotReading(100);
      setScreenshotReadingMessage(detectedJobNumber
        ? existingJobNumber && existingJobNumber !== detectedJobNumber
          ? `Found job ${detectedJobNumber}. Your existing job number was kept; please verify it.`
          : existingJobNumber
            ? `Job number ${detectedJobNumber} matches the screenshot.`
            : `Job number ${detectedJobNumber} was filled in. Please verify it.`
        : recognitionFailed
          ? "Screenshot saved. The job number could not be read; enter it manually."
          : "Screenshot saved. No clear six-digit job number was found; enter it manually.");
    }
    catch (cause) {
      setDraftStatus(previousStatus);
      setScreenshotReadingMessage("");
      setError(cause instanceof Error ? cause.message : "Could not open the screenshot.");
    }
    finally { screenshotProcessing.current = false; setProcessingScreenshot(false); }
  }

  async function startCamera() {
    if (screenshotProcessing.current) return;
    setError("");
    if (!validTechId || !validJobNumber || !screenshot) { setError("Enter a job number using 1 to 6 digits and add the account screenshot first."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError("This browser cannot open the camera. Use a current browser on your phone."); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      stream.current = media;
      setCameraReady(false);
      setCameraZoom(1);
      setCameraOn(true);
    } catch { stopCamera(); setError("Allow camera access in your browser, then try again."); }
  }

  async function takePhoto() {
    if (Date.now() < pinchCooldownUntil.current || !video.current?.videoWidth || !stream.current || taking || screenshotProcessing.current || photos.length >= MAX_PHOTOS) return;
    setTaking(true); setError(""); setCaptured(null); setFlash((current) => current + 1);
    try {
      const width = video.current.videoWidth;
      const height = video.current.videoHeight;
      const scale = Math.min(1, 1600 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not prepare the photo.");
      const cropWidth = width / cameraZoom;
      const cropHeight = height / cameraZoom;
      const takenAt = new Date();
      context.drawImage(video.current, (width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      drawCaptureTimestamp(context, canvas.width, canvas.height, takenAt);
      const photo = await compactJpeg(canvas, 1280);
      if (draftTimer.current !== null) { window.clearTimeout(draftTimer.current); draftTimer.current = null; }
      const nextPhotos = [...photos, photo];
      setPhotos(nextPhotos);
      setCaptured({ blob: photo, number: photos.length + 1 });
      navigator.vibrate?.(35);
      await queueDraftSave({ ...draftRef.current!, photos: nextPhotos });
      if (nextPhotos.length >= MAX_PHOTOS) window.setTimeout(stopCamera, 820);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The photo could not be captured."); }
    finally { setTaking(false); }
  }

  function removePhoto(index: number) {
    const nextPhotos = photos.filter((_, photoIndex) => photoIndex !== index);
    setPhotos(nextPhotos);
    if (draftTimer.current !== null) { window.clearTimeout(draftTimer.current); draftTimer.current = null; }
    void queueDraftSave({ ...draftRef.current!, photos: nextPhotos });
  }

  async function submit() {
    if (!ready || !screenshot || busy || taking || screenshotProcessing.current) return;
    stopCamera(); setBusy(true); setError(""); setUploadProgress(0); setUploadLabel("Preparing pictures…");
    try {
      if (draftTimer.current !== null) { window.clearTimeout(draftTimer.current); draftTimer.current = null; }
      const images = [screenshot, ...photos];
      const prepared: Blob[] = [];
      for (let index = 0; index < images.length; index++) {
        const image = images[index].size <= MAX_IMAGE_BYTES && images[index].type === "image/jpeg" ? images[index] : await savedImageAsJpeg(images[index]);
        if (image.size > MAX_IMAGE_BYTES) throw new Error("One of the pictures is still larger than 30 KB. Retake it and try again.");
        prepared.push(image);
        setUploadProgress(Math.round(10 * (index + 1) / images.length));
      }
      const preparedScreenshot = prepared[0];
      const preparedPhotos = prepared.slice(1);
      setScreenshot(preparedScreenshot); setPhotos(preparedPhotos);
      const draftSaved = await queueDraftSave({ ...draftRef.current!, screenshot: preparedScreenshot, photos: preparedPhotos });
      if (!draftSaved) throw new Error("Could not save this unfinished QC on your phone. Keep this page open and try again.");
      const details = { techId, jobNumber: jobNumber.trim(), submissionId };
      for (let index = 0; index < prepared.length; index++) {
        setUploadLabel(`Uploading picture ${index + 1} of ${prepared.length}…`);
        await sendQcStep({ ...details, action: "photo", slot: index, image: await imageBase64(prepared[index]) });
        setUploadProgress(10 + Math.round(80 * (index + 1) / prepared.length));
      }
      setUploadLabel("Saving QC for review…");
      setUploadProgress(95);
      await sendQcStep({ ...details, action: "finalize", photoCount: preparedPhotos.length });
      setUploadProgress(100); setUploadLabel("Upload complete");
      setQcCounts((counts) => counts ? { ...counts, captured: counts.captured + 1 } : counts);
      ++draftRevision.current;
      const removeDraft = draftWrites.current.then(() => deleteQcDraft(techId));
      draftWrites.current = removeDraft.catch(() => undefined);
      try { await removeDraft; setDraftStatus("idle"); }
      catch { setDraftStatus("failed"); }
      const nextId = crypto.randomUUID();
      draftRef.current = { techId, submissionId: nextId, jobNumber: "", screenshot: null, photos: [], updatedAt: Date.now() };
      setScreenshotReadingMessage(""); setSubmitted(true); setJobNumber(""); setScreenshot(null); setPhotos([]); setSubmissionId(nextId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not submit this QC.";
      setError(cause instanceof UploadFailure && cause.retryable ? `${message} Your unfinished QC is saved on this phone. Check your connection and tap Submit QC for approval again.` : message);
    }
    finally { setBusy(false); setUploadProgress(null); }
  }

  if (!draftReady) return <main className="capture-shell qc-dark-shell"><div className="camera-app qc-form"><p role="status">Checking for your unfinished QC…</p></div></main>;

  return <main className={`capture-shell qc-dark-shell qc-reference${cameraOn ? " qc-camera-active" : ""}`}>
    <div className="camera-app qc-form">
      <header className="camera-header qc-reference-header"><div><span className="kicker">TQA AUTOMATIC UPLOAD</span><h1>New QC submission</h1></div><div className="qc-header-actions"><button type="button" className="button light qc-logout" disabled={busy || taking || processingScreenshot || logoutBusy} onClick={() => { setResetError(""); setResetConfirmation(true); }}><RotateCcw size={17}/>Start new QC</button><button type="button" className="button light qc-logout" disabled={busy || taking || processingScreenshot || logoutBusy} onClick={() => void logOut()}><LogOut size={17}/>{logoutBusy ? "Logging out…" : "Log out"}</button></div><p>Signed in as Tech {techId}. Upload the job screenshot, check the job number, then take the required live photos.</p></header>
      <dialog ref={resetDialog} className="qc-reset-dialog" aria-labelledby="qc-reset-title" aria-describedby="qc-reset-description" onCancel={(event) => { event.preventDefault(); if (!clearingDraft.current) setResetConfirmation(false); }}>
        <div className="qc-reset-icon" aria-hidden="true"><RotateCcw size={24}/></div>
        <h2 id="qc-reset-title">Start a new QC?</h2>
        <p id="qc-reset-description">Your current photos, screenshot and job number will be cleared.</p>
        <small>Submitted QCs stay in your history.</small>
        {resetError && <p className="form-error" role="alert">{resetError}</p>}
        <div className="qc-reset-actions">
          <button ref={resetCancel} type="button" className="button light" disabled={busy} onClick={() => setResetConfirmation(false)}>Cancel</button>
          <button type="button" className="button dark" disabled={busy} onClick={() => void startNewQc()}>{busy ? "Clearing…" : "Start new QC"}</button>
        </div>
      </dialog>
      {resetMessage && <p className="qc-reset-status" role="status">{resetMessage}</p>}
      <section className="qc-tech-summary" aria-label="My QC totals">
        <a className="qc-summary-card qc-summary-rejected" href="/profile?view=rejected"><FileWarning size={19}/><span>My rejected QCs</span><strong>{qcCounts?.rejected ?? "—"}</strong><ChevronRight size={17}/></a>
        <a className="qc-summary-card" href="/profile?view=captured"><span>Captured QCs</span><strong>{qcCounts?.captured ?? "—"}</strong></a>
        <a className="qc-summary-card" href="/profile?view=uploaded"><span>Uploaded to Catalyst</span><strong>{qcCounts?.uploaded ?? "—"}</strong></a>
      </section>
      {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
      <div className="qc-deadline" role="status"><div className="qc-progress-ring" aria-hidden="true" style={{ background: `conic-gradient(#d7e9ff ${approvedQcs === null ? 0 : Math.min(100, approvedQcs / MONTHLY_QC_GOAL * 100)}%, #394b5a 0)` }}/><div className="qc-deadline-message"><strong>{remainingQcs === 0 ? "Monthly goal complete" : deadline ? deadline.daysLeft === 0 ? "Due today" : `${deadline.daysLeft} ${deadline.daysLeft === 1 ? "day" : "days"} left` : "Monthly QC deadline"}</strong><span>{!validTechId ? "Sign in again to see QCs remaining" : progressError ? "Approved QC progress is unavailable. Try again shortly." : remainingQcs === null ? "Checking approved QC progress…" : remainingQcs === 0 ? `${approvedQcs} of 5 approved · 0 remaining` : `${approvedQcs} of 5 approved · ${remainingQcs} remaining`}</span></div><small>Due <b>{deadline ? deadline.date.toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "on the 21st"}</b></small></div>
      {submitted ? <div className="qc-success" role="status"><Check size={34}/><h2>Sent for review</h2><p>Your QC was submitted for approval.</p><button className="button dark" onClick={() => setSubmitted(false)}>Start another QC</button></div> : <>
        <div className="qc-step-timeline">
        <section className="qc-step qc-setup-step qc-screenshot-step"><div className="qc-step-marker"><span>1</span></div><div className="qc-step-card"><div className="qc-step-heading"><h2>Account screenshot</h2><p>Upload a clear screenshot to read the job number automatically.</p></div><label className="qc-file-picker qc-screenshot-button"><ImagePlus size={25}/><span>{processingScreenshot ? screenshotReading > 0 ? `Reading job number ${screenshotReading}%` : "Starting job-number scan…" : screenshot ? "Replace screenshot" : "Upload screenshot"}</span><input type="file" accept="image/*" aria-label="Account screenshot from phone" disabled={busy || taking || processingScreenshot} onChange={(event) => { void chooseScreenshot(event.target.files?.[0]); event.target.value = ""; }} /></label>{screenshotReadingMessage && <p className={`qc-ocr-status${processingScreenshot ? " is-reading" : ""}`} role="status">{screenshotReadingMessage}</p>}</div></section>
        <section className="qc-step qc-setup-step"><div className="qc-step-marker"><span>2</span></div><div className="qc-step-card"><div className="qc-step-heading"><h2>Job number</h2><p>Check the number read from your screenshot, or enter up to 6 digits.</p></div><div className="qc-job-field"><span aria-hidden="true">#</span><input className="qc-tech-id" aria-label="Job number" placeholder="Enter job number" autoComplete="off" inputMode="numeric" pattern="[0-9]*" value={jobNumber} maxLength={6} disabled={busy || taking || processingScreenshot} onChange={(event) => changeJobNumber(event.target.value)} onBlur={saveJobNumberNow} /></div></div></section>
        <section className="qc-step qc-live-step">
          <div className="qc-step-marker"><span>3</span></div><div className="qc-step-card"><div className="qc-step-heading"><h2>Live QC photos</h2><p>Take the required live photos below.</p></div>
          <button type="button" className="viewfinder qc-viewfinder is-off qc-camera-entry" onClick={() => void startCamera()} disabled={busy || processingScreenshot || photos.length >= MAX_PHOTOS} aria-label={photos.length >= MAX_PHOTOS ? "Maximum of seven live photos reached" : "Open live camera"}><span className="camera-placeholder"><Camera size={32}/><span>{photos.length >= MAX_PHOTOS ? "7 photos ready. Remove one to retake." : "Tap to take live photos"}</span></span></button>
          {(screenshot || photos.length > 0) && <div className="qc-photo-grid qc-photo-gallery" data-photo-gallery>{screenshot && <div className="qc-photo qc-screenshot-photo"><ImagePreview blob={screenshot} alt="Account screenshot"/><span>Account</span></div>}{photos.map((photo, index) => <div className="qc-photo" key={index}><ImagePreview blob={photo} alt={`Live QC photo ${index + 1}`}/><button type="button" className="qc-remove-photo" aria-label={`Remove photo ${index + 1}`} disabled={busy || taking || processingScreenshot} onClick={() => removePhoto(index)}><Trash2 size={16}/></button><span>{index + 1}</span></div>)}</div>}
          </div></section>
        </div>
        <div className={`qc-fullscreen-camera${cameraOn ? " active" : ""}`} role={cameraOn ? "dialog" : undefined} aria-modal={cameraOn ? "true" : undefined} aria-label="Live QC camera" aria-hidden={!cameraOn} onTouchStart={(event) => beginPinch(event.touches)} onTouchMove={(event) => movePinch(event.touches)} onTouchEnd={(event) => { if (pinch.current) pinchCooldownUntil.current = Date.now() + 350; if (event.touches.length < 2) pinch.current = null; }} onTouchCancel={() => { pinch.current = null; }}>
          <video ref={video} autoPlay muted playsInline className="qc-fullscreen-video" aria-label="Live camera preview" onLoadedMetadata={() => setCameraReady(true)} onPlaying={() => setCameraReady(true)} style={{ transform: `scale(${cameraZoom})` }} />
          {flash > 0 && <div key={flash} className="camera-shutter-flash" aria-hidden="true"/>}
          {captured && <div className="qc-capture-fly" key={captured.number}><ImagePreview blob={captured.blob} alt="Just captured QC photo" interactive={false}/></div>}
          <button type="button" className="qc-camera-close" onClick={() => { if (Date.now() >= pinchCooldownUntil.current) stopCamera(); }} disabled={taking} aria-label="Close camera"><X size={27}/></button>
          {error && cameraOn && <p className="qc-camera-error" role="alert">{error}</p>}
          <div className="qc-camera-bottom">
            <output className="qc-camera-zoom-value" aria-label={`Camera zoom ${cameraZoom.toFixed(1)} times`}>{cameraZoom.toFixed(1)}×</output>
            <div className="qc-camera-controls"><div className="qc-camera-last-photo" aria-label={photos.length ? `Latest photo, ${photos.length} taken` : "No photos yet"}>{photos.length > 0 && <ImagePreview blob={photos[photos.length - 1]} alt="Latest photo" interactive={false}/>}</div><button type="button" className="qc-camera-shutter" onClick={() => void takePhoto()} disabled={!cameraReady || taking || busy || processingScreenshot || photos.length >= MAX_PHOTOS} aria-label={taking ? "Capturing photo" : "Take live QC photo"}/><span className="qc-camera-photo-count" aria-live="polite">{photos.length}/7</span></div>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {submitHint && <p id="qc-submit-hint" className="qc-submit-hint" role="status">{submitHint}</p>}
        <button aria-describedby={submitHint ? "qc-submit-hint" : undefined} className="button dark qc-submit" onClick={submit} disabled={!ready || busy || taking || processingScreenshot || cameraOn}><Send size={18}/>{busy ? "Submitting…" : "Submit QC for approval"}</button>
        {uploadProgress !== null && <div className="qc-upload-progress" role="status"><div><strong>{uploadLabel}</strong><span>{uploadProgress}%</span></div><progress max={100} value={uploadProgress} aria-label="QC picture upload progress" /></div>}
        <p className="camera-note camera-note-desktop">The account screenshot is the only saved image selected from your phone. QC photos use the live camera. Each picture is reduced to 30 KB or less. An unfinished QC stays in this browser until you submit it.</p>
        <QcRequirements />
      </>}
    </div>
  </main>;
}
