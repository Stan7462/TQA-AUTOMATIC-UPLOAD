export const JOBS_URL = "https://catalystqms.comcast.net/TechOps/jobs";
export const TQA_APP_ORIGIN = "https://qc.leadtechx.com";
export const observationUrl = (jobId) => `https://catalystqms.comcast.net/TechOps/observation/?jobid=${encodeURIComponent(jobId)}`;
export const completedObservationUrl = (observationId) => `https://catalystqms.comcast.net/TechOps/observation?id=${encodeURIComponent(observationId)}`;
export const OBSERVATIONS_URL = "https://catalystqms.comcast.net/TechOps/observations";

export function exactJobMatches(rows, jobNumber, techId) {
  return rows.filter((row) => String(row.jobNumber).trim() === String(jobNumber).trim()
    && String(row.techId).trim() === String(techId).trim());
}

export function orderedPhotos(qc) {
  return [...qc.photos].sort((a, b) => a.order - b.order);
}

export function observationTypeAssignments(qcs, rideAlongPercentage, random = Math.random) {
  const percentage = Math.max(0, Math.min(100, Number(rideAlongPercentage) || 0));
  const observationIndexes = qcs.map((qc, index) => qc.workflow === "follow_up" || qc.outcome === "fail" || qc.reviewStatus === "rejected" ? null : index).filter((index) => index !== null);
  const rideAlongCount = Math.round(observationIndexes.length * percentage / 100);
  const shuffled = [...observationIndexes];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const rideAlong = new Set(shuffled.slice(0, rideAlongCount));
  return qcs.map((qc, index) => ({
    qc,
    index,
    attempt: 1,
    observationType: rideAlong.has(index) ? "Ride Along" : "After the Fact",
  }));
}

export function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/tqa_trust_[a-f0-9]{64}/g, "[redacted]").replace(/\b[a-f0-9]{64}\b/g, "[redacted]");
}

// Only resume when Catalyst still has exactly the photos we confirmed saving.
export function recoveryPhotoIndex(checkpoint, state, photos) {
  if (checkpoint?.completionStarted) throw new Error('Completion may already have happened. Review Catalyst before retrying.');
  const expected = checkpoint?.photoIds || [];
  if (expected.length > photos.length || expected.some((id, i) => id !== photos[i].id)) throw new Error('QC photos changed since the interrupted upload. Review Catalyst before retrying.');
  const actual = state.photoKeys || [];
  const saved = checkpoint?.photoKeys || [];
  if (actual.length !== saved.length || actual.some((id, i) => id !== saved[i]) || saved.length !== expected.length) {
    throw new Error('Catalyst photos do not match confirmed upload progress. Existing photos will not be uploaded again; review this observation.');
  }
  return expected.length;
}
