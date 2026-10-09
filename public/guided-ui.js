(() => {
  const get=id=>document.getElementById(id);
  let current=1, seenRun=null, analysisVisible=true;
  function step(n){
    if(n===3 && !window.traceEditHasResults)return;
    current=n;
    analysisVisible=true;
    for(const el of document.querySelectorAll('[data-view]'))el.hidden=true;
    get('analysis-shell').hidden=false;get('run-status').hidden=false;
    get('progress').hidden=n===1;
    get(n===3?'results':'workspace').hidden=false;
    get('edit-step').hidden=n!==1;get('reads-step').hidden=n!==2;
    for(const b of document.querySelectorAll('[data-step]')){
      b.setAttribute('aria-current',Number(b.dataset.step)===n?'step':'false');
    }
    if(location.hash!=='#workspace' && location.hash!=='#results')history.replaceState(null,'','#workspace');
    window.scrollTo({top:0,behavior:'instant'});
  }
  function route(){
    const target=location.hash.slice(1);
    if(!target || target==='workspace')return step(current===3?1:current);
    if(target==='results'||target==='publication'){
      if(!window.traceEditHasResults)return step(1);
      step(3);if(target==='publication')get('publication').open=true;return;
    }
    const panel=document.querySelector('[data-view="'+(['lageso-library','peaksplit','method'].includes(target)?target:'workspace')+'"]');
    if(panel.id==='workspace')return step(1);
    analysisVisible=false;
    for(const el of document.querySelectorAll('[data-view]'))el.hidden=el!==panel;
    get('analysis-shell').hidden=true;get('run-status').hidden=true;
    document.querySelector('.tool-menu').open=false;
  }
  window.traceEditResultsUpdated = run => {
    window.traceEditHasResults=Boolean(run.results.length);
    document.querySelector('[data-step="3"]').disabled=!window.traceEditHasResults;
    if(run.id!==seenRun){seenRun=run.id;if(analysisVisible)step(3);}
    if(!analysisVisible||current!==3)get('results').hidden=true;
  };
  get('to-reads').onclick=()=>{
    if(!get('guides').value.trim()&&!get('cuts').value.trim()){
      get('error').textContent='Enter a guide sequence or import a design to continue.';get('guides').focus();return;
    }
    get('error').textContent='';step(2);
  };
  get('back-edit').onclick=()=>step(1);
  for(const b of document.querySelectorAll('[data-step]'))b.onclick=()=>step(Number(b.dataset.step));
  get('analysis-form').addEventListener('invalid',event=>{event.preventDefault();step(2);},true);
  new MutationObserver(()=>{
    if(get('donor').value.trim()||get('variants').value.trim())get('donor-options').open=true;
  }).observe(get('design-status'),{childList:true,subtree:true,characterData:true});
  window.addEventListener('hashchange',route);route();
  window.addEventListener('load',()=>{if(analysisVisible)window.scrollTo({top:0,behavior:'instant'});});
})();
