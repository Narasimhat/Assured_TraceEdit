import pytest
from edit_annotations import select_centers, target_from_settings


def test_windows_cover_every_change_including_late_target():
    variants=[{'position':p} for p in [126,192,193,194,195,201,350,600]]
    centers=select_centers(variants,[],10,target={'position':201})
    assert centers[0]==201
    assert all(any(abs(v['position']-c)<=10 for c in centers) for v in variants)
    assert select_centers([{'position':p} for p in [193,194,195,201]],[])==[197]


def test_explicit_windows_are_supplemented_not_silently_omitting_edits():
    assert select_centers([{'position':201}],[],10,[100])==[100,201]


def test_target_requires_matching_reference_and_alternate():
    target={'position':201,'ref':'A','alt':'C','label':'E280D'}
    assert target_from_settings({'target_variant':target,'variants':[dict(position=201,ref='A',alt='C')]})==target
    with pytest.raises(ValueError,match='must match'):
        target_from_settings({'target_variant':target,'variants':[dict(position=201,ref='G',alt='C')]})


def test_api_export_includes_late_target_and_all_four_windows():
    import io,json
    from app import app
    from synthetic import example
    from engine import read_ab1
    from pypdf import PdfReader
    c,s,config=example()
    control=read_ab1(io.BytesIO(c))
    config['variants']=[{'position':p,'ref':control.sequence[p-1],'alt':next(b for b in 'ACGT' if b!=control.sequence[p-1])} for p in [150,247,270,300]]
    config['centers']=[];config['flank']=6
    config['target_variant']={**config['variants'][-1],'label':'Late target'}
    client=app.test_client()
    response=client.post('/api/analyze',data={'control':(io.BytesIO(c),'control.ab1'),'sample':(io.BytesIO(s),'sample.ab1'),'settings':json.dumps(config)})
    assert response.status_code==200,response.data
    r=response.get_json()
    assert list(map(int,r['displays']))==[150,247,270,300]
    body={'bundle':{'id':'test','created_utc':'2026-01-01','settings':config,'results':[r]},'indices':[0],'centers':list(map(int,r['displays'])),'format':'pdf'}
    exported=client.post('/api/export',json=body)
    assert exported.status_code==200,exported.data[:500]
    text=''.join(p.extract_text() for p in PdfReader(io.BytesIO(exported.data)).pages)
    assert 'Late target' in text
    for v in config['variants']:assert f"{v['ref']}{v['position']}{v['alt']}" in text
    body['centers']=[150,247]
    rejected=client.post('/api/export',json=body)
    assert rejected.status_code==400
    assert b'outside the saved windows' in rejected.data
