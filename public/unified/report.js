import {buildQcReportHtml} from './vendor/assured-qc/report.js';
import {withRecommendations} from './vendor/assured-qc/recommend.js';
import {runProteinFigure} from './vendor/assured-qc/proteinFigure.js';
import {outcomeGraph,modelScores} from './outcome-graph.js';
import {koAssessment,koCard,simpleResult} from './knockout.js';
import {hdrCard,estimatedHdr,desiredOutcome,snpResult,snpCard} from './hdr.js';
import {indelChart} from './charts.js';
import {escapeHtml as esc,percent,variantKey,compare,csv,targetsOf} from './core.js';
export function targetSignals(r){return {a:r.target&&r.aq?.markers?.find(v=>variantKey(v)===variantKey(r.target)),t:r.target&&r.te?.variants?.find(v=>variantKey(v)===variantKey(r.target))};}
export function tableRows(bundle){return [['Sample','Control','Review status','Target (control-read coordinate)','AQ raw target %','TE raw target %','AQ indel %','TE indel %','AQ R2','TE R2','AQ error','TE error'],...bundle.results.map(r=>{const m=targetSignals(r);return [r.sample,r.control,compare(r).label,targetsOf(r).map(variantKey).join('; '),signalRange(r,'aq'),signalRange(r,'te'),r.aq?.summary?.indelPct??'',Number.isFinite(r.te?.metrics?.indel_fraction)?r.te.metrics.indel_fraction*100:'',r.aq?.r2??'',r.te?.metrics?.r_squared??'',r.aq?.error||'',r.te?.error||''];})];}
export const csvReport=b=>{const rows=tableRows(b);rows[0].push('AQ predicted KO % (ICE-style)','TE predicted KO % (ICE-style)','AQ estimated HDR %','AQ HDR status','TE estimated HDR %','TE HDR status','AQ desired outcome %','TE desired outcome %','Desired outcome','Possible KO contribution %','NMD-susceptible contribution %','Unresolved coding contribution %','Western blot priority','KO prediction reason');b.results.forEach((r,i)=>{const a=estimatedHdr(r,'aq'),t=estimatedHdr(r,'te');const scores=modelScores(r);rows[i+1].push(r.workflow==='knockout'&&scores.aq.ko!==null?scores.aq.ko*100:'',r.workflow==='knockout'&&scores.te.ko!==null?scores.te.ko*100:'',a.value===null?'':a.value*100,a.status,t.value===null?'':t.value*100,t.status,...['aq','te'].map(e=>{const g=desiredOutcome(r,e);return g.value===null?'':g.value*100;}),desiredOutcome(r,'aq').label,...(r.workflow==='knockout'?[r.knockoutPrediction?.value==null?'':r.knockoutPrediction.value*100,r.knockoutPrediction?.nmd_susceptible==null?'':r.knockoutPrediction.nmd_susceptible*100,r.knockoutPrediction?.unresolved==null?'':r.knockoutPrediction.unresolved*100,koAssessment(r,r.sampleType||b.setup.sampleType).priority,koAssessment(r,r.sampleType||b.setup.sampleType).reasons.join(' ')]:['','','','','']));});return csv(rows);};
export function traceSvg(display,selected){
 const targets=Array.isArray(selected)?selected:selected?[selected]:[];
 if(!display?.control?.x?.length || !display?.sample?.x?.length)return '';
 const colors=['#24834c','#2b6da9','#253c32','#c8493c'];let body='';
 for(const [index,role] of ['control','sample'].entries()){
  const d=display[role],bottom=110+index*145,x=v=>110+(v-d.start+.5)/(d.end-d.start+1)*900;
  body+=`<text x="8" y="${bottom-50}" font-size="14" fill="#38574a">${role==='control'?'Control':'Sample'}</text>`;
  for(const target of targets)if(target.position>=d.start && target.position<=d.end)body+=`<rect x="${x(target.position-.45)}" y="${bottom-90}" width="${x(target.position+.45)-x(target.position-.45)}" height="112" fill="#d8edcc"/>`;
  for(let c=0;c<4;c++){const path=d.x.map((v,j)=>(j?'L':'M')+x(v).toFixed(2)+','+(bottom-d.y[j][c]*85).toFixed(2)).join(' ');body+=`<path d="${path}" fill="none" stroke="${colors[c]}" stroke-width="1.3"/>`;}
  d.positions.forEach((pos,j)=>{body+=`<text x="${x(pos)}" y="${bottom+18}" text-anchor="middle" font-size="11" fill="#375147">${esc(d.calls[j])}</text>`;if(j%5===0)body+=`<text x="${x(pos)}" y="${bottom+33}" text-anchor="middle" font-size="9" fill="#677e6b">${pos}</text>`;});
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1030 300" class="trace" role="img" aria-label="Control and sample chromatograms around control base ${Number(display.center)}">${body}</svg>`;
}
const PUBLICATION_CSS=`body{font:15px/1.55 "Segoe UI",Arial,sans-serif;max-width:920px;margin:28px auto;padding:24px;color:#173d30;background:#f7f9f5}
.eyebrow{font-size:11px;letter-spacing:2px;color:#6f8578;font-weight:700;margin:0}
h1{font-size:34px;letter-spacing:-1px;margin:10px 0 8px;font-weight:650}
h2{font-size:20px;margin:28px 0 12px}
h3{font-size:16px;margin:0 0 8px}
.meta,.muted{color:#5f7468;font-size:13px}
.takehome{background:linear-gradient(135deg,#e7f4ed,#f4faf6);border:1px solid #b9d7c8;border-radius:14px;padding:22px 24px;margin:22px 0}
.takehome strong{display:block;font-size:22px;line-height:1.3;color:#174f3e;margin-bottom:8px}
.picks{margin:10px 0 0 18px;padding:0}
.picks li{margin:6px 0}
.rank{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0 8px}
.rank th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#647968;background:#eef3e7;padding:10px}
.rank td{padding:11px 10px;border-bottom:1px solid #e1e8dc;vertical-align:top}
.rank tr.pick{background:#eef8f2}
.rank .sub{font-size:11px;color:#7a8b83;margin-top:2px;overflow-wrap:anywhere}
.badge{display:inline-block;padding:3px 8px;border-radius:4px;background:#edf2e7;font-size:12px}
.badge.good{background:#dceee4;color:#215641}
.badge.review{background:#fff0dc;color:#80561c}
.figure{margin:18px 0;background:white;border:1px solid #dde5d7;border-radius:12px;padding:12px}
.figure svg{width:100%;max-width:100%;height:auto}
.note{font-size:12px;color:#617365;margin-top:18px}
details.appendix{margin-top:28px;border-top:1px solid #d8e2d6;padding-top:16px}
details.appendix>summary{cursor:pointer;font-weight:650;color:#2f5648}
.appendix-item{background:white;border:1px solid #e0e7da;border-radius:12px;padding:16px;margin:14px 0}
.engine-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.goal-card{background:#edf5f0;border-radius:10px;padding:16px;margin:12px 0}
.hdr-card{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
.hdr-card strong,.hdr-card small{display:block}
.hdr-card strong{font-size:22px}
.heading{display:flex;justify-content:space-between;gap:16px}
.heading strong{display:block;font-size:28px}
.effect-bar{display:flex;height:10px;background:#e5e9e5;border-radius:8px;overflow:hidden;margin:12px 0 6px}
.effect-key{display:flex;gap:16px;font-size:12px;margin-bottom:10px}
table{border-collapse:collapse;width:100%}
td,th{padding:8px;border:1px solid #d5ddcf;text-align:left}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}
@media(max-width:720px){.engine-grid,.hdr-card{grid-template-columns:1fr}h1{font-size:28px}}
@media print{body{margin:0;background:white;max-width:none}.takehome{break-inside:avoid}.appendix{display:none!important}.figure{break-inside:avoid}}`;

function publicationDocument({eyebrow,title,meta,take,decisions,metricHead,figureHtml='',note,appendixHtml}){
 const picks=decisions.top.length
  ?`<ol class="picks">${decisions.top.slice(0,8).map(r=>`<li><b>${esc(r.label)}</b> · ${esc(r.metricText)} ${esc(metricHead.toLowerCase())} · ${esc(r.detail)}</li>`).join('')}</ol>`
  :`<p class="muted">No provisional top picks. Use the ranked table to decide what to resequence or review.</p>`;
 const rank=`<table class="rank"><thead><tr><th>#</th><th>Clone</th><th>Next step</th><th>${esc(metricHead)}</th><th>Main allele / target</th></tr></thead><tbody>${decisions.rows.map((r,i)=>`<tr class="${r.priority?'pick':''}"><td>${i+1}</td><td>${esc(r.label)}<div class="sub">${esc(r.sample)}</div></td><td><span class="badge ${r.priority?'good':'review'}">${esc(r.status)}</span></td><td>${esc(r.metricText)}</td><td>${esc(r.detail)}</td></tr>`).join('')}</tbody></table>`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PUBLICATION_CSS}</style></head><body>
<p class="eyebrow">${esc(eyebrow)}</p>
<h1>${esc(title)}</h1>
<p class="meta">${esc(meta)}</p>
<section class="takehome"><strong>Take home: ${esc(take.headline)}</strong><p>${esc(take.body)}</p>${picks}</section>
<h2>Ranked clones</h2>
${rank}
${figureHtml?`<div class="figure">${figureHtml}</div>`:''}
<p class="note">${esc(note)}</p>
<details class="appendix"><summary>Appendix · detailed evidence</summary>${appendixHtml}</details>
</body></html>`;
}

export function reportHtml(bundle){
 const take=takeHomeMessage(bundle);
 const decisions=cloneDecisions(bundle);
 const workflow=decisions.workflow;
 const metricHead=workflow==='snp'?'Intended edit':'Editing score';
 const rows=tableRows(bundle);
 const comparison='<table><thead><tr>'+rows[0].slice(0,10).map(v=>`<th>${esc(v)}</th>`).join('')+'</tr></thead><tbody>'+rows.slice(1).map(r=>'<tr>'+r.slice(0,10).map(v=>`<td>${esc(typeof v==='number'?v.toFixed(2):v)}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
 const appendix=`<details><summary>How to interpret</summary><p>Same selected files; two distinct models. No averaged score. Target values are raw alternate-channel signals, not calibrated allele fractions. Agreement does not confirm genotype; indels can confound SNP signals. Multisite co-occurrence is model-dependent.</p></details>
<details><summary>Engine comparison table</summary>${comparison}</details>
${bundle.results.map(r=>{const review=compare(r);return `<section class="appendix-item"><h3>${esc(r.sample)}</h3><p>Control: ${esc(r.control)} · ${esc(review.label)}</p>${r.workflow==='knockout'?koCard(r,r.sampleType||bundle.setup.sampleType):snpCard(r,r.sampleType||bundle.setup.sampleType)}<details><summary>Quality checks</summary><ul>${review.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>AQ: ${esc(r.aq?.error||r.aq?.warnings?.join('; ')||'No engine warnings')}<br>TE: ${esc(r.te?.error||r.te?.warnings?.join('; ')||'No engine warnings')}</p></details><details><summary>Indel distributions & engine scores</summary><div class="engine-grid"><div><b>AssuredQC</b>${hdrCard(r,'aq')}${indelChart(r.aq,'aq',r)}</div><div><b>TraceEdit</b>${hdrCard(r,'te')}${indelChart(r.te,'te',r)}</div></div></details><details><summary>Interpretation and per-base evidence</summary><p>${esc(interpretation(r))}</p>${variantTable(r)}</details>${Object.values(r.te?.displays||{}).slice(0,1).map(d=>traceSvg(d,targetsOf(r))).join('')}</section>`;}).join('')}
<details><summary>Methods, setup & provenance</summary><p>Engine versions: ${esc(JSON.stringify(bundle.engines))}</p><pre>${esc(JSON.stringify(bundle.setup,null,2))}</pre></details>`;
 return publicationDocument({
  eyebrow:'ASSURED · CLONE SELECTION REPORT',
  title:bundle.setup.name.replace(/^Design:\s*/,''),
  meta:[(bundle.created||'').slice(0,10),bundle.setup.gene,bundle.setup.cell,bundle.setup.primer&&'Primer '+bundle.setup.primer,bundle.setup.sampleType,`${bundle.results.length}/${bundle.planned} reads`].filter(Boolean).join(' · ')+(bundle.stopped?' · stopped early':''),
  take,decisions,metricHead,
  figureHtml:outcomeGraph(bundle.results,bundle.setup.sampleType,false,false,workflow),
  note:'Provisional dual-engine screen (AssuredQC + TraceEdit). Scores are fitted contributions, not confirmed genotypes or allele frequencies. Differences >15 percentage points or fit R² <0.85 require review. Validate top picks independently before banking clones.',
  appendixHtml:appendix
 });
}

export function signalRange(r,engine,corrected=false){
 const values=targetsOf(r).map(t=>engine==='aq'?r.aq?.markers?.find(v=>variantKey(v)===variantKey(t))?.[corrected?'corrected':'raw']:r.te?.variants?.find(v=>variantKey(v)===variantKey(t))?.[corrected?'background_corrected_signal':'sample_alt_signal']);
 if(!values.length || values.some(v=>!Number.isFinite(v)))return '—';
 const lo=Math.min(...values),hi=Math.max(...values);return lo===hi?percent(lo):`${percent(lo)}–${percent(hi)}`;
}
export function interpretation(r){
 if(!r.aq?.ok || !r.te?.metrics || compare(r).label==='Input mismatch')return 'Analysis incomplete or inputs mismatched; no joint interpretation is available.';
 const n=targetsOf(r).length;
 return `${n?`Intended-base signal: AssuredQC ${signalRange(r,'aq',true)}, TraceEdit ${signalRange(r,'te',true)} after each engine’s background correction. `:''}Indel estimates: AssuredQC ${r.aq.summary.indelPct.toFixed(1)}%, TraceEdit ${percent(r.te.metrics.indel_fraction)}. ${n>1?'Multiple intended bases were selected. Bulk Sanger does not establish their co-occurrence on the same molecule. ':''}These are screening estimates, not confirmed precise-edit frequencies or percentages of edited cells. Ranges describe variation across bases, not confidence intervals. Do not add indel and substitution signals. ${r.aq.r2<.85?'AssuredQC has a weak fit; its allele decomposition needs review. ':''}${r.te.metrics.r_squared<.85?'TraceEdit has a weak fit; its allele decomposition needs review. ':''}Full-donor model percentages are not the target mutation frequency. Confirm the complete, indel-free edit by sequencing individual clones or an amplicon assay spanning the targets and cuts.`;
}
export function variantTable(r){
 const vs=[...new Map([...(r.aq?.markers||[]),...(r.te?.variants||[])].map(v=>[variantKey(v),v])).values()];
 if(!vs.length)return '';
 return '<h3>Per-base evidence</h3><table><tr><th>WT-read change</th><th>Role</th><th>AQ raw</th><th>TE raw</th><th>AQ corrected</th><th>TE corrected</th><th>AQ in fit</th></tr>'+vs.map(v=>{const a=r.aq?.markers?.find(x=>variantKey(x)===variantKey(v)),t=r.te?.variants?.find(x=>variantKey(x)===variantKey(v));return '<tr>'+[variantKey(v),targetsOf(r).some(x=>variantKey(x)===variantKey(v))?'Intended':'Other donor change',percent(a?.raw),percent(t?.sample_alt_signal),percent(a?.corrected),percent(t?.background_corrected_signal),a?.inFit?'Yes':'No'].map(x=>`<td>${esc(x)}</td>`).join('')+'</tr>';}).join('')+'</table><p>Coordinates are 1-based in the paired control. AQ corrected = alternate minus control signal; TE corrected = (alternate minus control)/(1 minus control). The engines also sample traces differently. Fit scores use different definitions and are not directly comparable.</p>';
}
export function poolOverview(bundle){
 return '<h2>Analysis summary</h2><p>Read-level estimates; repeated reads are not independent biological replicates. Intended-base signals must not be interpreted as precise-edit allele frequencies.</p>'+bundle.results.map(r=>`<p><b>${esc(r.sample)}</b>: ${esc(interpretation(r))}</p>`).join('');
}

export function qcStandaloneResults(bundle){return withRecommendations(bundle.results.map(r=>r.aq?.standalone?{...r.aq.standalone,workflow:r.workflow==='knockout'&&bundle.setup.guides?.length>1?'deletion':r.workflow||bundle.setup.workflow}:{name:r.sample,ok:false,error:r.aq?.error||'Re-run with QC 0.4.0 to generate its native detailed report.',warnings:[]}));}

function shortSample(sample){
 const base=String(sample||'').replace(/\.ab1.*$/i,'');
 const clone=base.match(/^cl(\d+)/i);
 return clone?'Clone '+clone[1]:base.split(/[_.]/)[0]||base;
}
export function engineDecisions(bundle,engine){
 const workflow=bundle.setup.workflow||bundle.results[0]?.workflow||'knockout';
 const sampleType=bundle.setup.sampleType||'clone';
 if(engine==='aq'&&bundle.results.some(r=>r.aq?.standalone)){
  const results=qcStandaloneResults(bundle);
  const rows=results.map(r=>{
   const rec=r.recommendation||{};
   const priority=rec.priority==='first'||rec.priority==='confirmed'||r.decision?.decision==='accept';
   const failed=!r.ok;
   const status=failed?'Resequence':rec.action||(r.decision?String(r.decision.decision):'Review');
   const metric=Number.isFinite(rec.score)?rec.score/100:Number.isFinite(r.summary?.intendedEditPct)?r.summary.intendedEditPct/100:Number.isFinite(r.summary?.koScorePct)?r.summary.koScorePct/100:null;
   const tier=priority?0:failed||rec.priority==='resequence'||rec.priority==='discard'?3:sampleType==='pool'||rec.priority==='none'?2:1;
   const why=Array.isArray(rec.why)?rec.why.join(' '):rec.why;
   return {label:shortSample(r.name),sample:r.name,status,metric,metricText:Number.isFinite(metric)?percent(metric):(Number.isFinite(rec.score)?String(rec.score):'—'),detail:why||r.decision?.reasons?.[0]||r.error||'AssuredQC estimate',priority,tier};
  });
  rows.sort((a,b)=>a.tier-b.tier||(b.metric??-1)-(a.metric??-1)||a.sample.localeCompare(b.sample));
  return {workflow,sampleType,engine:'aq',rows,top:rows.filter(r=>r.priority)};
 }
 const rows=bundle.results.map(r=>{
  if(engine==='te'){
   if(workflow==='knockout'){
    const simple=simpleResult(r,r.sampleType||sampleType,'traceedit');
    const metric=modelScores(r).te.ko??modelScores(r).te.indel;
    const priority=simple.status==='Test by Western blot';
    return {label:shortSample(r.sample),sample:r.sample,status:priority?'Validate by Western blot':simple.status,metric,metricText:Number.isFinite(metric)?percent(metric):'—',detail:simple.deletion,priority,tier:priority?0:simple.status==='Resequence'?3:simple.status==='Pool only'?2:1};
   }
   const g=desiredOutcome(r,'te');
   const metric=Number.isFinite(g.value)?g.value:null;
   const priority=sampleType!=='pool'&&Number.isFinite(metric)&&metric>=.9&&Number.isFinite(r.te?.metrics?.indel_fraction)&&r.te.metrics.indel_fraction<=.05&&Number.isFinite(r.te?.metrics?.r_squared)&&r.te.metrics.r_squared>=.95;
   const status=!r.te?.metrics?'Resequence':sampleType==='pool'?'Pool only':priority?'Prioritize for confirmation':g.value===null?'Review engines':'Review trace';
   return {label:shortSample(r.sample),sample:r.sample,status,metric,metricText:Number.isFinite(metric)?percent(metric):'—',detail:targetsOf(r).map(variantKey).join(', ')||g.label,priority,tier:priority?0:status==='Resequence'?3:status==='Pool only'?2:1};
  }
  const a=r.aq;
  if(!a?.ok)return {label:shortSample(r.sample),sample:r.sample,status:'Resequence',metric:null,metricText:'—',detail:a?.error||'AssuredQC failed',priority:false,tier:3};
  if(workflow==='snp'){
   const g=desiredOutcome(r,'aq');
   const metric=Number.isFinite(g.value)?g.value:Number.isFinite(a.summary?.intendedEditPct)?a.summary.intendedEditPct/100:null;
   const priority=sampleType!=='pool'&&Number.isFinite(metric)&&metric>=.9&&(a.summary?.indelPct??100)<=5&&(a.r2??0)>=.95;
   const status=sampleType==='pool'?'Pool only':priority?'Prioritize for confirmation':g.value===null?'Review engines':'Review trace';
   return {label:shortSample(r.sample),sample:r.sample,status,metric,metricText:Number.isFinite(metric)?percent(metric):'—',detail:targetsOf(r).map(variantKey).join(', ')||'Intended edit',priority,tier:priority?0:status==='Pool only'?2:1};
  }
  const metric=Number.isFinite(a.summary?.koScorePct)?a.summary.koScorePct/100:Number.isFinite(a.summary?.indelPct)?a.summary.indelPct/100:null;
  const priority=sampleType!=='pool'&&Number.isFinite(metric)&&metric>=.8&&(a.r2??0)>=.95;
  const status=sampleType==='pool'?'Pool only':priority?'Validate by Western blot':'Review trace';
  return {label:shortSample(r.sample),sample:r.sample,status,metric,metricText:Number.isFinite(metric)?percent(metric):'—',detail:`Indels ${Number.isFinite(a.summary?.indelPct)?a.summary.indelPct.toFixed(1)+'%':'—'}`,priority,tier:priority?0:status==='Pool only'?2:1};
 });
 rows.sort((a,b)=>a.tier-b.tier||(b.metric??-1)-(a.metric??-1)||a.sample.localeCompare(b.sample));
 return {workflow,sampleType,engine,rows,top:rows.filter(r=>r.priority)};
}
export function engineTakeHome(bundle,engine){
 const {workflow,sampleType,rows,top}=engineDecisions(bundle,engine);
 const name=engine==='aq'?'AssuredQC':'TraceEdit';
 if(sampleType==='pool'||rows.every(r=>r.status==='Pool only'))return {headline:'Pool screen — do not pick clones from these estimates.',body:`${name} pool reads judge editing activity only. Sequence individual clones before validation.`};
 if(!rows.length)return {headline:'No reads analysed.',body:'Re-run after adding control/sample pairs.'};
 if(top.length){
  const names=top.slice(0,5).map(r=>r.label);
  const more=top.length>5?` (+${top.length-5} more)`:'';
  return {headline:workflow==='snp'?`Advance ${names.join(', ')}${more} for confirmation sequencing.`:`Advance ${names.join(', ')}${more} for Western blot validation.`,
   body:`${name}-only provisional shortlist. Confirm independently before banking clones.`};
 }
 const review=rows.filter(r=>r.tier===1).slice(0,4).map(r=>r.label);
 return {headline:`No clone met ${name} top-pick thresholds.`,body:(review.length?`Review first: ${review.join(', ')}. `:'')+'Inspect traces before discarding borderline candidates.'};
}
export function engineReportHtml(bundle,engine){
 const name=engine==='aq'?'AssuredQC':'TraceEdit';
 const decisions=engineDecisions(bundle,engine);
 const take=engineTakeHome(bundle,engine);
 const workflow=decisions.workflow;
 const metricHead=workflow==='snp'?'Intended edit':'Editing / KO score';
 const figureHtml=engine==='te'&&workflow!=='snp'
  ?outcomeGraph(bundle.results,bundle.setup.sampleType,true,false,workflow)
  :outcomeGraph(bundle.results,bundle.setup.sampleType,false,false,workflow);
 const engineAppendix=()=>bundle.results.map(r=>{const a=engine==='aq',v=a?r.aq:r.te;
  if(!v || v.error || (a?!v.ok:!v.metrics))return `<section class="appendix-item"><h3>${esc(r.sample)}</h3><p>Analysis failed: ${esc(v?.error||'No result')}</p></section>`;
  const markers=a?v.markers:v.variants,contributions=a?v.contributions:v.outcomes;
  const table='<table><tr><th>Change</th><th>Role</th><th>Raw signal</th><th>Corrected signal</th></tr>'+(markers||[]).map(m=>'<tr>'+[variantKey(m),targetsOf(r).some(t=>variantKey(t)===variantKey(m))?'Intended':'Other donor change',percent(a?m.raw:m.sample_alt_signal),percent(a?m.corrected:m.background_corrected_signal)].map(x=>`<td>${esc(x)}</td>`).join('')+'</tr>').join('')+'</table>';
  const alleles='<table><tr><th>Model contribution</th><th>Type</th><th>Fraction</th></tr>'+(contributions||[]).map(c=>`<tr><td>${esc(c.label)}</td><td>${esc(c.kind)}</td><td>${percent(c.fraction)}</td></tr>`).join('')+'</table>';
  return `<section class="appendix-item"><h3>${esc(r.sample)}</h3><p>Control: ${esc(r.control)}</p><p>Indels: ${a?Number.isFinite(v.summary?.indelPct)?v.summary.indelPct.toFixed(1)+'%':'—':percent(v.metrics.indel_fraction)} · Fit R²: ${Number(a?v.r2:v.metrics.r_squared).toFixed(3)}</p><ul>${[...(v.warnings||[]),...(v.display_errors||[])].map(w=>`<li>${esc(w)}</li>`).join('')}</ul>${hdrCard(r,engine)}<details open><summary>Per-base evidence</summary>${table}</details><details><summary>Model contributions</summary>${alleles}</details>${a?'':Object.values(v.displays||{}).slice(0,1).map(d=>traceSvg(d,targetsOf(r))).join('')}<details><summary>Full engine output</summary><pre>${esc(JSON.stringify(v,null,2))}</pre></details></section>`;
 }).join('')+`<details><summary>Reviewed experiment</summary><pre>${esc(JSON.stringify(bundle.setup,null,2))}</pre></details>`;
 let appendixHtml=engineAppendix();
 if(engine==='aq'&&bundle.results.some(r=>r.aq?.standalone)){
  try{
   const results=qcStandaloneResults(bundle);
   const qcWorkflow=bundle.setup.workflow==='knockout'&&bundle.setup.guides?.length>1?'deletion':bundle.setup.workflow;
   const native=buildQcReportHtml({title:'Assured QC detailed evidence',workflow:qcWorkflow,design:bundle.setup.gene||'',results,generatedAt:new Date(bundle.created||Date.now()),notes:['Appendix from the standalone Assured QC template for this combined run.']});
   const protein=runProteinFigure(results)||'';
   appendixHtml=`<p class="muted">AssuredQC native ranking and allele evidence. Support scores are ordinal, not knockout probabilities.</p>${protein}<div class="appendix-item">${native}</div>`;
  }catch{/* incomplete native payloads fall back to engine appendix */}
 }
 return publicationDocument({
  eyebrow:`ASSURED · ${name.toUpperCase()} CLONE REPORT`,
  title:`${name} · ${bundle.setup.name.replace(/^Design:\s*/,'')}`,
  meta:[(bundle.created||'').slice(0,10),bundle.setup.gene,bundle.setup.sampleType,`${bundle.results.length} reads`,engine==='aq'?bundle.engines?.assuredQC:bundle.engines?.traceEdit].filter(Boolean).join(' · '),
  take,decisions,metricHead,figureHtml,
  note:`${name}-only publication screen from the shared reviewed setup. Fitted contributions are not confirmed allele frequencies. Validate top picks independently.`,
  appendixHtml
 });
}

export function nativeTraceEditRequest(bundle){
 const results=bundle.results.map(r=>{const t=structuredClone(r.te||{});delete t.plot;if(!t.metrics)return {sample:r.sample,status:'failed',error:t.error||'TraceEdit analysis failed',workflow:r.workflow,sampleType:r.sampleType||bundle.setup.sampleType};
 const targets=targetsOf(r);if(targets.length>1){t.target_variant=null;t.warnings=[...(t.warnings||[]),`Intended changes: ${targets.map(variantKey).join(', ')}. Multiple intended bases; no phase assignment.`];}
 t.workflow=r.workflow||bundle.setup.workflow;t.sampleType=r.sampleType||bundle.setup.sampleType;t.targets=targets;
 if(r.knockoutPrediction)t.knockoutPrediction=r.knockoutPrediction;if(r.westernBlot)t.westernBlot=r.westernBlot;
 return t;});
 const first=results.findIndex(r=>r.metrics&&Object.keys(r.displays||{}).length);if(first<0)throw Error('No usable TraceEdit chromatograms are available for a visual report.');
 const centers=Object.keys(results[first].displays).map(Number),hash=results[first].source_hashes.control;
 const indices=results.map((r,i)=>r.metrics&&r.source_hashes?.control===hash&&centers.every(c=>r.displays?.[c])?i:-1).filter(i=>i>=0).slice(0,12);
 results.forEach((r,i)=>{if(!indices.includes(i))delete r.displays;});
 return {bundle:{id:`unified-${bundle.created}`,created_utc:bundle.created,settings:{...bundle.setup,flank:18},results},indices,centers,title:('TraceEdit · '+bundle.setup.name).slice(0,75),flank:18,format:'report'};
}

function shortLabel(sample){
 const base=String(sample||'').replace(/\.ab1.*$/i,'');
 const clone=base.match(/^cl(\d+)/i);
 return clone?'Clone '+clone[1]:base.split(/[_.]/)[0]||base;
}
function decisionOf(r,sampleType,workflow){
 if(workflow==='knockout'){
  const simple=simpleResult(r,sampleType);
  const scores=modelScores(r);
  const metric=Number.isFinite(scores.te.ko)?scores.te.ko:Number.isFinite(scores.te.indel)?scores.te.indel:null;
  const priority=koAssessment(r,sampleType).priority==='Prioritize for Western blot';
  return {label:shortLabel(r.sample),sample:r.sample,status:simple.status==='Test by Western blot'?'Validate by Western blot':simple.status,metric,metricText:Number.isFinite(metric)?percent(metric):'—',detail:simple.deletion,priority,tier:priority?0:simple.status==='Resequence'?3:simple.status==='Pool only'?2:1};
 }
 const s=snpResult(r,sampleType);
 const metric=Number.isFinite(s.edit)?s.edit:null;
 return {label:shortLabel(r.sample),sample:r.sample,status:s.status,metric,metricText:Number.isFinite(metric)?percent(metric):'—',detail:s.label,priority:s.status==='Prioritize for confirmation',tier:s.status==='Prioritize for confirmation'?0:s.status==='Resequence'||s.status==='Input mismatch'?3:s.status==='Pool only'?2:1};
}
export function cloneDecisions(bundle){
 const workflow=bundle.setup.workflow||bundle.results[0]?.workflow||'knockout';
 const sampleType=bundle.setup.sampleType||'clone';
 const rows=bundle.results.map(r=>decisionOf(r,r.sampleType||sampleType,r.workflow||workflow));
 rows.sort((a,b)=>a.tier-b.tier||(b.metric??-1)-(a.metric??-1)||a.sample.localeCompare(b.sample));
 return {workflow,sampleType,rows,top:rows.filter(r=>r.priority)};
}
export function takeHomeMessage(bundle){
 const {workflow,sampleType,rows,top}=cloneDecisions(bundle);
 if(sampleType==='pool'||rows.every(r=>r.status==='Pool only')){
  return {headline:'Pool screen — do not pick clones from these estimates.',body:'Use these reads to judge editing activity in the bulk population, then sequence individual clones before validation.'};
 }
 if(!rows.length)return {headline:'No reads analysed.',body:'Re-run after adding control/sample pairs.'};
 if(top.length){
  const names=top.slice(0,5).map(r=>r.label);
  const more=top.length>5?` (+${top.length-5} more)`:'';
  return {headline:workflow==='snp'
   ?`Advance ${names.join(', ')}${more} for confirmation sequencing.`
   :`Advance ${names.join(', ')}${more} for Western blot validation.`,
   body:workflow==='snp'
   ?'These clones met provisional dual-engine intended-edit and quality thresholds. Confirm genotype independently before banking.'
   :'These clones met provisional dual-engine editing and coding-screen thresholds. Protein knockout still requires Western blot or equivalent validation.'};
 }
 const review=rows.filter(r=>r.tier===1).slice(0,4).map(r=>r.label);
 const bad=rows.filter(r=>r.tier===3).slice(0,3).map(r=>r.label);
 return {headline:'No clone met the provisional top-pick thresholds.',body:(review.length?`Review first: ${review.join(', ')}. `:'')+(bad.length?`Resequence or replace: ${bad.join(', ')}. `:'')+'Inspect traces before discarding borderline candidates.'};
}
export function compactOverview(bundle){
 const workflow=bundle.setup.workflow||(bundle.results[0]?.workflow)||'knockout';
 const {rows,top}=cloneDecisions(bundle);
 const table=rows.map(r=>`<tr class="${r.priority?'pick':''}"><td>${esc(r.label)}</td><td>${esc(r.status)}</td><td>${esc(r.metricText)}</td><td>${esc(r.detail)}</td></tr>`).join('');
 const title=workflow==='snp'?(top.length?top.length+' top clones to confirm':bundle.results.length+' reads analyzed'):(top.length?top.length+' top clones for Western blot':bundle.results.length+' reads analyzed');
 return `<div class="report-summary"><b>${esc(title)}</b><p>Screening shortlist · independent validation required.</p></div>${outcomeGraph(bundle.results,bundle.setup.sampleType,false,false,workflow)}<table class="rank"><tr><th>Clone</th><th>Next step</th><th>${workflow==='snp'?'Intended edit':'Editing / KO score'}</th><th>Note</th></tr>${table}</table>`;
}
