import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {env} from '@/lib/local-env';
import {hashPin,newPin,randomHex} from '@/lib/tech-auth';
import {encryptPin,credentialFingerprint} from '@/lib/pin-vault';
import {uniqueTechnicianPin} from '@/lib/credential-auth';
export const subscriptionStates=['trial','active','overdue','suspended','cancelled'] as const;
export function companyInput(body:Record<string,unknown>,creating=false){
 const result:{name?:string;kind?:string;status?:string;plan?:string;renewalAt?:number|null;contactEmail?:string|null;notes?:string|null}={};
 if(creating||'name' in body){if(typeof body.name!=='string'||body.name.trim().length<2||body.name.trim().length>80)throw Error('Company name must be 2–80 characters.');result.name=body.name.trim();}
 if(creating){if(body.kind!==undefined&&!['customer','demo'].includes(String(body.kind)))throw Error('Choose Customer or Demo.');result.kind=body.kind==='demo'?'demo':'customer';}
 if(creating||'status' in body){const value=body.status??'trial';if(!subscriptionStates.includes(value as typeof subscriptionStates[number]))throw Error('Choose a valid subscription status.');result.status=value as string;}
 if(creating||'plan' in body){if(typeof(body.plan??'Standard')!=='string'||String(body.plan??'Standard').trim().length>60)throw Error('Plan name must be 60 characters or less.');result.plan=String(body.plan??'Standard').trim()||'Standard';}
 if(creating||'renewalAt' in body){if(body.renewalAt==null||body.renewalAt==='')result.renewalAt=null;else{const date=typeof body.renewalAt==='string'?Date.parse(body.renewalAt):NaN;if(!Number.isSafeInteger(date)||date<0)throw Error('Choose a valid renewal date.');result.renewalAt=date;}}
 if(creating||'contactEmail' in body){if(body.contactEmail!=null&&typeof body.contactEmail!=='string')throw Error('Enter a contact email.');const email=String(body.contactEmail??'').trim();if(email&&(email.length>254||!/^\S+@\S+\.\S+$/.test(email)))throw Error('Enter a valid contact email.');result.contactEmail=email||null;}
 if(creating||'notes' in body){if(body.notes!=null&&(typeof body.notes!=='string'||body.notes.length>2000))throw Error('Notes must be 2,000 characters or less.');result.notes=String(body.notes??'').trim()||null;}
 if(!Object.keys(result).length)throw Error('Choose a company setting to update.');
 return result;
}
export async function newCompanyId(name:string){
 const base=name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,22)||'company';
 for(let i=0;i<100;i++){const value=`${base}-${randomHex(3)}`;if(!await env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(value).first())return value;}
 throw Error('Could not generate a company ID.');
}
export async function companySetup(tenantId:string){
 const techId=`SETUP-${randomHex(6).toUpperCase()}`,pin=newPin(),salt=randomHex(16);
 return {techId,pin,statement:env.DB.prepare('INSERT INTO technicians(tenant_id,tech_id,pin_salt,pin_hash,pin_ciphertext,credential_fingerprint,active,is_admin,must_change_credentials,created_at) VALUES(?,?,?,?,?,?,1,1,1,?)').bind(tenantId,techId,salt,await hashPin(pin,salt),await encryptPin(pin,env.PIN_ENCRYPTION_KEY),await credentialFingerprint(pin,env.PIN_ENCRYPTION_KEY),Date.now())};
}
export async function demoCompanyData(tenantId:string){
 const statements:ReturnType<typeof env.DB.prepareBound>[]=[],pictures:string[]=[],technicians:{techId:string;pin:string}[]=[];
 try{
  for(let i=0;i<3;i++){
   const techId=`DEMO0${i+1}`,pin=await uniqueTechnicianPin(env.DB,techId,newPin),salt=randomHex(16);
   statements.push(env.DB.prepare('INSERT INTO technicians(tenant_id,tech_id,pin_salt,pin_hash,pin_ciphertext,credential_fingerprint,active,is_admin,created_at) VALUES(?,?,?,?,?,?,1,0,?)').bind(tenantId,techId,salt,await hashPin(pin,salt),await encryptPin(pin,env.PIN_ENCRYPTION_KEY),await credentialFingerprint(pin,env.PIN_ENCRYPTION_KEY),Date.now()));
   technicians.push({techId,pin});
  }
  for(let i=0;i<6;i++){
   const ids:string[]=[];
   for(let p=0;p<3;p++){const id=`${Date.now()}-${crypto.randomUUID()}.jpg`;await env.BUCKET.put(`captures/${id}`,new Uint8Array(readFileSync(join(process.cwd(),'public','demo-qc',`${p}.jpg`))));pictures.push(id);ids.push(id);}
   const id=crypto.randomUUID(),submitted=Date.now()-(i+1)*3600000,status=['pending','pending','approved','rejected','approved','approved'][i],uploaded=i===5;
   statements.push(env.DB.prepare('INSERT INTO qc_submissions(id,root_submission_id,tenant_id,tech_id,job_number,address,screenshot_id,photo_ids,status,submitted_at,reviewed_at,review_note,catalyst_failures,correction_deadline_at,trust_upload_status,trust_uploaded_at,trust_external_reference,catalyst_observation_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,id,tenantId,technicians[i%3].techId,String(990101+i),'123 Example Lane — DEMO ONLY',ids[0],JSON.stringify(ids.slice(1)),status,submitted,status==='pending'?null:submitted+60000,status==='rejected'?'Please terminate the unused ports.':i===4?'Approved. Keep the cables neatly secured on your next job.':null,status==='rejected'?JSON.stringify([{code:'TQA4',reason:'Unused ports terminated / NAP ports closed'}]):null,status==='rejected'?Date.now()+48*3600000:null,uploaded?'uploaded':'ready',uploaded?submitted+120000:null,uploaded?'demo-only':null,uploaded?'After the Fact':null));
  }
  return {statements,pictures,technicians};
 }catch(error){if(pictures.length)await env.BUCKET.delete(pictures.map(id=>`captures/${id}`));throw error;}
}
