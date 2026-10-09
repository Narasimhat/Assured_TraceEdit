const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
test('editing sample fields clears only affected results; applying a donor clears all',()=>{
 const dom=new JSDOM('<div id="sampleList"><div data-sid="a"><input data-f="guide" value="AAA"></div></div><button id="addSample"></button><button id="applyGuide"></button><input id="guideAll"><button id="applyDonor"></button><textarea id="donorAll"></textarea><button id="clearDonor"></button><div id="bulkMsg"></div><div id="resultsSec"></div>');
 const source=fs.readFileSync('public/peaksplit/src/ui.js','utf8');
 const ctx={document:dom.window.document,state:{samples:[{id:'a',guide:'AAA'},{id:'b',guide:'CCC'}],results:new Map([['a',{ok:true}],['b',{ok:true}]])},renderSummary:()=>{},renderDetail:()=>{},renderSamples:()=>{},cleanSeq:s=>s};ctx.$=s=>ctx.document.querySelector(s);
 vm.createContext(ctx);vm.runInContext('let inputRevision=0;'+source.slice(source.indexOf('function invalidateResults'),source.indexOf('const $ =')),ctx);
 vm.runInContext(source.slice(source.indexOf("  const sl = $('#sampleList');"),source.indexOf("  $('#runBtn').onclick = runAll;")),ctx);
 const guide=ctx.document.querySelector('[data-f="guide"]');guide.value='TTT';guide.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.equal(ctx.state.samples[0].guide,'TTT');assert.equal(ctx.state.results.has('a'),false);assert.equal(ctx.state.results.has('b'),true);
 ctx.document.getElementById('donorAll').value='A'.repeat(80);ctx.document.getElementById('applyDonor').click();assert.equal(ctx.state.results.size,0);assert.equal(ctx.document.getElementById('resultsSec').hidden,true);dom.window.close();
});
