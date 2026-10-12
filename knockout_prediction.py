"""Conservative transcript-specific screening predictions, not functional validation."""
import hashlib
import io
import math
import re
from collections import Counter
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqFeature import ExactPosition, SeqFeature, CompoundLocation
from deletion_evidence import interval


def predict(control, reference_text, outcomes, transcript=''):
    if not isinstance(reference_text,str) or not isinstance(outcomes,list):
        raise ValueError('Provide reference text and a list of fitted outcomes.')
    reference_text=reference_text.replace('\r\n','\n').replace('\r','\n')
    if any(not isinstance(x,dict) or not isinstance(x.get('label'),str) for x in outcomes):
        raise ValueError('Each fitted outcome must have a text label.')
    if len(reference_text)>2_000_000 or len(outcomes)>2000:
        raise ValueError('Reference or model list exceeds the prediction limit.')
    records=list(SeqIO.parse(io.StringIO(reference_text),'genbank'))
    if len(records)!=1: raise ValueError('Use one annotated GenBank reference record.')
    record=records[0];reference=str(record.seq).upper()
    if not 100<=len(reference)<=1_000_000: raise ValueError('Reference length must be 100–1,000,000 bases.')
    features=[f for f in record.features if f.type=='CDS']
    def ids(f):return f.qualifiers.get('transcript_id',[])+f.qualifiers.get('protein_id',[])+f.qualifiers.get('label',[])
    if transcript:features=[f for f in features if transcript in ids(f)]
    if len(features)!=1:raise ValueError('Select one CDS using its transcript/protein ID. Available: '+', '.join('/'.join(ids(f)) or 'unlabelled CDS' for f in features[:12]))
    cds=features[0];strand=cds.location.strand
    if strand not in [-1,1] or any(not isinstance(x,ExactPosition) for p in cds.location.parts for x in [p.start,p.end]):raise ValueError('A complete, exact CDS annotation is required.')
    if cds.qualifiers.get('codon_start',['1'])!=['1'] or cds.qualifiers.get('transl_table',['1'])!=['1']:raise ValueError('Only complete CDS using the standard genetic code is supported.')
    positions=list(cds.location);sequence=str(cds.extract(record.seq)).upper()
    try:protein=str(Seq(sequence).translate(cds=True))
    except Exception as e:raise ValueError('The annotated CDS is incomplete or has an invalid translation.') from e
    # Require a unique collinear mapping supported by separated high-quality anchors.
    candidates=Counter();anchors={}
    for orientation,read in [(1,control.sequence),(-1,str(Seq(control.sequence).reverse_complement()))]:
        quality=control.quality if orientation==1 else control.quality[::-1]
        for i in range(0,len(read)-39,20):
            word=read[i:i+40]
            if set(word)-set('ACGT') or min(quality[i:i+40])<20:continue
            at=reference.find(word)
            if at<0 or reference.find(word,at+1)>=0:continue
            key=(orientation,at-i);candidates[key]+=1;anchors.setdefault(key,[]).append(i)
    valid=[key for key,n in candidates.items() if n>=2 and max(anchors[key])-min(anchors[key])>=40]
    if len(valid)!=1:raise ValueError('Control does not map uniquely with separated Q20 reference anchors.')
    orientation,offset=valid[0];read=control.sequence if orientation==1 else str(Seq(control.sequence).reverse_complement())
    index={g:i for i,g in enumerate(positions)}
    transcript_ids=cds.qualifiers.get('transcript_id',[])
    rnas=[f for f in record.features if f.type=='mRNA' and transcript_ids and f.qualifiers.get('transcript_id')==transcript_ids and f.location.strand==strand]
    rna=rnas[0] if len(rnas)==1 else None
    # ApE/Benchling exports may describe one transcript through labelled exons.
    exon_features=[f for f in record.features if f.type=='exon']
    prefixes={re.sub(r'\s+Exon\s+\d+$','',f.qualifiers.get('label',[''])[0],flags=re.I) for f in exon_features}
    if rna is None and len([f for f in record.features if f.type=='CDS'])==1 and len(prefixes)==1 and '' not in prefixes and len(exon_features)>1:
        exons=sorted(exon_features,key=lambda f:int(f.location.start),reverse=strand==-1)
        if all(f.location.strand==strand for f in exons) and all(any(g in f.location for f in exons) for g in positions):
            ascending=sorted(exons,key=lambda f:int(f.location.start))
            if all(int(a.location.end)<=int(b.location.start) for a,b in zip(ascending,ascending[1:])):
                rna=SeqFeature(CompoundLocation([f.location for f in exons]),type='mRNA')
    def nmd(stop,deleted,insert_at,insert_len):
        if rna is None:return 'Unknown: matching mRNA exon annotation is missing.'
        if len(rna.location.parts)==1:return 'Possible escape: single-exon transcript.'
        parts=sorted(rna.location.parts,key=lambda p:int(p.start),reverse=strand==-1)
        # For supported internal-exon edits, derive edited transcript coordinates.
        rp=list(rna.location);ri={g:i for i,g in enumerate(rp)}
        if any(g not in ri for g in positions):return 'Unknown: CDS and mRNA annotations conflict.'
        cds_start=ri[positions[0]];junctions=[];count=0
        for part in parts[:-1]:
            count+=len(part);removed=sum(ri.get(g,10**12)<count for g in deleted)
            addition=insert_len if insert_at is not None and ri.get(insert_at,10**12)<count else 0
            junctions.append(count-removed+addition)
        ptc=cds_start+stop*3
        if ptc<cds_start+150:return 'Possible escape: premature stop near the coding start.'
        if junctions[-1]-(ptc+3)<=55:return 'Possible escape: terminal exon or within 55 nt of the final junction.'
        edited_parts=[];count=0
        for part in parts:
            length=len(part)-sum(g in part for g in deleted)+(insert_len if insert_at is not None and insert_at in part else 0)
            edited_parts.append((count,count+length));count+=length
        if any(a<=ptc<b and b-a>407 for a,b in edited_parts):return 'Possible escape: premature stop in a long exon.'
        return 'NMD predicted susceptible (rule-based; not measured).'
    def consequence(label):
        span=interval(label);insert='';insert_at=None
        if span:a,b=span
        else:
            m=re.fullmatch(r'ins([ACGT]+)@(\d+)',label)
            if not m:return {'class':'unresolved','reason':'Unsupported outcome sequence.'}
            insert=m[1];a=b=int(m[2])
        if not 0<=a<=b<=len(control.sequence):return {'class':'unresolved','reason':'Outcome exceeds control coverage.'}
        if orientation==-1:a,b=len(read)-b,len(read)-a;insert=str(Seq(insert).reverse_complement())
        lo,hi=offset+a,offset+b
        if a<20 or b+20>len(read) or lo<0 or hi>len(reference) or read[a-20:b+20]!=reference[lo-20:hi+20]:return {'class':'unresolved','reason':'Local reference match does not cover this edit and both flanks.'}
        # Splice-changing and exon-crossing edits cannot be translated as simple indels.
        internal=[p for p in cds.location.parts if lo>=int(p.start)+3 and hi<=int(p.end)-3]
        if len(internal)!=1:
            if rna is not None:
                exons=sorted(rna.location.parts,key=lambda p:int(p.start),reverse=strand==-1)
                affected=[]
                for i,part in enumerate(exons):
                    if not any(g in part for g in positions):continue
                    sites=[]
                    if i<len(exons)-1:sites.append((int(part.end) if strand==1 else int(part.start)-2,'GT' if strand==1 else 'AC','donor'))
                    if i>0:sites.append((int(part.start)-2 if strand==1 else int(part.end),'AG' if strand==1 else 'CT','acceptor'))
                    for pos,motif,kind in sites:
                        if reference[pos:pos+2]==motif and (any(lo<=g<hi for g in [pos,pos+1]) or (insert and lo==pos+1)):
                            affected.append(kind)
                if affected:return {'class':'splice_disruptive','reason':'Canonical '+', '.join(sorted(set(affected)))+' site disrupted at a coding exon. RNA outcome, exon skipping, reading frame and NMD remain unresolved.'}
            return {'class':'unresolved','reason':'Noncoding, boundary-adjacent or exon-crossing edit; splicing/context requires review.'}
        deleted=set(range(lo,hi));indices=sorted(index[g] for g in deleted)
        if indices and indices!=list(range(indices[0],indices[-1]+1)):return {'class':'unresolved','reason':'Noncontiguous CDS edit.'}
        if indices:start,end=indices[0],indices[-1]+1
        else:
            if lo-1 not in index or lo not in index:return {'class':'unresolved','reason':'Insertion cannot be placed inside the CDS.'}
            start=end=max(index[lo-1],index[lo]);insert_at=lo-1 if strand==1 else lo
        if strand==-1:insert=str(Seq(insert).reverse_complement())
        altered=sequence[:start]+insert+sequence[end:]
        translated=str(Seq(altered[:len(altered)//3*3]).translate());stop=translated.find('*')
        delta=len(insert)-(end-start)
        if delta%3==0:return {'class':'in_frame','reason':'In-frame coding edit; domain/function impact is not resolved.','coding_delta':delta}
        if stop<0 or stop>=len(protein):return {'class':'unresolved','reason':'Coding frameshift without a resolved premature stop in the available CDS.','coding_delta':delta}
        return {'class':'predicted_disruptive','coding_delta':delta,'protein_change':f'Frameshift from codon {start//3+1}; stop at codon {stop+1}','nmd':nmd(stop,deleted,insert_at,len(insert))}
    details=[];score=0.;unresolved=0.;in_frame=0.;susceptible=0.;total=0.;splice=0.;truncating=0.
    for outcome in outcomes:
        weight=outcome.get('fraction')
        if not isinstance(weight,(int,float)) or not math.isfinite(weight) or weight<0:raise ValueError('Invalid model weight.')
        total+=weight
        if outcome.get('kind')=='wild_type':details.append({'label':outcome['label'],'fraction':weight,'class':'wild_type'});continue
        labels=outcome.get('equivalent_proposals') or [outcome.get('label','')]
        if not isinstance(labels,list) or any(not isinstance(label,str) for label in labels):raise ValueError('Equivalent outcomes must be a list of text labels.')
        if len(labels)>1000:raise ValueError('Too many equivalent outcomes.')
        calls=[consequence(label) for label in labels]
        classes={c['class'] for c in calls}
        classification=next(iter(classes)) if len(classes)==1 else 'unresolved'
        if classification=='predicted_disruptive':
            score+=weight;truncating+=weight
            if all(c.get('nmd','').startswith('NMD predicted susceptible') for c in calls):susceptible+=weight
        elif classification=='splice_disruptive':score+=weight;splice+=weight
        elif classification=='in_frame':in_frame+=weight
        else:unresolved+=weight
        details.append({'label':outcome['label'],'fraction':weight,'class':classification,'alternatives':calls})
    if not .98<=total<=1.001:raise ValueError('Model weights do not represent a complete fitted mixture.')
    return {'method':'coding-ko-screen/1','value':score,'coding_truncating':truncating,'splice_disruptive':splice,'unresolved':unresolved,'in_frame':in_frame,'nmd_susceptible':susceptible,'reference':record.id,'transcript':ids(cds) or sorted(prefixes),'reference_sha256':hashlib.sha256(reference_text.encode()).hexdigest(),'control_sha256':control.sha256,'mapping':{'strand':orientation,'offset':offset},'outcomes':details,'limitations':'Possible-KO fitted contribution: internal-CDS frameshifts with premature stops plus canonical splice-site disruptions in one selected transcript. Not a probability of functional knockout or biallelic status. Splice-disruption RNA outcomes and in-frame functional effects remain unresolved; NMD is predicted, not measured. Other isoforms, translation reinitiation and allele dropout are not excluded.'}
