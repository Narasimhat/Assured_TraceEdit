import json
import hashlib
from flask import Flask
import reference_api

def test_catalog_reference_resolution_deduplicates_and_rejects_paths(tmp_path,monkeypatch):
    catalog=tmp_path/'public/catalog';catalog.mkdir(parents=True)
    root=tmp_path/'sources';root.mkdir()
    (root/'a.gb').write_text('LOCUS       A\n//\n')
    (root/'b.gb').write_text('LOCUS       A\n//\n')
    (catalog/'summary.json').write_text(json.dumps({'source_root':str(root)}))
    entries=[{'name':'reference.gb','path':n,'source':'file'} for n in ['a.gb','b.gb']]
    (catalog/'test.json').write_text(json.dumps({'files':entries}))
    monkeypatch.setattr(reference_api,'HERE',tmp_path)
    app=Flask(__name__);app.register_blueprint(reference_api.reference_api);client=app.test_client()
    result=client.post('/api/reference/resolve',json={'filename':'reference.gb'})
    assert result.status_code==200
    assert result.json['sha256']==hashlib.sha256(result.json['text'].encode()).hexdigest()
    assert '\r' not in result.json['text']
    assert client.post('/api/reference/resolve',json={'filename':'../a.gb'}).status_code==400
    (root/'b.gb').write_text('LOCUS       B\n//\n')
    result=client.post('/api/reference/resolve',json={'filename':'reference.gb'})
    assert result.status_code==409 and len(result.json['candidates'])==2
    assert all('text' not in x for x in result.json['candidates'])
    chosen=result.json['candidates'][0]['sha256']
    assert client.post('/api/reference/resolve',json={'filename':'reference.gb','sha256':chosen}).status_code==200
