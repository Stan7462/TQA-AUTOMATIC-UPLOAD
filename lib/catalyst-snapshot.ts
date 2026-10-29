export type SnapshotStat={techId:string;uploaded:number;failedUploaded:number;monthlyGoal:number;rideAlong:number;afterTheFact:number;notRecorded:number};
export type SnapshotView='current'|'types';
export const observationTotal=(stat:Pick<SnapshotStat,'rideAlong'|'afterTheFact'|'notRecorded'>)=>Number(stat.rideAlong??0)+Number(stat.afterTheFact??0)+Number(stat.notRecorded??0);
export function snapshotPercentage(count:number,total:number){return total?`${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(count/total*100)}%`:'—';}
export function snapshotTypeTotals(stats:SnapshotStat[]){return stats.reduce((sum,stat)=>({rideAlong:sum.rideAlong+Number(stat.rideAlong??0),afterTheFact:sum.afterTheFact+Number(stat.afterTheFact??0),notRecorded:sum.notRecorded+Number(stat.notRecorded??0)}),{rideAlong:0,afterTheFact:0,notRecorded:0});}

export function snapshotTypesPng(stats:SnapshotStat[],range:{start:number;end:number},monthlyGoal:number){
 const width=1440,rowHeight=78,tableY=356,tableHeader=56,height=tableY+tableHeader+stats.length*rowHeight+150;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('This browser cannot create the snapshot.');
 const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,'#22333f');gradient.addColorStop(1,'#0c1821');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
 const write=(text:string,x:number,y:number,size=22,color='#edf4fb',align:CanvasTextAlign='left',weight=500,maxWidth?:number)=>{ctx.font=`${weight} ${size}px system-ui,sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;if(maxWidth)ctx.fillText(text,x,y,maxWidth);else ctx.fillText(text,x,y);};
 write('TQA AUTOMATIC UPLOAD',64,65,22,'#8edbd2','left',700);write('Uploaded to Catalyst · Type split',64,130,48,'#edf4fb','left',600);
 write(`${new Date(range.start).toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${new Date(range.end-1).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`,64,176,25,'#b7c7d3');
 const totals=snapshotTypeTotals(stats),total=observationTotal(totals);
 const categories=[['Ride Along',totals.rideAlong],['After the Fact',totals.afterTheFact],['Not recorded',totals.notRecorded]] as const;
 categories.forEach(([label,count],i)=>{const x=64+i*440;ctx.fillStyle='#213541';ctx.fillRect(x,205,420,100);write(label,x+20,239,20,'#b7c7d3');write(`${count}   ${snapshotPercentage(count,total)}`,x+20,283,34,'#edf4fb','left',600);});
 write(`${total} original Catalyst ${total===1?'observation':'observations'} · By upload date`,64,337,19,'#aabdc9');
 const columns=[{title:'TECHNICIAN',x:80,align:'left'},{title:'UPLOADED',x:590,align:'right'},{title:'FAILED',x:752,align:'right'},{title:'RIDE ALONG',x:960,align:'right'},{title:'AFTER THE FACT',x:1170,align:'right'},{title:'NOT RECORDED',x:1360,align:'right'}] as const;
 ctx.fillStyle='#293c49';ctx.fillRect(64,tableY,width-128,tableHeader);columns.forEach(column=>write(column.title,column.x,tableY+35,19,'#aabdc9',column.align,600));
 stats.forEach((stat,index)=>{const y=tableY+tableHeader+index*rowHeight;ctx.fillStyle=index%2?'#192934':'#1d2d38';ctx.fillRect(64,y,width-128,rowHeight);ctx.strokeStyle='#405969';ctx.beginPath();ctx.moveTo(64,y+rowHeight);ctx.lineTo(width-64,y+rowHeight);ctx.stroke();write(String(index+1),80,y+46,16,'#8195a3');write(`Tech ${stat.techId}`,118,y+47,25,'#edf4fb','left',600,290);write(`${stat.uploaded} of ${stat.monthlyGoal??monthlyGoal}`,590,y+47,25,'#edf4fb','right',600);write(String(stat.failedUploaded??0),752,y+47,27,'#ffadb8','right',600);
  [stat.rideAlong??0,stat.afterTheFact??0,stat.notRecorded??0].forEach((count,i)=>{write(String(count),columns[i+3].x,y+32,28,'#edf4fb','right',600);write(snapshotPercentage(count,observationTotal(stat)),columns[i+3].x,y+60,19,'#b7c7d3','right');});
 });
 write('Each original observation counts once. Corrections do not count twice. Percentages include Not recorded.',64,height-91,19,'#aabdc9');write('Failed observations use After the Fact. Type totals use Catalyst upload dates.',64,height-59,19,'#aabdc9');write(`Updated ${new Date().toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`,width-64,height-25,17,'#91a7b6','right');
 const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));return new File([bytes],`catalyst-qc-type-split-${new Date(range.start).toISOString().slice(0,10)}.png`,{type:'image/png'});
}
