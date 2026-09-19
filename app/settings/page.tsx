import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import TechnicianSettings from "./technician-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireChatGPTUser("/settings");
  if (!isOwner(user)) return <main className="access-message"><h1>Access restricted</h1><p>Only the site owner can manage technicians.</p></main>;
  return <TechnicianSettings />;
}
