"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
type Photo = {src:string;label:string};
type View = {zoom:number;x:number;y:number};
const FIT:View={zoom:1,x:0,y:0};
const MAX_ZOOM=8;
export default function PhotoLightbox() {
  const [gallery,setGallery]=useState<Photo[]>([]);
  const [index,setIndex]=useState(0);
  const [view,setView]=useState<View>(FIT);
  const current=useRef<View>(FIT);
  const trigger=useRef<HTMLElement|null>(null);
  const panel=useRef<HTMLDivElement|null>(null);
  const stage=useRef<HTMLDivElement|null>(null);
  const image=useRef<HTMLImageElement|null>(null);
  const closeButton=useRef<HTMLButtonElement|null>(null);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const swipe=useRef<{x:number;y:number}|null>(null);
  const pinched=useRef(false);
  const open=gallery.length>0;
  function update(next:View){
    const zoom=Math.max(1,Math.min(MAX_ZOOM,next.zoom));
    const limitX=Math.max(0,((image.current?.offsetWidth??0)*zoom-(stage.current?.clientWidth??0))/2);
    const limitY=Math.max(0,((image.current?.offsetHeight??0)*zoom-(stage.current?.clientHeight??0))/2);
    const bounded={zoom,x:Math.max(-limitX,Math.min(limitX,next.x)),y:Math.max(-limitY,Math.min(limitY,next.y))};
    current.current=bounded;setView(bounded);
  }
  function reset(){pointers.current.clear();swipe.current=null;pinched.current=false;update(FIT);}
  function zoomTo(value:number,clientX?:number,clientY?:number){
    const old=current.current,zoom=Math.max(1,Math.min(MAX_ZOOM,value));
    const rect=stage.current?.getBoundingClientRect();
    const ax=clientX===undefined||!rect?0:clientX-rect.left-rect.width/2;
    const ay=clientY===undefined||!rect?0:clientY-rect.top-rect.height/2;
    const ratio=zoom/old.zoom;
    update({zoom,x:ax-(ax-old.x)*ratio,y:ay-(ay-old.y)*ratio});
  }
  function close(){reset();setGallery([]);requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));}
  function step(direction:number){reset();setIndex(i=>(i+direction+gallery.length)%gallery.length);}
  useEffect(()=>{
    const handle=(event:MouseEvent)=>{
      if(!(event.target instanceof Element)||event.target.closest('[data-photo-lightbox]'))return;
      const action=event.target.closest('a,button');
      const clicked=event.target instanceof HTMLImageElement?event.target:action?.querySelector('img');
      if(!(clicked instanceof HTMLImageElement)||clicked.closest('[data-photo-lightbox-ignore]'))return;
      event.preventDefault();event.stopPropagation();trigger.current=(action||clicked) as HTMLElement;
      const group=clicked.closest('[data-photo-gallery]');
      const images=group?Array.from(group.querySelectorAll('img')).filter(img=>!img.closest('[data-photo-lightbox-ignore]')):[clicked];
      current.current=FIT;setView(FIT);pointers.current.clear();
      setGallery(images.map(img=>({src:img.currentSrc||img.src,label:img.alt||img.closest('button')?.getAttribute('aria-label')?.replace(/^Enlarge /,'')||'QC photo'})));
      setIndex(Math.max(0,images.indexOf(clicked)));
    };
    document.addEventListener('click',handle,true);return ()=>document.removeEventListener('click',handle,true);
  },[]);
  useEffect(()=>{
    if(!open)return;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';closeButton.current?.focus();
    function key(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}
      if(event.key==='ArrowRight'){event.preventDefault();step(1);}
      if(event.key==='+'||event.key==='='){event.preventDefault();zoomTo(current.current.zoom*1.5);}
      if(event.key==='-'){event.preventDefault();zoomTo(current.current.zoom/1.5);}
      if(event.key==='0'){event.preventDefault();reset();}
      if(event.key==='Tab'){
        const buttons=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }
    function wheel(event:WheelEvent){event.preventDefault();zoomTo(current.current.zoom*Math.exp(-event.deltaY*.002),event.clientX,event.clientY);}
    const target=stage.current;target?.addEventListener('wheel',wheel,{passive:false});
    window.addEventListener('keydown',key);window.addEventListener('resize',reset);
    return ()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',key);window.removeEventListener('resize',reset);target?.removeEventListener('wheel',wheel);};
    // Event handlers use current view refs; rebind when gallery size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open,gallery.length]);
  if(!open)return null;
  const photo=gallery[index];
  return <div ref={panel} className="qc-lightbox" data-photo-lightbox role="dialog" aria-modal="true" aria-label="QC photo viewer" onClick={e=>{if(e.target===e.currentTarget)close();}}>
    <div className="qc-lightbox-top"><div><strong>{photo.label}</strong><span>{index+1} of {gallery.length} · Pinch or scroll to zoom. Drag to inspect.</span></div><button ref={closeButton} onClick={close} aria-label="Close enlarged picture"><X size={24}/></button></div>
    <div ref={stage} className={`qc-lightbox-image${view.zoom>1?' is-zoomed':''}`} onDoubleClick={e=>zoomTo(current.current.zoom>1?1:3,e.clientX,e.clientY)}
      onPointerDown={e=>{if(e.pointerType==='mouse'&&e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.current.size===1){swipe.current={x:e.clientX,y:e.clientY};pinched.current=false;}else pinched.current=true;}}
      onPointerMove={e=>{
        const before=pointers.current.get(e.pointerId);if(!before)return;
        const oldPoints=Array.from(pointers.current.values());pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
        const points=Array.from(pointers.current.values());
        if(points.length===2){
          const distance=(p:{x:number;y:number}[])=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
          const cx=(points[0].x+points[1].x)/2,cy=(points[0].y+points[1].y)/2;
          const dx=cx-(oldPoints[0].x+oldPoints[1].x)/2,dy=cy-(oldPoints[0].y+oldPoints[1].y)/2;
          zoomTo(current.current.zoom*distance(points)/Math.max(1,distance(oldPoints)),cx,cy);
          update({...current.current,x:current.current.x+dx,y:current.current.y+dy});
        }else if(points.length===1&&current.current.zoom>1)update({...current.current,x:current.current.x+e.clientX-before.x,y:current.current.y+e.clientY-before.y});
      }}
      onPointerUp={e=>{pointers.current.delete(e.pointerId);const start=swipe.current;if(!pointers.current.size){if(start&&!pinched.current&&current.current.zoom===1&&gallery.length>1){const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))step(dx<0?1:-1);}swipe.current=null;}}}
      onPointerCancel={e=>{pointers.current.delete(e.pointerId);swipe.current=null;pinched.current=true;}}>
      <img ref={image} src={photo.src} alt={photo.label} draggable={false} style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}/>
    </div>
    <div className="qc-lightbox-tools"><button onClick={()=>zoomTo(view.zoom/1.5)} disabled={view.zoom<=1} aria-label="Zoom out"><Minus size={20}/></button><output aria-live="polite" aria-label="Photo zoom">{Math.round(view.zoom*100)}%</output><button onClick={()=>zoomTo(view.zoom*1.5)} disabled={view.zoom>=MAX_ZOOM} aria-label="Zoom in"><Plus size={20}/></button><button onClick={reset} className="qc-lightbox-fit" aria-label="Fit photo to screen"><RotateCcw size={16}/>Fit</button>{gallery.length>1&&<><button onClick={()=>step(-1)} aria-label="Previous photo"><ChevronLeft size={20}/></button><span>{index+1}/{gallery.length}</span><button onClick={()=>step(1)} aria-label="Next photo"><ChevronRight size={20}/></button></>}</div>
  </div>;
}
