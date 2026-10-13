const test=require('node:test'),assert=require('node:assert/strict');
const row=()=>({sample:'clone',workflow:'knockout',contextVerified:true,te:{source_hashes:{control:'c',sample:'s'},metrics:{indel_fraction:1,r_squared:.999},alignment:{baseline_mae:.001,sample_q20_fraction:1},outcomes:[{net_bp:-79,fraction:1}],deletion_evidence:{groups:[{fraction:1,size_bp:79,min_quality:58,matching_calls:24,compared_calls:24}]}}});
const bundle=r=>({setup:{name:'test',sampleType:'clone'},results:[r]});
test('publication shortlist needs real pairing, trace quality and dominant junction; absence is not zero',async()=>{
 const {reviewRows}=await import('../public/unified/publication.js');let r=row();assert.equal(reviewRows(bundle(r))[0].action,'First choice');
 r.contextVerified=false;assert.equal(reviewRows(bundle(r))[0].selected,undefined);
 r=row();r.te.deletion_evidence.groups[0].min_quality=20;assert.equal(reviewRows(bundle(r))[0].action,'Review genotype');
 r=row();r.te={error:'bad read'};const x=reviewRows(bundle(r))[0];assert.equal(x.action,'Resequence');assert.equal(x.scores.te.ko,null);
});
test('QC failure, identity mismatch and disagreement block a joint recommendation',async()=>{
 const {reviewRows}=await import('../public/unified/publication.js');const r=row();r.aq={ok:false,error:'failed'};assert.equal(reviewRows(bundle(r))[0].action,'Review model failure');
 r.aq={ok:true,r2:1,controlHash:'other',sampleHash:'s',summary:{indelPct:100,koScorePct:100}};assert.equal(reviewRows(bundle(r))[0].action,'Input mismatch');
 r.aq.controlHash='c';r.aq.summary.koScorePct=0;assert.equal(reviewRows(bundle(r))[0].action,'Review models');
});
test('target selection is required; mixed silent markers need phasing, not homozygous calls',async()=>{
 const {reviewRows,publicationPayload}=await import('../public/unified/publication.js');const r=row();r.workflow='snp';r.te.metrics.indel_fraction=0;r.te.variants=[{position:10,ref:'C',alt:'T',sample_alt_signal:1},{position:12,ref:'G',alt:'A',sample_alt_signal:.5}];
 assert.equal(reviewRows(bundle(r))[0].action,'Select intended edit');r.target={position:10,ref:'C',alt:'T'};assert.equal(reviewRows(bundle(r))[0].action,'Phase markers');
 assert.equal(publicationPayload(bundle(r)).rows[0].aqTarget,null);
});
test('selection is bounded per control group, pools excluded, fewer candidates not padded',async()=>{
 const {reviewRows}=await import('../public/unified/publication.js');const b=bundle(row());b.results=Array.from({length:9},(_,i)=>({...row(),sample:'clone '+i}));assert.equal(reviewRows(b).filter(r=>r.selected).length,6);
 b.results[8].te.source_hashes.control='different';assert.equal(reviewRows(b).filter(r=>r.selected).length,7);
 b.setup.sampleType='pool';assert.equal(reviewRows(b).filter(r=>r.selected).length,0);
 assert.equal(reviewRows(bundle(row())).filter(r=>r.selected).length,1);
});
test('HTML labels escaped and source outcomes not mutated',async()=>{
 const {publicationOverview,publicationPayload}=await import('../public/unified/publication.js');const b=bundle(row());b.results[0].sample='<img onerror=bad>';const before=JSON.stringify(b);
 const html=publicationOverview(b);assert.ok(!html.includes('<img onerror'));publicationPayload(b);assert.equal(JSON.stringify(b),before);
});
test('native adapter retains pool status and requires matching context hashes',async()=>{
 const {nativeBundle,reviewRows}=await import('../public/unified/publication.js');const t=row().te;t.sample='clone';const native={settings:{mode:'clones',project_context:{reviewed:true,control_sha256:'wrong',sample_sha256:['s']}},results:[t]};
 assert.equal(reviewRows(nativeBundle(native))[0].action,'Review setup');native.settings.project_context.control_sha256='c';assert.equal(reviewRows(nativeBundle(native))[0].action,'First choice');native.settings.mode='pool';assert.equal(reviewRows(nativeBundle(native))[0].action,'Pool only');
});
