import { catalystQcCategories, catalystFailureLabel } from "./catalyst-qc";
  const aliases = {
    connector: ['connector','connectors','fitting','fittings','compression fitting','f connector','coax end','fitting ends','cable ends','compression connector'],
    groundwire: ['ground wire','grounding wire','bond wire','bonding wire','ground cable'],
    groundblock: ['ground block','grounding block','bond block','bonding block'],
    clamp: ['ground clamp','grounding clamp','bonding clamp','bonding hardware'],
    groundpoint: ['grounding point','ground point','electrical meter','power ground','water pipe','ground rod'],
    hierarchy: ['ground hierarchy','bonding hierarchy','grounding order','preferred grounding'],
    groundtest: ['25 ohm','ohm test','resistance test','ground test','ground resistance'],
    validationtag: ['validation tag','verification tag','bonding date','validation date','second tag'],
    warningtag: ['do not remove','warning tag','ground tag','bonding tag','grounding tag'],
    polehardware: ['pole attachment','pole hardware','attachment hardware at pole'],
    loop: ['drip loop','slack loop','cable loop','water loop'],
    slack: ['span slack','mid span','between poles','sag','span tension'],
    transition: ['aerial to underground','overhead to underground','cable transition'],
    poleguard: ['pole guard','pole protection','covering down pole'],
    pedestal: ['pedestal','ped','lock box','tap box'],
    tag: ['tag','tags','identification','label','labels'],
    port: ['unused port','unused ports','open port','open ports','open tap port','open splitter port','tap port','tap ports','splitter port','splitter ports','terminator','terminators','termination cap','nap port','unused connection','uncapped port','unterminated port','ports left open'],
    tapfilter: ['trap','trap filter','filter on tap','tap filter'],
    water: ['weather seal','weather sealing','water protection','waterproof','water proof','weather boot','rubber boot','weatherproof','water getting','water entering','water ingress'],
    dropattachment: ['drop attachment','anchor','anchored','drop hook','house hook','j hook'],
    dropguard: ['drop guard','cable guard','building protection'],
    route: ['cable route','routing','routed','bend','bends','bending','bend radius','sharp bend','clearance','clearances','kink','kinked'],
    clips: ['clip','clips','staple','staples','cable supports','fastener','fasteners'],
    splice: ['splice','splicing','spliced','cable joint'],
    enclosure: ['enclosure','house enclosure','house box','housebox','nid','nit','network interface device','protective box','demarc box','demarcation box','outside box'],
    configuration: ['splitter configuration','wrong splitter','wrong amplifier','moca splitter','unity gain','distribution configuration'],
    hardware: ['splitter','splitters','amplifier','amplifiers','hardware hanging','block hanging'],
    excess: ['excess cable','spare cable','extra cable','cable coil','too much cable','too little cable'],
    entry: ['entry hole','entry holes','cable entry','penetration hole','wall hole','hole sealing','seal hole'],
    wallplate: ['wall plate','wallplate','wall outlet','equipment termination'],
    cpe: ['cpe','modem','router','customer equipment','gateway','set top box'],
    onu: ['onu','optical network unit'],
    firecable: ['plenum','riser','firewall','fire rated','fire stop','firestop']
  };
  const issues = {
    installation: ['crimp','crimped','crimping','compressed','compression','uncompressed','not seated','not fully seated','poorly fitted','fitted wrong','installed wrong','bad installation','not installed properly','needs replacement','needs to be replaced'],
    wrong: ['wrong','bad','incorrect','unsuitable','unapproved','incorrect type','wrong type','not approved'],
    missing: ['missing','absent','no','without','not installed','not present','not attached'],
    tight: ['tight','tightened','loose','loosened','torque','untightened','not tightened','overtightened'],
    gauge: ['gauge','thickness','thin','thick','awg'],
    routing: ['route','routing','routed','bend','radius','kink','clearance','too close'],
    spacing: ['spacing','distance','spaced','too far apart'],
    mounting: ['mount','mounted','mounting','attached','secured','hanging','loose','unsecured'],
    placement: ['location','located','position','positioned','space','clearance','too close'],
    damage: ['damage','damaged','broken','cracked','not reported'],
    open: ['open','unlocked','unsecured','not locked','not closed','uncapped','unterminated'],
    seal: ['seal','sealed','sealing','water','waterproof','weatherproof','boot','rain'],
    loop: ['loop','loops','drip','slack'],
    test: ['test','tested','verified','verification','resistance','ohm'],
    shared: ['shared','sharing','same clamp'],
    ground: ['grounded','grounding','bonding','bonded']
  };
  // One metadata entry for every real reason, in its original category order.
  const meta = {
    TQA1: [['hierarchy','wrong'],['groundtest','test'],['validationtag','missing']],
    TQA2: [['groundblock','missing installation wrong'],['groundwire','missing gauge wrong'],['clamp','shared wrong'],['groundpoint','wrong ground'],['groundwire','routing mounting'],['warningtag','missing']],
    TQA3: [['polehardware','wrong mounting placement'],['loop','missing loop'],['slack','tight wrong'],['transition','installation wrong'],['poleguard','missing wrong']],
    TQA4: [['pedestal','open'],['pedestal','damage'],['tag','missing wrong'],['port','missing open'],['tapfilter','installation wrong'],['connector','installation wrong'],['water','seal missing'],['connector','tight']],
    TQA5: [['dropattachment loop','mounting loop missing'],['dropguard','missing installation'],['route','routing'],['clips','spacing wrong'],['splice','installation wrong']],
    TQA6: [['groundblock','missing installation wrong'],['connector','installation wrong'],['water','seal missing'],['connector','tight'],['port','missing open'],['enclosure','missing placement installation'],['configuration','wrong'],['hardware groundblock','mounting'],['excess','wrong'],['route','routing'],['clips','spacing wrong'],['entry loop','seal loop missing'],['splice','installation wrong']],
    TQA7: [['connector','installation wrong tight'],['route','routing'],['clips','spacing wrong'],['wallplate','missing installation'],['cpe','placement'],['cpe','mounting installation'],['onu','placement mounting ground'],['firecable','wrong seal']]
  };
  const scope = {TQA1:'ground',TQA2:'ground',TQA3:'pole',TQA4:'tap',TQA5:'drop',TQA6:'house',TQA7:'inside'};
  const scopeNames = {ground:'Grounding',pole:'Pole / aerial',tap:'Tap / pedestal',drop:'Outside cable on building',house:'House box / NID',inside:'Inside / customer equipment'};
  const locations = {
    tap:['tap','pedestal','ped','nap','tap box','lock box'],
    house:['house box','housebox','nid','nit','distribution point','building distribution','demarc','splitter','splitters','amplifier'],
    inside:['inside','indoor','indoors','modem','router','cpe','wall plate','wallplate','gateway'],
    pole:['pole','poles','aerial','mid span','overhead'],
    drop:['outside cable','outdoor cable','building wall','siding','drop guard','drop hook']
  };
  export function normalizeMatcherComment(text) { return text.toLowerCase().replace(/[’']/g,"'").replace(/\b(isn't|aren't|wasn't|weren't|doesn't|don't|hasn't|haven't|can't)\b/g,' not ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' '); }
  function distance(a,b) {
    let row = Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++) { const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next; }
    return row[b.length];
  }
  const vocabulary=[...new Set([...Object.values(aliases),...Object.values(issues),...Object.values(locations)].flat().flatMap(v=>normalizeMatcherComment(v).split(' ')))].filter(w=>w.length>=4);
  function corrected(text) {
    const changes=[];
    const normalized=normalizeMatcherComment(text).split(' ').map(word=>{
      if(word.length<4 || vocabulary.includes(word) || ['fine','okay','good','correct','correctly','properly','working','however','with','only','should','have','been','their','that','this','there'].includes(word))return word;
      const candidates=vocabulary.map(v=>({v,d:distance(word,v)})).filter(x=>x.d<=(word.length>=8?2:1)).sort((a,b)=>a.d-b.d);
      if(!candidates.length || (candidates[1] && candidates[0].d===candidates[1].d))return word;
      changes.push(`${word} → ${candidates[0].v}`);return candidates[0].v;
    }).join(' ');
    return {text:normalized,changes};
  }
  function contains(text,phrase) { return (` ${text} `).includes(` ${normalizeMatcherComment(phrase)} `); }
  function detected(text,dict) { return Object.entries(dict).filter(([,phrases])=>phrases.some(p=>contains(text,p))).map(([name])=>name); }
  export function matchCatalystFailures(text, {location:override='', contexts={}, reviewed=[]}={}) {
    const catalog=catalystQcCategories.flatMap(c=>c.reasons.map((reason,index)=>({id:c.code+':'+index,code:c.code,reason,label:catalystFailureLabel({code:c.code,reason})}))); 
    const reviewedMatch=reviewed.find(e=>e.comment===normalizeMatcherComment(text)&&e.location===override);
    if(reviewedMatch) {
      const options=reviewedMatch.ids.map(id=>catalog.find(r=>r.id===id)).filter(Boolean).map(r=>({...r,hits:['reviewed example'],problemHits:[]}));
      return {results:options,groups:[{id:'reviewed',object:'Reviewed selection',comment:text,results:options,ambiguous:false}],changes:[],objects:[],scopes:[],reviewed:true};
    }
    // Preserve sentence boundaries before punctuation normalization.
    const parts=text.split(/[.!?;\n]+|\b(?:but|however|and|also)\b/i).map(v=>v.trim()).filter(Boolean);
    const seenObjects=new Set();const seenScopes=new Set();const changes=[];const groups=[];
    const commentScopes=detected(corrected(text).text,locations);
    for(const [partIndex,part] of parts.entries()) {
      const fix=corrected(part);const clause=fix.text;changes.push(...fix.changes);
      const outdoorMismatch=/\b(?:inside|indoor)\b.*\b(?:fitting|fittings|connector|connectors)\b.*\b(?:outside|outdoor|outdoors)\b/.test(clause);
      const indoorMismatch=/\b(?:outside|outdoor)\b.*\b(?:fitting|fittings|connector|connectors)\b.*\b(?:inside|indoor|indoors)\b/.test(clause);
      const negative=/\b(not|no|without|missing|wrong|incorrect|incorrectly|bad|badly|poor|poorly|loose|broken|damaged|unsecured|unlocked|kinked|unapproved|absent|unfinished|overtightened)\b/.test(clause) || /\b(?:needs?|must|should) (?:to be )?replac/.test(clause) || outdoorMismatch || indoorMismatch;
      const affirmative=/\b(fine|ok|okay|good|correct|correctly|properly|secured|installed|tightened|crimped|working)\b/.test(clause);
      const clearlyOkay=/\b(?:not missing|not loose|not damaged|not broken|no problems|no issues|no defects)\b/.test(clause);
      if((affirmative && !negative) || clearlyOkay)continue;
      let objects=detected(clause,aliases);
      if(objects.includes('validationtag')||objects.includes('warningtag'))objects=objects.filter(o=>o!=='tag');
      if(objects.includes('configuration'))objects=objects.filter(o=>o!=='hardware');
      if(objects.includes('groundpoint')||objects.includes('hierarchy'))objects=objects.filter(o=>o!=='groundwire');
      if(objects.includes('entry'))objects=objects.filter(o=>o!=='water');
      // A location noun is not a second defect: "fittings at the NID".
      if(objects.includes('connector')) {
        if(/\b(?:at|in|on|by) (?:the )?(?:nid|nit|house box|housebox|enclosure)\b/.test(clause))objects=objects.filter(o=>o!=='enclosure');
        if(/\b(?:at|in|on|by) (?:the )?(?:tap|pedestal|ped|lock box)\b/.test(clause))objects=objects.filter(o=>o!=='pedestal');
        if(/\b(?:at|in|on|by) (?:the )?(?:modem|router|cpe|gateway)\b/.test(clause))objects=objects.filter(o=>o!=='cpe');
      }
      if(objects.includes('port'))objects=objects.filter(o=>o!=='hardware');
      objects.forEach(o=>seenObjects.add(o));
      const faults=detected(clause,issues);
      if(outdoorMismatch || indoorMismatch)faults.push('wrong');
      let detectedScopes=override?[override]:detected(clause,locations);
      if(!override && outdoorMismatch)detectedScopes=commentScopes.includes('house')?['house']:['house','tap'];
      if(!override && indoorMismatch)detectedScopes=['inside'];
      detectedScopes.forEach(s=>seenScopes.add(s));
      // Rank within each problem, never across the entire comment.
      for(const object of objects) {
        const groupId=`${partIndex}:${object}`;
        const groupScopes=contexts[groupId]?[contexts[groupId]]:detectedScopes;
        const candidates=[];
        for(const r of catalog) {
          const [entity,defect]=meta[r.code][Number(r.id.split(':')[1])];
          if(!entity.split(' ').includes(object))continue;
          if(groupScopes.length && !groupScopes.includes(scope[r.code]) && scope[r.code]!=='ground')continue;
          const problemHits=defect.split(' ').filter(p=>faults.includes(p));
          const score=10+problemHits.length*5+(groupScopes.includes(scope[r.code])?7:0);
          candidates.push({...r,score,hits:[object],problemHits});
        }
        candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
        const best=candidates[0]?.score;
        const options=candidates.filter(r=>r.score>=best-4).slice(0,6);
        if(options.length)groups.push({id:groupId,object,comment:part,results:options,ambiguous:new Set(options.map(r=>scope[r.code])).size>1});
      }
    }
    const unique=new Map();
    for(const group of groups)for(const r of group.results)if(!unique.has(r.id))unique.set(r.id,r);
    return {results:[...unique.values()],groups,changes:[...new Set(changes)],objects:[...seenObjects],scopes:[...seenScopes]};
  }

export const matcherScopeNames=scopeNames;
export function matcherScope(code){return scope[code];}
