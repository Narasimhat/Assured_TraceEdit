import {escapeHtml as esc,percent} from './core.js';

export function koAssessment(row,sampleType='clone',evidence='dual'){
 const p=row.knockoutPrediction,a=row.aq,t=row.te;
 const result={value:null,priority:'Review coding context',reasons:[],method:'wb-priority/1'};
 if(!p||!Number.isFinite(p.value)){result.reasons.push(p?.error||'No coding-aware prediction. Resolve the reference from the design HTML in the local app.');return result;}
 if(p.control_sha256!==t?.source_hashes?.control){result.reasons.push('Reference prediction and native result have different control identities.');return result;}
 result.value=p.value;result.priority='Review before Western blot';
 result.reasons.push(`${percent(p.value)} possible-KO fitted contribution in the selected transcript.`);
 result.reasons.push(`${percent(p.coding_truncating)} coding frameshift/premature-stop; ${percent(p.splice_disruptive)} canonical splice-site disruption (RNA outcome unresolved).`);
 result.reasons.push(`${percent(p.nmd_susceptible)} predicted NMD-susceptible; ${percent(p.in_frame)} in-frame coding edits; ${percent(p.unresolved)} unresolved effects.`);
 if(sampleType!=='clone'){result.priority='Pool only — select individual clones';return result;}
 const paired=a?.ok&&a.controlHash===t?.source_hashes?.control&&a.sampleHash===t?.source_hashes?.sample;
 const good=row.contextVerified!==false&&(evidence==='traceedit'||(paired&&a.r2>=.95))&&t.metrics?.r_squared>=.95&&t.alignment?.baseline_mae<=.08&&t.alignment?.sample_q20_fraction>=.7&&t.inference?.control_q20_fraction>=.7;
 const aqProxy=(a?.contributions||[]).filter(c=>Number.isFinite(c.size)&&c.size%3!==0).reduce((n,c)=>n+c.fraction,0);
 const teProxy=(t?.outcomes||[]).filter(c=>Number.isFinite(c.net_bp)&&c.net_bp%3!==0).reduce((n,c)=>n+c.fraction,0);
 const consistent=evidence==='traceedit'||Math.abs(aqProxy-teProxy)<=.15;
 const warning=[...(a?.warnings||[]),...(t?.warnings||[]),...(t?.display_errors||[])].some(w=>!/^(Two-guide model includes|Coding context:)/i.test(w));
 if(!good)result.reasons.push('Input identity, fit or trace-quality checks require review.');
 if(!consistent)result.reasons.push('Engines disagree on out-of-frame contributions by more than 15 percentage points.');
 if(warning)result.reasons.push('Engine warnings require inspection before prioritization.');
 if(p.value>=.8&&p.unresolved<=.1&&good&&consistent&&!warning)result.priority='Prioritize for Western blot';
 else result.reasons.push('Does not meet all provisional priority thresholds; this does not exclude a functional knockout.');
 if(p.splice_disruptive>0)result.reasons.push('NMD cannot be inferred for the splice-site outcomes until the RNA consequence is established.');
 if(evidence==='traceedit'){result.method='wb-priority/1-traceedit';result.reasons.push('TraceEdit-only screening; independent engine agreement has not been checked.');}
 result.reasons.push('Heuristic triage, not a validated probability of knockout, biallelic editing or Western blot success. Other isoforms and escape mechanisms remain possible.');
 return result;
}

function detailedKoCard(row,sampleType='clone',evidence='dual'){
 const a=koAssessment(row,row.sampleType||sampleType,evidence),p=row.knockoutPrediction;
 const mechanism=(a.value===null?'Coding prediction unavailable':p.splice_disruptive>p.coding_truncating?'Predicted splice-site disruption':'Predicted coding disruption')+(evidence==='traceedit'?' · TraceEdit only':'');
 const segments=[['Coding',p?.coding_truncating,'#285d50'],['Splice',p?.splice_disruptive,'#629f91'],['Unresolved',p?.unresolved,'#dbb87a']];
 return `<section class="goal-card compact-ko"><div class="heading"><div><small>Possible KO contribution</small><strong>${a.value===null?'—':percent(a.value)}</strong></div><div><b>${esc(a.priority)}</b><p>${mechanism}</p></div></div>${a.value===null?'':`<div class="effect-bar" role="img" aria-label="${esc(segments.map(([n,v])=>n+' '+percent(v)).join(', '))}">${segments.map(([n,v,c])=>`<span style="width:${Math.max(0,Math.min(100,(v||0)*100))}%;background:${c}" title="${n}: ${percent(v)}"></span>`).join('')}</div><div class="effect-key">${segments.map(([n,v])=>`<span>${n} ${percent(v)}</span>`).join('')}</div>`}<small>Fitted contribution, not KO probability · validate by Western blot.</small><details><summary>Evidence & limitations</summary><ul>${a.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul><p>${esc(p?.reference||'No reference')} · ${esc(p?.transcript?.join(', ')||'')} · ${esc(p?.reference_sha256?.slice(0,12)||'')}</p><p>${esc(p?.limitations||'A reliable coding consequence has not been established.')}</p><details><summary>Predicted coding changes and NMD</summary><pre>${esc(JSON.stringify(p?.outcomes||[],null,2))}</pre></details></details></section>`;
}

// Presentation only: retain engine estimates and use the existing validation triage.
export function simpleResult(row,sampleType='clone',evidence='dual'){
 const a=koAssessment(row,row.sampleType||sampleType,evidence),t=row.te;
 const editing=Number.isFinite(t?.metrics?.indel_fraction)?t.metrics.indel_fraction:null;
 const sizes=new Map();for(const o of t?.outcomes||[])if(Number.isFinite(o.net_bp)&&Number.isFinite(o.fraction)&&o.net_bp!==0)sizes.set(o.net_bp,(sizes.get(o.net_bp)||0)+o.fraction);
 const main=[...sizes].filter(([,v])=>v>=.2).sort((a,b)=>b[1]-a[1]).slice(0,2);
 const deletion=main.length?main.map(([n])=>`${n>0?'+':''}${n} bp`).join(' / '):editing===0?'No edit detected':'Unresolved';
 const status=editing===null?'Resequence':a.value===null?'Review reference':a.priority==='Prioritize for Western blot'?'Test by Western blot':a.priority.startsWith('Pool only')?'Pool only':'Review trace';
 return {editing,deletion,status,assessment:a};
}
export function koCard(row,sampleType='clone',evidence='dual'){
 const s=simpleResult(row,sampleType,evidence);
 return `<section class="goal-card compact-ko"><div class="heading"><div><small>Indels · QC / TraceEdit</small><strong>${evidence==='traceedit'?'':Number.isFinite(row.aq?.summary?.indelPct)?row.aq.summary.indelPct.toFixed(1)+'% / ':'— / '}${s.editing===null?'Unavailable':percent(s.editing)}</strong></div><div><b>${esc(s.deletion)}</b><p>${esc(s.status)}</p></div></div><small>Editing estimate, not confirmed protein knockout.</small><details><summary>Coding prediction &amp; evidence</summary>${detailedKoCard(row,sampleType,evidence)}</details></section>`;
}
