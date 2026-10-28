import { notFound } from "next/navigation";
import PermissionSetup from "@/app/capture/permission-setup";
export const dynamic = "force-dynamic";
export default function PhoneSetupPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PermissionSetup techId="TEST02" preview><main className="management-page login-dark"><div className="management-head"><h1>You’re ready!</h1><p>The QC submission page opens here. Camera access is requested when you open the camera, and location when you take your first photo.</p><a className="button light" href="/preview/phone-setup">Try setup again</a></div></main></PermissionSetup>;
}
