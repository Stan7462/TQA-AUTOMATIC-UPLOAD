import { ClipboardCheck, Database, Settings2 } from "lucide-react";

export default function AdminNav({ active }: { active: "records" | "approvals" | "settings" }) {
  return <nav className="admin-nav" aria-label="Admin pages">
    <a href="/" className={active === "records" ? "active" : ""} aria-current={active === "records" ? "page" : undefined}><Database size={17}/> All data</a>
    <a href="/captures" className={active === "approvals" ? "active" : ""} aria-current={active === "approvals" ? "page" : undefined}><ClipboardCheck size={17}/> QC approvals</a>
    <a href="/api/owner/logout">Sign out</a>
    <a href="/settings" className={active === "settings" ? "active" : ""} aria-current={active === "settings" ? "page" : undefined}><Settings2 size={17}/> Settings</a>
  </nav>;
}
