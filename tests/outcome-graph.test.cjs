const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
test('simple graph shows editing independently of missing coding evidence, escapes names and preserves interaction',async()=>{
 const {outcomeGraph,bindOutcomeGraph}=await import('../public/unified/outcome-graph.js');
 const row={sample:'<script>alert(1)</script>',te:{metrics:{indel_fraction:1},source_hashes:{control:'c'},outcomes:[{net_bp:-79,fraction:1}]}};
 const html=outcomeGraph([row],'clone',false,true);assert.ok(!html.includes('<script>'));assert.match(html,/100.0%/);assert.match(html,/-79 bp/);assert.match(html,/Review model failure/);assert.ok(!html.includes('POSSIBLE KO CONTRIBUTION'));
 const dom=new JSDOM(html);let selected=-1;bindOutcomeGraph(dom.window.document,i=>selected=i);dom.window.document.querySelector('[data-sample]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter'}));assert.equal(selected,0);
 row.te={error:'alignment failed'};assert.match(outcomeGraph([row]),/Resequence/);assert.match(outcomeGraph([row]),/Resequence/);
 row.te={metrics:{indel_fraction:0},outcomes:[]};assert.match(outcomeGraph([row]),/0.0%/);assert.match(outcomeGraph([row]),/No edit detected/);dom.window.close();
});

test('both models use ICE-style screening independently of functional predictions',async()=>{
 const {modelScores,outcomeGraph,traceEditKoScore}=await import('../public/unified/outcome-graph.js');
 const r={sample:'clone',aq:{ok:true,summary:{indelPct:92,koScorePct:85,functionalKoPct:0,functionalUncertainPct:100}},te:{metrics:{indel_fraction:.98},outcomes:[{net_bp:-79,fraction:.6},{net_bp:-78,fraction:.3},{net_bp:-3,fraction:.08},{net_bp:0,fraction:.02}]}};
 assert.deepEqual(modelScores(r),{aq:{indel:.92,ko:.85},te:{indel:.98,ko:.6+.3}});
 assert.match(outcomeGraph([r]),/ICE-style/);assert.doesNotMatch(outcomeGraph([r]),/Not resolved|Functional|Possible/);
 const t=outcomes=>({metrics:{},outcomes});
 assert.equal(traceEditKoScore(t([{net_bp:18,fraction:.2},{net_bp:21,fraction:.3},{net_bp:-21,fraction:.1},{net_bp:1,fraction:.2},{net_bp:-2,fraction:.1},{net_bp:0,fraction:.1}])).toFixed(2),'0.70');
 assert.equal(traceEditKoScore(t([{net_bp:0,fraction:1}])),0);
 assert.equal(traceEditKoScore(t([{net_bp:-79,fraction:.5}])),.5); // no renormalization
 assert.equal(traceEditKoScore(t([])),null);
 assert.equal(traceEditKoScore(t([{fraction:1}])),null);
 assert.equal(traceEditKoScore({...r.te,error:'failed'}),null);
 r.aq.ok=false;assert.equal(modelScores(r).aq.ko,null);
});
test('native QC recommendations retain knockout workflow',async()=>{
 const {qcStandaloneResults}=await import('../public/unified/report.js');
 const b={setup:{workflow:'knockout',guides:['a','b']},results:[{sample:'clone',workflow:'knockout',aq:{standalone:{name:'clone',ok:true,sampleType:'clone',warnings:[],summary:{koScorePct:98,wtPct:0},decision:{decision:'Hold'}}}}]};
 const r=qcStandaloneResults(b)[0];assert.equal(r.workflow,'deletion');assert.equal(r.recommendation.score,98);assert.match(r.recommendation.basis,/frameshift/);
});
