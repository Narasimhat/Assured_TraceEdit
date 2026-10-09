(() => {
  const $ = id => document.getElementById(id);
  let library = [];
  const seq = s => (s || '').replace(/\s/g, '').toUpperCase();
  const choice = (items, value) => /^\d+$/.test(value) ? items?.[Number(value)] : undefined;
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function refreshSelection() {
    const r=selected(),g=choice(r?.guides,$('project-guide').value),d=choice(r?.donors,$('project-donor').value);
    $('send-project').disabled=!g || !/^[ACGT]+$/.test(seq(g.sequence)) || (Boolean(r?.donors?.length) && (!d || !/^[ACGT]+$/.test(seq(d.sequence))));
  }
  function selected() { return library.find(x => x.project_id === $('project-select').value); }
  function renderDesign() {
    const record = selected(); if (!record) {
      $('project-guide').replaceChildren();$('project-donor').replaceChildren();
      $('project-guide-source').textContent='';$('project-donor-source').textContent='';
      $('project-summary').textContent='No matching project. Change the search to choose a design.';
      refreshSelection();return;
    }
    const guides = record.guides || [], donors = record.donors || [];
    $('project-guide').innerHTML = guides.length ? (guides.length>1?'<option value="">Choose a guide</option>':'') + guides.map((x,i)=>`<option value="${i}">${esc(x.name)} · ${esc(x.sequence)}</option>`).join('') : '<option value="">No parsed guide sequence</option>';
    $('project-donor').innerHTML = donors.length ? (donors.length>1?'<option value="">Choose a donor</option>':'') + donors.map((x,i)=>`<option value="${i}">${esc(x.name)} · ${x.sequence.length} nt</option>`).join('') : '<option value="">No donor (KO / not provided)</option>';
    if (guides.length===1) $('project-guide').value='0';
    if (donors.length===1) $('project-donor').value='0';
    $('project-summary').textContent = `${record.project_id} · ${record.target_gene||'target unspecified'} · ${record.modification_type||'type unspecified'} · ${record.cell_line_name||record.parental_cell_line||'cell line unspecified'} · ${guides.length} guide(s), ${donors.length} donor(s)`;
    $('project-guide-source').textContent=record.guide_text||'No guide text recorded.';
    $('project-donor-source').textContent=record.donor_text||'No donor text recorded.';
    refreshSelection();
  }
  function renderList() {
    const q=$('project-search').value.trim().toLowerCase();
    const matches=library.filter(x=>[x.project_id,x.target_gene,x.parental_cell_line,x.cell_line_name,x.modification_type].join(' ').toLowerCase().includes(q));
    const previous=$('project-select').value;
    $('project-select').innerHTML=matches.map(x=>`<option value="${esc(x.project_id)}">${esc(x.project_id)} · ${esc(x.target_gene||'target?')} · ${esc(x.modification_type||'type?')}</option>`).join('')||'<option value="">No matching projects</option>';
    if(matches.some(x=>x.project_id===previous))$('project-select').value=previous;
    renderDesign();
  }
  async function init(){
    try{
      const response=await fetch('/lageso_projects.json',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();library=data.records||[];renderList();
      $('project-search').addEventListener('input',renderList);
      $('project-select').addEventListener('change',renderDesign);
      $('project-guide').addEventListener('change',refreshSelection);
      $('project-donor').addEventListener('change',refreshSelection);
      $('send-project').addEventListener('click',()=>{
        refreshSelection();if($('send-project').disabled)return;
        const r=selected(),g=choice(r?.guides,$('project-guide').value),d=choice(r?.donors,$('project-donor').value);
        if(!g){$('project-summary').textContent='Select a parsed guide before continuing.';return;}
        const frame=document.querySelector('#peaksplit iframe');
        const send=()=>frame.contentWindow.postMessage({type:'load-lageso-design',project:r.project_id,label:`${r.project_id} · ${r.target_gene}`,guide:seq(g.sequence),donor:d?seq(d.sequence):''},location.origin);
        if(frame.contentDocument?.readyState==='complete' && frame.contentWindow.location.pathname==='/peaksplit/')send();
        else {frame.addEventListener('load',send,{once:true});frame.loading='eager';}
        location.hash='peaksplit';$('project-summary').textContent=`Loaded ${r.project_id} into Peaksplit. Choose the AB1 files and inspect the pairing before analysis.`;
      });
    }catch(e){$('project-summary').textContent=`Could not load the local LAGESO project library: ${e.message}`;}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
