import {MessageSquareText,ArrowRight} from 'lucide-react';
export default function TechFeedbackNotice({count}:{count:number}){
 if(!count)return null;
 return <section className="qc-feedback-notice" aria-label="Unread supervisor feedback"><div><strong><MessageSquareText size={19}/>{count===1?'New supervisor note':'New supervisor notes'}<span className="qc-feedback-counter">{count}</span></strong><p>{count===1?'Your QC is approved. Your supervisor left feedback for you.':'Your QCs are approved. Your supervisor left feedback for you.'}</p></div><a className="button light" href="/profile?view=notes&unread=1">{count===1?'Read note':'Read notes'}<ArrowRight size={16}/></a></section>;
}
