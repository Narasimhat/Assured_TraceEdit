import {donorsOf,targetsOf} from './core.js';
import {parseAbif} from './vendor/assured-qc/abif.js';
import {specFromControl} from './vendor/assured-qc/manualSpec.js';
import {analysePair} from './vendor/assured-qc/analyze.js';
import {chromatogramFigure} from './vendor/assured-qc/figure.js';
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
self.onmessage=async ({data:m})=>{
  try {
    const control=parseAbif(m.control.buffer,m.control.name);
    if(control.calls.length<150 || control.calls.length>4000)throw Error('Control read must contain 150–4000 bases.');
    if(m.action==='prepare'){
      const plans=(donorsOf(m.setup).length?donorsOf(m.setup):['']).map((donor,i)=>{
        const p=specFromControl({control,guides:m.setup.guides,donor,gene:m.setup.gene});
        if(p.error)throw Error(p.error);
        if(p.spec.donors.some(d=>d.insertBp || d.replacedBp))throw Error('Only substitution donors are supported.');
        if(donor && !p.spec.markers.length)throw Error('No donor substitutions were mapped.');
        p.spec.donors.forEach(d=>{d.name=`Donor ${i+1}`;d.carriesMarkers=p.spec.markers.map(v=>v.pos);});
        return p;
      });
      const p=structuredClone(plans[0]),markers=new Map();
      for(const plan of plans)for(const v of plan.spec.markers){const old=markers.get(v.pos);if(old && (old.ref!==v.ref || old.alt!==v.alt))throw Error('Donors specify conflicting alternate bases at the same position. Analyze separately.');markers.set(v.pos,v);}
      p.spec.markers=[...markers.values()].sort((a,b)=>a.pos-b.pos);
      p.spec.donors=plans.flatMap(p=>p.spec.donors);
      p.warnings=[...new Set(plans.flatMap(p=>p.warnings||[]))];
      if(p.spec.markers.length>6)throw Error('Both-engine screening supports at most six distinct donor substitutions.');
      self.postMessage({ok:true,spec:p.spec,warnings:p.warnings,hash:await hash(m.control.buffer)});return;
    }
    const edited=parseAbif(m.sample.buffer,m.sample.name);
    if(edited.calls.length<150 || edited.calls.length>4000)throw Error('Sample read must contain 150–4000 bases.');
    const spec=structuredClone(m.spec);
    spec.markers.forEach(v=>{v.role=targetsOf(m).some(t=>v.pos===t.position-1 && v.alt===t.alt)?'intended':'blocking';v.label=v.role==='intended'?'Intended SNP':'Other donor change';});
    const first=Math.min(...spec.guides.map(g=>g.cut));
    const last=Math.max(...spec.guides.map(g=>g.cut));
    const pre=Math.max(40,...spec.markers.map(v=>first-v.pos+5));
    const post=Math.max(150,...spec.markers.map(v=>v.pos-last+5));
    if(pre>150 || post>250)throw Error('Donor changes lie too far from the cut for this comparison. Review the design in the separate apps.');
    const options={preCut:pre,postCut:post,sampleType:m.setup.sampleType};
    const r=analysePair({control,edited,spec,options});
    if(!r.ok)throw Error(r.error);
    const markers=r.markerReadout.map(v=>({position:v.marker.pos+1,ref:v.marker.ref,alt:v.marker.alt,role:v.marker.role,covered:v.covered,raw:v.altEdited,control:v.altControl,corrected:v.altNet,inFit:v.marker.pos>=r.prepared.window.start && v.marker.pos<r.prepared.window.end}));
    const result={ok:true,summary:r.summary,r2:r.decomposition.r2,markers,warnings:[...(m.planWarnings||[]),...r.warnings],contributions:r.decomposition.contributions,genotype:r.genotype,window:r.prepared.window,options,controlHash:await hash(m.control.buffer),sampleHash:await hash(m.sample.buffer)};
    if(m.figure){try{result.figure=chromatogramFigure({name:m.sample.name,controlTrace:control,editedTrace:edited,spec,sampleType:m.setup.sampleType,workflow:m.setup.workflow,options}).svg;}catch(e){result.figureError=e.message;}}
    self.postMessage(result);
  }catch(e){self.postMessage({ok:false,error:e.message||String(e)});}
};
