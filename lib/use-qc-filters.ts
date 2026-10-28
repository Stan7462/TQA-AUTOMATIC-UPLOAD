"use client";
import {normalizeUploadType} from "@/lib/qc-observation-type";
import { useEffect, useState } from "react";
export type QcFilters = { month: string; tech: string; status: string; search: string; uploadType?: string };
export function useQcFilters(key: string, initialStatus = "all", persist = true) {
  const [filters, setFilters] = useState<QcFilters>({ month: "", tech: "", status: initialStatus, search: "", uploadType: "all" });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!persist) {
      setFilters({ month: "", tech: "", status: initialStatus, search: "", uploadType: "all" });
      setReady(true);
      return;
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (saved) setFilters({ uploadType: normalizeUploadType(saved.uploadType), month: /^\d{4}-\d{2}$/.test(saved.month) ? saved.month : "", tech: typeof saved.tech === "string" ? saved.tech : "", search: typeof saved.search === "string" ? saved.search : "", status: ["all", "pending", "approved", "rejected", "fixed", "uploaded"].includes(saved.status) ? saved.status : initialStatus });
    } catch { /* Storage is optional. */ }
    setReady(true);
  }, [key, initialStatus, persist]);
  useEffect(() => { if (persist && ready) { try { sessionStorage.setItem(key, JSON.stringify(filters)); } catch { /* Storage is optional. */ } } }, [key, filters, ready, persist]);
  return { filters, setFilters, ready };
}
