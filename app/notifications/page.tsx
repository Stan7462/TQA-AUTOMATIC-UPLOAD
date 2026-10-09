import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/local-env";
import { getTechSessionFromCookie, TECH_COOKIE } from "@/lib/tech-auth";
import AdminShell from "@/app/admin-shell";
import NotificationSettings from "./settings";
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const jar = await cookies();
  const session = await getTechSessionFromCookie(`${TECH_COOKIE}=${jar.get(TECH_COOKIE)?.value || ""}`, env.DB);
  if (!session) redirect("/login?return_to=%2Fnotifications");
  if (session.mustSetup) redirect("/admin-setup");
  const content = <NotificationSettings supervisor={session.isAdmin}/>;
  return session.isAdmin ? <AdminShell active="settings"><section className="intro"><div><h1>Notifications</h1><p>Subscribe to QC updates on this device.</p></div></section><div className="admin-page-content settings-page">{content}</div></AdminShell> : <main className="management-page profile-dark"><div className="management-head"><a className="back-link" href="/capture">← New QC submission</a><h1>Notifications</h1><p>Stay informed about rejected QCs and deadlines.</p></div><div className="profile-results">{content}</div></main>;
}
