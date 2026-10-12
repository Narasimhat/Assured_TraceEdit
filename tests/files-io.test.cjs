const test=require('node:test'),assert=require('node:assert/strict');

function fakeFile(name,body='ABIF'){
 return {name,size:body.length,type:'',arrayBuffer:async()=>Uint8Array.from(body,c=>c.charCodeAt(0)).buffer,webkitRelativePath:''};
}

test('filesFromDataTransfer expands dropped directories via webkitGetAsEntry',async()=>{
 const {filesFromDataTransfer}=await import('../public/unified/files-io.js');
 const nested=fakeFile('cl2.ab1');
 const top=fakeFile('WT_control.ab1');
 const dirEntry={
  isFile:false,isDirectory:true,name:'run',
  createReader(){
   let done=false;
   return {readEntries(ok){
    if(done)return ok([]);
    done=true;
    ok([{isFile:true,isDirectory:false,name:'cl2.ab1',file:cb=>cb(nested)}]);
   }};
  }
 };
 const fileEntry={isFile:true,isDirectory:false,name:'WT_control.ab1',file:cb=>cb(top)};
 const dt={
  items:[
   {webkitGetAsEntry:()=>fileEntry,getAsFile:()=>top},
   {webkitGetAsEntry:()=>dirEntry,getAsFile:()=>null}
  ],
  files:[]
 };
 const files=await filesFromDataTransfer(dt);
 assert.equal(files.length,2);
 assert.equal(files[0].name,'WT_control.ab1');
 assert.equal(files[1].name,'cl2.ab1');
 assert.match(files[1].webkitRelativePath,/run\/cl2\.ab1$/);
});

test('filesFromDataTransfer falls back to FileList when entries are unavailable',async()=>{
 const {filesFromDataTransfer}=await import('../public/unified/files-io.js');
 const a=fakeFile('a.ab1');
 const files=await filesFromDataTransfer({items:[],files:[a]});
 assert.deepEqual(files.map(f=>f.name),['a.ab1']);
});

test('filesFromDirectoryHandle walks nested directories',async()=>{
 const {filesFromDirectoryHandle}=await import('../public/unified/files-io.js');
 const leaf=fakeFile('nested.ab1');
 const dir={
  name:'pool',
  async *entries(){
   yield ['nested.ab1',{kind:'file',getFile:async()=>leaf}];
   yield ['child',{kind:'directory',name:'child',async *entries(){yield ['deep.ab1',{kind:'file',getFile:async()=>fakeFile('deep.ab1')}];}}];
  }
 };
 const files=await filesFromDirectoryHandle(dir);
 assert.deepEqual(files.map(f=>f.name).sort(),['deep.ab1','nested.ab1']);
 assert.ok(files.some(f=>f.webkitRelativePath==='pool/nested.ab1'));
 assert.ok(files.some(f=>f.webkitRelativePath==='pool/child/deep.ab1'));
});
