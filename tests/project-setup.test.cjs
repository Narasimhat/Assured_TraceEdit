const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const {JSDOM}=require('jsdom');
function setup(){
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:webcrypto});
 w.eval(fs.readFileSync('public/project-setup.js','utf8'));
 const d=w.document,$=id=>d.getElementById(id);
 const change=id=>$(id).dispatchEvent(new w.Event('change',{bubbles:true}));
 const file=content=>({name:content+'.ab1',arrayBuffer:async()=>new TextEncoder().encode(content).buffer});
 const select=(id,files)=>{Object.defineProperty($(id),'files',{configurable:true,value:files});change(id);};
 return {dom,w,$,change,file,select};
}
async function ready($){for(let i=0;i<100;i++){if(!$('metadata-items').textContent.includes('identity is being'))return;await new Promise(r=>setTimeout(r,10));}throw Error('Control hash did not finish');}
test('saved setup restores coordinates only for identical control bytes',async()=>{
 const {dom,w,$,file,select}=setup();
 $('setup-name').value='NALCN E280D';$('setup-gene').value='NALCN';$('guides').value='ACGT';
 const control=file('original');select('control',[control]);await ready($);
 $('variants').value='A201C';$('target-variant').value='A201C';$('save-setup').click();
 assert.match($('setup-status').textContent,/saved/);
 $('load-setup').click();assert.equal($('target-variant').value,'');
 select('control',[file('different')]);await ready($);assert.equal($('target-variant').value,'');
 $('load-setup').click();select('control',[control]);await ready($);assert.equal($('target-variant').value,'A201C');
 assert.equal($('design-confirmed').checked,false);
 assert.equal(JSON.parse(w.localStorage.getItem('traceedit.project-setups.v1')).length,1);
 dom.window.close();
});
test('review declarations bind exact files and invalidate after changed design or sample selection',async()=>{
 const {dom,w,$,change,file,select}=setup();
 for(const [id,value] of Object.entries({'setup-name':'MYD88 KO','setup-gene':'MYD88','setup-cell':'Line A','setup-primer':'F1',guides:'ACGT'}))$(id).value=value;
 const control=file('wt'),sample=file('clone');select('control',[control]);select('samples',[sample]);await ready($);
 $('design-confirmed').checked=true;change('design-confirmed');$('pairing-confirmed').checked=true;change('pairing-confirmed');
 const snapshot=await w.TraceEditSetup.snapshot(control,[sample]);assert.equal(snapshot.reviewed,true);assert.equal(snapshot.sample_sha256.length,1);
 $('guides').value='GGGG'; // Programmatic edits also invalidate by snapshot comparison.
 assert.equal((await w.TraceEditSetup.snapshot(control,[sample])).reviewed,false);
 select('samples',[file('new')]);assert.equal($('pairing-confirmed').checked,false);
 assert.equal(snapshot.reviewed,true); // Historical declaration remains immutable.
 dom.window.close();
});
test('storage failure is visible rather than claiming a successful save',()=>{
 const {dom,w,$}=setup();$('setup-name').value='Project';
 w.Storage.prototype.setItem=()=>{throw Error('quota');};$('save-setup').click();
 assert.match($('setup-status').textContent,/Could not save/);dom.window.close();
});
test('analysis records review metadata in the run without sending it to the inference endpoint',async()=>{
 const {dom,w,$,file,select}=setup();
 w.eval(fs.readFileSync('public/app.js','utf8')+'\nwindow.currentRun=()=>bundle;');
 const control=file('wt'),sample=file('clone');select('control',[control]);select('samples',[sample]);await ready($);
 $('guides').value='ACGT';
 let sent;
 w.fetch=async(url,options)=>{sent=JSON.parse(options.body.get('settings'));return {ok:true,json:async()=>({sample:'clone',status:'failed',error:'Synthetic response'})};};
 await $('analysis-form').onsubmit({preventDefault(){}});
 assert.equal(sent.project_context,undefined);
 assert.equal(w.currentRun().settings.project_context.reviewed,false);
 assert.equal(w.currentRun().settings.project_context.control_sha256.length,64);
 assert.equal($('run').disabled,false);dom.window.close();
});
