export type QcUploadType='all'|'ride_along'|'after_the_fact'|'not_recorded';
export const uploadTypeOptions=[['all','All upload types'],['ride_along','Ride Along'],['after_the_fact','After the Fact'],['not_recorded','Not recorded']] as const;
export function normalizeUploadType(value:unknown):QcUploadType{
  return uploadTypeOptions.some(([key])=>key===value)?value as QcUploadType:'all';
}
type UploadedQc={trustUploadStatus:string;catalystObservationType?:string|null};
export function uploadedQcType(qc:UploadedQc):Exclude<QcUploadType,'all'>|null{
  if(qc.trustUploadStatus!=='uploaded')return null;
  return qc.catalystObservationType==='Ride Along'?'ride_along':qc.catalystObservationType==='After the Fact'?'after_the_fact':'not_recorded';
}
export function matchesQcUploadType(qc:UploadedQc,value:unknown){const selected=normalizeUploadType(value);return selected==='all'||uploadedQcType(qc)===selected;}

// A correction updates the original Catalyst observation; it has no new type
// of its own. Show the original confirmed type without guessing older values.
export function qcObservationTypeSql(table:'qc_submissions'|'qc_submission_attempts'){
  const root=`COALESCE(${table}.root_submission_id,${table}.${table==='qc_submissions'?'id':'submission_id'})`;
  return `CASE WHEN ${table}.trust_upload_kind='follow_up' THEN COALESCE(${table}.catalyst_observation_type,
    (SELECT original.catalyst_observation_type FROM qc_submission_attempts original WHERE original.tenant_id=${table}.tenant_id AND original.submission_id=${root} AND original.attempt_number=1 LIMIT 1),
    (SELECT original.catalyst_observation_type FROM qc_submissions original WHERE original.tenant_id=${table}.tenant_id AND original.id=${root} LIMIT 1))
    ELSE ${table}.catalyst_observation_type END`;
}
