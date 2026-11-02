import {CheckCheck,Clock3,MessageSquareText} from 'lucide-react';
type Props={status:string;reviewNote?:string|null;feedbackAcknowledgedAt?:number|null;detailed?:boolean;technician?:boolean};
export default function QcFeedbackStatus({status,reviewNote,feedbackAcknowledgedAt,detailed=false,technician=false}:Props){
 if(status!=='approved'||!reviewNote?.trim())return null;
 const acknowledged=!!feedbackAcknowledgedAt;
 const label=acknowledged?'Acknowledged':technician?'New supervisor note':'Awaiting acknowledgment';
 const Icon=acknowledged?CheckCheck:technician?MessageSquareText:Clock3;
 const time=acknowledged?new Date(Number(feedbackAcknowledgedAt)).toLocaleString():'';
 return <span className={`qc-feedback-status ${acknowledged?'acknowledged':'unread'}${detailed?' detailed':''}`} title={acknowledged?`Technician acknowledged this note: ${time}`:'The technician has not acknowledged this note yet.'}><Icon size={detailed?19:13}/><span><strong>{label}</strong>{detailed&&<small>{acknowledged?`Technician confirmed · ${time}`:'The reminder stays visible until the technician taps “I’ve read this.”'}</small>}</span></span>;
}
