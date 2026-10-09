/* Shared by the analysis workspace and printable project reports. */
window.deletionView = function(result) {
  const section = document.createElement('section');
  const e = result.deletion_evidence;
  if (!e) return section;
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = n => (100*n).toFixed(1)+'%';
  section.className = 'deletion-evidence';
  section.innerHTML = `<h3>Deletion evidence</h3><p><strong>${esc(e.size_distribution.filter(x=>x.fraction>=.05).map(x=>`${x.size_bp} bp deletion: ${pct(x.fraction)} model contribution`).join(' · ') || 'No deletion size reaches 5% model contribution.')}</strong></p><p>${esc(e.note)}</p>`;
  for (const g of e.groups) {
    const card = document.createElement('div');card.className='deletion-card';
    card.innerHTML = `<h4>−${esc(g.size_bp)} bp · ${esc(pct(g.fraction))} model contribution</h4>
      <svg viewBox="0 0 900 125" role="img" aria-label="${esc(g.size_bp)} base deletion schematic, not to scale" style="width:100%;max-width:900px">
      <text x="0" y="30" font-size="16">WT control</text><rect x="145" y="12" width="180" height="26" fill="#237e75"/><rect x="325" y="12" width="360" height="26" fill="#f9d6d3"/><rect x="685" y="12" width="190" height="26" fill="#237e75"/>
      <text x="505" y="31" text-anchor="middle" font-size="15">${esc(g.size_bp)} bp segment</text>
      <text x="0" y="82" font-size="16">Deletion model</text><rect x="145" y="63" width="180" height="26" fill="#237e75"/><path d="M325 76H685" stroke="#c34737" stroke-width="2" stroke-dasharray="7 5"/><rect x="685" y="63" width="190" height="26" fill="#237e75"/>
      <text x="505" y="112" text-anchor="middle" font-size="14">Removed segment · retained flanks join together</text></svg>
      <p>Representative interval: control bases <strong>${esc(g.start)}–${esc(g.end)}</strong> (inclusive). ${g.equivalent_intervals.length>1?`${esc(g.equivalent_intervals.length)} placements produce the same repaired sequence; the exact breakpoint is ambiguous.`:''} Schematic is not to scale.</p>
      <details><summary>Reference sequence and equivalent breakpoints</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">Left flank: ${esc(g.left)}
Deleted:    ${esc(g.deleted)}
Right flank:${esc(g.right)}
Equivalent control intervals: ${esc(g.equivalent_intervals.map(x=>`${x.start}–${x.end}`).join(', '))}</pre></details>
      ${g.expected_junction?`<p><strong>Junction check:</strong> ${esc(g.matching_calls)} / ${esc(g.compared_calls)} base calls match this model; minimum Q${esc(g.min_quality)} across the displayed 24 calls.</p><pre style="overflow:auto">Expected  ${esc(g.expected_junction.slice(0,12))} | ${esc(g.expected_junction.slice(12))}
Observed  ${esc(g.observed_calls.slice(0,12))} | ${esc(g.observed_calls.slice(12))}</pre><p>The bar marks the predicted junction after oriented sample base ${esc(g.sample_junction_after_base)}. Mixed peaks can produce misleading single base calls; this check does not confirm an allele.</p>`:''}`;
    if (g.trace) {
      const w=g.trace, ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
      svg.setAttribute('viewBox','0 0 1000 200');svg.setAttribute('role','img');svg.setAttribute('aria-label','Observed sample chromatogram across the predicted deletion junction');svg.style.width='100%';
      const append=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(text!==undefined)el.textContent=text;svg.append(el);};
      const x=p=>25+(p-w.start+.5)/(w.end-w.start+1)*950;
      append('line',{x1:x(g.sample_junction_after_base+.5),x2:x(g.sample_junction_after_base+.5),y1:10,y2:165,stroke:'#c34737','stroke-dasharray':'5 4'});
      ['#16a05a','#2568bc','#252525','#e23b37'].forEach((color,c)=>append('path',{d:w.x.map((p,i)=>(i?'L':'M')+x(p).toFixed(2)+','+(135-100*w.y[i][c]).toFixed(2)).join(' '),stroke:color,fill:'none','stroke-width':1.4}));
      w.positions.forEach((p,i)=>append('text',{x:x(p),y:157,'text-anchor':'middle','font-size':13},w.calls[i]));
      append('text',{x:25,y:190,'font-size':13},`Observed sample bases ${w.start}–${w.end} (${result.alignment?.orientation||'oriented read'}). A green · C blue · G black · T red.`);
      card.append(svg);
    }
    section.append(card);
  }
  return section;
};
