const test=require('node:test'),assert=require('node:assert/strict');

function koRow(sample,opts={}){
 return {
  sample,workflow:'knockout',sampleType:'clone',
  knockoutPrediction:{value:opts.ko??.95,coding_truncating:opts.ko??.95,splice_disruptive:0,nmd_susceptible:opts.ko??.95,in_frame:0,unresolved:.05,control_sha256:'c'},
  aq:{ok:true,controlHash:'c',sampleHash:'s',r2:.99,summary:{indelPct:(opts.indel??.98)*100,koScorePct:(opts.ko??.95)*100},contributions:[{size:-79,fraction:opts.indel??.98}],markers:[],warnings:[]},
  te:{source_hashes:{control:'c',sample:'s'},metrics:{indel_fraction:opts.indel??.98,r_squared:.99},alignment:{baseline_mae:.01,sample_q20_fraction:.99},inference:{control_q20_fraction:.99},outcomes:[{net_bp:-79,fraction:opts.indel??.98}],variants:[],warnings:[]},
  ...opts.extra
 };
}

test('publication report leads with take-home shortlist and keeps evidence in appendix',async()=>{
 const {reportHtml,takeHomeMessage,cloneDecisions}=await import('../public/unified/report.js');
 const bundle={
  setup:{name:'CDON knockout',workflow:'knockout',sampleType:'clone',gene:'CDON'},
  results:[koRow('cl3_CDON.ab1'),koRow('cl7_CDON.ab1',{ko:.96,indel:.97}),koRow('cl2_CDON.ab1',{ko:.2,indel:.25,extra:{knockoutPrediction:{value:.2,coding_truncating:.2,splice_disruptive:0,nmd_susceptible:.2,in_frame:.7,unresolved:.1,control_sha256:'c'}}})],
  planned:3,created:'2026-03-01T00:00:00.000Z',engines:{assuredQC:'a',traceEdit:'b'}
 };
 const take=takeHomeMessage(bundle);
 assert.match(take.headline,/Advance Clone 3, Clone 7|Advance Clone 7, Clone 3/);
 assert.match(take.headline,/Western blot/);
 const ranked=cloneDecisions(bundle);
 assert.equal(ranked.top.length,2);
 assert.ok(ranked.rows[0].priority);
 const html=reportHtml(bundle);
 assert.match(html,/Take home:/);
 assert.match(html,/Ranked clones/);
 assert.match(html,/Appendix/);
 assert.match(html,/CLONE SELECTION REPORT/);
 // Front page stays short: appendix holds the long per-sample cards
 const front=html.split('Appendix')[0];
 assert.doesNotMatch(front,/Quality checks/);
 assert.match(html,/Quality checks/);
 assert.match(html,/Indel distributions/);
});

test('pool screens refuse clone picking in the take-home message',async()=>{
 const {takeHomeMessage}=await import('../public/unified/report.js');
 const bundle={setup:{workflow:'knockout',sampleType:'pool'},results:[koRow('pool1.ab1')]};
 assert.match(takeHomeMessage(bundle).headline,/Pool screen/);
});
