// Shared, conservative presentation layer. Never changes an engine result.
import {escapeHtml as esc,targetsOf,variantKey,percent} from './core.js';
import {modelScores} from './outcome-graph.js';
export const REPORT_VERSION='publication/1';
const finite=Number.isFinite;
export function nativeBundle(b){return {created:b.created_utc,planned:b.results.length,setup:{...b.settings,name:b.settings?.project_context?.name||'TraceEdit clone review',sampleType:b.settings?.mode==='clones'?'clone':'pool'},engines:{traceEdit:b.results.find(r=>r.version)?.version},results:b.results.map(t=>({sample:t.sample,control:t.control,workflow:t.variants?.length?'snp':'knockout',target:t.target_variant||b.settings?.target_variant,te:t,contextVerified:b.settings?.project_context?.reviewed===true&&b.settings.project_context.control_sha256===t.source_hashes?.control&&b.settings.project_context.sample_sha256?.includes(t.source_hashes?.sample)}))};}
export function reviewRows(bundle){
 const rows=bundle.results.map((r,index)=>{
  const t=r.te,a=r.aq,scores=modelScores(r),workflow=r.workflow||bundle.setup?.workflow,targets=targetsOf(r);
  const bins=new Map();for(const o of t?.outcomes||[])if(finite(o.net_bp)&&finite(o.fraction))bins.set(o.net_bp,(bins.get(o.net_bp)||0)+o.fraction);
  const sizes=[...bins].sort((a,b)=>b[1]-a[1]);
  const markers=(t?.variants||[]).map(v=>({...v,intended:targets.some(x=>variantKey(x)===variantKey(v))}));
  const signals=targets.map(v=>markers.find(x=>variantKey(x)===variantKey(v))?.sample_alt_signal);
  const target=signals.length&&signals.every(finite)?Math.min(...signals):null;
  const group=[t?.source_hashes?.control||r.control||'unknown',workflow,targets.map(variantKey).sort().join(',')].join('|');
  const x={index,sample:r.sample,control:r.control,workflow,group,scores,markers,target,sizes,fit:t?.metrics?.r_squared,action:'Review',tier:9,reasons:[],warnings:[...(a?.warnings||[]),...(t?.warnings||[])],source:t?.source_hashes||{},te:t,aq:a};
  const stop=(action,reason)=>{x.action=action;x.reasons.push(reason);return x;};
  if(!t?.metrics||t.error)return stop('Resequence',t?.error||'TraceEdit result unavailable.');
  if((r.sampleType||bundle.setup?.sampleType)!=='clone')return stop('Pool only','Clone ranking requires individual clone samples.');
  if(!(r.contextVerified===true||(r.contextVerified!==false&&bundle.reviewed===true&&bundle.plans?.some(p=>p.hash===t.source_hashes?.control))))return stop('Review setup','Confirm project context and exact control/sample pairing before prioritizing clones.');
  if(!t.source_hashes?.control||!t.source_hashes?.sample)return stop('Review provenance','Source hashes are missing.');
  if(a){
   if(!a.ok||a.error)return stop('Review model failure',a.error||'Assured QC result unavailable.');
   if(a.controlHash!==t.source_hashes.control||a.sampleHash!==t.source_hashes.sample)return stop('Input mismatch','The engines used different input hashes.');
   if(!finite(a.r2)||a.r2<.95||!finite(scores.aq.indel)||Math.abs(scores.aq.indel-scores.te.indel)>.15)return stop('Review models','Fit or indel disagreement requires review.');
  }
  if(!finite(x.fit)||x.fit<.98||!finite(scores.te.indel)||!(t.alignment?.baseline_mae<=.08)||!(t.alignment?.sample_q20_fraction>=.7))return stop('Review trace','Fit or trace quality does not meet the screening threshold.');
  if(workflow==='knockout'){
   if(!finite(scores.te.ko)||a&&(!finite(scores.aq.ko)||Math.abs(scores.aq.ko-scores.te.ko)>.15))return stop('Review models','KO screening estimates are missing or disagree.');
   const g=[...(t.deletion_evidence?.groups||[])].sort((a,b)=>b.fraction-a.fraction)[0];
   if(scores.te.ko<.8||a&&scores.aq.ko<.8)return stop('Low screening score','Insufficient fitted KO-screening contribution.');
   if(!g||g.fraction<.9||g.min_quality<30||g.matching_calls!==g.compared_calls)return stop('Review genotype','A clean dominant deletion junction has not been established.');
   x.tier=g.fraction>=.98&&g.min_quality>=40?0:1;x.action=x.tier===0?'First choice':'Backup';x.reasons.push(`${g.size_bp} bp deletion; ${percent(g.fraction)} model contribution; junction min Q${g.min_quality}. Validate by Western blot.`);
  }else if(workflow==='snp'){
   if(target===null)return stop('Select intended edit','Intended-base evidence is missing; donor markers cannot substitute for the target.');
   if(a&&targets.some(v=>{const m=a.markers?.find(x=>variantKey(x)===variantKey(v)),te=markers.find(x=>variantKey(x)===variantKey(v));return !m?.covered||!m.inFit||!finite(m.raw)||Math.abs(m.raw-te.sample_alt_signal)>.15;}))return stop('Review target','Target coverage or model agreement is insufficient.');
   if(scores.te.indel>.01||a&&scores.aq.indel>.01)return stop('Review indels','Indels may confound the intended-base signal.');
   if(target<.95)return stop(target<.05?'WT-like':'Review mixed signal','Intended-base signal below the candidate threshold.');
   const mixed=markers.some(v=>!v.intended&&v.sample_alt_signal>.1&&v.sample_alt_signal<.9);
   x.tier=mixed?(x.fit>=.999?1:2):0;x.action=x.tier===0?'First choice':x.tier===1?'Phase markers':'Reserve';x.reasons.push(`${percent(target)} minimum intended-base signal; ${percent(scores.te.indel)} fitted indels. ${mixed?'Mixed donor markers require phasing.':'Confirm complete genotype independently.'}`);
  }else return stop('Review workflow','Choose SNP or knockout screening.');
  return x;
 });
 // Cap at six per control/target group; never mix controls or force a minimum.
 const counts=new Map();for(const x of [...rows].sort((a,b)=>a.tier-b.tier||(b.fit||0)-(a.fit||0))){if(x.tier>1)continue;const n=counts.get(x.group)||0;x.selected=n<6;counts.set(x.group,n+1);if(!x.selected)x.action='Additional eligible';}
 return rows;
}
export function screeningSvg(rows){
 const dual=rows.some(r=>r.aq), engines=dual?['aq','te']:['te'];
 const w=1080,h=140+rows.length*76,txt=(x,y,s,size=13,c='#24444c')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${c}">${esc(s)}</text>`;
 let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" style="width:100%;min-width:900px;height:auto" role="img" aria-label="Clone screening scores"><rect width="${w}" height="${h}" fill="white"/><g font-family="Arial,sans-serif">${txt(20,30,dual?'Clone screening | QC and TraceEdit':'TraceEdit clone screening',22)}${txt(20,59,dual?'Independent estimates; no averaged score. Screening predictions require validation.':'Prioritize candidates for validation. Scores are screening estimates.',12)}${txt(20,90,'SAMPLE')}${txt(280,90,'INDEL SCORE')}${txt(570,90,rows.every(r=>r.workflow==='knockout')?'PREDICTED KO SCORE':rows.every(r=>r.workflow==='snp')?'INTENDED-BASE SIGNAL':'KO / INTENDED SIGNAL')}${txt(870,90,'NEXT STEP')}`;
 const bar=(x,y,v,color)=>finite(v)?`<rect x="${x}" y="${y}" width="160" height="9" fill="#eef2f3"/><rect x="${x}" y="${y}" width="${160*Math.max(0,Math.min(1,v))}" height="9" fill="${color}"/>${txt(x+165,y+9,percent(v),11,color)}`:txt(x,y+9,'Not available',11,'#75858d');
 for(const [i,r] of rows.entries()){
  const y=112+i*76;const short=r.sample?.replace(/\.ab1$/i,'')||'Sample';s+=txt(20,y+15,short.length>31?short.slice(0,30)+'...':short,12)+txt(870,y+15,r.action,12);
  for(const [j,e] of engines.entries()){
   const color=e==='aq'?'#147e88':'#785eaa';const v=r.workflow==='knockout'?r.scores[e].ko:e==='te'?r.target:(r.markers.filter(m=>m.intended).length?Math.min(...r.markers.filter(m=>m.intended).map(m=>r.aq?.markers?.find(a=>variantKey(a)===variantKey(m))?.raw??NaN)):null);
   s+=txt(250,y+j*20+10,e==='aq'?'QC':'TE',10,color)+bar(280,y+j*20,r.scores[e].indel,color)+bar(570,y+j*20,v,color);
  }s+=`<line x1="20" x2="1060" y1="${y+57}" y2="${y+57}" stroke="#e0e8eb"/>`;
 }return s+'</g></svg>';
}
export function publicationOverview(bundle){
 const rows=reviewRows(bundle),selected=rows.filter(r=>r.selected).sort((a,b)=>a.tier-b.tier),groups=new Set(rows.map(r=>r.group));
 return `<section class="publication-overview"><h3>Clone validation shortlist</h3><p>${selected.length?selected.map(r=>`<b>${esc(r.sample)}</b> (${esc(r.action)})`).join(' · '):'No clones meet all screening checks yet. Review the reasons below.'}</p><small>${groups.size>1?'Candidates are selected separately for each control / target group. ':''}Provisional screening, not confirmed genotype or protein loss.</small>${screeningSvg(rows)}<details><summary>Why these recommendations?</summary>${rows.map(r=>`<p><b>${esc(r.sample)}: ${esc(r.action)}</b> — ${esc(r.reasons.join(' '))}</p>`).join('')}<p>Heuristic review thresholds; no calibrated success probabilities. SNP: intended signal ≥95%, indels ≤1%. KO: screening contribution ≥80%, dominant deletion ≥90%, matched junction calls and min Q30. Both available models must pass identity and agreement checks. At most six candidates per control/target group.</p></details></section>`;
}
export function publicationPayload(bundle){
 const rows=reviewRows(bundle);let panels=0;return {version:REPORT_VERSION,title:bundle.setup?.name||'Clone selection report',created:bundle.created,engines:bundle.engines,setup:bundle.setup,rows:rows.map(r=>{
  const t=r.te;const groups=[...(t?.deletion_evidence?.groups||[])].sort((a,b)=>b.fraction-a.fraction);
  // All samples are summarized; include at most six evidence panels per run.
  return {sample:r.sample,control:r.control,workflow:r.workflow,group:r.group,action:r.action,selected:!!r.selected,reasons:r.reasons,warnings:r.warnings,scores:r.scores,target:r.target,markers:r.markers,aqTarget:r.target===null?null:(r.markers.filter(m=>m.intended).every(m=>finite(r.aq?.markers?.find(a=>variantKey(a)===variantKey(m))?.raw))?Math.min(...r.markers.filter(m=>m.intended).map(m=>r.aq.markers.find(a=>variantKey(a)===variantKey(m)).raw)):null),fit:r.fit??null,sizes:r.sizes,source:r.source,aqSource:r.aq?{control:r.aq.controlHash,sample:r.aq.sampleHash}:null,parameters:t?.parameters,inference:t?.inference,error:t?.error||null,evidence:r.selected&&panels++<12?{junction:r.workflow==='knockout'?groups[0]:null,displays:r.workflow==='snp'?Object.values(t?.displays||{}).filter(d=>r.markers.some(m=>m.intended&&m.position>=d.control?.start&&m.position<=d.control?.end)).slice(0,6):[]}:null};
 })};
}
export function rasterParts(bundle){const p=publicationPayload(bundle);return Math.ceil((Math.ceil(p.rows.length/12)+p.rows.filter(r=>r.evidence?.junction||r.evidence?.displays?.length).length)/2);}
export async function downloadPublication(bundle,format='pdf',assetPage=0){
 const body=publicationPayload(bundle);body.format=format;body.asset_page=assetPage;
 const data=JSON.stringify(body);if(new Blob([data]).size>3900000)throw Error('Publication payload exceeds 3.9 MB. Export a smaller batch; full JSON remains available.');
 const response=await fetch('/api/publication',{method:'POST',headers:{'Content-Type':'application/json'},body:data});
 if(!response.ok){const e=await response.json();throw Error(e.error||'Publication export failed.');}
 const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=(body.title.replace(/[^a-z0-9_-]/gi,'_').slice(0,70)||'clone_review')+(format==='pngzip'?`_600dpi_part${assetPage+1}.zip`:format==='zip'?'_publication.zip':'_publication.pdf');a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
