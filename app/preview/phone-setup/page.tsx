import { notFound } from "next/navigation";
import PermissionSetup from "@/app/capture/permission-setup";
export const dynamic = "force-dynamic";
export default function PhoneSetupPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PermissionSetup techId="TEST02" preview><main className="management-page login-dark"><div className="management-head"><h1>You’re ready!</h1><p>All three steps are complete. In the real app, the QC submission page opens here automatically.</p><a className="button light" href="/preview/phone-setup">Try setup again</a></div></main></PermissionSetup>;
}
