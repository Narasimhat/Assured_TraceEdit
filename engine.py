"""Independent, bounded Sanger trace mixture inference. Coordinates follow control read."""
from dataclasses import dataclass
from itertools import product
from pathlib import Path
import hashlib
import numpy as np
from Bio import SeqIO, Align
from scipy.optimize import nnls

VERSION = '0.1.0'
BASES = 'ACGT'

def reverse_complement(s):
    return s.translate(str.maketrans('ACGTNacgtn', 'TGCANtgcan'))[::-1]

def dna(s, name='Sequence'):
    s = ''.join(str(s or '').split()).upper()
    if not s or set(s) - set(BASES):
        raise ValueError(f'{name} must contain only A, C, G and T.')
    return s

@dataclass
class Trace:
    sequence: str
    signal: np.ndarray
    quality: np.ndarray
    name: str = ''
    sha256: str = ''
    raw_signal: np.ndarray | None = None
    peak_positions: np.ndarray | None = None

    def reverse(self):
        raw = self.raw_signal[::-1, ::-1].copy() if self.raw_signal is not None else None
        peaks = len(raw)-1-self.peak_positions[::-1] if raw is not None else None
        return Trace(reverse_complement(self.sequence), self.signal[::-1, ::-1].copy(),
                     self.quality[::-1].copy(), self.name, self.sha256, raw, peaks)

def read_ab1(source, name=None):
    record = SeqIO.read(source, 'abi')
    raw = record.annotations['abif_raw']
    order = raw['FWO_1'].decode() if isinstance(raw['FWO_1'], bytes) else raw['FWO_1']
    peaks = np.asarray(raw.get('PLOC2', raw.get('PLOC1')), dtype=int)
    channels = {b: np.asarray(raw[f'DATA{9+i}'], dtype=float) for i, b in enumerate(order)}
    if set(channels) != set(BASES):
        raise ValueError('Unsupported AB1 channel order.')
    if len(peaks) != len(record.seq) or np.any(np.diff(peaks) < 0):
        raise ValueError('AB1 base positions are missing or inconsistent.')
    # Integrate a narrow neighborhood to reduce single-scan noise.
    signal = np.array([[np.mean(channels[b][max(0,p-1):p+2]) for b in BASES] for p in peaks])
    if not np.all(np.isfinite(signal)):
        raise ValueError('AB1 contains invalid signal at base positions.')
    signal = np.maximum(signal, 0)
    empty = signal.sum(axis=1) <= 0
    # Some instruments retain zero-signal terminal calls. Preserve coordinates and mark Q0.
    signal[empty] = .25
    signal /= signal.sum(axis=1, keepdims=True)
    quality = np.asarray(record.letter_annotations.get('phred_quality', [0]*len(peaks)))
    quality[empty] = 0
    duplicates = np.where(np.diff(peaks)==0)[0]
    quality[duplicates] = 0
    quality[duplicates+1] = 0
    if hasattr(source, 'seek'):
        source.seek(0)
        digest = hashlib.sha256(source.read()).hexdigest()
    else:
        digest = hashlib.sha256(Path(source).read_bytes()).hexdigest()
    return Trace(str(record.seq).upper(), signal, quality, name or Path(str(source)).name, digest,
                 np.column_stack([channels[b] for b in BASES]), peaks)

def locate_guides(sequence, guides):
    cuts, sites = [], []
    for guide in guides:
        guide = dna(guide, 'Guide')
        if not 17 <= len(guide) <= 25:
            raise ValueError('Supply a 17–25 nt protospacer without PAM.')
        hits = []
        for strand, query in [('+', guide), ('-', reverse_complement(guide))]:
            start = sequence.find(query)
            while start >= 0:
                hits.append((start, strand))
                start = sequence.find(query, start+1)
        if len(hits) != 1:
            raise ValueError(f'Guide {guide}: expected one exact match in control; found {len(hits)}. Inspect trace or supply an explicit cut position.')
        start, strand = hits[0]
        cut = start + len(guide)-3 if strand == '+' else start+3
        cuts.append(cut)
        sites.append({'guide': guide, 'strand': strand, 'start_1based': start+1, 'cut_after_base': cut})
    return sorted(set(cuts)), sites

def align_trace(control, sample, first_cut):
    start, end = max(20, first_cut-110), first_cut-15
    if end-start < 40:
        raise ValueError('Need at least 40 usable control bases upstream of the edit, beyond the first 20 bases.')
    anchor = control.sequence[start:end]
    aligner = Align.PairwiseAligner(mode='local', match_score=2, mismatch_score=-3,
                                   open_gap_score=-8, extend_gap_score=-2)
    options = []
    for orientation, trace in [('forward', sample), ('reverse-complement', sample.reverse())]:
        alignment = aligner.align(anchor, trace.sequence)[0]
        offsets, matches = [], 0
        for (a,b),(c,d) in zip(*alignment.aligned):
            for i,j in zip(range(a,b),range(c,d)):
                offsets.append(j-(start+i))
                matches += anchor[i] == trace.sequence[j]
        identity = matches/max(1,len(offsets))
        coverage = len(offsets)/len(anchor)
        options.append((alignment.score, orientation, trace, offsets, identity, coverage, alignment))
    _, orientation, trace, offsets, identity, coverage, alignment = max(options, key=lambda t:t[0])
    if not offsets or identity < .85 or coverage < .85:
        raise ValueError('No reliable upstream alignment (identity and coverage must each be ≥85%).')
    offset = int(round(float(np.median(offsets))))
    trimmed = 0
    if np.mean(np.array(offsets) == offset) < .95:
        # A low-quality earlier base call need not invalidate a clean terminal anchor.
        (a,b),(c,d) = list(zip(*alignment.aligned))[-1]
        if b-a < 40 or len(anchor)-b > 5:
            raise ValueError('Upstream gaps leave fewer than 40 contiguous anchor bases near the cut.')
        trimmed = int(a)
        offset = int(c-(start+a))
        start,end = start+int(a),start+int(b)
        identity = sum(control.sequence[i]==trace.sequence[i+offset] for i in range(start,end))/(end-start)
        if identity<.9: raise ValueError('Contiguous upstream anchor identity is below 90%.')
    indices = np.arange(start,end)
    valid = (indices+offset >= 0) & (indices+offset < len(trace.sequence))
    indices = indices[valid]
    baseline = float(np.mean(np.abs(control.signal[indices]-trace.signal[indices+offset])))
    quality = float(np.mean(control.quality[indices] >= 20))
    sample_quality = float(np.mean(trace.quality[indices+offset] >= 20))
    if min(quality, sample_quality) < .6:
        raise ValueError('Upstream trace quality is insufficient: fewer than 60% of anchor bases have Q≥20.')
    return trace, offset, {'orientation':orientation,'base_offset':offset,'identity':identity,
                           'coverage':coverage,'baseline_mae':baseline,'control_q20_fraction':quality,
                           'sample_q20_fraction':sample_quality,'anchor_start':start+1,'anchor_end':end,
                           'trimmed_anchor_bases':trimmed}

def donor_variants(control_sequence, donor):
    donor = dna(donor, 'Donor')
    aligner = Align.PairwiseAligner(mode='local', match_score=2, mismatch_score=-3,
                                   open_gap_score=-10, extend_gap_score=-2)
    choices = []
    for strand, seq in [('+',donor),('-',reverse_complement(donor))]:
        aln = aligner.align(control_sequence, seq)[0]
        choices.append((aln.score, strand, seq, aln))
    _, strand, seq, aln = max(choices, key=lambda t:t[0])
    blocks = list(zip(*aln.aligned))
    coverage = sum(b-a for (a,b),_ in blocks)/len(seq)
    if coverage < .85 or len(blocks) != 1:
        raise ValueError('Donor requires a contiguous alignment covering ≥85%; donor indels are not supported in this version.')
    (a,b),(c,d) = blocks[0]
    variants = [{'position':int(i+1),'ref':control_sequence[i],'alt':seq[j]} for i,j in zip(range(a,b),range(c,d)) if control_sequence[i] != seq[j]]
    if not variants or len(variants) > 12:
        raise ValueError('Donor alignment has zero or >12 substitutions. Specify variants manually.')
    return {'strand':strand,'coverage':coverage,'variants':variants}

def proposals(control, cuts, max_deletion, max_insertion, variants):
    n = len(control.sequence)
    candidates = [('WT',0,'wild_type',control.signal)]
    for cut in cuts:
        for size in range(1,max_deletion+1):
            # Enumerate all deletions touching the cut; aggregate ambiguous equivalents later.
            for start in range(cut-size,cut+1):
                if start < 0 or start+size >= n: continue
                sig = np.concatenate([control.signal[:start], control.signal[start+size:]])
                candidates.append((f'del{size}@{start+1}',-size,'deletion',sig))
        for size in range(1,max_insertion+1):
            for bases in product(BASES,repeat=size):
                ins = ''.join(bases)
                signal = np.eye(4)[[BASES.index(b) for b in ins]]
                sig = np.concatenate([control.signal[:cut],signal,control.signal[cut:]])
                candidates.append((f'ins{ins}@{cut}',size,'insertion',sig))
    if len(cuts) == 2:
        a,b = cuts
        for left in range(-2,3):
            for right in range(-2,3):
                start,end = a+left,b+right
                if 0 <= start < end < n:
                    sig = np.concatenate([control.signal[:start],control.signal[end:]])
                    candidates.append((f'excision@{start+1}:{end}',start-end,'excision',sig))
    if variants:
        # All combinations of up to six substitutions allow partial donor incorporation.
        if len(variants)>6: raise ValueError('At most six specified substitutions are supported per analysis.')
        for mask in range(1,2**len(variants)):
            signal = control.signal.copy()
            labels = []
            for k,v in enumerate(variants):
                if mask & (1<<k):
                    i = v['position']-1
                    signal[i] = np.eye(4)[BASES.index(v['alt'])]
                    labels.append(f"{v['ref']}{v['position']}{v['alt']}")
            candidates.append(('+'.join(labels),0,'substitution',signal))
    return candidates

def fit_mixture(matrix, observed):
    # Strong sum-to-one constraint with nonnegative least squares; no ICE code used.
    a = np.vstack([matrix, np.ones((1,matrix.shape[1]))*20])
    b = np.r_[observed,20.]
    weights,_ = nnls(a,b,maxiter=max(3000,10*matrix.shape[1]))
    if weights.sum() <= 0: raise ValueError('Mixture fit failed.')
    weights /= weights.sum()
    predicted = matrix@weights
    residual = float(np.mean((observed-predicted)**2))
    r2 = float(1-np.sum((observed-predicted)**2)/max(1e-12,np.sum((observed-observed.mean())**2)))
    return weights,predicted,r2,residual

def analyze(control, sample, guides=None, cut_positions=None, variants=None, max_deletion=20, max_insertion=2, window=120):
    max_deletion,max_insertion,window = int(max_deletion),int(max_insertion),int(window)
    if not 1 <= max_deletion <= 40 or not 0 <= max_insertion <= 3 or not 60 <= window <= 250:
        raise ValueError('Allowed ranges: deletion 1–40 bp, insertion 0–3 bp, window 60–250 bases.')
    guides = guides or []
    sites = []
    if cut_positions:
        cuts = sorted(set(int(v) for v in cut_positions))
    else:
        cuts,sites = locate_guides(control.sequence,guides)
    if not 1 <= len(cuts) <= 2: raise ValueError('Provide one or two guides or cut positions.')
    if min(cuts)<75 or max(cuts)>=len(control.sequence)-60:
        raise ValueError('Cut positions need ≥75 upstream and ≥60 downstream control bases.')
    variants = variants or []
    positions = set()
    for v in variants:
        v['position'] = int(v['position'])
        v['ref'],v['alt'] = dna(v['ref'],'Reference base'),dna(v['alt'],'Alternate base')
        i = v['position']-1
        if len(v['ref'])!=1 or len(v['alt'])!=1 or v['ref']==v['alt'] or not 0<=i<len(control.sequence) or control.sequence[i]!=v['ref']:
            raise ValueError(f'Variant {v} does not match the control sequence.')
        if i in positions: raise ValueError('Duplicate variant position.')
        positions.add(i)
    # Align before every intended edit, including donor SNPs upstream of the cut.
    oriented,offset,alignment = align_trace(control,sample,min([*cuts,*positions]))
    candidates = proposals(control,cuts,max_deletion,max_insertion,variants)
    start = min(min(cuts)-8,min(positions,default=min(cuts)-8))
    end = min(max(cuts)+window,len(oriented.sequence)-offset,min(len(c[3]) for c in candidates))
    if start+offset<0 or end-max(cuts)<50: raise ValueError('Insufficient downstream read coverage for the candidate edit range.')
    if any(i<start or i>=end for i in positions): raise ValueError('Specified SNP is outside the inference window.')
    if any(i < alignment['anchor_end'] for i in positions): raise ValueError('Specified SNP overlaps the upstream alignment anchor.')
    observed = oriented.signal[start+offset:end+offset].flatten()
    matrix = np.column_stack([c[3][start:end].flatten() for c in candidates])
    # Identical observable hypotheses cannot be distinguished. Keep an explicit equivalence group.
    unique,idx,inv = np.unique(np.round(matrix,6),axis=1,return_index=True,return_inverse=True)
    weights,predicted,r2,mse = fit_mixture(unique,observed)
    outcomes = []
    for j,w in enumerate(weights):
        if w < 1e-6: continue
        members = np.where(inv==j)[0]
        candidate = candidates[int(idx[j])]
        outcomes.append({'label':candidate[0],'net_bp':candidate[1],'kind':candidate[2],
                         'fraction':float(w),'equivalent_proposals':[candidates[k][0] for k in members]})
    outcomes.sort(key=lambda o:-o['fraction'])
    indel = sum(o['fraction'] for o in outcomes if o['net_bp']!=0)
    frameshift = sum(o['fraction'] for o in outcomes if o['net_bp']%3!=0)
    substitutions = sum(o['fraction'] for o in outcomes if o['kind']=='substitution')
    warnings = []
    q20 = float(np.mean(control.quality[start:end]>=20))
    if r2<.8: warnings.append('Poor mixture fit (R² < 0.80); reported fractions are unreliable.')
    if alignment['baseline_mae']>.08: warnings.append('High upstream trace disagreement; inspect control pairing and alignment.')
    if q20<.7: warnings.append('Control inference window has fewer than 70% Q≥20 bases.')
    if any(abs(o['net_bp'])==max_deletion and o['kind']=='deletion' and o['fraction']>.05 for o in outcomes):
        warnings.append('An outcome reaches the deletion search boundary; increase the range.')
    if any(o['net_bp']==max_insertion and o['kind']=='insertion' and o['fraction']>.05 for o in outcomes):
        warnings.append('An outcome reaches the insertion search boundary; larger insertions are not modeled.')
    if len(cuts)>1: warnings.append('Two-guide model includes single-site edits and inter-guide excision, but not combinations of independent small indels.')
    snps = []
    for v in variants:
        i = v['position']-1
        alt = BASES.index(v['alt'])
        raw = float(oriented.signal[i+offset,alt]); background = float(control.signal[i,alt])
        snps.append({**v,'sample_alt_signal':raw,'control_alt_signal':background,
                     'background_corrected_signal':float(np.clip((raw-background)/max(1e-8,1-background),0,1))})
    if snps and indel>.1: warnings.append('Substantial indel signal confounds per-position SNP fractions; SNP signal is not an allele frequency.')
    if len(snps)>1: warnings.append('Sanger mixtures cannot phase separated SNPs. Substitution-combination contributions are non-unique and do not establish complete donor incorporation.')
    return {'version':VERSION,'sample':sample.name,'control':control.name,
            'source_hashes':{'control':control.sha256,'sample':sample.sha256},
            'status':'review_required' if warnings else 'fit_pass','warnings':warnings,
            'metrics':{'indel_fraction':indel,'frameshift_proxy':frameshift,'substitution_fraction':substitutions,
                       'mean_snp_signal':float(np.mean([v['background_corrected_signal'] for v in snps])) if snps else None,
                       'r_squared':r2,'rmse':float(np.sqrt(mse))},
            'alignment':alignment,'guides':sites,'cuts_after_base':cuts,'variants':snps,
            'parameters':{'max_deletion':max_deletion,'max_insertion':max_insertion,'window':window},
            'inference':{'start_1based':start+1,'end_1based':end,'control_q20_fraction':q20,'proposals':len(candidates),'distinct_proposals':len(weights)},
            'outcomes':outcomes,'plot':{'positions':list(range(start+1,end+1)),
                'control':control.signal[start:end].round(5).tolist(),'sample':oriented.signal[start+offset:end+offset].round(5).tolist(),
                'fitted':predicted.reshape(-1,4).round(5).tolist(),'sequence':control.sequence[start:end]},
            'limitations':['Research prototype; not benchmarked against independent allele-frequency ground truth.',
                'Fractions are model-dependent trace contributions, not cell percentages or confirmed genotypes.',
                'Frameshift proxy assumes a coding-region edit; it is not proof of knockout.',
                'Sanger base-position sampling and a constant upstream offset may misalign complex mixtures.',
                'No compound SNP+indel alleles, large insertions, arbitrary complex repair, or mosaic copy-number inference.']}
