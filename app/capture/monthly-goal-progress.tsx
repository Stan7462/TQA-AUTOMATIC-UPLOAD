import { Check } from "lucide-react";

type Props = { approved: number | null; goal: number; due: string; error?: string };

export default function MonthlyGoalProgress({ approved, goal, due, error }: Props) {
  const remaining = approved === null ? null : Math.max(0, goal - approved);
  const complete = remaining === 0;
  return <section className="qc-monthly-milestones" aria-label="Monthly QC goal">
    <div className="qc-milestones-heading"><span>Monthly QC goal</span><span>Due <b>{due}</b></span></div>
    <strong className="qc-milestones-title" role="status">{error || (approved === null ? "Checking approved QC progress…" : `${approved} of ${goal} QCs approved`)}</strong>
    <div className="qc-milestones-grid" role="img" aria-label={approved === null || error ? "QC progress unavailable" : `${Math.min(approved, goal)} of ${goal} goal milestones complete`}>
      {Array.from({ length: goal }, (_, index) => {
        const done = !error && approved !== null && index < approved;
        return <span key={index} className={`qc-milestone${done ? " is-complete" : ""}`} aria-hidden="true">{done ? <Check size={16}/> : index + 1}</span>;
      })}
    </div>
    <div className="qc-milestones-footer"><span>{complete && !error ? "Monthly goal complete" : "Approved QCs count toward your goal"}</span><span>{remaining !== null && !error ? `${remaining} remaining` : "—"}</span></div>
  </section>;
}
