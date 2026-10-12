import io
import random
import numpy as np
import pytest
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio.SeqFeature import SeqFeature, SimpleLocation, CompoundLocation
from engine import Trace
from knockout_prediction import predict

def fixture(reverse=False,rna=True):
    rng=random.Random(32)
    codons=[a+b+c for a in 'ACGT' for b in 'ACGT' for c in 'ACGT' if a+b+c not in ['TAA','TAG','TGA']]
    coding='ATG'+''.join(rng.choice(codons) for _ in range(399))+'TAA'
    genome=list(''.join(rng.choice('ACGT') for _ in range(1750)))
    spans=[(100,400),(500,800),(900,1200),(1300,1603)];cursor=0
    for a,b in spans:genome[a:b]=coding[cursor:cursor+b-a];cursor+=b-a
    for a,b in spans[:-1]:genome[b:b+2]='GT'
    for a,b in spans[1:]:genome[a-2:a]='AG'
    record=SeqRecord(Seq(''.join(genome)),id='TEST.1',annotations={'molecule_type':'DNA'})
    location=CompoundLocation([SimpleLocation(a,b,strand=1) for a,b in spans])
    record.features=[SeqFeature(location,type='CDS',qualifiers={'transcript_id':['TEST-T.1']})]
    if rna:record.features.append(SeqFeature(location,type='mRNA',qualifiers={'transcript_id':['TEST-T.1']}))
    control_seq=str(record.seq[480:880]);record=record.reverse_complement(id=True,annotations=True) if reverse else record
    f=io.StringIO();SeqIO.write(record,f,'genbank')
    trace=Trace(control_seq,np.zeros((400,4)),np.full(400,40),sha256='test-control')
    return trace,f.getvalue()

def outcome(label='del1@201',kind='deletion',fraction=1):return {'label':label,'kind':kind,'fraction':fraction,'equivalent_proposals':[label]}

def test_internal_coding_frameshift_and_reverse_reference_agree():
    a=predict(*fixture(),[outcome()]);b=predict(*fixture(reverse=True),[outcome()])
    assert a['value']==b['value']==1
    assert a['coding_truncating']==1 and a['nmd_susceptible']==1
    assert a['outcomes'][0]['alternatives'][0]['protein_change']==b['outcomes'][0]['alternatives'][0]['protein_change']

def test_inframe_not_automatically_knockout_and_splice_site_is_separate():
    p=predict(*fixture(),[outcome('del3@201')]);assert p['value']==0 and p['in_frame']==1
    p=predict(*fixture(),[outcome('del3@320')]);assert p['splice_disruptive']==1 and p['coding_truncating']==0 and p['nmd_susceptible']==0

def test_nmd_missing_annotation_does_not_invent_susceptibility():
    p=predict(*fixture(rna=False),[outcome()]);assert p['value']==1 and p['nmd_susceptible']==0
    assert 'Unknown' in p['outcomes'][0]['alternatives'][0]['nmd']

def test_ambiguous_equivalent_outcomes_are_unresolved():
    o=outcome();o['equivalent_proposals']+=['del3@201']
    p=predict(*fixture(),[o]);assert p['value']==0 and p['unresolved']==1

def test_invalid_mixture_and_local_reference_mismatch():
    with pytest.raises(ValueError):predict(*fixture(),[outcome(fraction=float('nan'))])
    trace,text=fixture();trace.sequence=trace.sequence[:195]+('A' if trace.sequence[195]!='A' else 'C')+trace.sequence[196:]
    p=predict(trace,text,[outcome()]);assert p['unresolved']==1

def test_wild_type_does_not_contribute_and_weights_are_not_rescaled():
    p=predict(*fixture(),[outcome(fraction=.6),outcome('WT','wild_type',.4)])
    assert p['value']==.6 and p['unresolved']==0
