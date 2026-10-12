import {escapeHtml as esc,percent} from './core.js';
import {simpleResult} from './knockout.js';
import {snpResult} from './hdr.js';
function nativeOutcomeGraph(rows,sampleType='clone',native=false,interactive=false){
 const width=900,height=184+rows.length*78;
 const items=rows.map((r,i)=>{const t=native?r:r.te;const simple=simpleResult(native?{te:t,knockoutPrediction:r.knockoutPrediction,contextVerified:r._contextVerified}:r,r.sampleType||sampleType,native?'traceedit':'dual');return {r,i,t,a:simple.assessment,...simple};});
 const ready=items.filter(x=>x.status==='Test by Western blot').length,missing=items.filter(x=>x.editing===null).length;
 let body=`<title>Clone selection overview</title><desc>TraceEdit editing estimates on a 0–100% scale. Main net deletion sizes and next steps. Protein knockout requires validation.</desc><rect width="900" height="${height}" rx="20" fill="#ffffff"/><g font-family="Segoe UI,Arial,sans-serif" fill="#173e36"><text x="28" y="40" font-size="23" font-weight="650">Clone selection</text><text x="28" y="65" font-size="13" fill="#72837e">${native?'TraceEdit screening':'QC + TraceEdit'} · ${rows.length} samples</text><rect x="467" y="20" width="168" height="45" rx="12" fill="#e8f5ef"/><text x="485" y="48" font-size="16" fill="#22684f">${ready} to validate</text><rect x="646" y="20" width="225" height="45" rx="12" fill="#f5f2eb"/><text x="665" y="48" font-size="16" fill="#87652d">${rows.length-ready-missing} review · ${missing} unavailable</text><text x="28" y="105" font-size="12" font-weight="600" fill="#7a8b84">SAMPLE</text><text x="230" y="105" font-size="12" font-weight="600" fill="#7a8b84">EDITING % (TRACEEDIT)</text><text x="682" y="105" font-size="12" font-weight="600" fill="#7a8b84">NEXT STEP</text>`;
 for(const n of [0,50,100])body+=`<text x="${230+n*3.4}" y="125" font-size="11" fill="#8a9791" text-anchor="${n===0?'start':n===100?'end':'middle'}">${n}%</text>`;
 items.forEach(({r,i,t,a,status,editing,deletion})=>{
  const y=146+i*78,v=editing,indel=t?.metrics?.indel_fraction;
  const color=status==='Test by Western blot'?'#2d8b70':v===null?'#929f99':status==='Pool only'?'#587b8c':'#c39449';
  const tint=status==='Test by Western blot'?'#e7f4ed':v===null?'#f0f3f1':'#faf2e4';
  const label=(r.sample||'Sample').replace(/\.ab1.*$/i,'');const clone=label.match(/^cl(\d+)_/i);const short=clone?'Clone '+clone[1]:label.length>20?label.slice(0,19)+'…':label;
  body+=`<g ${interactive?`role="button" tabindex="0" data-sample="${i}" aria-label="Inspect ${esc(r.sample)}" style="cursor:pointer"`:''}><title>${esc(r.sample)} · Indel ${percent(indel)} · ${esc(deletion)} · ${status}</title><line x1="28" x2="871" y1="${y+58}" y2="${y+58}" stroke="#edf1ee"/><text x="28" y="${y+17}" font-size="18" font-weight="600">${esc(short)}</text><text x="28" y="${y+39}" font-size="12" fill="#80918a">${esc(deletion)}</text>`;
  if(Number.isFinite(v))body+=`<rect x="230" y="${y+6}" width="340" height="12" rx="6" fill="#edf1ee"/><rect x="230" y="${y+6}" width="${Math.max(0,Math.min(1,v))*340}" height="12" rx="6" fill="${color}"/><text x="592" y="${y+22}" font-size="23" font-weight="600">${percent(v)}</text>`;
  else body+=`<line x1="230" x2="570" y1="${y+12}" y2="${y+12}" stroke="#dfe6e1" stroke-dasharray="4 6"/><text x="230" y="${y+38}" font-size="13" fill="#8a9690">Not available</text>`;
  body+=`<rect x="680" y="${y-1}" width="190" height="32" rx="16" fill="${tint}"/><text x="775" y="${y+20}" text-anchor="middle" font-size="13" font-weight="600" fill="${color}">${status}</text></g>`;
 });
 body+=`<text x="28" y="${height-14}" font-size="12" fill="#7b8b83">Editing estimate, not confirmed knockout. Select a sample for traces and coding evidence.</text></g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="display:block;width:100%;min-width:560px;height:auto" role="${interactive?'group':'img'}" aria-label="Editing results by sample">${body.replace(/font-size="([0-9]+)"/g,'style="font-size:$1px"')}</svg>`;
}
// ICE-style screening rule, applied to each engine's fitted contributions.
// Keep coding/splicing assessments in the detailed report; these are not KO probabilities.
export function traceEditKoScore(t){
 if(t?.error || !t?.metrics || !Array.isArray(t.outcomes) || !t.outcomes.length)return null;
 if(t.outcomes.some(o=>!Number.isInteger(o.net_bp)||!Number.isFinite(o.fraction)||o.fraction<0))return null;
 const total=t.outcomes.reduce((n,o)=>n+o.fraction,0);
 if(total>1.01)return null;
 return Math.min(1,t.outcomes.filter(o=>o.net_bp%3!==0||Math.abs(o.net_bp)>=21).reduce((n,o)=>n+o.fraction,0));
}
export function modelScores(row){
 const a=row.aq,t=row.te;
 const aqOk=a?.ok&&!a.error,teOk=!!t?.metrics&&!t.error;
 return {aq:{indel:aqOk&&Number.isFinite(a.summary?.indelPct)?a.summary.indelPct/100:null,ko:aqOk&&Number.isFinite(a.summary?.koScorePct)?a.summary.koScorePct/100:null},te:{indel:teOk&&Number.isFinite(t.metrics.indel_fraction)?t.metrics.indel_fraction:null,ko:traceEditKoScore(t)}};
}
function snpOutcomeGraph(rows,sampleType='clone',interactive=false){
 const width=1080,height=220+rows.length*112;
 const text=(x,y,value,size=14,color='#284249',weight=400)=>`<text x="${x}" y="${y}" style="font-size:${size}px" fill="${color}" font-weight="${weight}">${esc(value)}</text>`;
 const bar=(x,y,value,color)=>{
  if(!Number.isFinite(value))return `<line x1="${x}" x2="${x+160}" y1="${y+6}" y2="${y+6}" stroke="#bbc8cd" stroke-dasharray="4 4"/>`+text(x+165,y+11,'N/A',12,'#70818a');
  const clamp=v=>Math.max(0,Math.min(1,v));
  return `<rect x="${x}" y="${y}" width="160" height="12" rx="5" fill="#e9eef1"/><rect x="${x}" y="${y}" width="${160*clamp(value)}" height="12" rx="4" fill="${color}"/>`+text(x+165,y+11,percent(value),12,color,600);
 };
 const items=rows.map((r,i)=>({r,i,...snpResult(r,r.sampleType||sampleType)}));
 const ready=items.filter(x=>x.status==='Prioritize for confirmation').length;
 const missing=items.filter(x=>x.status==='Resequence'||x.status==='Input mismatch').length;
 let body=`<title>Two-model SNP screening</title><desc>Intended-edit and estimated HDR contributions from AssuredQC and TraceEdit. Fitted model weights, not confirmed allele fractions or genotypes.</desc><rect width="1080" height="${height}" rx="18" fill="white"/>`;
 body+=text(25,36,sampleType==='pool'?'Pool SNP screening':'Clone SNP screening',25,'#183c43',650)+text(25,62,'Two models. One next step. Select a sample for evidence.',14);
 body+=`<rect x="700" y="20" width="150" height="40" rx="12" fill="#e8f5ef"/>`+text(718,46,`${ready} to confirm`,15,'#22684f',600);
 body+=`<rect x="860" y="20" width="195" height="40" rx="12" fill="#f5f2eb"/>`+text(875,46,`${rows.length-ready-missing} review · ${missing} unavailable`,13,'#87652d',600);
 body+=text(25,108,'SAMPLE / TARGET',12)+text(300,108,'INTENDED EDIT',13,'#183c43',600)+text(610,108,'ESTIMATED HDR',12,'#183c43',600)+text(890,108,'NEXT STEP',12);
 for(const x of [310,650]){body+=text(x,130,'0%',11,'#73848a')+text(x+133,130,'100%',11,'#73848a');}
 items.forEach(({r,i,label,status,aq,te,hdrAq,hdrTe})=>{
  const y=155+i*112;
  const color=status==='Prioritize for confirmation'?'#19786c':status==='Resequence'||status==='Input mismatch'?'#9e4545':'#886222';
  const name=(r.sample||'Sample').replace(/\.ab1.*$/i,'');const match=name.match(/^cl(\d+)_/i);const short=match?'Clone '+match[1]:name.length>22?name.slice(0,21)+'…':name;
  const target=label.length>28?label.slice(0,27)+'…':label;
  body+=`<g ${interactive?`role="button" tabindex="0" data-sample="${i}" aria-label="Inspect ${esc(r.sample)}" style="cursor:pointer"`:''}><title>${esc(r.sample)}; ${esc(status)}</title>`;
  body+=text(25,y+16,short,17,'#183c43',600)+text(25,y+40,target,12,'#70818a');
  body+=text(245,y+13,'QC',12,'#287b89',600)+text(245,y+48,'TE',12,'#7760aa',600);
  body+=bar(310,y,aq.value,'#287b89')+bar(310,y+35,te.value,'#7760aa');
  body+=bar(650,y,hdrAq.value,'#287b89')+bar(650,y+35,hdrTe.value,'#7760aa');
  body+=`<rect x="885" y="${y+10}" width="178" height="32" rx="16" fill="${status==='Prioritize for confirmation'?'#e4f2ed':'#f5eee1'}"/>`+text(893,y+31,status,11,color,600);
  body+=`<line x1="25" x2="1055" y1="${y+94}" y2="${y+94}" stroke="#e8eef0"/></g>`;
 });
 body+=text(25,height-36,'QC = Assured QC | TE = TraceEdit | Intended edit = substitution-only outcomes carrying every selected target.',12)+text(25,height-14,'Fitted contributions, not confirmed genotypes. Confirm by independent sequencing.',12);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="display:block;width:100%;min-width:720px;height:auto;font-family:Segoe UI,Arial,sans-serif" role="${interactive?'group':'img'}" aria-label="Two-model SNP screening results">${body}</svg>`;
}
export function outcomeGraph(rows,sampleType='clone',native=false,interactive=false,workflow='knockout'){
 if(workflow==='snp'&&!native)return snpOutcomeGraph(rows,sampleType,interactive);
 if(native)return nativeOutcomeGraph(rows,sampleType,native,interactive);
 const width=1080,height=220+rows.length*112;
 const text=(x,y,value,size=14,color='#284249',weight=400)=>`<text x="${x}" y="${y}" style="font-size:${size}px" fill="${color}" font-weight="${weight}">${esc(value)}</text>`;
 const bar=(x,y,value,color)=>{
  if(!Number.isFinite(value))return `<line x1="${x}" x2="${x+160}" y1="${y+6}" y2="${y+6}" stroke="#bbc8cd" stroke-dasharray="4 4"/>`+text(x+165,y+11,'N/A',12,'#70818a');
  const clamp=v=>Math.max(0,Math.min(1,v));
  let out=`<rect x="${x}" y="${y}" width="160" height="12" rx="5" fill="#e9eef1"/><rect x="${x}" y="${y}" width="${160*clamp(value)}" height="12" rx="4" fill="${color}"/>`;
  return out+text(x+165,y+11,percent(value),12,color,600);
 };
 let body=`<title>Two-model clone screening</title><desc>Indel score and ICE-style predicted knockout score from each model: fitted contributions with a net length change not divisible by three or at least 21 bp in magnitude. Not a probability of functional knockout.</desc><rect width="1080" height="${height}" rx="18" fill="white"/>`;
 body+=text(25,36,sampleType==='pool'?'Pool screening':'Clone screening',25,'#183c43',650)+text(25,62,'Two models. One next step. Select a sample for evidence.',14);
 body+=text(25,108,'SAMPLE / DELETION',12)+text(300,108,'INDEL SCORE',13,'#183c43',600)+text(610,108,'PREDICTED KNOCKOUT SCORE',12,'#183c43',600)+text(890,108,'NEXT STEP',12);
 for(const x of [310,650]){body+=text(x,130,'0%',11,'#73848a')+text(x+133,130,'100%',11,'#73848a');}
 rows.forEach((r,i)=>{
  const y=155+i*112,s=modelScores(r),simple=simpleResult(r,sampleType);let status=simple.status;
  if(!r.aq?.ok&&r.te?.metrics)status='Review model failure';
  if(status==='Test by Western blot')status='Validate by Western blot';
  const color=status==='Validate by Western blot'?'#19786c':status==='Resequence'?'#9e4545':'#886222';
  const name=(r.sample||'Sample').replace(/\.ab1.*$/i,'');const match=name.match(/^cl(\d+)_/i);const short=match?'Clone '+match[1]:name.length>22?name.slice(0,21)+'…':name;
  body+=`<g ${interactive?`role="button" tabindex="0" data-sample="${i}" aria-label="Inspect ${esc(r.sample)}" style="cursor:pointer"`:''}><title>${esc(r.sample)}; ${esc(status)}</title>`;
  body+=text(25,y+16,short,17,'#183c43',600)+text(25,y+40,simple.deletion,13,'#70818a');
  body+=text(245,y+13,'QC',12,'#287b89',600)+text(245,y+48,'TE',12,'#7760aa',600);
  body+=bar(310,y,s.aq.indel,'#287b89')+bar(310,y+35,s.te.indel,'#7760aa');
  body+=bar(650,y,s.aq.ko,'#287b89')+bar(650,y+35,s.te.ko,'#7760aa');
  body+=`<rect x="885" y="${y+10}" width="178" height="32" rx="16" fill="${status==='Validate by Western blot'?'#e4f2ed':'#f5eee1'}"/>`+text(893,y+31,status,11,color,600);
  body+=`<line x1="25" x2="1055" y1="${y+94}" y2="${y+94}" stroke="#e8eef0"/></g>`;
 });
 body+=text(25,height-36,'QC = Assured QC | TE = TraceEdit | Predicted KO: frameshift or indel of 21 bp or more (ICE-style).',12)+text(25,height-14,'Predicted scores, not confirmed knockout. Validate by Western blot.',12);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="display:block;width:100%;min-width:720px;height:auto;font-family:Segoe UI,Arial,sans-serif" role="${interactive?'group':'img'}" aria-label="Two-model editing and knockout results">${body}</svg>`;
}
export function bindOutcomeGraph(host,inspect){host.querySelectorAll('[data-sample]').forEach(n=>{n.onclick=()=>inspect(Number(n.dataset.sample));n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect(Number(n.dataset.sample));}};});}
