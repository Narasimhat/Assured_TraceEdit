const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(files){
 const source=fs.readFileSync('public/peaksplit/src/ui.js','utf8');
 const code=source.slice(source.indexOf('function fileByName'),source.indexOf('function newSample'));
 const ctx={state:{files:new Map(files.map(f=>[f.id,{...f,trace:{}}])),samples:[]},CTRL_RE:/control|wt/i,newSample:p=>p};
 vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;
}
test('duplicate basenames do not silently resolve sample sheets',()=>{const c=setup([{id:'a',name:'clone.ab1'},{id:'b',name:'clone.ab1'}]);assert.equal(c.fileByName('clone'),null);});
test('multiple controls remain unresolved even with matching filename prefixes',()=>{const c=setup([{id:'a',name:'gene_control.ab1'},{id:'b',name:'other_control.ab1'},{id:'c',name:'gene_clone.ab1'}]);c.autoPair();assert.equal(c.state.samples[0].controlId,'');});
test('one unrelated WT must not silently pair with a new project',()=>{const c=setup([{id:'a',name:'APOE_WT.ab1'},{id:'b',name:'MYD88_clone.ab1'}]);c.autoPair();assert.equal(c.state.samples[0].controlId,'');});
