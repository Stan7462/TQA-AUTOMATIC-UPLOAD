import { loadOneSignal, reportPushDevice, pushOriginSupported } from "./onesignal-client";

export type RequiredPermissions = { camera: boolean; location: boolean; notifications: boolean };
export const allPermissionsEnabled = (value: RequiredPermissions) => value.camera && value.location && value.notifications;

export async function permissionGranted(name: string): Promise<boolean> {
  return await permissionState(name) === "granted";
}

export async function permissionState(name: string): Promise<PermissionState | null> {
  try { return (await navigator.permissions.query({ name: name as PermissionName })).state; }
  catch { return null; }
}

export async function enableCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    stream.getTracks().forEach(track => track.stop());
    rememberCameraSetup(true);
  } catch (error) {
    rememberCameraSetup(false);
    throw error;
  }
}

const cameraSetupKey = "tqa.camera-setup.v1";
function rememberCameraSetup(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(cameraSetupKey, "enabled");
    else localStorage.removeItem(cameraSetupKey);
  } catch { /* Access still works when browser storage is unavailable. */ }
}

export async function cameraPermission(alreadyVerified = false): Promise<boolean> {
  const state = await permissionState("camera");
  if (state === "granted") { rememberCameraSetup(true); return true; }
  if (state === "denied") { rememberCameraSetup(false); return false; }
  // Safari may report prompt or not support camera queries even after access
  // succeeded. Revalidate remembered setup with the real camera on reopening.
  if (alreadyVerified) return true;
  try { if (localStorage.getItem(cameraSetupKey) !== "enabled") return false; }
  catch { return false; }
  try { await enableCamera(); return true; }
  catch { return false; }
}

export async function enableLocation() {
  await new Promise<void>((resolve, reject) => navigator.geolocation.getCurrentPosition(() => resolve(), reject, { timeout: 15000, maximumAge: 60000 }));
}

export async function notificationPermission() {
  if (!pushOriginSupported()) return false;
  const response = await fetch("/api/notifications", { cache: "no-store" });
  const config = await response.json() as { appId: string; configured: boolean; sendingEnabled: boolean; account: { enabled: boolean; externalId: string } | null };
  if (!response.ok || !config.account || !config.configured || !config.sendingEnabled) return false;
  const sdk = await loadOneSignal(config.appId);
  await sdk.login(config.account.externalId);
  await reportPushDevice(sdk);
  return Boolean(config.account.enabled && sdk.Notifications.permission && sdk.User.PushSubscription.optedIn);
}

export async function verifySubmissionPermissions(): Promise<boolean> {
  // Recheck access before uploading; no remembered local flag can bypass this gate.
  await enableCamera();
  if (!await permissionGranted("geolocation")) await enableLocation();
  return notificationPermission();
}
