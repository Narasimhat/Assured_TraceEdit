"""Resumable local analysis using content-addressed corpus reads and explicit pairings."""
import hashlib, io, json, sqlite3, time, zipfile
from functools import lru_cache
from pathlib import Path
from corpus import longpath, MAX_MEMBER, MAX_READ
from engine import read_ab1, analyze, donor_variants

def validate_jobs(jobs, known):
    if not isinstance(jobs,list) or not 1 <= len(jobs) <= 2000:
        raise ValueError('Provide 1–2000 jobs per batch')
    ids=set()
    allowed={'guides','cut_positions','variants','max_deletion','max_insertion','window'}
    for j in jobs:
        if not isinstance(j,dict) or not isinstance(j.get('id'),str) or not j['id'] or len(j['id'])>160 or j['id'] in ids:
            raise ValueError('Each job needs a unique nonempty ID of at most 160 characters')
        ids.add(j['id'])
        provenance=j.get('pairing_evidence',{})
        documented=isinstance(provenance,dict) and provenance.get('kind')=='saved_tool_export' and isinstance(provenance.get('path'),str) and bool(provenance['path'])
        if j.get('pairing_reviewed') is not True and not documented:
            raise ValueError('Every pairing needs explicit review or a saved tool export recording the sample and control')
        if j.get('sample_sha256') not in known or j.get('control_sha256') not in known:
            raise ValueError('Sample and control must be corpus hashes')
        if j['sample_sha256']==j['control_sha256'] and not j.get('negative_control_check'):
            raise ValueError('Identical sample/control bytes require an explicit negative_control_check')
        if not isinstance(j.get('settings'),dict) or set(j['settings'])-allowed:
            raise ValueError('Provide supported analysis settings')
        if not j['settings'].get('guides') and not j['settings'].get('cut_positions'):
            raise ValueError('Each job needs guide sequences or explicit cut positions')
        if j.get('donor') and j['settings'].get('variants'):
            raise ValueError('Specify a donor or explicit variants, not both')
        if j.get('donor') and not isinstance(j['donor'],str):raise ValueError('Donor must be DNA text')

class BatchRunner:
    def __init__(self,app):
        self.app=Path(app)
        self.reads={r['sha256']:r for r in json.loads((self.app/'public/corpus/reads.json').read_text(encoding='utf-8'))}
        self.root=Path(json.loads((self.app/'public/corpus/summary.json').read_text(encoding='utf-8'))['source_root'])
        self.out=self.app/'data/batches';self.out.mkdir(exist_ok=True,parents=True)
        self.engine_hash=hashlib.sha256((self.app/'engine.py').read_bytes()).hexdigest()

    @lru_cache(maxsize=16)
    def trace(self,digest):
        failures=[]
        # Prefer physical files, but a verified duplicate in an archive is usable.
        for source in sorted(self.reads[digest]['sources'],key=lambda s:s['path'].count('!')):
            try:
                parts=source['path'].split('!')
                with longpath(self.root/parts[0]).open('rb') as stream:
                    if len(parts)==1:raw=stream.read(MAX_READ+1)
                    else:
                        with zipfile.ZipFile(stream) as z:
                            with z.open(parts[1]) as member:raw=member.read((MAX_READ if len(parts)==2 else MAX_MEMBER)+1)
                        for i,part in enumerate(parts[2:],2):
                            if len(raw)>MAX_MEMBER:raise ValueError('Nested archive too large')
                            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                                with z.open(part) as member:raw=member.read((MAX_READ if i==len(parts)-1 else MAX_MEMBER)+1)
                if len(raw)>MAX_READ or hashlib.sha256(raw).hexdigest()!=digest:raise ValueError('Source content changed since audit')
                return read_ab1(io.BytesIO(raw),digest[:12])
            except Exception as e:failures.append(str(e))
        raise ValueError('No unchanged readable source: '+ '; '.join(failures[:2]))

    def run(self,jobs,progress=None,cancel=None):
        validate_jobs(jobs,self.reads)
        db=sqlite3.connect(self.out/'runs.sqlite')
        db.execute('CREATE TABLE IF NOT EXISTS results(key TEXT PRIMARY KEY, payload TEXT)')
        result=[]
        try:
            for index,job in enumerate(jobs):
                if cancel and cancel.is_set():break
                parameters={k:job.get(k) for k in ('sample_sha256','control_sha256','settings','donor')}
                key=hashlib.sha256(json.dumps([self.engine_hash,parameters],sort_keys=True).encode()).hexdigest()
                cached=db.execute('SELECT payload FROM results WHERE key=?',(key,)).fetchone()
                started=time.perf_counter()
                if cached:payload=json.loads(cached[0])
                else:
                    try:
                        settings=json.loads(json.dumps(job['settings']))
                        control,sample=self.trace(job['control_sha256']),self.trace(job['sample_sha256'])
                        if job.get('donor'):settings['variants']=donor_variants(control.sequence,job['donor'])['variants']
                        native=analyze(control,sample,**settings)
                        payload={'result':native,'status':native['status']}
                        db.execute('INSERT OR REPLACE INTO results VALUES(?,?)',(key,json.dumps(payload)));db.commit()
                    except Exception as e:payload={'status':'error','error':str(e)}
                result.append({'id':job['id'],'cache_key':key,'engine_sha256':self.engine_hash,'cached':bool(cached),'seconds':round(time.perf_counter()-started,4),**payload})
                if progress:progress(index+1,len(jobs),result[-1])
            report={'requested':len(jobs),'completed':len(result),'cancelled':len(result)<len(jobs),'results':result,
                    'limitations':'Model-dependent Sanger contributions. Review warnings. Native TraceEdit currently supports small indels and substitution donors; large tag insertion analysis is not supported.'}
            tmp=self.app/'public/corpus/latest-batch.json.tmp'
            tmp.write_text(json.dumps(report),encoding='utf-8');tmp.replace(tmp.with_suffix(''))
            return report
        finally:db.close()

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('manifest',type=Path);args=parser.parse_args()
    jobs=json.loads(args.manifest.read_text(encoding='utf-8'))['jobs']
    runner=BatchRunner(Path(__file__).resolve().parent)
    runner.run(jobs,lambda n,total,row:print(json.dumps({'completed':n,'total':total,'id':row['id'],'status':row['status'],'cached':row['cached']}),flush=True))
