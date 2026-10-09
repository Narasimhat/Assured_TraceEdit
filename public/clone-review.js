/* Transparent screening rules, not a validated genotype classifier. */
(function(root){
  const number=x=>typeof x==='number'&&Number.isFinite(x);
  const pct=x=>(100*x).toFixed(1)+'%';
  function review(r,settings={}){
    const result={tier:'review',title:'Review before choosing',reasons:[],warnings:[...(r.warnings||[])]};
    const reason=s=>result.reasons.push(s);
    if(!r.metrics){result.tier='repeat';result.title='No reliable call';reason(r.error||'Analysis failed.');return result;}
    const m=r.metrics,a=r.alignment||{},q=r.inference?.control_q20_fraction;
    const poor=!number(m.r_squared)||m.r_squared<.95||!number(a.baseline_mae)||a.baseline_mae>.08||!number(q)||q<.7||!number(a.sample_q20_fraction)||a.sample_q20_fraction<.7;
    reason(number(m.r_squared)?`Fit R² ${m.r_squared.toFixed(3)}.`:'Fit quality unavailable.');
    if(poor)reason('Fit, upstream agreement or trace-quality evidence does not meet the screening thresholds; inspect or repeat the read.');
    const boundary=Boolean(r.display_errors?.length)||(r.warnings||[]).some(w=>!/^Two-guide model includes|^Sanger mixtures cannot phase/.test(w));
    const target=r.target_variant||settings.target_variant;
    if((r.variants||[]).length){
      if(!target){reason('Intended mutation is not assigned. Specify it before prioritizing clones; other donor changes cannot substitute for the target.');return result;}
      const v=r.variants.find(v=>v.position===target.position&&v.ref===target.ref&&v.alt===target.alt);
      if(!v||!number(v.background_corrected_signal)){reason('Intended-mutation signal is unavailable.');return result;}
      reason(`${target.label||'Target'} (${v.ref}${v.position}${v.alt}): ${pct(v.background_corrected_signal)} corrected alternate signal.`);
      const qualities=[];
      for(const d of Object.values(r.displays||{}))for(const role of ['control','sample']){
        const w=d[role],i=w?.positions?.indexOf(v.position);
        if(i>=0&&number(w.quality?.[i]))qualities.push(w.quality[i]);
      }
      const quality=qualities.length>=2?Math.min(...qualities):null;
      reason(quality===null?'Target base quality unavailable.':`Minimum target base quality Q${quality} across available control/sample windows.`);
      reason(number(m.indel_fraction)?`${pct(m.indel_fraction)} fitted indel signal.`:'Indel signal unavailable.');
      if(v.background_corrected_signal>=.9&&quality>=30&&number(m.indel_fraction)&&m.indel_fraction<=.05&&!poor&&!boundary){result.tier='prioritize';result.title='Prioritize for confirmation';}
      else if(v.background_corrected_signal>=.2&&v.background_corrected_signal<.9)reason('Mixed target signal may fit a heterozygous goal, but Sanger signal cannot assign genotype or phase.');
      else if(v.background_corrected_signal<.2)reason('Little intended alternate signal; this read is not strong evidence of the requested edit.');
      reason('Other donor changes and allele phase still require review.');
    }else{
      const groups=[...(r.deletion_evidence?.groups||[])].sort((a,b)=>b.fraction-a.fraction),g=groups[0];
      if(!g){reason('No resolved deletion sequence supports prioritization.');return result;}
      reason(`${g.size_bp} bp deletion model: ${pct(g.fraction)} signal contribution; junction ${g.matching_calls??'?'}/${g.compared_calls??'?'} calls, minimum Q${g.min_quality??'?'}.`);
      const dominant=g.fraction>=.9&&groups.slice(1).every(x=>x.fraction<.1);
      const junction=number(g.min_quality)&&g.min_quality>=30&&g.compared_calls>=24&&g.matching_calls===g.compared_calls;
      if(g.size_bp%3===0)reason('Deletion length is a multiple of three; it would preserve frame in a coding region. This is not sufficient evidence of knockout.');
      else reason('Deletion length is compatible with a frameshift only if it lies in the relevant coding region. Functional knockout is unconfirmed.');
      if(!dominant)reason('Multiple or weak deletion models make clone interpretation uncertain.');
      if(dominant&&junction&&!poor&&!boundary&&g.size_bp%3!==0){result.tier='prioritize';result.title='Prioritize for confirmation';}
    }
    const context=settings.project_context;
    const verified=context?.reviewed===true&&context.control_sha256===r.source_hashes?.control&&context.sample_sha256?.includes(r.source_hashes?.sample);
    if(!verified){
      result.tier='review';result.title='Review setup before choosing';
      reason('Sample/control and design assignments are unconfirmed for this result. Confirm setup, then reanalyse; changing the current form does not validate an earlier run.');
      for(const item of context?.missing||[])reason(item);
    }else reason('Project, design and pairing were declared reviewed for these exact source files; independent confirmation is still pending.');
    if(settings.mode==='bulk'){result.tier='review';result.title='Bulk sample — review evidence';reason('Bulk analysis cannot identify an individual clone to choose.');}
    return result;
  }
  function render(bundle,host,inspect){
    host.replaceChildren();
    const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
    const entries=bundle.results.map((r,i)=>({r,i,...review(r,bundle.settings)}));
    if(bundle.settings?.project_context?.project_name)host.append(el('p','Analysis project: '+bundle.settings.project_context.project_name+' · '+bundle.settings.project_context.gene));
    const strong=entries.filter(x=>x.tier==='prioritize');
    host.append(el('h3','Which clones should I follow up?'),el('p',`${strong.length} to prioritize for confirmation · ${entries.filter(x=>x.tier==='review').length} need review · ${entries.filter(x=>x.tier==='repeat').length} have no reliable call`),el('p','Provisional screening suggestions, not validated clone rankings. High signal does not establish homozygosity, complete donor incorporation or functional knockout. Clone choices depend on your desired genotype.'));
    const sorted=[...strong,...entries.filter(x=>x.tier!=='prioritize')];
    const cards=el('div','');cards.className='clone-choices';host.append(cards);
    const more=el('details','');more.append(el('summary',`Show remaining ${Math.max(0,entries.length-3)} samples and reasons`));
    for(const [j,x] of sorted.entries()){
      const card=el('article','');card.className='clone-choice '+x.tier;
      card.append(el('strong',x.title),el('h4',x.r.sample));
      const list=el('ul','');x.reasons.forEach(r=>list.append(el('li',r)));card.append(list);
      if(x.warnings.length){const d=el('details','');d.append(el('summary',`${x.warnings.length} analysis warning(s)`));x.warnings.forEach(w=>d.append(el('p',w)));card.append(d);}
      const button=el('button','Inspect evidence');button.type='button';button.className='secondary';button.onclick=()=>inspect(x.i);card.append(button);
      (j<3?cards:more).append(card);
    }
    if(entries.length>3)host.append(more);
    const rules=el('details','');rules.append(el('summary','How these suggestions are made'),el('p','Unvalidated screening thresholds: R² ≥0.95, upstream disagreement ≤0.08, ≥70% Q20 bases in the sample anchor and control inference window, and no search-boundary warning. Substitution: assigned target signal ≥90%, target Q≥30 in control/sample, indel signal ≤5%. Deletion: one sequence contributes ≥90%, complete ≥24-base junction match at Q≥30, and length not divisible by three. The coding frame and desired genotype are not inferred. Samples meeting the same rules are listed in input order; confirm with independent evidence.'));host.append(rules);
  }
  root.TraceEditReview={review,render};
  if(typeof module!=='undefined')module.exports={review};
})(typeof window!=='undefined'?window:globalThis);
