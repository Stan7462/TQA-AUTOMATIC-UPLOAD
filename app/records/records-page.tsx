import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import QcRecordList, { type RecordView } from "./qc-record-list";

export default async function RecordsPage({ view }: { view: RecordView }) {
  const user = await requireChatGPTUser(`/records/${view}`);
  if (!isOwner(user)) return <main className="access-message"><h1>Access restricted</h1><p>Only the site owner can view QC records.</p></main>;
  return <QcRecordList view={view}/>;
}
