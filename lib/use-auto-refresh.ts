"use client";
import { useEffect, useRef } from "react";

// Refresh when returning to a page, and every 30 seconds while visible.
export function useAutoRefresh(refresh: (signal?: AbortSignal) => void | Promise<void>, enabled = true) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const controller = new AbortController();
    const run = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try { await latest.current(controller.signal); } finally { running = false; }
    };
    const timer = window.setInterval(() => void run(), 30_000);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", run); document.removeEventListener("visibilitychange", run); };
  }, [enabled]);
}
