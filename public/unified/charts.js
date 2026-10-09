import {desiredOutcome} from './hdr.js';
import {escapeHtml as esc} from './core.js';
export function distribution(result,engine){
 const rows=engine==='aq'?result?.contributions:result?.outcomes;if(!Array.isArray(rows))return [];
 const bins=new Map();for(const r of rows){const size=engine==='aq'?r.size:r.net_bp;if(!Number.isFinite(size)||!Number.isFinite(r.fraction)||r.fraction<0)continue;bins.set(size,(bins.get(size)||0)+r.fraction);}
 return [...bins].sort((a,b)=>a[0]-b[0]);
}
export function zeroSegments(result,engine,row){
 const zero=distribution(result,engine).find(([size])=>size===0)?.[1]||0;
 const rows=(engine==='aq'?result?.contributions:result?.outcomes)||[];
 const wt=rows.filter(o=>(engine==='aq'?o.kind==='wt':o.kind==='wild_type')&&(engine==='aq'?o.size:o.net_bp)===0).reduce((sum,o)=>sum+o.fraction,0);
 const g=row?desiredOutcome(row,engine):null;
 const intended=(row?.workflow==='snp'||row?.targets?.length||row?.target)?g?.value??0:0;
 if(wt+intended>zero+1e-6)return [{label:'0 bp · unclassified',value:zero,color:'#94a3b8'}];
 return [{label:'WT',value:wt,color:'#82948f'},{label:'Intended edit',value:intended,color:'#8b5fc7'},{label:g?.value===null||!g?'Unclassified':'Other edits',value:Math.max(0,zero-wt-intended),color:'#e4b44b'}].filter(s=>s.value>1e-9);
}
export function indelChart(result,engine,row){
 const bins=distribution(result,engine);if(!bins.length)return '<p>No fitted distribution available.</p>';
 const w=560,h=260,left=45,right=15,top=20,bottom=55,plot=h-top-bottom,step=(w-left-right)/bins.length;
 let svg='';for(const tick of [0,25,50,75,100]){const y=top+plot*(1-tick/100);svg+=`<line x1="${left}" x2="${w-right}" y1="${y}" y2="${y}" stroke="#e2e9e7"/><text x="${left-8}" y="${y+4}" text-anchor="end">${tick}%</text>`;}
 bins.forEach(([size,f],i)=>{const x=left+i*step+step*.15,width=step*.7,y=top+plot*(1-Math.min(1,f)),label=size>0?'+'+size:String(size),color=size<0?'#6678c4':size>0?'#db9455':'#4d938b';if(size===0){let base=0;for(const segment of zeroSegments(result,engine,row)){const sy=top+plot*(1-base-segment.value);svg+=`<rect x="${x}" y="${sy}" width="${width}" height="${plot*segment.value}" fill="${segment.color}"><title>${esc(segment.label)}: ${(segment.value*100).toFixed(2)}% fitted contribution</title></rect>`;if(segment.value>=.10&&width>=45)svg+=`<text x="${x+width/2}" y="${sy+plot*segment.value/2+4}" text-anchor="middle" style="fill:#fff">${(segment.value*100).toFixed(1)}%</text>`;base+=segment.value;}}else{svg+=`<rect x="${x}" y="${y}" width="${width}" height="${plot*Math.min(1,f)}" rx="2" fill="${color}"><title>${esc(label)} bp: ${(f*100).toFixed(2)}% fitted contribution</title></rect>`;}if(bins.length<23||size===0||f>=.03)svg+=`<text x="${x+width/2}" y="${top+plot+18}" text-anchor="middle">${label}</text>`;if(f>=.06)svg+=`<text x="${x+width/2}" y="${Math.max(12,y-5)}" text-anchor="middle">${(f*100).toFixed(1)}%</text>`;});
 const legend=zeroSegments(result,engine,row).map(s=>`<span style="display:inline-flex;align-items:center;gap:5px;margin:3px 12px 3px 0"><i style="background:${s.color};width:12px;height:12px;display:inline-block"></i>${esc(s.label)} ${(s.value*100).toFixed(1)}%</span>`).join('');
 return `<svg class="distribution" viewBox="0 0 ${w} ${h}" role="img" aria-label="${engine==='aq'?'AssuredQC':'TraceEdit'} fitted net indel size distribution"><style>text{font:11px system-ui;fill:#526a66}</style>${svg}<text x="300" y="250" text-anchor="middle">Net length change (bp) · 0 includes WT and substitutions</text></svg><div style="font-size:12px">${legend}</div><small>0-bp components are fitted signal contributions. Intended edit includes all required target changes, with blocking changes optional.</small>`;
}
