import {escapeHtml as esc,percent,targetsOf} from './core.js';
export function estimatedHdr(row,engine){
 const donors=row.donorVariants;
 if(!donors?.length)return {value:null,status:'Not available',reason:'No mapped donor recorded. Re-run with a substitution donor.'};
 const unique=[...new Set(donors.map(vs=>vs.map(v=>`${v.ref}${v.position}${v.alt}`).sort().join(',')))];
 const r=engine==='aq'?row.aq:row.te;
 if(!r || r.error || (engine==='aq'?!r.ok:!r.metrics))return {value:null,status:'Unresolved',reason:'Engine analysis is incomplete.'};
 const fit=engine==='aq'?r.r2:r.metrics.r_squared;
 if(!Number.isFinite(fit)||fit<.85)return {value:null,status:'Unresolved',reason:'Fit below the workspace review threshold (R² 0.85).'};
 if(unique.length!==1)return {value:null,status:'Unresolved',reason:'Distinct donors share changes; a unique complete-donor total is not established.'};
 const variants=donors[0];
 if(!variants.length)return {value:null,status:'Not available',reason:'No donor substitutions mapped.'};
 if(engine==='aq'){
 if(variants.some(v=>!r.markers?.some(m=>m.position===v.position&&m.ref===v.ref&&m.alt===v.alt&&m.covered&&m.inFit)))return {value:null,status:'Unresolved',reason:'A donor site is not covered in the fit.'};
 const value=r.summary?.intendedEditPct;
 if(!Number.isFinite(value)||value<0||value>100)return {value:null,status:'Unresolved',reason:'Complete-donor fit unavailable.'};
 return {value:value/100,status:'Model estimate',reason:'Complete-donor fitted contribution without indels. Includes all mapped blocking changes. Multisite phase is not confirmed.'};
 }
 if(variants.length!==1)return {value:null,status:'Unresolved',reason:'TraceEdit substitution combinations cannot uniquely establish complete multisite donor incorporation.'};
 const value=r.metrics.substitution_fraction;
 if(!Number.isFinite(value)||value<0||value>1||r.variants?.length!==1)return {value:null,status:'Unresolved',reason:'A donor-specific substitution estimate is unavailable.'};
 return {value,status:'Model estimate',reason:'Single-substitution fitted contribution; this does not prove HDR repair or an indel-free edited molecule.'};
}
export function hdrCard(row,engine){const h=estimatedHdr(row,engine),targets=targetsOf(row);const signals=targets.map(t=>engine==='aq'?row.aq?.markers?.find(v=>v.position===t.position&&v.alt===t.alt)?.raw:row.te?.variants?.find(v=>v.position===t.position&&v.alt===t.alt)?.sample_alt_signal);const valid=signals.length&&signals.every(Number.isFinite);const target=valid?(Math.min(...signals)===Math.max(...signals)?percent(signals[0]):`${percent(Math.min(...signals))}–${percent(Math.max(...signals))}`):'Not available';return `<div class="hdr-card"><div><small>Estimated HDR · model-based</small><strong>${h.value===null?esc(h.status):percent(h.value)}</strong></div><div><small>Intended-base signal</small><strong>${target}</strong></div></div><details><summary>HDR estimate details</summary><p>${esc(h.reason)} Estimates are fitted signal contributions, not confirmed allele or cell frequencies. Do not add HDR, target signal and indels.</p></details>`;}
