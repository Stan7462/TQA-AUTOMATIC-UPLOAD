"use client";
import { useEffect, useState } from "react";
import { Bell, Smartphone, Clock, CircleAlert, Target } from "lucide-react";
import { loadOneSignal, reportPushDevice, pushOriginSupported, type OneSignalSdk } from "@/lib/onesignal-client";

type Preferences = { enabled: boolean; rejected: boolean; deadline: boolean; overdue: boolean; monthly: boolean; supervisorSummary: boolean; escalation: boolean };
type Config = { appId: string; configured: boolean; sendingEnabled: boolean; account: Preferences & { externalId: string } };
const options = [
  ["rejected", "QC rejected · Immediate", "Job 776499 rejected: TAP ports aren’t visible. You have 72 hours to fix it."],
  ["deadline", "Deadline approaching", "Included in the 8 AM summary: Job 776499—35 hours left to fix."],
  ["overdue", "QC overdue", "Included in the 8 AM summary: Job 776499—overdue."],
  ["monthly", "Monthly goal reminder", "You have 3 of 5 approved QCs. Monthly deadline is approaching."],
] as const;

export default function NotificationSettings({ supervisor, embedded = false }: { supervisor: boolean; embedded?: boolean }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [prefs, setPrefs] = useState<Preferences>({ enabled: false, rejected: true, deadline: true, overdue: true, monthly: true, supervisorSummary: true, escalation: true });
  const [sdk, setSdk] = useState<OneSignalSdk | null>(null);
  const [busy, setBusy] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [https, setHttps] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const result = await response.json() as Config;
      if (!response.ok || !result.account) throw new Error("Sign in to manage notifications.");
      if (!active) return;
      setConfig(result);
      setPrefs({ enabled: Boolean(result.account.enabled), rejected: Boolean(result.account.rejected), deadline: Boolean(result.account.deadline), overdue: Boolean(result.account.overdue), monthly: Boolean(result.account.monthly), supervisorSummary: Boolean(result.account.supervisorSummary), escalation: Boolean(result.account.escalation) });
      setHttps(pushOriginSupported());
      if (pushOriginSupported()) {
        const service = await loadOneSignal(result.appId);
        await service.login(result.account.externalId);
        const selected = await reportPushDevice(service);
        if (active) { setSdk(() => service); setDeviceEnabled(Boolean(selected && service.User.PushSubscription.optedIn)); }
      }
    }
    void load().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load notification settings."); });
    return () => { active = false; };
  }, []);
  async function save(next: Preferences) {
    const response = await fetch("/api/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(supervisor ? next : { enabled: next.enabled }) });
    if (!response.ok) throw new Error("Could not save notification settings. Try again.");
    setPrefs(next);
  }
  async function subscribe() {
    if (!sdk) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!sdk.Notifications.isPushSupported()) throw new Error("On iPhone, add this app to your Home Screen, open it from there, and try again.");
      await sdk.Notifications.requestPermission();
      if (!sdk.Notifications.permission) throw new Error("Notifications were not allowed. Enable them in your phone's notification settings and try again.");
      await sdk.User.PushSubscription.optIn();
      // Token registration can finish after optIn resolves, especially on iPhone.
      for (let attempt = 0; attempt < 40 && (!sdk.User.PushSubscription.optedIn || !sdk.User.PushSubscription.id); attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
      if (!sdk.User.PushSubscription.optedIn || !sdk.User.PushSubscription.id) throw new Error("The device did not subscribe. Please try again.");
      await save({ ...prefs, enabled: true });
      await reportPushDevice(sdk, true);
      setDeviceEnabled(true); setNotice(supervisor ? "This device is subscribed to QC notifications." : "This is now your active phone. Your previous phone will no longer receive QC notifications.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not subscribe."); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setError(""); setNotice("");
    try { await save({ ...prefs, enabled: false }); await sdk?.User.PushSubscription.optOut(); if(sdk) await reportPushDevice(sdk); setDeviceEnabled(false); setNotice("QC notifications are paused for your account."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not pause notifications."); }
    finally { setBusy(false); }
  }
  async function savePreferences() {
    setBusy(true); setError(""); setNotice("");
    try { await save(prefs); setNotice("Notification preferences saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save preferences."); }
    finally { setBusy(false); }
  }
  return <section className={`qc-pin-panel settings-panel notification-settings${embedded ? " notification-embedded" : ""}`}>
    <div className="notification-heading"><div className="notification-icon"><Bell size={24}/></div><div><h2>QC notifications</h2><p>{supervisor ? "Manage alerts for your team and this device." : "Stay on top of QC fixes and monthly deadlines."}</p></div><span className={`notification-device-status${deviceEnabled ? " subscribed" : ""}`}>{deviceEnabled ? "Device connected" : "Not connected"}</span></div>
    <div className="notification-device"><Smartphone size={22}/><div><h3>Connect your phone</h3><p>Add the app to your Home Screen in Safari. Open it from that icon, then tap Enable notifications and choose Allow.</p></div></div>
    {!https ? <div className="notification-preview">Local preview · Phone notifications will be available on the live HTTPS app.</div> : config && !config.sendingEnabled && <div className="notification-preview">Notification delivery has not been activated yet.</div>}
    {!supervisor && <p>Only one phone receives your QC notifications. Enabling notifications here replaces your previous phone.</p>}
    <div className="notification-actions"><button className="button dark" disabled={!sdk || busy} onClick={() => void subscribe()}><Bell size={16}/>{busy ? "Working…" : "Enable notifications"}</button>{supervisor && <button className="button light" disabled={!config || busy || !prefs.enabled} onClick={() => void disable()}>Pause my notifications</button>}</div>
    {supervisor ? <><div className="notification-section-head"><h3>Technician alerts</h3><p>Choose which alerts your company&apos;s technicians receive.</p></div><div className="notification-options">{options.map(([key, label, example], index) => {
      const Icon = [CircleAlert, Clock, CircleAlert, Target][index];
      return <label className="notification-option" key={key}><Icon size={20}/><span><strong>{label}</strong><small>{example}</small></span><input type="checkbox" role="switch" checked={prefs[key]} disabled={busy || !config} onChange={event => setPrefs(p => ({ ...p, [key]: event.target.checked }))}/></label>;
    })}</div><div className="notification-footer"><p>Technicians receive one combined morning summary, with the nearest deadlines first. QC rejection alerts arrive immediately. Approaching-deadline and overdue alerts arrive at 8:00 AM Central time, using the current time left. Approaching-deadline warnings start when 48 hours or less remain. Fixed QCs stop correction reminders. Monthly goal reminders arrive at 8:00 AM Central time, six and five days before the fiscal deadline on the 21st, if the technician has not met their goal.</p><button className="button light" disabled={busy || !config} onClick={() => void savePreferences()}>Save team alert settings</button></div><div className="notification-section-head"><h3>Your supervisor alerts</h3><p>These settings apply to your account.</p></div>{([['supervisorSummary','Morning team summary','8 AM: QCs to review, overdue corrections, and technicians below goal—including those with zero approved QCs.'],['escalation','Unresolved QC escalation','8 AM: follow up when a correction remains overdue for at least another 24 hours.']] as const).map(([key,label,description])=><label className="notification-option" key={key}><Bell size={20}/><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" role="switch" checked={prefs[key]} disabled={busy||!config} onChange={e=>setPrefs(p=>({...p,[key]:e.target.checked}))}/></label>)}<button className="button light" disabled={busy||!config} onClick={()=>void savePreferences()}>Save my alert settings</button><div className="notification-supervisor-note"><h3>Your upload alerts</h3><p>Open a technician&apos;s Notification settings in <a href="/settings#technicians-settings">Settings → Technicians</a> to choose whose submissions you monitor.</p></div></> : <div className="notification-supervisor-note"><h3>Alerts managed by your supervisor</h3><p>Your supervisor selects QC and deadline alerts for your team. Once connected, you will receive the alerts enabled for your company.</p></div>}
    <details className="notification-supervisor-note"><summary>Example notifications</summary><div className="notification-option"><Bell size={20}/><span><strong>Technician · 8:00 AM</strong><small>2 jobs need fixing: Job 776499—17 hours left to fix; Job 824082—35 hours left to fix. You have 4 of 5 approved QCs. Monthly deadline: the 21st.</small></span></div><div className="notification-option"><Bell size={20}/><span><strong>Supervisor · 8:00 AM</strong><small>3 QCs need review; 2 corrections overdue; 4 technicians below goal (1 with zero approved QCs).</small></span></div><div className="notification-option"><Bell size={20}/><span><strong>Supervisor · Immediate correction alert</strong><small>Tech 7462 resubmitted Job 776499—attempt 2 is ready for review.</small></span></div></details>
    {notice && <p className="qc-notice" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
