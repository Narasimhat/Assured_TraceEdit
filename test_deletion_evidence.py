import numpy as np
from engine import Trace, analyze
from deletion_evidence import explain_deletions
from test_engine import fixture, mixture


def test_real_gap_coordinates_and_junction_with_offset():
    c = fixture()
    signal = np.concatenate([c.signal[:240], c.signal[319:]])
    sample = mixture(c, [signal], [1], offset=7)
    result = analyze(c, sample, cut_positions=[240,319], max_deletion=5)
    group = result['deletion_evidence']['groups'][0]
    assert group['size_bp'] == 79
    assert group['end']-group['start']+1 == 79
    assert group['matching_calls'] == group['compared_calls'] == 24
    assert group['expected_junction'] == group['observed_calls']
    assert group['sample_junction_after_base'] == group['start']-1+7


def test_identical_repair_sequences_are_combined_but_distinct_ones_are_not():
    sequence = 'CG'*50+'AAAA'+'TC'*60
    signal = np.eye(4)[['ACGT'.index(b) for b in sequence]]
    control = Trace(sequence,signal,np.full(len(sequence),40))
    sample = Trace(sequence[:100]+sequence[102:],signal[:-2],np.full(len(sequence)-2,40))
    r = {'alignment':{'base_offset':0},'outcomes':[
        {'net_bp':-2,'fraction':.4,'equivalent_proposals':['del2@101']},
        {'net_bp':-2,'fraction':.4,'equivalent_proposals':['del2@102']},
        {'net_bp':-2,'fraction':.2,'equivalent_proposals':['del2@104']} ]}
    e = explain_deletions(control,sample,r)
    assert len(e['groups']) == 2
    assert e['groups'][0]['fraction'] == .8
    assert len(e['groups'][0]['equivalent_intervals']) == 3
    assert e['size_distribution'][0]['fraction'] == 1


def test_signal_equivalence_is_not_falsely_claimed_as_sequence_equivalence():
    c = fixture()
    r = {'alignment':{'base_offset':0},'outcomes':[
        {'net_bp':-4,'fraction':1.,'equivalent_proposals':['del4@101','del4@201']} ]}
    e = explain_deletions(c,c,r)
    assert not e['groups']
    assert e['unresolved_sequence_fraction'] == 1
