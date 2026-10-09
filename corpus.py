"""Local, resumable corpus QC. No experimental labels are inferred from filenames."""
import hashlib
import io
import json
import os
import re
import sqlite3
import time
import zipfile
from pathlib import Path
from collections import Counter
import numpy as np
from engine import read_ab1

VERSION = 'corpus-qc-1'
MAX_READ = 2_000_000
MAX_MEMBER = 128_000_000
MAX_ARCHIVE_TOTAL = 1_000_000_000
MAX_DEPTH = 4

def longpath(path):
    path = str(Path(path).absolute())
    if os.name == 'nt' and not path.startswith('\\\\?\\'):
        path = '\\\\?\\UNC\\' + path[2:] if path.startswith('\\\\') else '\\\\?\\' + path
    return Path(path)

def longest_run(mask):
    edges = np.diff(np.r_[False, mask, False].astype(int))
    starts, ends = np.where(edges == 1)[0], np.where(edges == -1)[0]
    if not len(starts): return 0, None, None
    k = int(np.argmax(ends-starts))
    return int(ends[k]-starts[k]), int(starts[k]+1), int(ends[k])

def qc_read(raw, guides=()):
    if len(raw) > MAX_READ: raise ValueError('AB1 exceeds 2 MB app limit')
    trace = read_ab1(io.BytesIO(raw))
    length = len(trace.sequence)
    if not 150 <= length <= 4000: raise ValueError('Read length outside 150–4000 base app limits')
    run, start, end = longest_run(trace.quality >= 20)
    # A candidate QC screen, not an edit call or a calibrated probability.
    windows = np.convolve((trace.quality >= 20).astype(float), np.ones(100)/100, 'valid')
    best = float(windows.max()) if len(windows) else 0
    issues = []
    if best < .8: issues.append('No 100-base window with at least 80% Q20 calls')
    if np.mean(trace.quality >= 20) < .3: issues.append('Fewer than 30% of all calls are Q20')
    hits = []
    for g in guides:
        for strand, query in [('+',g['sequence']), ('-',g['reverse'])]:
            at = trace.sequence.find(query)
            while at >= 0:
                hits.append({'sequence':g['sequence'],'strand':strand,'start_1based':at+1,'projects':g['projects']})
                at = trace.sequence.find(query, at+1)
    return {'status':'review' if issues else 'qc_candidate', 'issues':issues,
            'bases':length,'q20_fraction':round(float(np.mean(trace.quality >= 20)),4),
            'best_100_q20_fraction':round(best,4),'longest_q20_run':run,
            'q20_run_start':start,'q20_run_end':end,
            'ambiguous_calls':sum(b not in 'ACGT' for b in trace.sequence),
            'sequence_sha256':hashlib.sha256(trace.sequence.encode()).hexdigest(),
            'guide_hits':hits,'truth_status':'unreviewed'}

class Corpus:
    def __init__(self, app):
        self.app = Path(app)
        self.out = self.app/'data/corpus'; self.out.mkdir(parents=True,exist_ok=True)
        self.db = sqlite3.connect(self.out/'corpus.sqlite')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS traces(hash TEXT PRIMARY KEY, qc TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sources(path TEXT PRIMARY KEY, project TEXT, year TEXT, hash TEXT, error TEXT, scan TEXT);
        CREATE TABLE IF NOT EXISTS completed(path TEXT PRIMARY KEY, fingerprint TEXT, scan TEXT);
        CREATE TABLE IF NOT EXISTS issues(path TEXT, error TEXT, scan TEXT);
        ''')
        self.scan = str(time.time_ns())
        self.guides = []
        libpath = self.app/'public/lageso_projects.json'
        library_bytes = libpath.read_bytes() if libpath.exists() else b'{}'
        self.library_hash = hashlib.sha256(library_bytes).hexdigest()
        byseq = {}
        for r in json.loads(library_bytes).get('records',[]):
            for g in r.get('guides',[]):
                seq = g.get('sequence','').upper()
                if 17 <= len(seq) <= 25 and not set(seq)-set('ACGT'):
                    byseq.setdefault(seq,[]).append(r['project_id'])
        for seq, projects in byseq.items():
            self.guides.append({'sequence':seq,'reverse':seq.translate(str.maketrans('ACGT','TGCA'))[::-1],'projects':sorted(set(projects))})
        # QC depends on parser policy and library; invalidate cached calculations on change.
        self.db.execute('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)')
        key = VERSION + ':' + self.library_hash
        old = self.db.execute("SELECT value FROM meta WHERE key='version'").fetchone()
        if old and old[0] != key:
            self.db.execute('DELETE FROM traces'); self.db.execute('DELETE FROM completed')
        self.db.execute("INSERT OR REPLACE INTO meta VALUES('version',?)",(key,))

    def issue(self, path, error):
        self.db.execute('INSERT INTO issues VALUES(?,?,?)',(path,str(error)[:500],self.scan))

    def ingest(self, raw, path, project, year):
        digest = hashlib.sha256(raw).hexdigest()
        if not self.db.execute('SELECT 1 FROM traces WHERE hash=?',(digest,)).fetchone():
            try: qc = qc_read(raw,self.guides)
            except Exception as e: qc = {'status':'parse_error','issues':[str(e)[:300]],'truth_status':'unreviewed'}
            self.db.execute('INSERT INTO traces VALUES(?,?)',(digest,json.dumps(qc)))
        self.db.execute('INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?,?)',(path,project,year,digest,None,self.scan))

    def archive(self, z, path, project, year, budget, depth=0):
        entries = z.infolist()
        if len(entries)>20000:
            self.issue(path,'Archive has more than 20,000 entries; not expanded'); return
        for entry in entries:
            if entry.is_dir(): continue
            ext = Path(entry.filename).suffix.lower()
            if ext not in ('.ab1','.abi','.zip'): continue
            inner = path+'!'+entry.filename
            if ext == '.zip' and depth >= MAX_DEPTH:
                self.issue(inner,'Nested ZIP depth limit reached'); continue
            limit = MAX_READ if ext != '.zip' else MAX_MEMBER
            if entry.file_size > limit or budget[0]+entry.file_size>MAX_ARCHIVE_TOTAL:
                self.issue(inner,'Archive expansion byte limit reached'); continue
            try:
                with z.open(entry) as stream: raw = stream.read(limit+1)
                if len(raw)>limit: raise ValueError('Expanded member exceeds size limit')
                budget[0] += len(raw)
                if ext == '.zip':
                    with zipfile.ZipFile(io.BytesIO(raw)) as nested:
                        self.archive(nested,inner,project,year,budget,depth+1)
                else: self.ingest(raw,inner,project,year)
            except Exception as e: self.issue(inner,e)

    def run(self):
        summary = json.loads((self.app/'public/catalog/summary.json').read_text(encoding='utf-8'))
        root = Path(summary['source_root'])
        total = 0
        for group in summary['projects']:
            data = json.loads((self.app/'public/catalog'/f"{group['id']}.json").read_text(encoding='utf-8'))
            for entry in data['files']:
                if entry['source']!='file': continue
                relative = entry['path']; ext = Path(entry['name']).suffix.lower()
                if ext not in ('.ab1','.abi','.zip'): continue
                source = longpath(root/relative)
                try:
                    st = source.stat(); fingerprint = f'{st.st_size}:{st.st_mtime_ns}'
                    previous = self.db.execute('SELECT fingerprint,scan FROM completed WHERE path=?',(relative,)).fetchone()
                    if previous and previous[0]==fingerprint:
                        # Exact prefix via substr avoids SQL wildcard interpretation of filenames.
                        self.db.execute('UPDATE sources SET scan=? WHERE path=? OR substr(path,1,?)=?', (self.scan,relative,len(relative)+1,relative+'!'))
                        self.db.execute('UPDATE issues SET scan=? WHERE scan=? AND (path=? OR substr(path,1,?)=?)',(self.scan,previous[1],relative,len(relative)+1,relative+'!'))
                    else:
                        self.db.execute('DELETE FROM sources WHERE path=? OR substr(path,1,?)=?',(relative,len(relative)+1,relative+'!'))
                        if ext=='.zip':
                            with zipfile.ZipFile(source) as z: self.archive(z,relative,group['name'],group['year'],[0])
                        else:
                            with source.open('rb') as stream: self.ingest(stream.read(MAX_READ+1),relative,group['name'],group['year'])
                    self.db.execute('INSERT OR REPLACE INTO completed VALUES(?,?,?)',(relative,fingerprint,self.scan))
                except Exception as e:
                    self.issue(relative,e)
                total+=1
                if total%100==0:
                    self.db.commit(); print(json.dumps({'processed_source_files':total}),flush=True)
            self.db.commit()
        self.export(summary,total)

    def export(self, catalog, total):
        rows = self.db.execute('SELECT s.path,s.project,s.year,s.hash,t.qc FROM sources s JOIN traces t ON s.hash=t.hash WHERE s.scan=? ORDER BY s.path',(self.scan,)).fetchall()
        occurrences=Counter(r[3] for r in rows); unique={r[3]:json.loads(r[4]) for r in rows}
        years=Counter(r[2] for r in rows)
        records=[]
        for digest,qc in unique.items():
            sources=[{'path':r[0],'project':r[1],'year':r[2]} for r in rows if r[3]==digest]
            records.append({'sha256':digest,**qc,'copies':occurrences[digest],'sources':sources})
        issues=[{'path':p,'error':e} for p,e in self.db.execute('SELECT path,error FROM issues WHERE scan=?',(self.scan,))]
        report={'version':VERSION,'created_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
                'source_root':catalog['source_root'],'catalog_files':catalog['source_files'],
                'processed_ab1_and_zip_sources':total,'read_occurrences':len(rows),'unique_byte_hashes':len(unique),
                'duplicate_copies':len(rows)-len(unique),'qc_counts':dict(Counter(q['status'] for q in unique.values())),
                'year_occurrences':dict(years),'reads_with_guide_candidates':sum(bool(q.get('guide_hits')) for q in unique.values()),
                'confirmed_truth_labels':0,'issues':issues,
                'limits':{'nested_zip_depth':MAX_DEPTH,'nested_zip_bytes':MAX_MEMBER,'archive_expansion_bytes':MAX_ARCHIVE_TOTAL},
                'coverage':'AB1/ABI quality screening and byte-level deduplication, including bounded nested ZIP traversal. Other formats are inventoried separately. QC is not a genotype call. Guide hits are candidate links only. No model trained.'}
        target=self.app/'public/corpus';target.mkdir(exist_ok=True)
        for name,value in [('summary.json',report),('reads.json',records)]:
            tmp=target/(name+'.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8');tmp.replace(target/name)
        print(json.dumps(report),flush=True)

if __name__=='__main__':
    Corpus(Path(__file__).resolve().parent).run()
