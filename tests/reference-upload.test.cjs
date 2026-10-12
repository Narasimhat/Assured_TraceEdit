const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('uploaded reference normalizes fingerprints and rejects missing or mismatched coding context',async()=>{
 const {referenceFromFile}=await import('../public/unified/reference.js');
 const text='LOCUS       EXAMPLE\nFEATURES             Location/Qualifiers\n     CDS             1..300\n//\n';
 const file={name:'gene.gb',size:100,text:async()=>text.replaceAll('\n','\r\n')};
 const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 const result=await referenceFromFile(file,'gene.gb',hash);
 assert.equal(result.text,text);assert.equal(result.sha256,hash(text));
 await assert.rejects(referenceFromFile(file,'other.gb',hash),/expects other.gb/);
 await assert.rejects(referenceFromFile({...file,size:2000001},null,hash),/2 MB/);
 await assert.rejects(referenceFromFile({...file,text:async()=>text.replace('CDS','misc_feature')},null,hash),/no annotated CDS/);
 await assert.rejects(referenceFromFile({...file,text:async()=>text+text},null,hash),/one record/);
});
