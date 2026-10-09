"""Group duplicates/projects before any future supervised training; leave every label blank."""
import hashlib,json
from pathlib import Path

def group_reads(reads):
    parent={}
    def find(x):
        parent.setdefault(x,x)
        if parent[x]!=x:parent[x]=find(parent[x])
        return parent[x]
    def join(a,b):
        ra,rb=find(a),find(b)
        if ra!=rb:parent[max(ra,rb)]=min(ra,rb)
    sequence_owner={};guide_owner={}
    for read in reads:
        projects=sorted(set(s['project'] for s in read['sources']))
        for p in projects:join(projects[0],p)
        # Identical called sequences and shared guides make project independence doubtful.
        for value,owners in [(read.get('sequence_sha256'),sequence_owner)]+[(g['sequence'],guide_owner) for g in read.get('guide_hits',[])]:
            if value:
                if value in owners:join(projects[0],owners[value])
                else:owners[value]=projects[0]
    members={}
    for p in parent:members.setdefault(find(p),[]).append(p)
    identifiers={root:hashlib.sha256(json.dumps(sorted(ps)).encode()).hexdigest()[:16] for root,ps in members.items()}
    return {r['sha256']:identifiers[find(r['sources'][0]['project'])] for r in reads},members

def run():
    out=Path(__file__).resolve().parents[1]/'public/corpus'
    reads=json.loads((out/'reads.json').read_text(encoding='utf-8'))
    groups,members=group_reads(reads)
    rows=[{'sample_sha256':r['sha256'],'project_group':groups[r['sha256']],
           'sources':r['sources'],'review_status':'unreviewed','reviewer':'','evidence_source':'',
           'evidence_kind':'','expected_outcome':None,'expected_fraction':None,
           'control_sha256':'','target':'','primer':'','intended_edit':'','notes':''} for r in reads]
    manifest={'schema_version':1,'eligible_for_training':0,'project_groups':len(members),'policy':[
        'No split or model training until labels, pairing and evidence are reviewed.',
        'ICE and DECODR are comparator outputs, not independent truth labels.',
        'Keep connected project groups together: shared byte hashes, identical called sequences, and matching guides join groups.',
        'Check target, clone, cell-line and replicate relationships before locking train/validation/test groups; metadata grouping alone is insufficient.',
        'Reserve an untouched prospective test set before tuning. Never tune thresholds on held-out results.'
    ],'records':rows}
    (out/'label-review.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'unreviewed_reads':len(rows),'connected_project_groups':len(members),'training_labels':0}))

if __name__=='__main__':run()
