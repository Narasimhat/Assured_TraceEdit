/** Collect AB1 uploads from file pickers, directory pickers, and drag-drop (including folders). */

function withRelativePath(file, relativePath){
 if(file.webkitRelativePath===relativePath)return file;
 try{
  const copy=new File([file],file.name,{type:file.type,lastModified:file.lastModified});
  Object.defineProperty(copy,'webkitRelativePath',{value:relativePath,configurable:true});
  return copy;
 }catch{
  try{Object.defineProperty(file,'webkitRelativePath',{value:relativePath,configurable:true});}catch{/* keep original */}
  return file;
 }
}

function readAllEntries(reader){
 return new Promise((resolve,reject)=>{
  const all=[];
  const pull=()=>reader.readEntries(batch=>{
   if(!batch.length)return resolve(all);
   all.push(...batch);
   pull();
  },reject);
  pull();
 });
}

async function filesFromEntry(entry,path=''){
 if(!entry)return [];
 if(entry.isFile){
  const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));
  return [withRelativePath(file,path+file.name)];
 }
 if(!entry.isDirectory)return [];
 const prefix=path+entry.name+'/';
 const children=await readAllEntries(entry.createReader());
 const nested=await Promise.all(children.map(child=>filesFromEntry(child,prefix)));
 return nested.flat();
}

/** Walk a DataTransfer from drag-drop; folders are expanded via webkitGetAsEntry. */
export async function filesFromDataTransfer(dataTransfer){
 if(!dataTransfer)return [];
 const items=[...(dataTransfer.items||[])];
 if(items.some(item=>typeof item.webkitGetAsEntry==='function')){
  const groups=await Promise.all(items.map(async item=>{
   const entry=item.webkitGetAsEntry?.();
   if(entry)return filesFromEntry(entry);
   const file=item.getAsFile?.();
   return file?[file]:[];
  }));
  const fromEntries=groups.flat();
  if(fromEntries.length)return fromEntries;
 }
 return [...(dataTransfer.files||[])];
}

/** Recursively read a File System Access API directory handle. */
export async function filesFromDirectoryHandle(dirHandle,path=''){
 const prefix=path||`${dirHandle.name}/`;
 const out=[];
 for await(const [name,handle] of dirHandle.entries()){
  if(handle.kind==='file'){
   const file=await handle.getFile();
   out.push(withRelativePath(file,prefix+name));
  }else if(handle.kind==='directory'){
   out.push(...await filesFromDirectoryHandle(handle,`${prefix}${name}/`));
  }
 }
 return out;
}

/** Open a directory picker when supported; otherwise return null so the caller can use <input webkitdirectory>. */
export async function pickDirectoryFiles(){
 if(typeof window==='undefined'||typeof window.showDirectoryPicker!=='function')return null;
 try{
  const dir=await window.showDirectoryPicker({id:'assured-ab1-folder',mode:'read',startIn:'documents'});
  return filesFromDirectoryHandle(dir);
 }catch(e){
  if(e?.name==='AbortError')return [];
  throw e;
 }
}
