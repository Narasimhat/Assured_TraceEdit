const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(){const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'});dom.window.scrollTo=()=>{};dom.window.eval(fs.readFileSync('public/guided-ui.js','utf8'));return dom;}
test('guided workflow preserves inputs while moving between edit, reads and results',()=>{
 const dom=setup(),w=dom.window,d=w.document;
 d.getElementById('to-reads').click();assert.equal(d.getElementById('reads-step').hidden,true);assert.match(d.getElementById('error').textContent,/guide/);
 d.getElementById('guides').value='ACGT'.repeat(5);d.getElementById('to-reads').click();assert.equal(d.getElementById('reads-step').hidden,false);assert.equal(d.getElementById('edit-step').hidden,true);
 w.traceEditResultsUpdated({id:'run1',results:[{}]});assert.equal(d.getElementById('results').hidden,false);assert.equal(d.getElementById('workspace').hidden,true);
 d.querySelector('[data-step="1"]').click();assert.equal(d.getElementById('guides').value,'ACGT'.repeat(5));assert.equal(d.getElementById('results').hidden,true);
 dom.window.close();
});
test('background results do not reopen a panel over secondary tools',()=>{
 const dom=setup(),w=dom.window,d=w.document;w.location.hash='peaksplit';w.dispatchEvent(new w.HashChangeEvent('hashchange'));
 w.traceEditResultsUpdated({id:'run1',results:[{}]});assert.equal(d.getElementById('peaksplit').hidden,false);assert.equal(d.getElementById('results').hidden,true);
 d.querySelector('[data-step="3"]').click();assert.equal(d.getElementById('peaksplit').hidden,true);assert.equal(d.getElementById('results').hidden,false);dom.window.close();
});
