"""One local batch worker; reviewed manifests only; caches survive app restarts."""
import threading
from pathlib import Path
from flask import Blueprint,request,jsonify
from batch import BatchRunner,validate_jobs
batch_api=Blueprint('batch_api',__name__)
lock=threading.Lock();stop=threading.Event()
state={'status':'idle','completed':0,'total':0}

@batch_api.before_request
def local_mutation():
    if request.method=='POST':
        if request.headers.get('Sec-Fetch-Site')=='cross-site' or (request.headers.get('Origin') and request.headers['Origin']!=request.host_url.rstrip('/')):
            return jsonify(error='Use the local app to start a batch'),403
        if not request.is_json:return jsonify(error='JSON required'),415

@batch_api.get('/api/batch')
def batch_status():
    with lock:return jsonify(dict(state))

@batch_api.post('/api/batch/cancel')
def cancel_batch():
    stop.set();return jsonify(status='stop_requested_after_current_sample')

@batch_api.post('/api/batch')
def start_batch():
    data=request.get_json();jobs=data.get('jobs') if isinstance(data,dict) else None
    try:
        runner=BatchRunner(Path(__file__).resolve().parent);validate_jobs(jobs,runner.reads)
    except (ValueError,OSError,KeyError) as e:return jsonify(error=str(e)),400
    with lock:
        if state['status']=='running':return jsonify(error='A batch is already running'),409
        state.clear();state.update(status='running',completed=0,total=len(jobs),errors=0);stop.clear()
    def progress(n,total,row):
        with lock:state.update(completed=n,current=row['id'],errors=state['errors']+(row['status']=='error'))
    def work():
        try:
            report=runner.run(jobs,progress,stop)
            with lock:state.update(status='cancelled' if report['cancelled'] else 'complete',report='/corpus/latest-batch.json')
        except Exception as e:
            with lock:state.update(status='error',error=str(e))
    threading.Thread(target=work,daemon=True).start()
    return jsonify(status='running',total=len(jobs)),202
