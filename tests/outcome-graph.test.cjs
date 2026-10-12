const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
test('graph separates missing KO evidence from zero and preserves clickable sample identity',async()=>{
 const {outcomeGraph,bindOutcomeGraph}=await import('../public/unified/outcome-graph.js');
 const row={sample:'<script>alert(1)</script>',te:{metrics:{indel_fraction:1},source_hashes:{control:'c'}}};
 const html=outcomeGraph([row],'clone',false,true);assert.ok(!html.includes('<script>'));assert.match(html,/100.0%/);assert.match(html,/Not available/);assert.match(html,/Add \/ check reference/);
 const dom=new JSDOM(html);let selected=-1;bindOutcomeGraph(dom.window.document,i=>selected=i);dom.window.document.querySelector('[data-sample]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter'}));assert.equal(selected,0);
 row.knockoutPrediction={value:0,control_sha256:'c',coding_truncating:0,splice_disruptive:0,nmd_susceptible:0,in_frame:1,unresolved:0};assert.match(outcomeGraph([row]),/0.0%/);assert.ok(!outcomeGraph([row]).includes('Not available'));
 dom.window.close();
});
