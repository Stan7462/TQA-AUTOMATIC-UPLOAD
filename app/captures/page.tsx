import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import QcInbox from "./qc-inbox";

export const dynamic = "force-dynamic";

export default async function CapturesPage() {
  const user = await requireChatGPTUser("/captures");
  if (!isOwner(user)) return <main className="access-message"><h1>Access restricted</h1><p>Only the site owner can review QC submissions.</p></main>;
  return <QcInbox />;
}
