// Explain the processing destination before a user selects experimental files.
(() => {
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 if(local)return;
 const status=document.querySelector('.local-indicator');
 if(status)status.textContent='Hosted workspace';
 const footer=document.querySelector('footer span');
 if(footer)footer.textContent='Research use · TraceEdit processes uploads on the server; Peaksplit runs in your browser.';
 const note=document.createElement('p');note.className='hint';note.textContent='TraceEdit sends selected AB1 files to the hosted server for analysis. Results stay in this tab until downloaded. Use the local app for files that must remain on your computer.';
 document.getElementById('reads-step').prepend(note);
 for(const a of document.querySelectorAll('a[href="/catalog.html"],a[href="/corpus.html"],a[href="#lageso-library"],a[download][href$="sample_sheet.csv"]'))a.hidden=true;
 const library=document.getElementById('lageso-library');
 if(library){const p=document.createElement('p');p.textContent='The project design library is available in the local app. Import a design report in Edit setup to analyze here.';library.prepend(p);library.querySelector('.panel').hidden=true;}
 const p=document.querySelector('#peaksplit .section-title p:not(.eyebrow)');if(p)p.textContent='Browser-based analysis for single-guide edits. Choose matching files and review each control/sample pair.';
})();
