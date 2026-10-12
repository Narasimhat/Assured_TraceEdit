"""Malformed client input must produce actionable JSON errors, not server errors."""
import io
import json

import pytest

from app import app, settings
from synthetic import example


def assert_error(response, status=400):
    assert response.status_code == status
    assert isinstance(response.get_json()['error'], str)
    assert response.headers['Cache-Control'] == 'no-store'


@pytest.mark.parametrize('key,values', [
    ('max_deletion', [None, [], {}, True, 1.5, '20', 0, 41]),
    ('max_insertion', [None, [], {}, False, 1.5, '2', -1, 4]),
    ('window', [None, [], {}, True, 120.5, '120', 59, 251]),
])
def test_invalid_model_settings(key, values):
    for value in values:
        response = app.test_client().post('/api/analyze', data={
            'settings': json.dumps({key: value}),
        })
        assert_error(response)
        assert key in response.get_json()['error']


@pytest.mark.parametrize('body', [None, [], {'bundle': None}, {'bundle': []},
    {'bundle': {'results': [{'sample': 'test', 'status': 'fit_pass', 'displays': None}]}},
    {'bundle': {'results': [{'sample': 'test', 'status': 'fit_pass', 'displays': {'1': None}}]}},
    {'bundle': {'results': [{'sample': 'test', 'status': 'fit_pass', 'displays': {'1': {'control': {}}}}]}},
    {'bundle': {'results': [{'sample': 'test', 'status': 'fit_pass', 'source_hashes': []}]}},
])
def test_invalid_export_structure(body):
    assert_error(app.test_client().post('/api/export', data=json.dumps(body), content_type='application/json'))


def test_malformed_json_and_wrong_content_type():
    client = app.test_client()
    assert_error(client.post('/api/export', data='{broken', content_type='application/json'))
    assert_error(client.post('/api/export', data='{}', content_type='text/plain'), 415)


@pytest.mark.parametrize('config', [
    {'max_deletion': 1, 'max_insertion': 0, 'window': 60},
    {'max_deletion': 40, 'max_insertion': 3, 'window': 250},
    {},
])
def test_supported_model_boundaries(config):
    with app.test_request_context(data={'settings': json.dumps(config)}):
        assert settings() == config


@pytest.mark.parametrize('field,value', [('x', {}), ('y', {'bad': 'signal'}),
    ('positions', None), ('calls', []), ('start', None), ('end', '20')])
def test_invalid_export_trace_fields(field, value):
    window = {'x': [1, 2], 'y': [[0, 0, 0, 0], [0, 0, 0, 0]],
              'positions': [1, 2], 'calls': 'AC', 'start': 1, 'end': 2}
    window[field] = value
    result = {'sample': 'test', 'status': 'fit_pass',
              'displays': {'1': {'control': window, 'sample': window}}}
    assert_error(app.test_client().post('/api/export', json={
        'bundle': {'results': [result]}, 'indices': [0], 'centers': [1],
    }))


@pytest.mark.parametrize('result', [None, [], 12, {'source_hashes': None}, {'outcomes': None}, {'outcomes': [None]}])
def test_invalid_knockout_result(result):
    control, _, _ = example()
    response = app.test_client().post('/api/knockout-prediction', data={
        'control': (io.BytesIO(control), 'control.ab1'),
        'result': json.dumps(result),
    })
    assert_error(response)
