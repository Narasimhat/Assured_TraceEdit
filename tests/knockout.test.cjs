const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
test('reference filename is scoped to the selected design and ambiguous names stay unresolved',async()=>{
 global.DOMParser=new JSDOM('').window.DOMParser;
 const {readAnnotations}=await import('../public/unified/annotations.js');
 const html='<h1>Design: A</h1><div>Reference</div> <div>gene-reference.gb</div><h1>Design: B</h1><p>Reference other.gb</p>';
 assert.equal(readAnnotations(html,'Design: A').reference,'gene-reference.gb');
 assert.equal(readAnnotations(html,'Design: B').reference,'other.gb');
 assert.equal(readAnnotations('<h1>X</h1><p>Reference a.gb</p><p>Reference b.gb</p>','X').reference,null);
});
test('WB priority requires coding evidence, matching sources, quality and engine agreement',async()=>{
 const {koAssessment}=await import('../public/unified/knockout.js');
 const row={knockoutPrediction:{value:.95,coding_truncating:0,splice_disruptive:.95,nmd_susceptible:0,in_frame:0,unresolved:.05,control_sha256:'c'},aq:{ok:true,controlHash:'c',sampleHash:'s',r2:.99,contributions:[{size:-79,fraction:1}],warnings:[]},te:{source_hashes:{control:'c',sample:'s'},metrics:{r_squared:.99},alignment:{baseline_mae:.01,sample_q20_fraction:.99},inference:{control_q20_fraction:.99},outcomes:[{net_bp:-79,fraction:1}],warnings:[]}};
 assert.equal(koAssessment(row).priority,'Prioritize for Western blot');
 assert.match(koAssessment(row,'pool').priority,/Pool only/);
 row.aq.r2=.7;assert.equal(koAssessment(row).priority,'Review before Western blot');
 row.knockoutPrediction.control_sha256='different';assert.equal(koAssessment(row).value,null);
 delete row.knockoutPrediction;assert.equal(koAssessment(row).value,null);
});
