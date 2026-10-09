const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
test('new project removes old traces, design, results and settings; restore recovers them',()=>{
 const dom=new JSDOM('<input id="guideAll" value="OLD"><textarea id="donorAll">OLD DONOR</textarea><input id="fileInput"><input id="sheetInput"><input data-set="maxDel"><button id="restoreProject"></button><p id="bulkMsg"></p><div id="resultsSec"></div>');
 const src=fs.readFileSync('public/peaksplit/src/ui.js','utf8');
 const ctx={document:dom.window.document,state:{files:new Map([['old',{name:'APOE.ab1'}]]),samples:[{id:'old'}],results:new Map([['old',{ok:true}]]),selected:'old',settings:{maxDel:60}},renderFiles(){},renderSamples(){},renderSummary(){},renderDetail(){}};
 ctx.$=s=>ctx.document.querySelector(s);vm.createContext(ctx);
 vm.runInContext('let inputRevision=0;'+src.slice(src.indexOf('let projectRevision'),src.indexOf('// ---------- Files')),ctx);
 ctx.resetProject();assert.equal(ctx.state.files.size,0);assert.equal(ctx.state.samples.length,0);assert.equal(ctx.state.results.size,0);assert.equal(ctx.state.selected,null);assert.equal(ctx.$('#guideAll').value,'');assert.equal(ctx.$('#donorAll').value,'');assert.equal(ctx.state.settings.maxDel,30);assert.equal(ctx.$('#resultsSec').hidden,true);
 ctx.state.files.set('new',{name:'MYD88.ab1'});ctx.restoreProject();assert.equal(ctx.state.files.has('old'),true);assert.equal(ctx.state.files.has('new'),false);assert.equal(ctx.state.results.size,1);assert.equal(ctx.$('#guideAll').value,'OLD');assert.equal(ctx.state.settings.maxDel,60);dom.window.close();
});
test('reset during asynchronous file reading prevents stale reads reappearing',async()=>{
 const src=fs.readFileSync('public/peaksplit/src/ui.js','utf8');let finish;
 const ctx={state:{files:new Map(),samples:[]},nid:()=>1,parseAB1:()=>({}),resolveNames(){},autoPair(){},renderFiles(){},renderSamples(){}};
 vm.createContext(ctx);vm.runInContext('let projectRevision=0;'+src.slice(src.indexOf('async function addFiles'),src.indexOf('function fileByName')),ctx);
 const pending=ctx.addFiles([{name:'old.ab1',arrayBuffer:()=>new Promise(r=>finish=r)}]);vm.runInContext('projectRevision++',ctx);finish(new ArrayBuffer(0));await pending;assert.equal(ctx.state.files.size,0);
});
