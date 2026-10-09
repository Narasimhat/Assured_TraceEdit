"""Read-only access to AB1 files explicitly listed in the generated local catalog."""
import json,re,zipfile,io
from pathlib import Path, PureWindowsPath
from flask import Blueprint, jsonify, send_file
catalog_api=Blueprint('catalog_api',__name__)
HERE=Path(__file__).resolve().parent
@catalog_api.get('/api/catalog/<project_id>/<file_id>')
def catalog_read(project_id,file_id):
    if not re.fullmatch(r'[0-9a-f]{16}',project_id) or not re.fullmatch(r'[0-9a-f]{24}',file_id):
        return jsonify(error='Invalid catalog ID'),400
    try:
        root=json.loads((HERE/'public/catalog/summary.json').read_text(encoding='utf-8'))['source_root']
        group=json.loads((HERE/'public/catalog'/f'{project_id}.json').read_text(encoding='utf-8'))
        entry=next((x for x in group['files'] if x['id']==file_id),None)
        if not entry or Path(entry['name']).suffix.lower() not in ('.ab1','.abi'):
            return jsonify(error='Select an AB1 catalog entry'),404
        relative=entry.get('archive_path',entry['path'])
        if PureWindowsPath(relative).is_absolute() or '..' in PureWindowsPath(relative).parts:
            return jsonify(error='Invalid source path'),400
        source=Path('\\\\?\\'+str(Path(root)/relative))
        if entry['source']=='zip member':
            with zipfile.ZipFile(source) as z:
                with z.open(entry['member']) as f: raw=f.read(2_000_001)
        else:
            with source.open('rb') as f:raw=f.read(2_000_001)
        if len(raw)>2_000_000 or not raw.startswith(b'ABIF'):
            return jsonify(error='Not a supported AB1 file under 2 MB'),400
        return send_file(io.BytesIO(raw),mimetype='application/octet-stream',download_name=entry['name'],as_attachment=True)
    except (OSError,ValueError,KeyError,zipfile.BadZipFile,RuntimeError) as e:
        return jsonify(error='Source unavailable. Reconnect the project drive or refresh the catalog.'),404
