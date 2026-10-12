import {escapeHtml as esc,percent} from './core.js';

export function koAssessment(row,sampleType='clone'){
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
 const good=paired&&a.r2>=.95&&t.metrics?.r_squared>=.95&&t.alignment?.baseline_mae<=.08&&t.alignment?.sample_q20_fraction>=.7&&t.inference?.control_q20_fraction>=.7;
 const aqProxy=(a?.contributions||[]).filter(c=>Number.isFinite(c.size)&&c.size%3!==0).reduce((n,c)=>n+c.fraction,0);
 const teProxy=(t?.outcomes||[]).filter(c=>Number.isFinite(c.net_bp)&&c.net_bp%3!==0).reduce((n,c)=>n+c.fraction,0);
 const consistent=Math.abs(aqProxy-teProxy)<=.15;
 const warning=[...(a?.warnings||[]),...(t?.warnings||[]),...(t?.display_errors||[])].some(w=>!/Two-guide model includes/i.test(w));
 if(!good)result.reasons.push('Input identity, fit or trace-quality checks require review.');
 if(!consistent)result.reasons.push('Engines disagree on out-of-frame contributions by more than 15 percentage points.');
 if(warning)result.reasons.push('Engine warnings require inspection before prioritization.');
 if(p.value>=.8&&p.unresolved<=.1&&good&&consistent&&!warning)result.priority='Prioritize for Western blot';
 else result.reasons.push('Does not meet all provisional priority thresholds; this does not exclude a functional knockout.');
 if(p.splice_disruptive>0)result.reasons.push('NMD cannot be inferred for the splice-site outcomes until the RNA consequence is established.');
 result.reasons.push('Heuristic triage, not a validated probability of knockout, biallelic editing or Western blot success. Other isoforms and escape mechanisms remain possible.');
 return result;
}

export function koCard(row,sampleType='clone'){
 const a=koAssessment(row,sampleType),p=row.knockoutPrediction;
 return `<section class="goal-card"><small>Possible KO contribution · predictive screening</small><strong>${a.value===null?'Unresolved':percent(a.value)}</strong><b>${esc(a.priority)}</b><ul>${a.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>${p?.reference?`<p>Reference: ${esc(p.reference)} · transcript ${esc(p.transcript?.join(', ')||'single annotated CDS')} · fingerprint ${esc(p.reference_sha256?.slice(0,12))}</p>`:''}<details><summary>Predicted coding changes and NMD</summary><pre>${esc(JSON.stringify(p?.outcomes||[],null,2))}</pre><p>${esc(p?.limitations||'A reliable coding consequence has not been established.')}</p><p>Priority thresholds: ≥80% possible-KO model contribution; ≤10% unresolved contribution; both fits R² ≥0.95; adequate native trace quality; no unresolved engine warnings; out-of-frame estimates within 15 percentage points. These thresholds require independent validation.</p></details></section>`;
}
