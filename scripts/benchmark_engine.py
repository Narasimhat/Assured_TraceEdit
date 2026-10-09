"""Deterministic stress benchmark, explicitly separate from biological validation."""
import json, sys, time
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Trace, analyze, VERSION

def run():
    results=[]
    for seed in (19,71,211):
        rng=np.random.default_rng(seed)
        seq=''.join(rng.choice(list('ACGT'),650));sig=np.eye(4)[['ACGT'.index(b) for b in seq]]
        c=Trace(seq,sig,np.full(650,40),'synthetic control')
        for case in ('wt','del1','del7','ins2','del60_out_of_model','wrong_control','low_quality_anchor','noisy_del7'):
            fraction=.6;true_fraction=0 if case=='wt' else fraction
            edited=sig.copy();q=np.full(650,40)
            if 'del' in case:
                size=60 if '60' in case else 7 if '7' in case else 1
                edited=np.concatenate([sig[:240],sig[240+size:]])
            if case=='ins2':edited=np.concatenate([sig[:240],np.eye(4)[[0,2]],sig[240:]])
            n=min(len(sig),len(edited));mix=(1-fraction)*sig[:n]+fraction*edited[:n]
            if case=='wrong_control':mix=np.eye(4)[rng.integers(0,4,n)]
            if case=='low_quality_anchor':q[:]=0
            if case=='noisy_del7':
                mix=np.maximum(0,mix+rng.normal(0,.04,mix.shape));mix/=mix.sum(axis=1,keepdims=True)
            s=Trace(''.join('ACGT'[i] for i in mix.argmax(axis=1)),mix,q[:n],'synthetic sample')
            start=time.perf_counter()
            try:
                r=analyze(c,s,cut_positions=[240],max_deletion=20,max_insertion=2)
                row={'status':r['status'],'predicted_indel_fraction':r['metrics']['indel_fraction'],'r_squared':r['metrics']['r_squared'],'warnings':r['warnings']}
            except Exception as e:row={'status':'rejected','error':str(e)}
            support=case not in ('del60_out_of_model','wrong_control','low_quality_anchor')
            row.update(seed=seed,case=case,supported=support,truth_indel_fraction=true_fraction if support or 'del60' in case else None,seconds=round(time.perf_counter()-start,4))
            if support and 'predicted_indel_fraction' in row:row['absolute_error']=abs(row['predicted_indel_fraction']-true_fraction)
            results.append(row);print(json.dumps(row),flush=True)
    errors=[r['absolute_error'] for r in results if 'absolute_error' in r]
    unsupported=[r for r in results if not r['supported']]
    report={'engine_version':VERSION,'synthetic_only':True,'cases':len(results),
            'supported_cases':sum(r['supported'] for r in results),'supported_mae':float(np.mean(errors)),
            'unsupported_cases':len(unsupported),'unsupported_not_flagged':sum(r['status']=='fit_pass' for r in unsupported),
            'median_seconds':float(np.median([r['seconds'] for r in results])),
            'limitations':'Synthetic signals share assumptions with the model. This measures regression behavior, not biological accuracy or superiority to other tools.',
            'results':results}
    out=Path(__file__).resolve().parents[1]/'public/corpus';out.mkdir(exist_ok=True)
    (out/'benchmark.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

if __name__=='__main__':run()
