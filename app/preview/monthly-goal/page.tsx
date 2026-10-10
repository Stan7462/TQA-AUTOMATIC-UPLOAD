import { notFound } from "next/navigation";
import MonthlyGoalProgress from "@/app/capture/monthly-goal-progress";
export const dynamic = "force-dynamic";
export default function MonthlyGoalPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="management-page login-dark"><div className="management-head"><h1>Monthly QC goal</h1><p>Local preview · compact milestones</p></div><div style={{ maxWidth: 620 }}><MonthlyGoalProgress approved={2} goal={5} due="October 21"/><MonthlyGoalProgress approved={5} goal={5} due="October 21"/></div><a className="button light" href="/capture">Open QC submission</a></main>;
}
