// Match server reference fingerprints independent of file line endings.
export async function referenceFromFile(file,expectedName,hash){
 if(!file || file.size>2000000)throw Error('Choose a GenBank file smaller than 2 MB.');
 if(!/\.(gb|gbk|genbank)$/i.test(file.name))throw Error('Choose a .gb, .gbk or .genbank file.');
 if(expectedName && file.name.toLowerCase()!==expectedName.toLowerCase())throw Error(`This design expects ${expectedName}. Select that reference file.`);
 const text=(await file.text()).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if((text.match(/^LOCUS\s/gm)||[]).length!==1 || !/^\/\/\s*$/m.test(text))throw Error('Choose a complete GenBank file containing one record.');
 if(!/^\s{5}CDS\s/m.test(text))throw Error('This reference has no annotated CDS for knockout prediction.');
 return {filename:file.name,text,sha256:await hash(new TextEncoder().encode(text)),source:'Selected GenBank file'};
}
