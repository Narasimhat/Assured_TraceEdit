'use strict';
let importedDesigns = [], mappedVariantText = '';
function clearMappedVariants() {
  if (mappedVariantText && $('variants').value === mappedVariantText) $('variants').value = '';
  mappedVariantText = '';
  $('target-variant').value=''; $('target-label').value='';
  $('donor-status').textContent = 'Donor changes will be mapped when you analyze, or click Map ssODN to control.';
}
$('donor').addEventListener('input',clearMappedVariants);
$('control').addEventListener('change',clearMappedVariants);

function useDonor() {
  clearMappedVariants();
  const design=importedDesigns[Number($('design-choice').value)];
  const donor=design?.donors[Number($('donor-choice').value)];
  $('donor').value=donor?.sequence || '';
  $('donor-status').textContent=donor ? `Imported ${donor.name} · ${donor.sequence.length} bases. Select the control AB1 to map its substitutions.` : 'No substitution donor selected. Guides are available for indel analysis.';
}
function useDesign() {
  const design=importedDesigns[Number($('design-choice').value)];
  $('guides').value=design.guides.map(g=>g.sequence).join('\n');
  $('cuts').value=''; $('variants').value=''; $('centers').value=''; mappedVariantText='';
  $('donor-choice').replaceChildren();
  for (const [i,donor] of design.donors.entries()) {
    const option=node('option',`${donor.name} · ${donor.sequence.length} nt${donor.recommended?' · ordered strand':''}`);
    option.value=i; $('donor-choice').append(option);
  }
  $('donor-choice-label').hidden=design.donors.length<2;
  $('design-status').textContent=`${design.title}: imported ${design.guides.length} gRNA(s), without PAM, and ${design.donors.length} donor option(s).${design.guides.length>2?' Choose at most two gRNAs below before analysis.':''}${!design.donors.length?' No supported ssODN found; for a substitution design, paste the donor below.':''} Previous cut/SNP coordinates were cleared because they belong to the prior design.`;
  useDonor();
}
$('design-choice').onchange=useDesign;
$('donor-choice').onchange=useDonor;
$('design-file').onchange=async()=>{
  try {
    if(busy)throw Error('Wait for analysis to finish before importing a design.');
    const file=$('design-file').files[0]; if(!file)return;
    if(file.size>5_000_000)throw Error('Design HTML must be smaller than 5 MB.');
    const designs=TraceEditDesign.parse(await file.text());
    importedDesigns=designs;
    $('design-choice').replaceChildren();
    designs.forEach((d,i)=>{const option=node('option',d.title);option.value=i;$('design-choice').append(option);});
    $('design-choice-label').hidden=designs.length<2;
    useDesign(); $('error').textContent='';
  } catch(e) { $('design-status').textContent=e.message;error(e); }
};

async function mapEnteredDonor() {
  const control=$('control').files[0];
  if(!control)throw Error('Select a wild-type control AB1 before mapping the ssODN.');
  const sequence=$('donor').value.replace(/\s+/g,'').toUpperCase();
  if(!/^[ACGT]{30,4000}$/.test(sequence))throw Error('Enter an ssODN of 30–4000 A/C/G/T bases. Spaces and line breaks are allowed.');
  const form=new FormData(); form.append('control',control);form.append('donor',sequence);
  $('donor-status').textContent='Mapping ssODN substitutions to the control read…';
  const mapped=await(await responseData(await fetch('/api/donor',{method:'POST',body:form}))).json();
  if(control!==$('control').files[0] || sequence!==$('donor').value.replace(/\s+/g,'').toUpperCase()) throw Error('Control or donor changed during mapping. Map again with the current inputs.');
  const manual=config().variants;
  const combined=new Map(manual.map(v=>[v.position,v]));
  for(const v of mapped.variants) {
    const old=combined.get(v.position);
    if(old && (old.ref!==v.ref||old.alt!==v.alt))throw Error(`The ssODN conflicts with the entered SNP at control base ${v.position}. Review the specified SNPs.`);
    combined.set(v.position,v);
  }
  if(combined.size>6)throw Error('The donor and manual SNPs contain more than six substitutions, beyond the current model limit.');
  mappedVariantText=[...combined.values()].sort((a,b)=>a.position-b.position).map(v=>`${v.ref}${v.position}${v.alt}`).join(', ');
  $('variants').value=mappedVariantText;
  $('donor-status').textContent=`Mapped ${mapped.variants.length} donor substitution(s): ${mapped.variants.map(v=>`${v.ref}${v.position}${v.alt}`).join(', ')}. Coordinates refer to this control read.`;
  return {sequence,strand:mapped.strand,coverage:mapped.coverage};
}
$('map-donor').onclick=async()=>{
  if(busy)return;
  $('map-donor').disabled=true;
  try{await mapEnteredDonor();$('error').textContent='';}
  catch(e){$('donor-status').textContent=e.message;error(e);}
  finally{$('map-donor').disabled=false;}
};
