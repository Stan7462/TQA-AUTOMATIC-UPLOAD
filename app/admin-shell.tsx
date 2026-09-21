import type { ReactNode } from "react";
import AdminNav from "@/app/admin-nav";

type AdminPage = "records" | "approvals" | "history" | "settings";

export default function AdminShell({ active, children }: { active: AdminPage; children: ReactNode }) {
  return <div className="app admin-dark">
    <aside className="rail" aria-label="TQA Automatic Upload"><div className="logo">T<span>Q</span></div><div className="rail-line"/><span>TQA UPLOAD</span></aside>
    <main className="workspace">
      <header className="topbar">
        <div className="top-title"><small>TQA AUTOMATIC UPLOAD</small><strong>Review workspace</strong></div>
      </header>
      <div className="workspace-nav"><AdminNav active={active}/></div>
      {children}
    </main>
  </div>;
}
