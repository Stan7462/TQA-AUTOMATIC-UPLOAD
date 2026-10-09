"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Camera, MapPin, Bell, Check } from "lucide-react";
import NotificationSettings from "@/app/notifications/settings";
import { allPermissionsEnabled, enableCamera, enableLocation, notificationPermission, permissionState, type RequiredPermissions } from "@/lib/required-permissions";

export default function PermissionSetup({ techId, children }: { techId: string; children: ReactNode }) {
  const [permissions, setPermissions] = useState<RequiredPermissions>({ camera: false, location: false, notifications: false });
  const [checked, setChecked] = useState(false);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const refresh = useCallback(async () => {
    const [camera, location, notifications] = await Promise.all([permissionState("camera"), permissionState("geolocation"), notificationPermission().catch(() => false)]);
    setPermissions(previous => ({ camera: camera === null ? previous.camera : camera === "granted", location: location === null ? previous.location : location === "granted", notifications }));
    setChecked(true);
  }, []);
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);
  async function enable(kind: "camera" | "location") {
    setBusy(kind); setError("");
    try {
      await (kind === "camera" ? enableCamera() : enableLocation());
      setPermissions(previous => ({ ...previous, [kind]: true }));
    } catch { setError(`Could not enable ${kind}. Allow access in your browser or phone settings, then try again.${kind === "location" ? " Make sure Location Services are on and try where GPS is available." : ""}`); }
    finally { setBusy(""); }
  }
  const ready = allPermissionsEnabled(permissions);
  return <>
    {started && <div hidden={!ready}>{children}</div>}
    {(!started || !ready) && <main className="management-page login-dark"><div className="management-head"><span className="kicker">TECH {techId}</span><h1>Set up your phone</h1><p>Camera, location, and notifications must all be enabled before you can submit a QC.</p></div><section className="settings-panel required-permissions">
      {[{ key: "camera" as const, label: "Camera", text: "Take live QC pictures.", Icon: Camera }, { key: "location" as const, label: "Location", text: "Record where the work was completed.", Icon: MapPin }, { key: "notifications" as const, label: "Push notifications", text: "Receive rejection and deadline alerts.", Icon: Bell }].map(({ key, label, text, Icon }) => <div className="required-permission-row" key={key}><Icon size={24}/><div><strong>{label}</strong><p>{text}</p></div>{permissions[key] ? <span className="required-permission-ready"><Check size={16}/>Enabled</span> : <button className="button light" disabled={!!busy || !checked} onClick={() => key === "notifications" ? setNotificationOpen(true) : void enable(key)}>{busy === key ? "Checking…" : "Enable"}</button>}</div>)}
      {notificationOpen && <NotificationSettings supervisor={false}/>}
      <p>On iPhone, add this app to your Home Screen using Safari, then open that icon to enable push notifications. Local preview cannot register push notifications.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="notification-actions"><button className="button light" onClick={() => void refresh()}>Check permissions again</button><button className="button dark" disabled={!ready} onClick={() => setStarted(true)}>Continue to QC</button><a className="button light" href="/api/owner/logout">Sign out</a></div>
    </section></main>}
  </>;
}
