import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import QcRecordList from "@/app/records/qc-record-list";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireChatGPTUser("/history");
  if (!isOwner(user)) return <main className="access-message"><h1>Access restricted</h1><p>Only the site owner can view QC history.</p></main>;
  return <QcRecordList view="all" historyMode/>;
}
