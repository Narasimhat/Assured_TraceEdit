(() => {
 const $=id=>document.getElementById(id);let reads=[],evidence=[],page=0,jobs=null;
 const labels={qc_candidate:'QC candidate',review:'Needs review',parse_error:'Not usable by app'};
 const cell=(row,text)=>{const td=document.createElement('td');td.textContent=text;row.append(td);return td;};
 function render(){
  const q=$('search').value.trim().toLowerCase(),year=$('year').value,status=$('qc').value;
  const filtered=reads.filter(r=>(!year||r.sources.some(s=>s.year===year))&&(!q||r.sources.some(s=>s.path.toLowerCase().includes(q)))&&(!status||(status==='duplicates'?r.copies>1:status==='unlinked'?!r.guide_hits?.length:r.status===status)));
  page=Math.min(page,Math.max(0,Math.ceil(filtered.length/50)-1));$('reads').replaceChildren();
  for(const r of filtered.slice(page*50,(page+1)*50)){
   const tr=document.createElement('tr'),s=r.sources[0],td=cell(tr,s.path.split(/[\\/!]/).pop());
   const small=document.createElement('small');small.textContent=s.project;td.append(small);
   const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Sources and hash';pre.textContent=r.sha256+'\n'+r.sources.map(s=>s.path).join('\n');details.append(summary,pre);td.append(details);
   cell(tr,`${labels[r.status]||r.status}${r.q20_fraction!=null?' · '+Math.round(100*r.q20_fraction)+'% Q20':''}${r.issues.length?'\n'+r.issues.join('; '):''}`);
   cell(tr,r.copies);const projects=[...new Set((r.guide_hits||[]).flatMap(g=>g.projects))];cell(tr,projects.length?projects.join(', ')+' (unverified)':'Not linked');$('reads').append(tr);
  }
  $('read-count').textContent=`${filtered.length.toLocaleString()} unique files match. Q20 is base-call quality; low values can also accompany genuine mixed traces.`;
  $('page').textContent=`Page ${page+1} / ${Math.max(1,Math.ceil(filtered.length/50))}`;$('previous').disabled=page===0;$('next').disabled=(page+1)*50>=filtered.length;
 }
 function renderEvidence(){
  const q=$('evidence-search').value.toLowerCase();const matches=evidence.filter(e=>(!q?e.kind==='tool_comparison'||e.kind==='review_candidate':(e.path+' '+e.excerpt).toLowerCase().includes(q)));
  $('evidence').replaceChildren();for(const e of matches.slice(0,50)){const tr=document.createElement('tr');const td=cell(tr,e.path);const details=document.createElement('details'),s=document.createElement('summary'),pre=document.createElement('pre');s.textContent='Extracted text preview';pre.textContent=e.excerpt;details.append(s,pre);td.append(details);cell(tr,e.kind+(e.limits.length?' · '+e.limits.join('; '):''));$('evidence').append(tr);}
  $('evidence-count').textContent=`Showing ${Math.min(50,matches.length)} of ${matches.length} matching documents. Refine your search to see other records.`;
 }
 async function get(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(path+' unavailable');return r.json();}
 async function poll(){try{const s=await get('/api/batch');$('batch-status').textContent=`${s.status}: ${s.completed}/${s.total}${s.errors?' · '+s.errors+' errors':''}${s.error?' · '+s.error:''}`;$('cancel-batch').disabled=s.status!=='running';$('run-batch').disabled=s.status==='running'||!jobs;$('batch-report').hidden=!s.report;if(s.status==='running')setTimeout(poll,1500);}catch(e){$('batch-status').textContent=e.message;}}
 document.addEventListener('DOMContentLoaded',async()=>{
  try{const [s,r]=await Promise.all([get('/corpus/summary.json'),get('/corpus/reads.json')]);reads=r;
   for(const [value,label] of [[s.unique_byte_hashes,'unique trace files'],[s.duplicate_copies,'duplicate copies'],[(s.qc_counts.review||0)+(s.qc_counts.parse_error||0),'need quality review'],[s.confirmed_truth_labels,'verified truth labels']]){const div=document.createElement('div');div.className='stat';const strong=document.createElement('strong');strong.textContent=value.toLocaleString();div.append(strong,document.createTextNode(label));$('stats').append(div);}
   for(const y of Object.keys(s.year_occurrences).sort())$('year').add(new Option(y,y));$('issues').textContent=s.coverage+'\n'+JSON.stringify(s.issues,null,2);render();
  }catch(e){$('error').textContent=e.message;}
  for(const id of ['year','qc','search'])$(id).addEventListener('input',()=>{page=0;render();});$('previous').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
  try{const [s,e]=await Promise.all([get('/corpus/evidence-summary.json'),get('/corpus/evidence.json')]);evidence=e;$('evidence-summary').textContent=`${s.unique_documents} unique documents extracted; ${s.comparator_rows} comparator records. ${s.errors.length} extraction issues. `+s.coverage;$('issues').textContent+='\nDocument issues:\n'+JSON.stringify(s.errors,null,2);renderEvidence();}catch{}
  $('evidence-search').oninput=renderEvidence;
  try{const r=await get('/corpus/retrospective.json');const failed=r.results.filter(x=>x.status==='error').length;const fitted=r.results.length-failed;$('retrospective').textContent=`${r.eligible_pairs} documented DECODR run records reanalyzed: ${fitted} fits and ${failed} rejected runs. Multiple exports can represent the same sample. ${r.review_queue.length} other exports need mapping or model review. `+r.interpretation;}catch{$('retrospective').textContent='Historical comparison is not yet available.';}
  try{const b=await get('/corpus/benchmark.json');$('benchmark').textContent=`Synthetic stress check: ${b.cases} cases; supported-case mean absolute error ${(100*b.supported_mae).toFixed(2)} percentage points. ${b.unsupported_not_flagged}/${b.unsupported_cases} out-of-scope or invalid cases escaped review/rejection. This is not biological accuracy.`;}catch{$('benchmark').textContent='Synthetic benchmark not available.';}
  $('manifest').onchange=async()=>{try{const file=$('manifest').files[0];if(!file||file.size>3_000_000)throw Error('Choose a JSON manifest under 3 MB');jobs=JSON.parse(await file.text()).jobs;if(!Array.isArray(jobs))throw Error('Manifest needs a jobs array');$('run-batch').disabled=false;$('batch-status').textContent=`${jobs.length} jobs ready for validation.`;}catch(e){jobs=null;$('run-batch').disabled=true;$('batch-status').textContent=e.message;}};
  $('run-batch').onclick=async()=>{try{const r=await fetch('/api/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs})});const s=await r.json();if(!r.ok)throw Error(s.error);poll();}catch(e){$('batch-status').textContent=e.message;}};
  $('cancel-batch').onclick=async()=>{await fetch('/api/batch/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});poll();};poll();
 });
})();
