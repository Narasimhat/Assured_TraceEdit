const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function sequences(text,kind) {
  const out=[];
  for(const part of String(text||'').split(';')){
    const re=/(?<![a-z])[acgt]{8,}(?:\s+[acgt]+)*(?![a-z])/gi;
    for(const match of part.matchAll(re)){
      let sequence=match[0].replace(/\s/g,'').toUpperCase();
      if(kind==='guide' && sequence.length===23 && /GG$/.test(sequence))sequence=sequence.slice(0,20);
      if(kind==='guide'?sequence.length!==20:sequence.length<30)continue;
      if(out.some(x=>x.sequence===sequence))continue;
      const name=part.slice(0,match.index).trim().replace(/[:\s]+$/,'').slice(-100)||`${kind} ${out.length+1}`;
      out.push({name,sequence});
    }
  }
  return out;
}
export function projectsFromSheets(sheets){
 const records=[];
 for(const sheet of sheets){
  const header=sheet.rows.find(r=>r.values.some(v=>/sgrnatargetingsequence|guidesequence/.test(norm(v))) && r.values.some(v=>/lfdnr|projectid/.test(norm(v))));
  if(!header)continue;
  const col=pattern=>header.values.findIndex(v=>pattern.test(norm(v)));
  const namedCell=col(/^celllinename/);
  const indices={id:col(/^(lfdnr|projectid)$/),gene:col(/^targetgene|^gene$/),cell:namedCell>=0?namedCell:col(/^parentalcellline/),guide:col(/sgrnatargetingsequence|guidesequence/),donor:col(/donorseq|ssodn/),edit:col(/modificationtype|editgoal/)};
  for(const row of sheet.rows.filter(r=>r.number>header.number)){
   const get=k=>String(row.values[indices[k]]||'').trim();if(!get('id'))continue;
   records.push({id:`${sheet.name}:${row.number}`,title:`${get('id')} · ${get('gene')} · ${get('cell')}`,projectId:get('id'),gene:get('gene'),cell:get('cell'),workflow:/ko|knockout|deletion/i.test(get('edit'))?'knockout':'snp',guides:sequences(get('guide'),'guide'),donors:sequences(get('donor'),'donor'),source:{sheet:sheet.name,row:row.number,guide:get('guide'),donor:get('donor'),edit:get('edit')}});
  }
 }
 if(!records.length)throw Error('No LAGESO project table found. Expected Lfd.Nr./Project ID, sgRNA / Targeting Sequence and Target Gene columns.');
 return records;
}
