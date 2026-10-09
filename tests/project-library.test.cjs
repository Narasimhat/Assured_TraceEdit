const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM(`<input id="project-search"><select id="project-select"></select><select id="project-guide"></select><select id="project-donor"></select><p id="project-summary"></p><pre id="project-guide-source"></pre><pre id="project-donor-source"></pre><button id="send-project"></button><section id="peaksplit"><iframe src="/peaksplit/"></iframe></section>`,{url:'http://localhost/',runScripts:'outside-only'});
 const w=dom.window;w.fetch=async()=>({ok:true,json:async()=>({records:[{project_id:'P1',target_gene:'Target',guides:[{name:'first',sequence:'A'.repeat(20)},{name:'second',sequence:'C'.repeat(20)}],donors:[{name:'first',sequence:'A'.repeat(80)},{name:'second',sequence:'C'.repeat(80)}]}]})});
 w.eval(fs.readFileSync('public/project-library.js','utf8'));await new Promise(r=>setTimeout(r,20));return dom;
}
test('multiple choices require explicit selection and changing donors preserves guide',async()=>{
 const d=await setup(),w=d.window,el=id=>w.document.getElementById(id);
 assert.equal(el('send-project').disabled,true);
 el('project-guide').value='1';el('project-guide').dispatchEvent(new w.Event('change'));
 assert.equal(el('send-project').disabled,true);
 el('project-donor').value='1';el('project-donor').dispatchEvent(new w.Event('change'));
 assert.equal(el('project-guide').value,'1');assert.equal(el('project-donor').value,'1');assert.equal(el('send-project').disabled,false);
 el('project-donor').value='';el('project-donor').dispatchEvent(new w.Event('change'));assert.equal(el('send-project').disabled,true);d.window.close();
});
test('empty search results clear the previous design',async()=>{
 const d=await setup(),w=d.window,el=id=>w.document.getElementById(id);
 el('project-search').value='absent';el('project-search').dispatchEvent(new w.Event('input'));
 assert.equal(el('project-guide').options.length,0);assert.equal(el('send-project').disabled,true);d.window.close();
});
