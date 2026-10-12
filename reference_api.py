"""Resolve only GenBank filenames explicitly indexed in the local project catalog."""
import hashlib
import json
import re
from pathlib import Path, PureWindowsPath
from flask import Blueprint, jsonify, request

reference_api=Blueprint('reference_api',__name__)
HERE=Path(__file__).resolve().parent

@reference_api.post('/api/reference/resolve')
def resolve_reference():
    body=request.get_json(silent=True) or {};name=body.get('filename','')
    if not isinstance(name,str) or not re.fullmatch(r'[\w .()\-]+\.(?:gb|gbk|genbank)',name,re.I):
        return jsonify(error='Use a GenBank filename, not a path or URL.'),400
    summary_path=HERE/'public/catalog/summary.json'
    if not summary_path.exists():return jsonify(error='Local reference catalog is unavailable.'),404
    summary=json.loads(summary_path.read_text(encoding='utf-8'));root=Path(summary['source_root']).resolve()
    matches={}
    for group_path in (HERE/'public/catalog').glob('*.json'):
        if group_path.name=='summary.json':continue
        group=json.loads(group_path.read_text(encoding='utf-8'))
        for item in group.get('files',[]):
            if item.get('name','').lower()!=name.lower() or item.get('source')!='file':continue
            relative=PureWindowsPath(item['path'])
            if relative.is_absolute() or '..' in relative.parts:continue
            path=(root/Path(*relative.parts)).resolve()
            if not path.is_relative_to(root):continue
            try:
                with path.open('rb') as f:data=f.read(2_000_001)
                if len(data)>2_000_000:continue
                text=data.decode('utf-8-sig').replace('\r\n','\n').replace('\r','\n');digest=hashlib.sha256(text.encode('utf-8')).hexdigest()
                if not text.lstrip().startswith('LOCUS'):continue
            except (OSError,UnicodeError):continue
            matches.setdefault(digest,{'filename':name,'sha256':digest,'text':text,'source':'Local catalog','projects':[]})['projects'].append(group_path.stem)
    chosen=body.get('sha256')
    if chosen:
        if chosen not in matches:return jsonify(error='Selected reference no longer matches the catalog.'),409
        return jsonify(matches[chosen])
    if len(matches)==1:return jsonify(next(iter(matches.values())))
    if not matches:return jsonify(error='Reference filename was not found in accessible catalog files. Reconnect the drive or refresh the catalog.'),404
    return jsonify(error='Different reference files share this name. Choose the source fingerprint.',candidates=[{k:v for k,v in x.items() if k!='text'} for x in matches.values()]),409
