'use client';
import {useEffect,useState} from 'react';
import {Images,Download} from 'lucide-react';
export default function CatalystUploadSettings({extensionVersion}:{extensionVersion:string}){
  const [included,setIncluded]=useState(true),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/catalyst-settings',{cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json() as {includeScreenshot?:boolean;error?:string};
      if(!response.ok||typeof data.includeScreenshot!=='boolean')throw Error(data.error||'Could not load upload settings.');
      setIncluded(data.includeScreenshot);setLoaded(true);
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});
    return()=>controller.abort();
  },[]);
  async function change(value:boolean){
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/catalyst-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({includeScreenshot:value})});
      const data=await response.json() as {includeScreenshot?:boolean;error?:string};
      if(!response.ok||typeof data.includeScreenshot!=='boolean')throw Error(data.error||'Could not save upload settings.');
      setIncluded(data.includeScreenshot);setNotice('Upload setting saved.');
    }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
  }
  return <section id="catalyst-settings" className="qc-pin-panel settings-panel notification-settings">
    <div className="settings-section-title"><Images size={21}/><h2>Catalyst uploads</h2></div>
    <div className="catalyst-extension-download">
      <h3>Chrome extension <small>v{extensionVersion}</small></h3>
      <a className="button light" href="/api/extension/download" download><Download size={17}/>Download latest extension</a>
      <p>Unzip the download. In Chrome, open <b>chrome://extensions</b>, enable Developer mode, and choose <b>Load unpacked</b>. Select the extracted folder. To update, replace the files in your existing extension folder and click Reload in Chrome.</p>
    </div>
    <p>Choose which pictures your company sends to Catalyst.</p>
    <div className="notification-options"><label className="notification-option"><Images size={20}/><span><strong>Include account screenshots</strong><small>Upload the technician&apos;s account screenshot along with the live QC photos. Turn off to upload only the live photos.</small></span><input type="checkbox" role="switch" aria-label="Include account screenshots" checked={included} disabled={!loaded||busy} onChange={event=>void change(event.target.checked)}/></label></div>
    <p>Screenshots stay in the app for review and address/job number extraction. This setting applies to all technicians in your company, including failed QCs and approved corrections.</p>
    <p>Change this before starting uploads, then refresh the extension queue. Already uploaded pictures are kept.</p>
    {busy&&<p role="status">Saving…</p>}{notice&&<p className="qc-notice" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
  </section>;
}
