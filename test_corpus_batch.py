import io,json,zipfile,hashlib,threading
from pathlib import Path
from unittest.mock import patch
import pytest
from corpus import Corpus, longest_run
from batch import BatchRunner, validate_jobs
from test_engine import fixture

def test_q20_run_coordinates():
    assert longest_run([False,True,True,False,True])==(2,2,3)
    assert longest_run([False,False])==(0,None,None)

def test_nested_archive_dedup_and_failed_read_tracking(tmp_path):
    raw=b'ABIFmock';outer=io.BytesIO();inner=io.BytesIO()
    with zipfile.ZipFile(inner,'w') as z:z.writestr('nested.ab1',raw)
    with zipfile.ZipFile(outer,'w') as z:z.writestr('copy.ab1',raw);z.writestr('inner.zip',inner.getvalue())
    c=Corpus(tmp_path)
    with patch('corpus.qc_read',return_value={'status':'qc_candidate'}) as qc:
        with zipfile.ZipFile(outer) as z:c.archive(z,'test.zip','project','2026',[0])
        assert qc.call_count==1
    assert c.db.execute('SELECT count(*) FROM sources').fetchone()[0]==2
    assert c.db.execute('SELECT count(*) FROM traces').fetchone()[0]==1
    c.db.close()

def test_batch_validates_pairing_and_rejects_unknown_hashes():
    job={'id':'one','control_sha256':'a','sample_sha256':'b','settings':{'cut_positions':[240]}}
    with pytest.raises(ValueError,match='pairing'):validate_jobs([job],{'a','b'})
    job['pairing_reviewed']=True;validate_jobs([job],{'a','b'})
    with pytest.raises(ValueError,match='corpus hashes'):validate_jobs([job],{'a'})

def test_batch_checkpoint_resume_and_source_change(tmp_path):
    public=tmp_path/'public/corpus';public.mkdir(parents=True)
    (tmp_path/'engine.py').write_text('engine-v1')
    source=tmp_path/'read.ab1';source.write_bytes(b'ABIFchanged')
    (public/'reads.json').write_text(json.dumps([{'sha256':h,'sources':[{'path':'read.ab1'}]} for h in ['a','b']]))
    (public/'summary.json').write_text(json.dumps({'source_root':str(tmp_path)}))
    runner=BatchRunner(tmp_path)
    with pytest.raises(ValueError,match='changed'):runner.trace('a')
    job={'id':'one','control_sha256':'a','sample_sha256':'b','pairing_reviewed':True,'settings':{'cut_positions':[240]}}
    c=fixture()
    with patch.object(runner,'trace',return_value=c):
        first=runner.run([job]);assert not first['results'][0]['cached']
    with patch.object(runner,'trace',side_effect=AssertionError('Should use checkpoint')):
        second=runner.run([job]);assert second['results'][0]['cached']
    assert first['results'][0]['result']==second['results'][0]['result']
    cancel=threading.Event();cancel.set();assert runner.run([job],cancel=cancel)['cancelled']

def test_batch_endpoint_rejects_cross_origin_and_unreviewed_jobs():
    from app import app
    client=app.test_client()
    assert client.post('/api/batch',json={},headers={'Origin':'http://unrelated.invalid'}).status_code==403
    assert client.post('/api/batch',data='{}').status_code==415
    assert client.post('/api/batch',json={'jobs':[]}).status_code==400

def test_review_groups_keep_shared_sequences_and_guides_together():
    from scripts.build_review_manifest import group_reads
    rows=[{'sha256':'a','sources':[{'project':'P1'},{'project':'P2'}],'sequence_sha256':'same'},
          {'sha256':'b','sources':[{'project':'P3'}],'sequence_sha256':'same','guide_hits':[{'sequence':'GUIDE'}]},
          {'sha256':'c','sources':[{'project':'P4'}],'guide_hits':[{'sequence':'GUIDE'}]},
          {'sha256':'d','sources':[{'project':'P5'}]}]
    groups,_=group_reads(rows)
    assert groups['a']==groups['b']==groups['c']
    assert groups['d']!=groups['a']
    assert group_reads(list(reversed(rows)))[0]==groups
