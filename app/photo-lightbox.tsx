"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type OpenPhoto = { src: string; label: string };

export default function PhotoLightbox() {
  const [photo, setPhoto] = useState<OpenPhoto | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const imageButton = useRef<HTMLButtonElement | null>(null);

  function close() {
    setPhoto(null);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }

  useEffect(() => {
    function openFromClick(event: MouseEvent) {
      if (!(event.target instanceof Element) || event.target.closest("[data-photo-lightbox]")) return;
      const action = event.target.closest("a, button");
      const image = event.target instanceof HTMLImageElement ? event.target : action?.querySelector("img");
      if (!(image instanceof HTMLImageElement) || image.closest("[data-photo-lightbox-ignore]")) return;
      const src = image.currentSrc || image.src;
      if (!src) return;
      event.preventDefault();
      event.stopPropagation();
      trigger.current = (action || image) as HTMLElement;
      setPhoto({ src, label: image.alt || action?.getAttribute("aria-label")?.replace(/^Enlarge /, "") || "Photo" });
    }
    document.addEventListener("click", openFromClick, true);
    return () => document.removeEventListener("click", openFromClick, true);
  }, []);

  useEffect(() => {
    if (!photo) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        if (event.shiftKey && document.activeElement === closeButton.current) { event.preventDefault(); imageButton.current?.focus(); }
        else if (!event.shiftKey && document.activeElement === imageButton.current) { event.preventDefault(); closeButton.current?.focus(); }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = priorOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [photo]);

  if (!photo) return null;
  return <div className="qc-lightbox" data-photo-lightbox role="dialog" aria-modal="true" aria-label={`Enlarged ${photo.label}`} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="qc-lightbox-top"><div><strong>{photo.label}</strong><span>Tap the picture again to return.</span></div><button ref={closeButton} type="button" onClick={close} aria-label="Close enlarged picture"><X size={24}/></button></div>
    <button ref={imageButton} className="qc-lightbox-image" type="button" onClick={close} aria-label="Return to previous view"><img src={photo.src} alt={photo.label}/></button>
  </div>;
}
