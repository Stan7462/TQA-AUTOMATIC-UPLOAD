"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- vinext's client Link router currently throws in production; native links keep admin navigation reliable. */
import { useCallback, useEffect, useState } from "react";
import { Archive, ClipboardCheck, Database, Settings2 } from "lucide-react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export default function AdminNav({ active }: { active: "records" | "approvals" | "history" | "settings" }) {
  const [pendingCount, setPendingCount] = useState(0);
  const loadPendingCount = useCallback(async (signal?: AbortSignal) => {
    try {
      const range = fiscalMonthBounds(fiscalMonthKey());
      const response = await fetch(`/api/qc-submissions?status=pending&start=${range.start}&end=${range.end}`, { cache: "no-store", signal });
      const result = await response.json() as { counts?: { pending?: number } };
      if (response.ok && !signal?.aborted) setPendingCount(result.counts?.pending ?? 0);
    } catch { /* Keep the previous count if a background refresh fails. */ }
  }, []);
  useEffect(() => { const controller = new AbortController(); void loadPendingCount(controller.signal); return () => controller.abort(); }, [loadPendingCount]);
  useAutoRefresh(loadPendingCount);
  return <nav className="admin-nav" aria-label="Admin pages">
    <a href="/" className={active === "records" ? "active" : ""} aria-current={active === "records" ? "page" : undefined}><Database size={17}/> All data</a>
    <a href="/captures?queue=pending" className={active === "approvals" ? "active" : ""} aria-current={active === "approvals" ? "page" : undefined}><ClipboardCheck size={17}/> QC approvals{pendingCount > 0 && <span className="admin-notification-badge" aria-label={`${pendingCount} QCs need review`}>{pendingCount > 99 ? "99+" : pendingCount}</span>}</a>
    <a href="/history" className={active === "history" ? "active" : ""} aria-current={active === "history" ? "page" : undefined}><Archive size={17}/> QC History</a>
    <a href="/api/owner/logout">Sign out</a>
    <a href="/settings" className={active === "settings" ? "active" : ""} aria-current={active === "settings" ? "page" : undefined}><Settings2 size={17}/> Settings</a>
  </nav>;
}
