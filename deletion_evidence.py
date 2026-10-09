"""Explain fitted deletions without treating inferred alleles as observed genotypes."""
import re
from chromatograms import trace_window


def interval(label):
    m = re.fullmatch(r'excision@(\d+):(\d+)', label)
    if m:
        return int(m[1])-1, int(m[2])
    m = re.fullmatch(r'del(\d+)@(\d+)', label)
    if m:
        start = int(m[2])-1
        return start, start+int(m[1])
    return None


def explain_deletions(control, sample, result):
    """Group sequence-identical proposals; retain ambiguity and raw sample calls."""
    groups = {}
    sizes = {}
    unresolved = 0.0
    for outcome in result['outcomes']:
        if outcome['net_bp'] >= 0:
            continue
        size = -outcome['net_bp']
        sizes[size] = sizes.get(size, 0) + outcome['fraction']
        spans = [interval(x) for x in outcome['equivalent_proposals']]
        if not spans or any(x is None for x in spans):
            unresolved += outcome['fraction']
            continue
        sequences = {control.sequence[:a]+control.sequence[b:] for a, b in spans}
        if len(sequences) != 1:
            # Identical signals in the fit window can hide different repair sequences.
            unresolved += outcome['fraction']
            continue
        key = sequences.pop()
        group = groups.setdefault(key, {'size_bp': size, 'fraction': 0., 'intervals': set()})
        group['fraction'] += outcome['fraction']
        group['intervals'].update(spans)
    explained = []
    for sequence, group in sorted(groups.items(), key=lambda kv: -kv[1]['fraction']):
        if group['fraction'] < .05:
            continue
        a, b = min(group.pop('intervals'))
        # Enumerate every reference placement giving the same repaired sequence.
        equivalent = [(i, i+group['size_bp']) for i in range(len(control.sequence)-group['size_bp']+1)
                      if control.sequence[:i]+control.sequence[i+group['size_bp']:] == sequence]
        group['equivalent_intervals'] = [{'start': i+1, 'end': j} for i, j in equivalent]
        group.update(start=a+1, end=b, left=control.sequence[max(0,a-12):a],
                     deleted=control.sequence[a:b], right=control.sequence[b:b+12])
        sample_start = a + result['alignment']['base_offset']
        lo, hi = sample_start-12, sample_start+12
        if lo >= 0 and hi <= len(sample.sequence):
            expected = sequence[a-12:a+12]
            observed = sample.sequence[lo:hi]
            group.update(expected_junction=expected, observed_calls=observed,
                         matching_calls=sum(x==y for x,y in zip(expected,observed)),
                         compared_calls=len(expected), min_quality=int(min(sample.quality[lo:hi])),
                         sample_junction_after_base=sample_start)
            if sample.raw_signal is not None:
                try:
                    group['trace'] = trace_window(sample, sample_start, 12)
                except ValueError as error:
                    group['trace_error'] = str(error)
        explained.append(group)
    return {'size_distribution': [{'size_bp': k, 'fraction': v} for k,v in sorted(sizes.items(), key=lambda kv:-kv[1])],
            'groups': explained, 'unresolved_sequence_fraction': unresolved,
            'coordinate_system': '1-based inclusive control-read bases; not genomic coordinates',
            'note': 'Model-dependent trace contributions, not allele or cell percentages. Identical repaired sequences are combined. Junction calls are instrument base calls from the whole sample, not separated alleles. Deletion length alone does not prove functional knockout.'}
