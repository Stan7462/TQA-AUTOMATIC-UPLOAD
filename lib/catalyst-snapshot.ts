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

export function snapshotGoalTotals(stats:Pick<SnapshotStat,'uploaded'|'monthlyGoal'>[],monthlyGoal:number){
 const uploaded=stats.reduce((sum,stat)=>sum+Number(stat.uploaded??0),0);
 const required=stats.reduce((sum,stat)=>sum+Number(stat.monthlyGoal??monthlyGoal),0);
 const credited=stats.reduce((sum,stat)=>sum+Math.min(Number(stat.uploaded??0),Number(stat.monthlyGoal??monthlyGoal)),0);
 // Never round an incomplete team up to 100%: every technician must meet their goal.
 const percentage=required?`${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(credited<required?Math.min(99.9,credited/required*100):100)}%`:'—';
 return {uploaded,required,credited,remaining:Math.max(0,required-credited),percentage,progress:required?Math.min(1,Math.max(0,credited/required)):0};
}

export function snapshotPng(stats: SnapshotStat[], range: { start: number; end: number }, monthlyGoal: number, view:SnapshotView="current") {
  if(view==="types")return snapshotTypesPng(stats,range,monthlyGoal);
  const dense = stats.length > 10;
  const columns = dense ? 2 : 1;
  const rows = Math.max(1, Math.ceil(stats.length / columns));
  const width = 1080;
  const rowHeight = dense ? 62 : 78;
  const height = 460 + rows * rowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create the snapshot.");
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#22333f");
  gradient.addColorStop(1, "#0c1821");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#8edbd2";
  context.font = "700 22px system-ui, sans-serif";
  context.fillText("TQA AUTOMATIC UPLOAD", 64, 70);
  context.fillStyle = "#edf4fb";
  context.font = "700 58px system-ui, sans-serif";
  context.fillText("Uploaded to Catalyst", 64, 138);
  context.fillStyle = "#b7c7d3";
  context.font = "28px system-ui, sans-serif";
  const period = `${new Date(range.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(range.end - 1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  context.fillText(period, 64, 184);
  const totals=snapshotGoalTotals(stats,monthlyGoal);
  context.fillStyle="#edf4fb";context.font="600 25px system-ui, sans-serif";
  context.fillText(`${totals.uploaded} of ${totals.required} required QCs uploaded`,64,237);
  context.textAlign="right";context.fillText(totals.percentage,width-64,237);context.textAlign="left";
  context.fillStyle="#2a414f";context.fillRect(64,258,width-128,12);
  context.fillStyle="#8ed3bd";context.fillRect(64,258,(width-128)*totals.progress,12);
  context.fillStyle="#b7c7d3";context.font="22px system-ui, sans-serif";context.fillText("Team monthly goal",64,304);
  context.textAlign="right";context.fillText(`${totals.remaining} remaining`,width-64,304);context.textAlign="left";
  const tableX = 64;
  const tableY = 330;
  const tableWidth = width - 128;
  const columnWidth = tableWidth / columns;
  context.fillStyle = "#293c49";
  context.fillRect(tableX, tableY, tableWidth, 50);
  context.fillStyle = "#aabdc9";
  context.font = "700 18px system-ui, sans-serif";
  for (let column = 0; column < columns; column++) {
    const x = tableX + column * columnWidth;
    context.textAlign = "left";
    context.fillText("TECHNICIAN", x + 16, tableY + 32);
    context.textAlign = "right";
    context.fillText("UPLOADED", x + columnWidth - 105, tableY + 32);
    context.fillText("FAILED", x + columnWidth - 16, tableY + 32);
  }
  context.textAlign = "left";
  stats.forEach((stat, index) => {
    const column = dense ? index % 2 : 0;
    const row = dense ? Math.floor(index / 2) : index;
    const x = tableX + column * columnWidth;
    const y = tableY + 50 + row * rowHeight;
    context.fillStyle = row % 2 ? "#192934" : "#1d2d38";
    context.fillRect(x, y, columnWidth, rowHeight);
    context.strokeStyle = "#405969";
    context.strokeRect(x, y, columnWidth, rowHeight);
    context.textAlign = "left";
    context.fillStyle = "#8195a3";
    context.font = `500 ${dense ? 14 : 17}px system-ui, sans-serif`;
    context.fillText(String(index + 1), x + 16, y + rowHeight / 2 + 7);
    context.fillStyle = "#edf4fb";
    context.font = `700 ${dense ? 23 : 27}px system-ui, sans-serif`;
    context.fillText(`Tech ${stat.techId}`, x + 44, y + rowHeight / 2 + 9, columnWidth - 263);
    context.textAlign = "right";
    context.font = `700 ${dense ? 28 : 34}px system-ui, sans-serif`;
    context.fillText(String(stat.uploaded), x + columnWidth - 163, y + rowHeight / 2 + 10);
    context.fillStyle = "#bed0dc";
    context.font = `600 ${dense ? 18 : 21}px system-ui, sans-serif`;
    context.fillText(`of ${stat.monthlyGoal ?? monthlyGoal}`, x + columnWidth - 105, y + rowHeight / 2 + 9);
    context.fillStyle = stat.failedUploaded ? "#ffadb8" : "#bed0dc";
    context.font = `700 ${dense ? 28 : 34}px system-ui, sans-serif`;
    context.fillText(String(stat.failedUploaded ?? 0), x + columnWidth - 16, y + rowHeight / 2 + 10);
    context.textAlign = "left";
  });
  context.fillStyle = "#91a7b6";
  context.font = "20px system-ui, sans-serif";
  context.textAlign = "left";
  context.font = "16px system-ui, sans-serif";
  context.fillText("Confirmed uploads • Failed QCs do not count toward the monthly goal", 64, height - 55);
  context.textAlign = "right";
  context.fillText(`Updated ${new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`, width - 64, height - 55);
  const encoded = canvas.toDataURL("image/png").split(",")[1];
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  return new File([bytes], `catalyst-qc-progress-${new Date(range.start).toISOString().slice(0,10)}.png`, { type: "image/png" });
}
