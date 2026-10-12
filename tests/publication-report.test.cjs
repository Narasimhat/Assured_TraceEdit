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

test('standalone AssuredQC and TraceEdit reports use the same publication take-home layout',async()=>{
 const {engineReportHtml,engineTakeHome,engineDecisions}=await import('../public/unified/report.js');
 const bundle={
  setup:{name:'Design: CDON knockout',workflow:'knockout',sampleType:'clone',gene:'CDON'},
  results:[koRow('cl3_CDON.ab1'),koRow('cl2_CDON.ab1',{ko:.2,indel:.25,extra:{knockoutPrediction:{value:.2,coding_truncating:.2,splice_disruptive:0,nmd_susceptible:.2,in_frame:.7,unresolved:.1,control_sha256:'c'}}})],
  planned:2,created:'2026-03-01T00:00:00.000Z',engines:{assuredQC:'aq-v',traceEdit:'te-v'}
 };
 for(const engine of ['aq','te']){
  const name=engine==='aq'?'AssuredQC':'TraceEdit';
  const take=engineTakeHome(bundle,engine);
  assert.match(take.headline,/Advance Clone 3/);
  assert.match(take.body,new RegExp(`${name}-only`));
  assert.ok(engineDecisions(bundle,engine).top.some(r=>r.label==='Clone 3'));
  const html=engineReportHtml(bundle,engine);
  assert.match(html,/Take home:/);
  assert.match(html,/Ranked clones/);
  assert.match(html,/Appendix/);
  assert.match(html,new RegExp(`${name.toUpperCase()} CLONE REPORT`));
  assert.match(html,new RegExp(`${name} · CDON knockout`));
  const front=html.split('Appendix')[0];
  assert.doesNotMatch(front,/Full engine output|Per-base evidence/);
  assert.match(html,/Per-base evidence|AssuredQC native ranking/);
 }
});

test('standalone AssuredQC report with native QC results shortlists from recommendations',async()=>{
 const {engineReportHtml,engineDecisions,engineTakeHome}=await import('../public/unified/report.js');
 const bundle={
  setup:{name:'HDR screen',workflow:'snp',sampleType:'clone',gene:'GENE'},
  results:[{
   sample:'cl9_GENE.ab1',workflow:'snp',sampleType:'clone',control:'WT.ab1',
   aq:{ok:true,r2:.99,summary:{intendedEditPct:96,indelPct:1},markers:[],contributions:[],warnings:[],
    standalone:{name:'cl9_GENE.ab1',ok:true,summary:{intendedEditPct:96,indelPct:1,wtPct:4,editedPct:96,betweenCutsPct:0,partialConversionPct:0,koScorePct:0,unexplainedPct:0},
     decision:{decision:'accept',reasons:['Clean HDR'],next:'Confirm'},quality:{r2:.99,noiseFraction:.01,positionsUsed:40,columns:2,discordanceBefore:.01,discordanceAfter:.01},
     markers:[],charts:{contributions:'',discordance:''},warnings:[]}},
   te:{metrics:{indel_fraction:.01,r_squared:.99},variants:[{position:40,ref:'A',alt:'G',sample_alt_signal:.95,background_corrected_signal:.95}],warnings:[]}
  }],
  created:'2026-03-01T00:00:00.000Z',engines:{assuredQC:'0.4.0',traceEdit:'t'}
 };
 const decisions=engineDecisions(bundle,'aq');
 assert.equal(decisions.top.length,1);
 assert.equal(decisions.rows[0].label,'Clone 9');
 assert.match(engineTakeHome(bundle,'aq').headline,/Advance Clone 9/);
 const html=engineReportHtml(bundle,'aq');
 assert.match(html,/ASSURED · ASSUREDQC CLONE REPORT/);
 assert.match(html,/Advance Clone 9/);
 assert.match(html,/Appendix/);
 assert.match(html,/AssuredQC native ranking|Per-base evidence/);
});
