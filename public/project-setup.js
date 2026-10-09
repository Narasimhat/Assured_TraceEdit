/* Browser-local setup records. Review declarations are not biological validation. */
(() => {
  const $=id=>document.getElementById(id), key='traceedit.project-setups.v1';
  const fields=['setup-name','setup-gene','setup-cell','setup-primer','setup-edit','guides','donor','cuts','variants','target-variant','target-label','centers','deletion','insertion','window','flank','mode'];
  const coordinates=['cuts','variants','target-variant','centers'];
  let records=[],active=null,controlHash=null,revision=0,pending=null,confirmedDesign=null;
  const el=(tag,text)=>{const x=document.createElement(tag);x.textContent=text;return x;};
  function values(){return Object.fromEntries(fields.map(id=>[id,$(id).value]));}
  function designKey(){return JSON.stringify(values());}
  function notice(text){$('setup-status').textContent=text;}
  function list(){
    $('saved-setup').replaceChildren(new Option('Choose a saved project…',''));
    for(const r of records)$('saved-setup').append(new Option(r.values['setup-name']+' · '+(r.values['setup-gene']||'Gene unspecified'),r.id));
    $('saved-setup').value=active||'';
  }
  function store(){localStorage.setItem(key,JSON.stringify(records));}
  function issues(){
    const issues=[];
    for(const [id,label] of [['setup-name','Project name'],['setup-gene','Gene'],['setup-cell','Cell line'],['setup-primer','Sequencing primer']])if(!$(id).value.trim())issues.push(label+' is missing.');
    if(!$('guides').value.trim()&&!$('cuts').value.trim())issues.push('Guide or control-read cut position is missing.');
    if($('setup-edit').value!=='knockout'&&!$('target-variant').value.trim())issues.push('Assign the intended SNP after mapping the donor to this control.');
    if(!$('design-confirmed').checked||confirmedDesign!==designKey())issues.push('Confirm the current design against the experimental record.');
    if(!$('control').files.length)issues.push('Choose the matching control read.');
    else if(!controlHash)issues.push('Control identity is being checked or could not be verified.');
    if(!$('samples').files.length)issues.push('Add sample reads.');
    if(!$('pairing-confirmed').checked)issues.push('Confirm that every selected sample belongs to this control and primer. Split ambiguous samples into another batch.');
    return issues;
  }
  function render(){
    if(confirmedDesign&&confirmedDesign!==designKey()){confirmedDesign=null;$('design-confirmed').checked=false;}
    const todo=issues();$('metadata-count').textContent=todo.length?`${todo.length} setup items to review`:'Setup reviewed for this batch';
    $('metadata-items').replaceChildren(...todo.map(x=>el('li',x)));
    $('metadata-ready').textContent=todo.length?'Analysis can continue provisionally; clone prioritization waits for confirmed setup.':'Your declarations will be recorded with the analysis. They do not confirm genotype or function.';
  }
  function invalidate(){confirmedDesign=null;$('design-confirmed').checked=false;$('pairing-confirmed').checked=false;render();}
  async function hash(file){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');}
  async function controlChanged(){
    const n=++revision;controlHash=null;$('pairing-confirmed').checked=false;
    coordinates.forEach(id=>$(id).value='');confirmedDesign=null;$('design-confirmed').checked=false;render();
    const f=$('control').files[0];if(!f)return;
    try{
      const h=await hash(f);if(n!==revision)return;controlHash=h;
      if(pending&&pending.control_sha256===h){coordinates.forEach(id=>$(id).value=pending.values[id]||'');notice('Matching control verified. Saved read coordinates restored; review the current setup.');}
      else if(pending)notice('Different control: saved read coordinates were cleared. Map the donor or enter coordinates for this read.');
      pending=null;render();
    }catch(e){notice('Could not verify control identity. '+e.message);render();}
  }
  $('save-setup').onclick=()=>{
    if($('control').files.length&&!controlHash){notice('Wait for control identity verification before saving.');return;}
    if(!$('setup-name').value.trim()){notice('Enter a project name first.');$('setup-name').focus();return;}
    const record={id:active||crypto.randomUUID(),values:values(),control_sha256:controlHash,updated_utc:new Date().toISOString()};
    const next=records.filter(x=>x.id!==record.id).concat(record),previous=records;records=next;
    try{store();active=record.id;list();notice('Project setup saved in this browser. Re-select AB1 files for each batch.');}catch(e){records=previous;notice('Could not save: browser storage is unavailable or full.');}
  };
  $('load-setup').onclick=()=>{
    const record=records.find(x=>x.id===$('saved-setup').value);if(!record)return;
    active=record.id;fields.forEach(id=>$(id).value=record.values[id]||'');
    coordinates.forEach(id=>$(id).value='');$('control').value='';$('samples').value='';controlHash=null;revision++;pending=record;invalidate();
    $('donor-options').open=Boolean($('donor').value);notice('Loaded '+record.values['setup-name']+'. Choose reads; coordinates are restored only for the identical saved control.');
  };
  $('new-setup').onclick=()=>{
    active=null;pending=null;controlHash=null;revision++;fields.forEach(id=>$(id).value='');
    Object.entries({'setup-edit':'knockout',deletion:'20',insertion:'2',window:'120',flank:'10',mode:'clones'}).forEach(([id,v])=>$(id).value=v);
    $('control').value='';$('samples').value='';list();invalidate();notice('New project setup. Saved projects remain available.');
  };
  $('design-confirmed').onchange=()=>{confirmedDesign=$('design-confirmed').checked?designKey():null;render();};
  $('pairing-confirmed').onchange=render;
  fields.forEach(id=>$(id).addEventListener('input',invalidate));
  $('control').addEventListener('change',controlChanged);
  $('samples').addEventListener('change',()=>{$('pairing-confirmed').checked=false;render();});
  // Imported designs and donor mapping can change fields programmatically.
  new MutationObserver(()=>{if(confirmedDesign!==designKey()){confirmedDesign=null;$('design-confirmed').checked=false;}render();}).observe($('design-status'),{childList:true,subtree:true,characterData:true});
  async function snapshot(control,samples){
    render();
    const h=await hash(control),sampleHashes=await Promise.all(samples.map(hash));
    const missing=issues();
    if(h!==controlHash)missing.push('Control identity has changed since setup review.');
    if(sampleHashes.includes(h))missing.push('A selected sample is byte-identical to the control; review its assignment.');
    return {project_id:active,project_name:$('setup-name').value.trim(),gene:$('setup-gene').value.trim(),cell_line:$('setup-cell').value.trim(),primer:$('setup-primer').value.trim(),edit_type:$('setup-edit').value,reviewed:missing.length===0,reviewed_utc:missing.length?null:new Date().toISOString(),control_sha256:h,sample_sha256:sampleHashes,missing,review_basis:'User experimental-record declaration; not independent biological validation.'};
  }
  window.TraceEditSetup={snapshot,refresh:render};
  try{const data=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(data)||data.some(r=>!r.id||!r.values))throw Error();records=data;list();}catch{notice('Saved setups could not be loaded. Existing storage has not been overwritten.');}
  render();
})();
