type Props = { status: string; trustUploadStatus: string; correctionPending?: number; attemptNumber?: number };

export default function FailedQcUploadBadge({ status, trustUploadStatus, correctionPending, attemptNumber }: Props) {
  if (status !== "rejected" || correctionPending === 1) return null;
  if (trustUploadStatus === "uploaded") {
    return <span className="qc-trust-status uploaded qc-fail-upload-badge">Fail uploaded to Catalyst</span>;
  }
  if (trustUploadStatus === "failed" && attemptNumber === 1) {
    return <span className="qc-trust-status failed qc-fail-upload-badge">Fail upload needs retry</span>;
  }
  return null;
}
