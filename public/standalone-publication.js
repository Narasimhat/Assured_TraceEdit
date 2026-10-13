import {nativeBundle,publicationOverview,downloadPublication,rasterParts} from './unified/publication.js';
const results=document.getElementById('results');
const evidence=document.createElement('details');evidence.id='sample-evidence';evidence.innerHTML='<summary>Inspect individual samples and traces</summary>';
const technical=document.createElement('details');technical.id='technical-exports';technical.innerHTML='<summary>Data and custom figure exports</summary>';
for(const child of [...results.children]){
 if(child.id==='clone-review'||child.classList.contains('section-title')){child.hidden=true;continue;}
 (child.id==='publication'||child.querySelector('#json')?technical:evidence).append(child);
}
results.append(evidence,technical);
const design=document.getElementById('design-import-panel');document.getElementById('edit-step').querySelector('h2').after(design);
window.TraceEditPublication={render(current){
 let root=document.getElementById('native-publication');if(!root){root=document.createElement('section');root.id='native-publication';results.prepend(root);}
 const adapted=nativeBundle(current);root.innerHTML=publicationOverview(adapted);
 const actions=document.createElement('div');actions.className='actions';
 const status=document.createElement('p');status.setAttribute('role','status');
 const add=(parent,label,format,part=0)=>{
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.onclick=async()=>{
   if(document.getElementById('run').disabled){status.textContent='Wait until analysis finishes.';return;}
   button.disabled=true;status.textContent='Preparing download...';
   try{await downloadPublication(adapted,format,part);status.textContent='Downloaded.';}
   catch(e){status.textContent=e.message;}finally{button.disabled=false;}
  };parent.append(button);
 };
 add(actions,'Download report','pdf');add(actions,'Editable figures + data','zip');root.prepend(actions);root.append(status);
 const raster=document.createElement('details');raster.innerHTML='<summary>High-resolution figures (600 dpi)</summary>';
 for(let part=0;part<rasterParts(adapted);part++)add(raster,`Download part ${part+1}`,'pngzip',part);
 root.append(raster);document.getElementById('clone-review').hidden=true;
}};
