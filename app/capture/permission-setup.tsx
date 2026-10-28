"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, ArrowRight, Smartphone } from "lucide-react";
import { loadOneSignal, pushOriginSupported, reportPushDevice, type OneSignalSdk } from "@/lib/onesignal-client";
import { notificationSetupHandled, rememberNotificationSetup } from "@/lib/notification-onboarding";

export default function PermissionSetup({ techId, tenantId = "default", children, preview = false }: { techId: string; tenantId?: string; children: ReactNode; preview?: boolean }) {
  const [checked, setChecked] = useState(preview);
  const [handled, setHandled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(preview);
  const [error, setError] = useState("");
  const [needsInstall, setNeedsInstall] = useState(false);
  const sdk = useRef<OneSignalSdk | null>(null);
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    const finish = () => { if (!cancelled) { setHandled(true); setChecked(true); } };
    if (notificationSetupHandled(tenantId, techId) || !pushOriginSupported() || (typeof Notification !== "undefined" && Notification.permission === "denied")) {
      finish();
      return;
    }
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setNeedsInstall(ios && !window.matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & {standalone?: boolean}).standalone);
    setChecked(true);
    // Prepare the SDK before the tap so the native prompt retains its user gesture.
    void (async () => {
      const response = await fetch("/api/notifications", {cache:"no-store"});
      const data = await response.json() as {appId:string;account:{externalId:string;enabled:boolean}|null;configured:boolean;sendingEnabled:boolean};
      if (!response.ok) throw new Error("Notifications could not connect. You can continue and enable them later in Notification settings.");
      if (!data.account || !data.configured || !data.sendingEnabled) { finish(); return; }
      const service = await loadOneSignal(data.appId);
      if (cancelled) return;
      await service.login(data.account.externalId);
      if (cancelled) return;
      sdk.current = service;
      if (data.account.enabled && service.Notifications.permission && service.User.PushSubscription.optedIn && await reportPushDevice(service)) {
        rememberNotificationSetup(tenantId, techId);
        finish();
      } else if (!cancelled) setConnected(true);
    })().catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Notifications could not connect. You can enable them later in Notification settings."); });
    return () => { cancelled = true; };
  }, [preview, tenantId, techId]);
  function continueToQc() {
    if (!preview) rememberNotificationSetup(tenantId, techId);
    setHandled(true);
  }
  async function enableNotifications() {
    if (busy) return;
    if (preview) { setHandled(true); return; }
    const service = sdk.current;
    if (!service) return;
    setBusy(true); setError("");
    try {
      if (!service.Notifications.isPushSupported()) throw new Error("Open this app from your Home Screen to enable notifications on iPhone, or continue for now.");
      // Remember the native prompt even when dismissed or denied. Only an explicit
      // action in Notification settings should ask again on a later visit.
      rememberNotificationSetup(tenantId, techId);
      if (!service.Notifications.permission) await service.Notifications.requestPermission();
      if (!service.Notifications.permission) { setHandled(true); return; }
      await service.User.PushSubscription.optIn();
      for (let i=0;i<40 && (!service.User.PushSubscription.optedIn || !service.User.PushSubscription.id);i++) await new Promise(resolve=>setTimeout(resolve,250));
      if (!service.User.PushSubscription.optedIn || !service.User.PushSubscription.id) throw new Error("Your phone has not finished subscribing. Continue for now and reconnect from Notification settings.");
      const response = await fetch("/api/notifications", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:true})});
      if (!response.ok) throw new Error("Could not save your notification connection. You can reconnect from Notification settings.");
      await reportPushDevice(service,true);
      setHandled(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect notifications. You can continue for now."); }
    finally { setBusy(false); }
  }
  if (handled) return <>{children}</>;
  if (!checked) return <main className="management-page login-dark"><p role="status">Checking notification settings…</p></main>;
  return <main className="management-page login-dark guided-setup"><div className="management-head"><span className="kicker">TECH {techId}</span><h1>Stay up to date</h1><p>Get notified when a QC needs fixing or a deadline is near.</p></div><section className="settings-panel required-permissions guided-permissions">
    {preview && <div className="setup-preview-label">Local design preview · taps simulate permissions</div>}
    <div className="required-permission-row current"><span className="setup-step-icon"><Bell size={22}/></span><div><strong>QC notifications</strong><p>Only this phone will receive your QC alerts. Connecting it replaces your previous notification phone.</p></div></div>
    {needsInstall && <div className="setup-install"><Smartphone size={24}/><div><strong>Add the app to your Home Screen for notifications</strong><p>In Safari, tap Share → Add to Home Screen → Add. Open the new app icon to enable notifications, or continue for now.</p></div></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button dark setup-continue" disabled={busy || !connected || needsInstall} onClick={()=>void enableNotifications()}>{busy ? "Connecting…" : "Enable notifications"}<ArrowRight size={19}/></button>
    <div className="setup-footer"><button type="button" disabled={busy} onClick={continueToQc}>Not now — continue to QCs</button></div>
    <p className="setup-footnote">You can change notifications later in Notification settings. Camera access is requested when you open the camera; location is requested when you take your first photo.</p>
  </section></main>;
}
