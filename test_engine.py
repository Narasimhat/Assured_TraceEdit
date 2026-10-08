import copy
import io
from pathlib import Path
import numpy as np
import pytest
from engine import Trace, analyze, locate_guides, reverse_complement, donor_variants, read_ab1

def fixture():
    rng=np.random.default_rng(177)
    sequence=''.join(rng.choice(list('ACGT'),650))
    signal=np.eye(4)[['ACGT'.index(b) for b in sequence]]
    return Trace(sequence,signal,np.full(650,40),'control')

def mixture(control,signals,weights,offset=0):
    n=min(len(s) for s in signals)
    signal=sum(w*s[:n] for w,s in zip(weights,signals))
    sequence=''.join('ACGT'[i] for i in signal.argmax(axis=1))
    if offset:
        signal=np.concatenate([np.eye(4)[[0]*offset],signal])
        sequence='A'*offset+sequence
    return Trace(sequence,signal,np.full(len(sequence),40),'sample')

def test_wildtype():
    c=fixture();r=analyze(c,c,cut_positions=[240],max_deletion=8)
    assert r['metrics']['indel_fraction']<1e-5
    assert r['metrics']['r_squared']>.999

@pytest.mark.parametrize('size,fraction,offset',[(1,.3,0),(7,.65,8),(3,1.,0)])
def test_deletion_recovery(size,fraction,offset):
    c=fixture();d=np.concatenate([c.signal[:240],c.signal[240+size:]])
    s=mixture(c,[c.signal,d],[1-fraction,fraction],offset)
    r=analyze(c,s,cut_positions=[240],max_deletion=10)
    assert abs(r['metrics']['indel_fraction']-fraction)<.01
    assert abs(r['metrics']['frameshift_proxy']-(fraction if size%3 else 0))<.01
    assert r['alignment']['base_offset']==offset

def test_reverse_sample():
    c=fixture();r=analyze(c,c.reverse(),cut_positions=[240],max_deletion=5)
    assert r['alignment']['orientation']=='reverse-complement'
    assert r['metrics']['r_squared']>.999

def test_insertion():
    c=fixture();insert=np.concatenate([c.signal[:240],np.eye(4)[[0,2]],c.signal[240:]])
    s=mixture(c,[c.signal,insert],[.4,.6]);r=analyze(c,s,cut_positions=[240],max_deletion=5)
    assert abs(r['metrics']['indel_fraction']-.6)<.01
    assert any(o['label']=='insAG@240' and o['fraction']>.59 for o in r['outcomes'])

def test_dual_excision():
    c=fixture();d=np.concatenate([c.signal[:240],c.signal[300:]])
    s=mixture(c,[c.signal,d],[.25,.75]);r=analyze(c,s,cut_positions=[240,300],max_deletion=5)
    assert abs(r['metrics']['indel_fraction']-.75)<.01
    assert r['metrics']['frameshift_proxy']<.01

def test_snp():
    c=fixture();i=246;alt=next(b for b in 'ACGT' if b!=c.sequence[i]);edited=c.signal.copy();edited[i]=np.eye(4)['ACGT'.index(alt)]
    s=mixture(c,[c.signal,edited],[.45,.55]);v={'position':i+1,'ref':c.sequence[i],'alt':alt}
    r=analyze(c,s,cut_positions=[240],variants=[v],max_deletion=5)
    assert abs(r['metrics']['substitution_fraction']-.55)<.01
    assert abs(r['variants'][0]['background_corrected_signal']-.55)<.01

def test_snp_upstream_of_default_cut_anchor():
    c=fixture();i=210;alt=next(b for b in 'ACGT' if b!=c.sequence[i])
    edited=c.signal.copy();edited[i]=np.eye(4)['ACGT'.index(alt)]
    s=mixture(c,[c.signal,edited],[.4,.6])
    r=analyze(c,s,cut_positions=[240],variants=[{'position':i+1,'ref':c.sequence[i],'alt':alt}],max_deletion=5)
    assert r['alignment']['anchor_end'] < i
    assert abs(r['variants'][0]['background_corrected_signal']-.6)<.01

def test_donor_mapping_both_strands():
    c=fixture();seq=list(c.sequence[200:300]);seq[46]=next(b for b in 'ACGT' if b!=seq[46]);donor=''.join(seq)
    for d in [donor,reverse_complement(donor)]:
        result=donor_variants(c.sequence,d)
        assert result['variants']==[{'position':247,'ref':c.sequence[246],'alt':seq[46]}]

def test_guides_both_strands():
    c=fixture();cuts,sites=locate_guides(c.sequence,[c.sequence[223:243],reverse_complement(c.sequence[300:320])])
    assert cuts==[240,303]
    assert [s['strand'] for s in sites]==['+','-']

def test_reject_mismatched_reference_and_bad_quality():
    c=fixture();s=copy.deepcopy(c);s.quality[:]=0
    with pytest.raises(ValueError,match='quality'): analyze(c,s,cut_positions=[240])
    wrong=next(b for b in 'ACGT' if b!=c.sequence[246])
    with pytest.raises(ValueError,match='does not match'): analyze(c,c,cut_positions=[240],variants=[{'position':247,'ref':wrong,'alt':c.sequence[246]}])

def test_invalid_ab1():
    with pytest.raises(Exception): read_ab1(io.BytesIO(b'not an AB1 file'))

def test_unrelated_sample_rejected():
    c=fixture();s=Trace('A'*650,np.tile([1,0,0,0],(650,1)),np.full(650,40))
    with pytest.raises(ValueError,match='alignment'): analyze(c,s,cut_positions=[240])

def test_earlier_anchor_basecall_gap():
    c=fixture();signal=np.concatenate([c.signal[:145],c.signal[146:]])
    s=mixture(c,[signal],[1.])
    r=analyze(c,s,cut_positions=[240],max_deletion=5)
    assert r['alignment']['trimmed_anchor_bases']>0
    assert r['alignment']['base_offset']==-1
    assert r['metrics']['indel_fraction']<1e-5

def test_multiple_snps_marked_unphased():
    c=fixture();variants=[]
    for i in [244,247]:
        variants.append({'position':i+1,'ref':c.sequence[i],'alt':next(b for b in 'ACGT' if b!=c.sequence[i])})
    r=analyze(c,c,cut_positions=[240],variants=variants,max_deletion=4)
    assert r['metrics']['mean_snp_signal']==0
    assert any('cannot phase' in w for w in r['warnings'])
