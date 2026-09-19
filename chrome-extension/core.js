export const API_ORIGIN = "https://stanislavs-macbook-air.tailbf5c58.ts.net";
export const JOBS_URL = "https://catalystqms.comcast.net/TechOps/jobs";
export const observationUrl = (jobId) => `https://catalystqms.comcast.net/TechOps/observation/?jobid=${encodeURIComponent(jobId)}`;

export function exactJobMatches(rows, jobNumber, techId) {
  return rows.filter((row) => String(row.jobNumber).trim() === String(jobNumber).trim()
    && String(row.techId).trim() === String(techId).trim());
}

export function orderedPhotos(qc) {
  return [...qc.photos].sort((a, b) => a.order - b.order);
}

export function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/tqa_trust_[a-f0-9]{64}/g, "[redacted]");
}
