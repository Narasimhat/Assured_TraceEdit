"""Local-first Sanger analysis app with request-scoped trace processing."""
import io
import hashlib
import json
import os
import re
import struct
import tempfile
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault('MPLCONFIGDIR', str(Path(tempfile.gettempdir())/'traceedit-mpl'))
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
from flask import Flask, jsonify, request, send_file, send_from_directory
import numpy as np
from engine import read_ab1, analyze, donor_variants
from edit_annotations import select_centers, target_from_settings
from chromatograms import trace_window, COLORS

HERE=Path(__file__).parent
app=Flask(__name__,static_folder='public',static_url_path='')
app.config['MAX_CONTENT_LENGTH']=4_000_000
HOSTED = bool(os.environ.get('VERCEL'))
if not HOSTED:
    from catalog_api import catalog_api
    app.register_blueprint(catalog_api)
    from batch_api import batch_api
    app.register_blueprint(batch_api)

@app.before_request
def request_limit():
    if request.content_length and request.content_length>app.config['MAX_CONTENT_LENGTH']:
        return jsonify(error='Request exceeds 4 MB. Select fewer figure rows or smaller files.'),413

@app.after_request
def privacy(response):
    if request.path.startswith('/api/'):
        response.headers['Cache-Control']='no-store'
    return response

@app.errorhandler(ValueError)
def invalid(error): return jsonify(error=str(error)),400

@app.errorhandler(413)
def oversized(error): return jsonify(error='Request too large. Use files or a figure selection totaling less than 4 MB.'),413

@app.get('/')
def index(): return send_from_directory(HERE/'public','index.html')

@app.get('/peaksplit/')
def peaksplit_index(): return send_from_directory(HERE/'public'/'peaksplit','index.html')

@app.get('/peaksplit/<path:filename>')
def peaksplit_assets(filename): return send_from_directory(HERE/'public'/'peaksplit',filename)

@app.get('/api/health')
def health(): return jsonify(status='ok',version='0.7.0',engine_sha256=hashlib.sha256((HERE/'engine.py').read_bytes()).hexdigest(),storage='hosted-stateless' if HOSTED else 'local-and-stateless')

def uploaded(role):
    file=request.files.get(role)
    if file is None: raise ValueError('Select a '+role+' AB1 file.')
    name=(file.filename or role+'.ab1').replace('\\','/').split('/')[-1][:160]
    raw=file.read(2_000_001)
    if len(raw)>2_000_000: raise ValueError('Each AB1 file must be smaller than 2 MB.')
    if not raw.startswith(b'ABIF'): raise ValueError(name+': not an AB1/ABIF file.')
    # Bound the untrusted binary directory before Biopython allocates arrays.
    try:
        count,offset=struct.unpack_from('>I4xI',raw,18)
        if not 1<=count<=1024 or offset+28*count>len(raw): raise ValueError()
        for i in range(count):
            entry=struct.unpack_from('>4sIHHIIII',raw,offset+28*i)
            if entry[4]>2_000_000 or entry[5]>len(raw) or (entry[5]>4 and entry[6]+entry[5]>len(raw)): raise ValueError()
    except (ValueError,struct.error): raise ValueError(name+': invalid ABIF directory.') from None
    try: trace=read_ab1(io.BytesIO(raw),name)
    except Exception: raise ValueError(name+': unsupported or malformed AB1 data.') from None
    if not 150<=len(trace.sequence)<=4000: raise ValueError('Read length must be 150–4000 bases.')
    return trace

def settings():
    try: data=json.loads(request.form.get('settings','{}'))
    except Exception: raise ValueError('Invalid analysis settings.') from None
    if not isinstance(data,dict): raise ValueError('Settings must be an object.')
    guides=data.get('guides',[]);cuts=data.get('cut_positions',[]);variants=data.get('variants',[])
    if not isinstance(guides,list) or len(guides)>2 or any(not isinstance(g,str) or len(g)>40 for g in guides): raise ValueError('Use one or two guide sequences.')
    if not isinstance(cuts,list) or len(cuts)>2 or any(type(c)!=int for c in cuts): raise ValueError('Use one or two integer cut positions.')
    if not isinstance(variants,list) or len(variants)>6: raise ValueError('At most six SNPs are supported.')
    for v in variants:
        if not isinstance(v,dict) or set(v)!={'position','ref','alt'} or type(v['position'])!=int or any(not isinstance(v[k],str) or len(v[k])!=1 for k in ('ref','alt')): raise ValueError('Each SNP needs position, ref, and alt.')
    centers=data.get('centers',[])
    if not isinstance(centers,list) or len(centers)>6 or any(type(c)!=int or not 1<=c<=4000 for c in centers): raise ValueError('Display up to six control-read positions.')
    flank=data.get('flank',10)
    if type(flank)!=int or not 6<=flank<=30: raise ValueError('Flank must be 6–30 bases.')
    target_from_settings(data)
    return data

@app.post('/api/donor')
def donor():
    control=uploaded('control');sequence=request.form.get('donor','')
    if len(sequence)>4000: raise ValueError('Donor is too long.')
    return jsonify(donor_variants(control.sequence,sequence))

@app.post('/api/analyze')
def run():
    config=settings();control=uploaded('control');sample=uploaded('sample')
    result=analyze(control,sample,**{k:config[k] for k in ('guides','cut_positions','variants','max_deletion','max_insertion','window') if k in config})
    target=target_from_settings(config)
    result['target_variant']=target
    centers=select_centers(result['variants'],result['cuts_after_base'],config.get('flank',10),config.get('centers'),target)
    oriented=sample.reverse() if result['alignment']['orientation']=='reverse-complement' else sample
    result['displays']={};result['display_errors']=[]
    for center in centers:
        try:
            ctrl=trace_window(control,center,config.get('flank',10))
            edited=trace_window(oriented,center,config.get('flank',10),result['alignment']['base_offset'])
            result['displays'][str(center)]={'center':center,'control':ctrl,'sample':edited,'reference':ctrl['calls'],'colors':COLORS}
        except ValueError as e: result['display_errors'].append(str(e))
    return jsonify(result)

def validate_bundle(body):
    """Bound client-held data before handing it to plotting and document libraries."""
    if not isinstance(body,dict): raise ValueError('Invalid export.')
    bundle=body.get('bundle',{});results=bundle.get('results',[])
    if not isinstance(results,list) or not 1<=len(results)<=384: raise ValueError('Export requires 1–384 results.')
    for r in results:
        if not isinstance(r,dict) or not isinstance(r.get('sample'),str) or len(r['sample'])>160: raise ValueError('Invalid sample name.')
        if r.get('status') not in ('failed','fit_pass','review_required'): raise ValueError('Invalid QC status.')
        for d in r.get('displays',{}).values():
            for role in ('control','sample'):
                w=d[role];x=np.asarray(w['x'],dtype=float);y=np.asarray(w['y'],dtype=float)
                if x.ndim!=1 or not 2<=len(x)<=10000 or y.shape!=(len(x),4) or not np.isfinite(x).all() or not np.isfinite(y).all() or np.max(np.abs(y))>2: raise ValueError('Invalid display signal.')
                if len(w['positions'])>61 or len(w['calls'])!=len(w['positions']) or w['end']-w['start']>60: raise ValueError('Invalid trace window.')
    indices=body.get('indices',[]);centers=body.get('centers',[])
    if not isinstance(indices,list) or not 1<=len(indices)<=12 or any(type(i)!=int or not 0<=i<len(results) for i in indices): raise ValueError('Select 1–12 figure samples.')
    if not isinstance(centers,list) or not 1<=len(centers)<=6 or any(type(c)!=int for c in centers): raise ValueError('Choose one to six sites.')
    for i in indices:
        if results[i].get('source_hashes',{}).get('control')!=results[indices[0]].get('source_hashes',{}).get('control'): raise ValueError('Figure samples must share the same control.')
        for c in centers:
            if str(c) not in results[i].get('displays',{}): raise ValueError('A selected sample lacks a display at this site. Reanalyze with matching figure positions.')
    return bundle

@app.post('/api/export')
def export():
    body=request.get_json();bundle=validate_bundle(body)
    formats={'pdf':'chromatogram_figure.pdf','svg':'chromatogram_figure.svg','png':'chromatogram_figure_600dpi.png','report':'analysis_report.pdf','manifest':'export_manifest.json'}
    fmt=body.get('format','pdf')
    if fmt not in formats: raise ValueError('Unknown export format.')
    from publication import export_publication
    with tempfile.TemporaryDirectory(prefix='traceedit-') as tmp:
        out=Path(tmp)
        export_publication(bundle,body['indices'],[],out,body.get('title','Genome editing chromatograms'),body['centers'],body.get('flank',10),body.get('labels'))
        payload=(out/formats[fmt]).read_bytes()
    if len(payload)>4_000_000: raise ValueError('Export exceeds the cloud response limit. Select fewer figure rows or use vector PDF/SVG.')
    return send_file(io.BytesIO(payload),download_name=formats[fmt],as_attachment=True)

if __name__=='__main__': app.run('127.0.0.1',8767)
