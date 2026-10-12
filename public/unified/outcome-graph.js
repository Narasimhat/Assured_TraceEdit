import {escapeHtml as esc,percent} from './core.js';
import {koAssessment} from './knockout.js';
export function outcomeGraph(rows,sampleType='clone',native=false,interactive=false){
 const width=1040,height=116+rows.length*56;
 let body=`<title>Editing results by sample</title><desc>Blue: TraceEdit indel signal. KO bars: green prioritize, amber review. Missing predictions have no bar. Fitted contributions are not knockout probabilities.</desc><rect width="1040" height="${height}" fill="white"/><g font-family="Arial,sans-serif" fill="#18352f"><text x="16" y="25" font-size="17" font-weight="bold">Editing results by sample</text><text x="210" y="53" font-size="13">Indel signal · TraceEdit</text><text x="510" y="53" font-size="13">Possible KO contribution</text><text x="820" y="53" font-size="13">Next step</text>`;
 for(const x of [210,510])for(const n of [0,50,100])body+=`<text x="${x+n*2.4}" y="72" font-size="10" text-anchor="${n===0?'start':n===100?'end':'middle'}" fill="#65786e">${n}%</text>`;
 rows.forEach((r,i)=>{
  const t=native?r:r.te,p=r.knockoutPrediction;
  const context=native?r._contextVerified:undefined;
  const a=koAssessment(native?{te:t,knockoutPrediction:p,contextVerified:context}:r,r.sampleType||sampleType,native?'traceedit':'dual');
  const value=a.value,indel=t?.metrics?.indel_fraction,y=88+i*56;
  const status=!t?.metrics?'No reliable fit':value===null?'Add / check reference':a.priority==='Prioritize for Western blot'?'Western blot':a.priority.startsWith('Pool only')?'Pool only':'Review evidence';
  const color=status==='Western blot'?'#278366':status==='Pool only'?'#637e89':'#bd862c';
  const label=(r.sample||'Sample').replace(/\.ab1.*$/i,'');const clone=label.match(/^cl(\d+)_/i);const short=clone?'Clone '+clone[1]:label.length>23?label.slice(0,22)+'…':label;
  body+=`<g ${interactive?`role="button" tabindex="0" data-sample="${i}" aria-label="Inspect ${esc(r.sample)}" style="cursor:pointer"`:''}><title>${esc(r.sample)} · Indels ${percent(indel)} · Possible KO ${value===null?'unavailable':percent(value)} · ${status}</title><rect x="0" y="${y-9}" width="1040" height="54" fill="${i%2?'#f6f8f5':'#ffffff'}"/><text x="16" y="${y+15}" font-size="12">${i+1}. ${esc(short)}</text>`;
  for(const [x,v,c] of [[210,indel,'#568baa'],[510,value,color]]){
   if(Number.isFinite(v)){body+=`<rect x="${x}" y="${y}" width="240" height="21" rx="4" fill="#e9eeea"/><rect x="${x}" y="${y}" width="${Math.max(0,Math.min(1,v))*240}" height="21" rx="4" fill="${c}"/><text x="${x+246}" y="${y+15}" font-size="12">${percent(v)}</text>`;}
   else body+=`<text x="${x}" y="${y+15}" font-size="12" fill="#79847e">Not available</text>`;
  }
  body+=`<text x="820" y="${y+15}" font-size="12" fill="${color}">${status}</text></g>`;
 });
 body+=`<text x="16" y="${height-5}" font-size="11" fill="#65786e">Fitted signal contributions · validate protein loss by Western blot${native?' · TraceEdit only':''}</text></g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;min-width:760px;height:auto" role="${interactive?'group':'img'}" aria-label="Editing results by sample">${body}</svg>`;
}
export function bindOutcomeGraph(host,inspect){host.querySelectorAll('[data-sample]').forEach(n=>{n.onclick=()=>inspect(Number(n.dataset.sample));n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect(Number(n.dataset.sample));}};});}
