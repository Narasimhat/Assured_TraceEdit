import {referenceFromFile} from './unified/reference.js';
import {readAnnotations} from './unified/annotations.js';
import {koAssessment,koCard} from './unified/knockout.js';
const $=id=>document.getElementById(id);
let reference=null,expected=null,revision=0,pending=Promise.resolve();
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function reset(){revision++;reference=null;expected=null;$('coding-status').textContent='Select an annotated GenBank reference for KO prediction.';$('coding-transcript').value='';}
async function design(html,title){
 reset();const id=revision;expected=readAnnotations(html,title).reference;
 if(!expected)return;
 try{const response=await fetch('/api/reference/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:expected})});const data=await response.json();if(id!==revision)return;if(!response.ok)throw Error();reference=data;$('coding-status').textContent='Reference ready: '+data.filename+' · '+data.sha256.slice(0,12);}
 catch{if(id===revision){$('coding-panel').open=true;$('coding-status').textContent='Choose '+expected+' below to enable KO prediction.';}}
}
$('coding-reference').onchange=async()=>{
 const file=$('coding-reference').files[0];if(!file)return;const id=++revision;reference=null;
 pending=(async()=>{try{const value=await referenceFromFile(file,expected,hash);if(id!==revision)return;reference=value;$('coding-status').textContent='Reference ready: '+value.filename+' · '+value.sha256.slice(0,12);}catch(e){if(id===revision)$('coding-status').textContent=e.message;}finally{$('coding-reference').value='';}})();await pending;
};
for(const name of ['new-setup','load-setup'])$(name).addEventListener('click',reset);
function rowFor(result,settings){const c=settings.project_context;return {te:result,knockoutPrediction:result.knockoutPrediction,contextVerified:c?.reviewed===true&&c.control_sha256===result.source_hashes?.control&&c.sample_sha256?.includes(result.source_hashes?.sample)};}
function assessment(result,settings){return koAssessment(rowFor(result,settings),settings.mode==='clones'?'clone':'pool','traceedit');}
window.TraceEditCoding={
 design:(html,title)=>{pending=design(html,title);return pending;},
 async snapshot(){await pending;return reference?{...reference,transcript:$('coding-transcript').value.trim()}:null;},
 async analyze(result,control,context,settings){
  if($('setup-edit').value!=='knockout')return;
  try{if(!context)throw Error('No annotated reference selected.');const form=new FormData();form.append('control',control);form.append('reference',context.text);form.append('transcript',context.transcript);form.append('result',JSON.stringify({source_hashes:result.source_hashes,metrics:result.metrics,outcomes:result.outcomes}));const response=await fetch('/api/knockout-prediction',{method:'POST',body:form});const data=await response.json();if(!response.ok)throw Error(data.error||'Coding prediction failed.');result.knockoutPrediction=data;}
  catch(e){result.knockoutPrediction={value:null,error:e.message};}
  result.westernBlot=assessment(result,settings);
 },
 card(result,settings){const box=document.createElement('div');box.innerHTML=koCard(rowFor(result,settings),settings.mode==='clones'?'clone':'pool','traceedit');return box;},
 summary(bundle,host){host.replaceChildren();const n=bundle.results.filter(r=>assessment(r,bundle.settings).priority==='Prioritize for Western blot').length;const title=document.createElement('h3');title.textContent=n+' candidates for Western blot · TraceEdit only';host.append(title);const p=document.createElement('p');p.textContent='Predictive screening · select a sample for coding evidence.';host.append(p);}
};
