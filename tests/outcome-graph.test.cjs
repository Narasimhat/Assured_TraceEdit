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

test('dual scores preserve separate estimates, unresolved effects and source validation',async()=>{
 const {modelScores,outcomeGraph}=await import('../public/unified/outcome-graph.js');
 const r={sample:'clone',aq:{ok:true,functional:{},summary:{indelPct:92,functionalKoPct:0,functionalUncertainPct:100}},te:{metrics:{indel_fraction:.98},source_hashes:{control:'a'}},knockoutPrediction:{value:.9,control_sha256:'a'}};
 assert.deepEqual(modelScores(r),{aq:{indel:.92,ko:0,uncertain:1},te:{indel:.98,ko:.9,uncertain:null}});
 assert.match(outcomeGraph([r]),/Not resolved/);assert.match(outcomeGraph([r]),/92.0%/);assert.match(outcomeGraph([r]),/98.0%/);
 r.knockoutPrediction.control_sha256='b';assert.equal(modelScores(r).te.ko,null);
 delete r.knockoutPrediction.control_sha256;delete r.te.source_hashes;assert.equal(modelScores(r).te.ko,null);
 r.aq.ok=false;assert.equal(modelScores(r).aq.indel,null);
});
test('native QC recommendations retain knockout workflow',async()=>{
 const {qcStandaloneResults}=await import('../public/unified/report.js');
 const b={setup:{workflow:'knockout',guides:['a','b']},results:[{sample:'clone',workflow:'knockout',aq:{standalone:{name:'clone',ok:true,sampleType:'clone',warnings:[],summary:{koScorePct:98,wtPct:0},decision:{decision:'Hold'}}}}]};
 const r=qcStandaloneResults(b)[0];assert.equal(r.workflow,'deletion');assert.equal(r.recommendation.score,98);assert.match(r.recommendation.basis,/frameshift/);
});
