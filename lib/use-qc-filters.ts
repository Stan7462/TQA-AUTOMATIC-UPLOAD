"use client";
import { useEffect, useState } from "react";
export type QcFilters = { month: string; tech: string; status: string; search: string };
export function useQcFilters(key: string, initialStatus = "all") {
  const [filters, setFilters] = useState<QcFilters>({ month: "", tech: "", status: initialStatus, search: "" });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (saved) setFilters({ month: /^\d{4}-\d{2}$/.test(saved.month) ? saved.month : "", tech: typeof saved.tech === "string" ? saved.tech : "", search: typeof saved.search === "string" ? saved.search : "", status: ["all", "pending", "approved", "rejected", "uploaded"].includes(saved.status) ? saved.status : initialStatus });
    } catch { /* Storage is optional. */ }
    setReady(true);
  }, [key, initialStatus]);
  useEffect(() => { if (ready) { try { sessionStorage.setItem(key, JSON.stringify(filters)); } catch { /* Storage is optional. */ } } }, [key, filters, ready]);
  return { filters, setFilters, ready };
}
