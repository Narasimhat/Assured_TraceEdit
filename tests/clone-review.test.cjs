const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {review}=require('../public/clone-review.js');
function sample(){return {sample:'clone.ab1',status:'fit_pass',metrics:{r_squared:.99,indel_fraction:.01},alignment:{baseline_mae:.01,sample_q20_fraction:.99},inference:{control_q20_fraction:.99},warnings:[],variants:[{position:201,ref:'A',alt:'C',background_corrected_signal:.99}],target_variant:{position:201,ref:'A',alt:'C',label:'E280D'},displays:{201:{center:201,control:{positions:[201],quality:[40]},sample:{positions:[201],quality:[40]}}}};}
test('target evidence can prioritize; missing target, low quality, mixed signal or confounding indels cannot',()=>{
 let r=sample();assert.equal(review(r).tier,'prioritize');
 delete r.target_variant;assert.equal(review(r).tier,'review');
 r=sample();r.displays[201].sample.quality=[5];assert.equal(review(r).tier,'review');
 r=sample();r.variants[0].background_corrected_signal=.5;assert.equal(review(r).tier,'review');assert.match(review(r).reasons.join(' '),/heterozygous/);
 r=sample();r.metrics.indel_fraction=.15;assert.equal(review(r).tier,'review');
 r=sample();r.warnings=['An outcome reaches the deletion search boundary'];assert.equal(review(r).tier,'review');
 r=sample();assert.equal(review(r,{mode:'bulk'}).tier,'review');
 assert.equal(review({error:'Bad anchor'}).tier,'repeat');
});
test('deletion review requires clear junction evidence and does not call in-frame deletion a knockout',()=>{
 const r=sample();r.variants=[];delete r.target_variant;
 r.deletion_evidence={groups:[{size_bp:79,fraction:.99,compared_calls:24,matching_calls:24,min_quality:40}]};
 assert.equal(review(r).tier,'prioritize');
 r.deletion_evidence.groups[0].size_bp=78;assert.equal(review(r).tier,'review');
 r.deletion_evidence.groups[0].size_bp=79;r.deletion_evidence.groups[0].matching_calls=23;assert.equal(review(r).tier,'review');
});
test('select all skips failed rows, clears in one click and resets between sessions',()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.deletionView=()=>d.createElement('section');
 w.eval(fs.readFileSync('public/app.js','utf8')+'\ndetail=()=>{};window.testRender=b=>{bundle=b;render();};');
 // No chart points needed for the selection test.
 const good=sample();good.variants=[];good.displays={201:{}};
 const b={id:'one',settings:{},results:[good,{sample:'bad.ab1',status:'failed'},good]};w.testRender(b);
 d.getElementById('select-all').click();assert.equal(d.querySelectorAll('[data-row]:checked').length,2);assert.equal(d.querySelector('[data-row="1"]').checked,false);
 d.getElementById('clear-selection').click();assert.equal(d.querySelectorAll('[data-row]:checked').length,0);
 d.getElementById('select-all').click();w.testRender({...b,id:'two'});assert.equal(d.querySelectorAll('[data-row]:checked').length,0);
 dom.window.close();
});
