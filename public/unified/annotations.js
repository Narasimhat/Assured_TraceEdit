import {reverseComplement} from './vendor/assured-qc/seq.js';
export function readAnnotations(html,title){
 const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style,iframe,object,svg').forEach(n=>n.remove());
 const hs=[...doc.querySelectorAll('h1')],h=hs.find(n=>n.textContent.trim()===title.trim());
 if(!h)return null;
 const range=doc.createRange();range.setStartAfter(h);const next=hs[hs.indexOf(h)+1];if(next)range.setEndBefore(next);else range.setEndAfter(doc.body.lastChild);
 const text=range.cloneContents().textContent.replace(/\s+/g,' ');
 const codons=[...text.matchAll(/Codon:\s*([ACGT]{3})\s*(?:->|→)\s*([ACGT]{3})/gi)].map(m=>({ref:m[1].toUpperCase(),alt:m[2].toUpperCase()}));
 const unique=[...new Map(codons.map(c=>[c.ref+'>'+c.alt,c])).values()];
 const blocking=[...text.matchAll(/p\.([A-Z])\d+\1\s*[:(]\s*([ACGT]{3})\s*(?:->|→)\s*([ACGT]{3})/gi)].map(m=>({ref:m[2].toUpperCase(),alt:m[3].toUpperCase()}));
 return {intended:unique.length===1?unique[0]:null,blocking:[...new Map(blocking.map(c=>[c.ref+'>'+c.alt,c])).values()],title};
}
export function mapAnnotations(annotation,sequence,variants){
 const key=v=>`${v.position}:${v.ref}>${v.alt}`,known=new Set(variants.map(key));
 const locate=c=>{if(!c)return [];const hits=new Map();for(const [ref,alt] of [[c.ref,c.alt],[reverseComplement(c.ref),reverseComplement(c.alt)]]){
 for(let pos=sequence.indexOf(ref);pos>=0;pos=sequence.indexOf(ref,pos+1)){const changes=[];for(let i=0;i<3;i++)if(ref[i]!==alt[i])changes.push({position:pos+i+1,ref:ref[i],alt:alt[i]});if(changes.length&&changes.every(v=>known.has(key(v))))hits.set(changes.map(key).join(','),changes);}
 }return [...hits.values()];};
 const intended=locate(annotation?.intended);if(intended.length!==1)return {targets:[],blocking:[],note:'HTML annotations are missing or do not map uniquely. Select intended changes manually.'};
 const blockers=(annotation.blocking||[]).flatMap(c=>{const hits=locate(c);return hits.length===1?hits[0]:[];});
 if(blockers.some(b=>intended[0].some(t=>key(b)===key(t))))return {targets:[],blocking:[],note:'Conflicting intended and silent annotations. Review manually.'};
 return {targets:intended[0],blocking:blockers,note:'Intended codon and mapped silent changes read from the HTML. Check the assignments before confirming.'};
}
