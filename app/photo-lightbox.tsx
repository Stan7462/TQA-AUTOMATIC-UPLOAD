"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
type Photo = {src:string;label:string};
export default function PhotoLightbox() {
  const [gallery,setGallery]=useState<Photo[]>([]);
  const [index,setIndex]=useState(0);
  const trigger=useRef<HTMLElement|null>(null);
  const panel=useRef<HTMLDivElement|null>(null);
  const closeButton=useRef<HTMLButtonElement|null>(null);
  const touch=useRef<{x:number;y:number}|null>(null);
  const swiped=useRef(false);
  const open=gallery.length>0;
  function close(){setGallery([]);requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));}
  function step(direction:number){setIndex(i=>(i+direction+gallery.length)%gallery.length);}
  useEffect(()=>{
    const handle=(event:MouseEvent)=>{
      if(!(event.target instanceof Element)||event.target.closest('[data-photo-lightbox]'))return;
      const action=event.target.closest('a,button');
      const image=event.target instanceof HTMLImageElement?event.target:action?.querySelector('img');
      if(!(image instanceof HTMLImageElement)||image.closest('[data-photo-lightbox-ignore]'))return;
      event.preventDefault();event.stopPropagation();trigger.current=(action||image) as HTMLElement;
      const group=image.closest('[data-photo-gallery]');
      const images=group?Array.from(group.querySelectorAll('img')).filter(img=>!img.closest('[data-photo-lightbox-ignore]')):[image];
      setGallery(images.map(img=>({src:img.currentSrc||img.src,label:img.alt||img.closest('button')?.getAttribute('aria-label')?.replace(/^Enlarge /,'')||'QC photo'})));
      setIndex(Math.max(0,images.indexOf(image)));
    };
    document.addEventListener('click',handle,true);return ()=>document.removeEventListener('click',handle,true);
  },[]);
  useEffect(()=>{
    if(!open)return;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';closeButton.current?.focus();
    function key(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='ArrowLeft'){event.preventDefault();setIndex(i=>(i-1+gallery.length)%gallery.length);}
      if(event.key==='ArrowRight'){event.preventDefault();setIndex(i=>(i+1)%gallery.length);}
      if(event.key==='Tab'){
        const buttons=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }
    window.addEventListener('keydown',key);return ()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',key);};
  },[open,gallery.length]);
  if(!open)return null;
  const photo=gallery[index];
  return <div ref={panel} className="qc-lightbox" data-photo-lightbox role="dialog" aria-modal="true" aria-label="QC photo viewer" onClick={e=>{if(e.target===e.currentTarget)close();}}>
    <div className="qc-lightbox-top"><div><strong>{photo.label}</strong><span aria-live="polite">{index+1} of {gallery.length} · Swipe to browse. Tap photo to close.</span></div><button ref={closeButton} onClick={close} aria-label="Close enlarged picture"><X size={24}/></button></div>
    <button className="qc-lightbox-image" aria-label="Close enlarged picture" onTouchStart={e=>{swiped.current=false;touch.current=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;}} onTouchEnd={e=>{const start=touch.current;touch.current=null;if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){swiped.current=true;step(dx<0?1:-1);}}} onClick={()=>{if(swiped.current){swiped.current=false;return;}close();}}><img src={photo.src} alt={photo.label}/></button>
    {gallery.length>1&&<div className="qc-lightbox-navigation"><button onClick={()=>step(-1)} aria-label="Previous photo"><ChevronLeft/></button><span>{index+1} / {gallery.length}</span><button onClick={()=>step(1)} aria-label="Next photo"><ChevronRight/></button></div>}
  </div>;
}
