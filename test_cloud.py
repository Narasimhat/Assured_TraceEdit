import io
import json
from app import app
from synthetic import example

def analyzed():
    c,s,config=example()
    response=app.test_client().post('/api/analyze',data={'control':(io.BytesIO(c),'synthetic_control.ab1'),'sample':(io.BytesIO(s),'synthetic_mixed.ab1'),'settings':json.dumps(config)})
    assert response.status_code==200,response.data
    return response.get_json(),config

def test_ab1_upload_and_continuous_signal():
    r,_=analyzed()
    assert abs(r['variants'][0]['background_corrected_signal']-.55)<.005
    assert r['metrics']['indel_fraction']<.01
    assert len(r['displays']['247']['sample']['x'])>200
    assert 'sources' not in r

def test_stateless_publication():
    r,config=analyzed()
    bundle={'id':'synthetic_test','created_utc':'2026-01-01T00:00:00Z','settings':config,'results':[r]}
    client=app.test_client()
    for fmt,signature in [('pdf',b'%PDF'),('report',b'%PDF'),('svg',b'<?xml'),('png',b'\x89PNG')]:
        response=client.post('/api/export',json={'bundle':bundle,'indices':[0],'centers':[247],'format':fmt,'title':'Synthetic screening example'})
        assert response.status_code==200,response.data[:300]
        assert response.data.startswith(signature)
        assert response.headers['Cache-Control']=='no-store'

def test_invalid_upload_and_export():
    client=app.test_client()
    response=client.post('/api/analyze',data={'control':(io.BytesIO(b'fake'),'fake.ab1'),'sample':(io.BytesIO(b'fake'),'fake.ab1')})
    assert response.status_code==400
    assert client.post('/api/export',json={'bundle':{'results':[]}}).status_code==400
    assert client.post('/api/analyze',data=b'x'*4_000_001).status_code==413

def test_health_and_frontend():
    client=app.test_client()
    assert client.get('/api/health').get_json()['storage']=='local-and-stateless'
    page=client.get('/').data
    assert b'ASSURED' in page and b'id="analysis-form"' in page
