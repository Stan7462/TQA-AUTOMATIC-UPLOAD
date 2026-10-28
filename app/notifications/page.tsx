import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/local-env";
import { getTechSessionFromCookie, TECH_COOKIE } from "@/lib/tech-auth";
import { SUPER_COOKIE } from "@/lib/super-auth";
import NotificationSettings from "./settings";
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const jar = await cookies();
  const header = [TECH_COOKIE,SUPER_COOKIE].map(name=>`${name}=${jar.get(name)?.value || ""}`).join('; ');
  const session = await getTechSessionFromCookie(header, env.DB);
  if (!session) redirect("/login?return_to=%2Fnotifications");
  if (session.mustSetup) redirect("/admin-setup");
  if (session.isAdmin) redirect("/settings#notifications-settings");
  const content = <NotificationSettings supervisor={session.isAdmin}/>;
  return <main className="management-page profile-dark"><div className="management-head"><a className="back-link" href="/capture">← New QC submission</a><h1>Notifications</h1><p>Stay informed about rejected QCs and deadlines.</p></div><div className="profile-results">{content}</div></main>;
}
