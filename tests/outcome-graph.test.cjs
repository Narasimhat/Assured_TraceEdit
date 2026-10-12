const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
test('simple graph shows editing independently of missing coding evidence, escapes names and preserves interaction',async()=>{
 const {outcomeGraph,bindOutcomeGraph}=await import('../public/unified/outcome-graph.js');
 const row={sample:'<script>alert(1)</script>',te:{metrics:{indel_fraction:1},source_hashes:{control:'c'},outcomes:[{net_bp:-79,fraction:1}]}};
 const html=outcomeGraph([row],'clone',false,true);assert.ok(!html.includes('<script>'));assert.match(html,/100.0%/);assert.match(html,/-79 bp/);assert.match(html,/Review reference/);assert.ok(!html.includes('POSSIBLE KO CONTRIBUTION'));
 const dom=new JSDOM(html);let selected=-1;bindOutcomeGraph(dom.window.document,i=>selected=i);dom.window.document.querySelector('[data-sample]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter'}));assert.equal(selected,0);
 row.te={error:'alignment failed'};assert.match(outcomeGraph([row]),/Not available/);assert.match(outcomeGraph([row]),/Resequence/);
 row.te={metrics:{indel_fraction:0},outcomes:[]};assert.match(outcomeGraph([row]),/0.0%/);assert.match(outcomeGraph([row]),/No edit detected/);dom.window.close();
});
