export type OneSignalSdk = {
  init(options: Record<string, unknown>): Promise<void>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;
  Notifications: { permission: boolean; isPushSupported(): boolean; requestPermission(): Promise<void> };
  User: { PushSubscription: { optedIn: boolean; optIn(): Promise<void>; optOut(): Promise<void> } };
};
declare global {
  interface Window { OneSignalDeferred?: ((sdk: OneSignalSdk) => void)[]; }
}
let loading: Promise<OneSignalSdk> | null = null;

export function loadOneSignal(appId: string): Promise<OneSignalSdk> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Notification service could not load. Check your connection and try again.")), 15000);
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async sdk => {
      try {
        await sdk.init({ appId, serviceWorkerPath: "OneSignalSDKWorker.js", notifyButton: { enable: false }, promptOptions: { slidedown: { prompts: [{ type: "push", autoPrompt: false }] } } });
        window.clearTimeout(timer); resolve(sdk);
      } catch { window.clearTimeout(timer); reject(new Error("Notifications are not configured for this website yet.")); }
    });
    const script = document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.defer = true;
    script.onerror = () => { window.clearTimeout(timer); reject(new Error("Could not load the notification service.")); };
    document.head.appendChild(script);
  });
  return loading;
}

export function pushOriginSupported() { return location.protocol === "https:"; }

export async function reportPushDevice(sdk: OneSignalSdk) {
  const status=!sdk.Notifications.isPushSupported()?"unsupported":typeof Notification!=="undefined"&&Notification.permission==="denied"?"blocked":sdk.User.PushSubscription.optedIn?"connected":"not_subscribed";
  await fetch("/api/notifications/device",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})}).catch(()=>undefined);
}
