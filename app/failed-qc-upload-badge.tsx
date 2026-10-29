type Props = { status: string; trustUploadStatus: string; correctionPending?: number; attemptNumber?: number; rejectionUploadMode?: string };

export default function FailedQcUploadBadge({ status, trustUploadStatus, correctionPending, rejectionUploadMode }: Props) {
  if (status !== "rejected" || correctionPending === 1) return null;
  if (rejectionUploadMode === "local") return <span className="qc-trust-status qc-fail-upload-badge">No Catalyst upload</span>;
  if (trustUploadStatus === "uploaded") {
    return <span className="qc-trust-status uploaded qc-fail-upload-badge">Fail uploaded to Catalyst</span>;
  }
  if (trustUploadStatus === "failed") {
    return <span className="qc-trust-status failed qc-fail-upload-badge">Fail upload needs retry</span>;
  }
  return null;
}
