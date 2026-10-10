"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, MapPin, Bell, Check, ArrowRight, Smartphone } from "lucide-react";
import { loadOneSignal, pushOriginSupported, reportPushDevice, type OneSignalSdk } from "@/lib/onesignal-client";
import { allPermissionsEnabled, cameraPermission, enableCamera, enableLocation, notificationPermission, permissionState, type RequiredPermissions } from "@/lib/required-permissions";

const steps = [
  { key: "camera" as const, label: "Camera", text: "Take clear, live pictures of your work.", instruction: "Tap Continue, then choose Allow when your phone asks to use the camera.", Icon: Camera },
  { key: "location" as const, label: "Location", text: "Save the location of each QC.", instruction: "Choose Allow for location access. Keep Location Services turned on.", Icon: MapPin },
  { key: "notifications" as const, label: "Notifications", text: "Know when a QC needs fixing or a deadline is near.", instruction: "Choose Allow for notifications. This phone will replace your previous notification phone.", Icon: Bell },
];
export default function PermissionSetup({ techId, children, preview = false }: { techId: string; children: ReactNode; preview?: boolean }) {
  const [permissions, setPermissions] = useState<RequiredPermissions>({ camera: false, location: false, notifications: false });
  const [checked, setChecked] = useState(preview);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [needsInstall, setNeedsInstall] = useState(false);
  const cameraVerified = useRef(false);
  const refreshing = useRef(false);
  const enabling = useRef(false);
  const sdk = useRef<OneSignalSdk | null>(null);
  const refresh = useCallback(async () => {
    if (preview || refreshing.current || enabling.current) return;
    refreshing.current = true;
    try {
      const [camera, location, notifications] = await Promise.all([cameraPermission(cameraVerified.current), permissionState("geolocation"), notificationPermission().catch(() => false)]);
      cameraVerified.current = camera;
      setPermissions(previous => ({ camera, location: location === null ? previous.location : location === "granted", notifications }));
      setChecked(true);
    } finally { refreshing.current = false; }
  }, [preview]);
  useEffect(() => {
    if (preview) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setNeedsInstall(ios && !window.matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & {standalone?: boolean}).standalone);
    void refresh();
    // Initialize ahead of the button tap so the native prompt retains its user gesture.
    if (pushOriginSupported()) void (async () => {
      const response = await fetch("/api/notifications", {cache:"no-store"});
      const data = await response.json() as {appId:string;account:{externalId:string}|null;configured:boolean;sendingEnabled:boolean};
      if (response.ok && data.account && data.configured && data.sendingEnabled) {
        const service = await loadOneSignal(data.appId);
        await service.login(data.account.externalId);
        sdk.current = service;
      }
    })().catch(() => undefined);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh, preview]);
  const ready = allPermissionsEnabled(permissions);
  const completed = steps.filter(step => permissions[step.key]).length;
  const next = steps.find(step => !permissions[step.key]);
  async function continueSetup() {
    if (!next || busy) return;
    enabling.current = true;
    setBusy(next.key); setError("");
    try {
      if (!preview) {
        if (next.key === "camera") { await enableCamera(); cameraVerified.current = true; }
        else if (next.key === "location") await enableLocation();
        else {
          if (!pushOriginSupported()) throw new Error("Push notifications need the HTTPS app. Local preview shows the design only.");
          const service = sdk.current;
          if (!service) throw new Error("Notifications are still connecting. Check your internet connection and try again.");
          if (!service.Notifications.isPushSupported()) throw new Error("Open this app from your Home Screen to enable notifications on iPhone.");
          await service.Notifications.requestPermission();
          if (!service.Notifications.permission) throw new Error("Notifications are blocked. Open your phone's notification settings, allow notifications for this app, then return here.");
          await service.User.PushSubscription.optIn();
          for (let i=0;i<40 && (!service.User.PushSubscription.optedIn || !service.User.PushSubscription.id);i++) await new Promise(resolve=>setTimeout(resolve,250));
          if (!service.User.PushSubscription.optedIn || !service.User.PushSubscription.id) throw new Error("Your phone has not finished subscribing. Try again.");
          const response = await fetch("/api/notifications", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:true})});
          if (!response.ok) throw new Error("Could not save your notification connection. Try again.");
          await reportPushDevice(service,true);
        }
      }
      setPermissions(previous=>({...previous,[next.key]:true}));
    } catch (cause) {
      setError(next.key === "notifications" && cause instanceof Error ? cause.message : `Could not enable ${next.label.toLowerCase()}. In Safari, open the page menu → Website Settings and allow ${next.label.toLowerCase()} access. On Android, open your browser's site permissions. ${next.key === "location" ? "Also turn on your phone's Location Services." : ""} Then return here and try again.`);
    } finally {enabling.current = false;setBusy("");}
  }
  if (ready) return <>{children}</>;
  return <main className="management-page login-dark guided-setup"><div className="management-head"><span className="kicker">TECH {techId}</span><h1>Let’s set up your phone</h1><p>Three quick permissions, then you’re ready to submit QCs.</p></div><section className="settings-panel required-permissions guided-permissions">
    {preview && <div className="setup-preview-label">Local design preview · taps simulate permissions</div>}
    <div className="setup-progress"><strong>{completed} of 3 ready</strong><span>{checked ? "We’ll only ask for permissions that are missing." : "Checking your phone…"}</span></div>
    <div className="setup-progress-track" role="progressbar" aria-label="Phone setup progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={completed}><span style={{width:`${completed/3*100}%`}}/></div>
    {needsInstall && <div className="setup-install"><Smartphone size={24}/><div><strong>First, add the app to your Home Screen</strong><p>In Safari, tap Share → Add to Home Screen → Add. Open the new app icon, sign in, and continue setup there.</p></div></div>}
    <ol className="setup-steps">{steps.map(({key,label,text,Icon},i)=><li className={`required-permission-row${permissions[key] ? " completed" : next?.key===key ? " current" : ""}`} key={key}><span className="setup-step-icon">{permissions[key] ? <Check size={22}/> : <Icon size={22}/>}</span><div><strong>{label}</strong><p>{text}</p></div><span className="setup-step-state">{permissions[key] ? "Ready" : next?.key===key ? "Up next" : `Step ${i+1}`}</span></li>)}</ol>
    {next && <div className="setup-next"><strong>{checked ? `Next: allow ${next.label.toLowerCase()}` : "Checking existing permissions"}</strong><p>{next.instruction}</p></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button dark setup-continue" disabled={!!busy || !checked || needsInstall} onClick={()=>void continueSetup()}>{busy ? "Waiting for permission…" : completed===0 ? "Set up my phone" : "Continue setup"}<ArrowRight size={19}/></button>
    <div className="setup-footer"><button type="button" disabled={!!busy} onClick={()=>void refresh()}>Check permissions again</button><a href="/api/owner/logout">Sign out</a></div>
    <p className="setup-footnote">Your phone controls these permissions. Once all three are enabled, your QC page opens automatically.</p>
  </section></main>;
}
