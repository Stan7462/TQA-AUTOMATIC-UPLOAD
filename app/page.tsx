import { requireChatGPTUser } from "./chatgpt-auth";
import { isOwner } from "./access";
import ReviewWorkspace from "./review-workspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  if (!isOwner(user)) {
    return <main className="access-message"><h1>Review access is restricted</h1><p>This workspace is available only to its owner.</p><a href="/capture">Open camera capture</a></main>;
  }
  return <ReviewWorkspace />;
}
