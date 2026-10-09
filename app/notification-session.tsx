"use client";
import { useEffect } from "react";
import { loadOneSignal, reportPushDevice, pushOriginSupported } from "@/lib/onesignal-client";

// Rebind the device after account changes; public login pages detach previous users.
export default function NotificationSession() {
  useEffect(() => {
    if (!pushOriginSupported()) return;
    let cancelled = false;
    async function sync() {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { appId: string; account: { externalId: string; enabled: boolean } | null };
      const sdk = await loadOneSignal(data.appId);
      if (cancelled) return;
      if (data.account) {
        await sdk.login(data.account.externalId);
        await reportPushDevice(sdk);
        if (!data.account.enabled) await sdk.User.PushSubscription.optOut();
      } else {
        await sdk.User.PushSubscription.optOut();
        await sdk.logout();
      }
    }
    void sync().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return null;
}
