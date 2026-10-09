import {escapeHtml as esc,percent,targetsOf} from './core.js';
export function estimatedHdr(row,engine){
 const donors=row.donorVariants;
 const unavailable=reason=>({value:null,partial:null,status:'Unresolved',reason});
 if(!donors?.length)return {...unavailable('No mapped donor recorded. Re-run with a substitution donor.'),status:'Not available'};
 const r=engine==='aq'?row.aq:row.te;
 if(!r || r.error || (engine==='aq'?!r.ok:!r.metrics))return unavailable('Engine analysis is incomplete.');
 const key=v=>`${v.ref}${v.position}${v.alt}`;
 const signatures=[...new Map(donors.filter(d=>d.length).map(d=>[d.map(key).sort().join('+'),d])).values()];
 if(!signatures.length)return unavailable('No donor substitutions mapped.');
 const known=new Set(signatures.flat().map(key));
 if(engine==='aq' && signatures.flat().some(v=>!r.markers?.some(m=>key(m)===key(v)&&m.covered&&m.inFit)))return unavailable('A donor site is outside the fitted coverage.');
 if(engine==='te' && signatures.flat().some(v=>!r.variants?.some(m=>key(m)===key(v)&&Number.isFinite(m.sample_alt_signal))))return unavailable('A donor site is missing from TraceEdit evidence.');
 const outcomes=engine==='aq'?r.contributions:r.outcomes;
 if(!Array.isArray(outcomes))return unavailable('Fitted sequence contributions missing. Re-run analysis.');
 let full=0,partial=0,unclassified=0,equivalent=false;
 for(const o of outcomes){
 if(!Number.isFinite(o.fraction)||o.fraction<0)return unavailable('Invalid fitted weights.');
 const size=engine==='aq'?o.size:o.net_bp;if(size!==0)continue;
 if((engine==='aq'&&o.kind==='wt')||(engine==='te'&&o.kind==='wild_type'))continue;
 if(engine==='aq'&&!['edit','edit_partial'].includes(o.kind))continue;
 if(engine==='te'&&o.kind!=='substitution')continue;
 let carried;
 if(engine==='aq'){
 if(!Array.isArray(o.carries)){unclassified+=o.fraction;continue;}
 carried=new Set(r.markers.filter(m=>o.carries.includes(m.position-1)).map(key));
 equivalent ||= Boolean(o.indistinguishable);
 }else{
 const tokens=String(o.label).split('+');
 if(!tokens.every(t=>known.has(t))){unclassified+=o.fraction;continue;}
 carried=new Set(tokens);equivalent ||= (o.equivalent_proposals||[]).some(label=>label!==o.label);
 }
 // A fitted outcome is counted once, even when compatible with multiple donors.
 if(signatures.some(d=>d.every(v=>carried.has(key(v)))))full+=o.fraction;
 else if([...carried].some(k=>known.has(k)))partial+=o.fraction;
 }
 if(unclassified>1e-6)return unavailable('Some substitution contributions lack a donor assignment.');
 if(full+partial>1.001)return unavailable('Fitted weights exceed the expected total.');
 const fit=engine==='aq'?r.r2:r.metrics.r_squared;
 if(!Number.isFinite(fit))return unavailable('Fit score unavailable.');
 const flags=[];
 if(fit<.85)flags.push('Weak fit (R² below 0.85).');
 if(signatures.length>1)flags.push('Multiple donors; shared outcomes counted once. Donor-specific origin is not established.');
 if(known.size>1)flags.push('Multisite phase is model-dependent; alternative mixtures may explain the same peaks.');
 if(equivalent)flags.push('The engine reports equivalent candidate sequences.');
 return {value:full,partial,status:flags.length?'Provisional model estimate':'Model estimate',reason:'Best-fit contribution of zero-length-change outcomes containing every mapped change of at least one donor, including blocking changes. Partial = other donor-change outcomes without a complete donor signature. '+flags.join(' ')+' No uncertainty interval or unique molecular composition is established.',method:'donor-compatible-outcome-union/1'};
}
export function hdrCard(row,engine){const h=estimatedHdr(row,engine),targets=targetsOf(row);const signals=targets.map(t=>engine==='aq'?row.aq?.markers?.find(v=>v.position===t.position&&v.alt===t.alt)?.raw:row.te?.variants?.find(v=>v.position===t.position&&v.alt===t.alt)?.sample_alt_signal);const valid=signals.length&&signals.every(Number.isFinite);const target=valid?(Math.min(...signals)===Math.max(...signals)?percent(signals[0]):`${percent(Math.min(...signals))}–${percent(Math.max(...signals))}`):'Not available';return `<div class="hdr-card"><div><small>Estimated HDR · best fit</small><strong>${h.value===null?esc(h.status):percent(h.value)}</strong><small>${esc(h.status)}</small>${h.partial===null||h.partial===undefined?'':`<small>Partial donor-pattern: ${percent(h.partial)}</small>`}</div><div><small>Intended-base signal</small><strong>${target}</strong></div></div><details><summary>HDR estimate details</summary><p>${esc(h.reason)} Estimates are fitted signal contributions, not confirmed allele or cell frequencies. Do not add HDR, target signal and indels.</p></details>`;}
