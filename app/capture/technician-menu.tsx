"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, ChevronRight, CircleAlert, Images, List, Menu, MessageSquareText, Upload, X } from "lucide-react";

export type TechnicianQcCounts = {
  unreadFeedback: number;
  captured: number;
  allQcs: number;
  uploaded: number;
  rejected: number;
  needsCorrection: number;
  urgentRejectedAt: number | null;
};

export default function TechnicianMenu({ techId, counts, disabled, onNavigate }: {
  techId: string;
  counts: TechnicianQcCounts | null;
  disabled: boolean;
  onNavigate: (href: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const rejected = (counts?.needsCorrection ?? 0) > 0;
  const notes = (counts?.unreadFeedback ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const entries = [
    { href: "/profile?view=rejected", label: "Rejected QCs", icon: CircleAlert, count: counts?.rejected, badge: "rejected" },
    { href: "/profile?view=captured", label: "Captured QCs", icon: Images, count: counts?.captured },
    { href: "/profile?view=uploaded", label: "Uploaded to Catalyst", icon: Upload, count: counts?.uploaded },
    { href: "/profile?view=all", label: "All QCs", icon: List, count: counts?.allQcs },
    { href: "/profile?view=notes", label: "Supervisor notes", icon: MessageSquareText, count: counts?.unreadFeedback, badge: "notes" },
    { href: "/notifications", label: "Notifications", icon: Bell },
  ];

  return <div className="qc-technician-menu" ref={container} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="button light qc-menu-trigger" disabled={disabled}
      aria-expanded={open} aria-controls="qc-technician-menu-panel"
      aria-label={`Menu${rejected ? `, ${counts!.needsCorrection} QCs need fixing` : ""}${notes ? `, ${counts!.unreadFeedback} unread notes` : ""}`}
      onClick={() => setOpen(!open)} onKeyDown={event => {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); }
      }}>
      <Menu size={20} aria-hidden="true"/><span>Menu</span>
      {notes && <span className="qc-menu-notes-dot" aria-hidden="true"/>}
      {rejected && <img className="qc-menu-rejection-alert" src="/images/technician-rejection-alert.png" alt="" aria-hidden="true" data-photo-lightbox-ignore/>}
    </button>
    {open && <nav id="qc-technician-menu-panel" ref={panel} className="qc-technician-menu-panel" aria-label="My QC menu">
      <div className="qc-technician-menu-heading"><div><strong>My menu</strong><small>Tech {techId}</small></div><button type="button" aria-label="Close menu" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={20}/></button></div>
      {entries.map(entry => <a key={entry.href} href={entry.href} aria-disabled={disabled || undefined} onClick={event => {
        event.preventDefault();
        if (disabled) return;
        setOpen(false);
        void onNavigate(entry.href);
      }}>
        <entry.icon size={20} aria-hidden="true"/><span>{entry.label}</span>
        {entry.badge === "rejected" && rejected && <span className="qc-menu-rejected-dot" aria-label="Correction needed">!</span>}
        {entry.badge === "notes" && notes && <span className="qc-menu-notes-dot" aria-label="Unread notes"/>}
        {entry.href !== "/notifications" && <strong className="qc-menu-count">{entry.count ?? "—"}</strong>}
        <ChevronRight size={17} aria-hidden="true"/>
      </a>)}
    </nav>}
  </div>;
}
