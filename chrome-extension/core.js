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

export function observationTypeAssignments(qcs, rideAlongPercentage, random = Math.random, monthlyTotals = []) {
  const fraction = Math.max(0, Math.min(100, Number(rideAlongPercentage) || 0)) / 100;
  const totals = new Map(monthlyTotals.map(row => [String(row.techId).trim().toUpperCase(), {rideAlong:Number(row.rideAlong)||0, afterTheFact:Number(row.afterTheFact)||0}]));
  return qcs.map((qc,index) => {
    const key = String(qc.techId ?? "").trim().toUpperCase();
    const count = totals.get(key) ?? {rideAlong:0,afterTheFact:0};
    totals.set(key,count);
    let observationType = "After the Fact";
    if (qc.workflow !== "follow_up") {
      if (qc.outcome !== "fail" && qc.reviewStatus !== "rejected") {
        const target = (count.rideAlong + count.afterTheFact + 1) * fraction;
        const rideError = Math.abs(count.rideAlong + 1 - target);
        const afterError = Math.abs(count.rideAlong - target);
        if (rideError < afterError || (Math.abs(rideError-afterError) < 1e-9 && random() < 0.5)) observationType = "Ride Along";
      }
      if (observationType === "Ride Along") count.rideAlong++;
      else count.afterTheFact++;
    }
    return {qc,index,attempt:1,observationType};
  });
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
