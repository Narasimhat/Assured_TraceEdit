const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');

function snpRow(overrides={}){
 const a={position:20,ref:'A',alt:'G'},b={position:21,ref:'C',alt:'T'};
 return {
  workflow:'snp',sample:'cl3_sample.ab1',sampleType:'clone',targets:[a,b],
  aq:{ok:true,controlHash:'c',sampleHash:'s',r2:.98,summary:{indelPct:2},markers:[a,b].map(v=>({...v,covered:true,inFit:true,raw:.95,corrected:.94})),contributions:[{kind:'edit',size:0,carries:[19,20],fraction:.92},{kind:'wt',size:0,fraction:.08}],warnings:[]},
  te:{source_hashes:{control:'c',sample:'s'},metrics:{indel_fraction:.03,r_squared:.97},variants:[a,b].map(v=>({...v,sample_alt_signal:.94,background_corrected_signal:.93})),outcomes:[{kind:'substitution',net_bp:0,label:'A20G+C21T',fraction:.91},{kind:'wild_type',net_bp:0,fraction:.09}],warnings:[]},
  donorVariants:[[a,b]],
  ...overrides
 };
}

test('SNP triage prioritizes agreeing high-edit clones and keeps pools in review',async()=>{
 const {snpResult,snpCard}=await import('../public/unified/hdr.js');
 const row=snpRow();
 assert.equal(snpResult(row).status,'Prioritize for confirmation');
 assert.ok(Math.abs(snpResult(row).edit-.91)<1e-9);
 assert.match(snpCard(row),/Prioritize for confirmation/);
 assert.match(snpCard(row),/91\.0%/);
 assert.equal(snpResult(row,'pool').status,'Pool only');
 row.aq.summary.indelPct=20;assert.equal(snpResult(row).status,'Review engines');
});

test('SNP overview graph mirrors dual-model layout and preserves interaction',async()=>{
 const {outcomeGraph,bindOutcomeGraph}=await import('../public/unified/outcome-graph.js');
 const html=outcomeGraph([snpRow()],'clone',false,true,'snp');
 assert.match(html,/INTENDED EDIT/);
 assert.match(html,/ESTIMATED HDR/);
 assert.match(html,/Prioritize for confirmation/);
 assert.match(html,/Clone 3/);
 assert.doesNotMatch(html,/PREDICTED KNOCKOUT SCORE/);
 const dom=new JSDOM(html);let selected=-1;bindOutcomeGraph(dom.window.document,i=>selected=i);
 dom.window.document.querySelector('[data-sample]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter'}));
 assert.equal(selected,0);dom.window.close();
});

test('combined report overview includes SNP graphs and decision cards',async()=>{
 const {compactOverview,reportHtml,takeHomeMessage}=await import('../public/unified/report.js');
 const bundle={setup:{name:'PHF6 S199E',workflow:'snp',sampleType:'clone',gene:'PHF6'},results:[snpRow()],planned:1,created:'2026-01-01T00:00:00.000Z',engines:{assuredQC:'x',traceEdit:'y'}};
 assert.match(compactOverview(bundle),/INTENDED EDIT/);
 assert.match(compactOverview(bundle),/top clones to confirm/);
 const take=takeHomeMessage(bundle);
 assert.match(take.headline,/Advance Clone 3/);
 const html=reportHtml(bundle);
 assert.match(html,/Take home:/);
 assert.match(html,/CLONE SELECTION REPORT/);
 assert.match(html,/Intended edit · QC \/ TraceEdit/);
 assert.match(html,/Appendix/);
});
