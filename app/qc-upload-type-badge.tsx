import {uploadedQcType,uploadTypeOptions} from '@/lib/qc-observation-type';
export default function QcUploadTypeBadge(props:{trustUploadStatus:string;catalystObservationType?:string|null}){
  const type=uploadedQcType(props);if(!type)return null;
  const label=uploadTypeOptions.find(([key])=>key===type)![1];
  return <span className={`qc-upload-type ${type}`} aria-label={`Uploaded as: ${label}`} title={type==='not_recorded'?'The upload type was not recorded for this QC.':`Catalyst observation type: ${label}`}>{label}</span>;
}
