import {snapshotGoalTotals,type SnapshotStat} from '@/lib/catalyst-snapshot';
export default function CatalystSnapshotGoal({stats,monthlyGoal}:{stats:SnapshotStat[];monthlyGoal:number}){
 const totals=snapshotGoalTotals(stats,monthlyGoal);
 return <section className="qc-snapshot-goal" aria-label="Team monthly QC goal">
  <div className="qc-snapshot-goal-heading"><strong>{totals.uploaded} of {totals.required} required QCs uploaded</strong><span>{totals.percentage}</span></div>
  <div className="qc-snapshot-goal-track" role="progressbar" aria-label="Team monthly QC goal" aria-valuemin={0} aria-valuemax={totals.required} aria-valuenow={totals.credited} aria-valuetext={`${totals.uploaded} QCs uploaded; ${totals.credited} count toward ${totals.required} required QCs; ${totals.percentage} complete. Each technician contributes up to their own goal.`}><span style={{width:`${totals.progress*100}%`}}/></div>
  <div className="qc-snapshot-goal-caption"><span>Team monthly goal</span><span>{totals.remaining} remaining</span></div>
 </section>;
}
