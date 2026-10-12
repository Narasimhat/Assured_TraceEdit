// Use server-reported execution mode, including local servers accessed over a LAN.
(async () => {
  const label=document.getElementById('workspace-build');
  try {
    const response=await fetch('/api/health',{cache:'no-store'});
    if(!response.ok)throw Error('Health request failed');
    const info=await response.json();
    const local=info.storage==='local-and-stateless';
    label.textContent=`${local?'Local':'Online'} · v${info.workspace_version||'?'} · build ${info.build||'unknown'}`;
    document.getElementById('local-projects').hidden=!local;
    label.title=local?'TraceEdit runs on this computer; AssuredQC runs in the browser.':'TraceEdit runs on the hosted server; AssuredQC runs in the browser.';
  } catch {
    label.textContent='Workspace version unavailable';
  }
})();
