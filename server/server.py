import os
import pandas as pd
import numpy as np
import json
from flask import Flask, jsonify, Response, request
from flask_cors import CORS
from streaming_elastic import StreamingDepth

app = Flask(__name__)
cors = CORS(app)

df = pd.DataFrame()
depths = StreamingDepth()
fname = ''

# Multivariate files (see combine_data.py): a `feature` column naming the variable,
# a time column (`timestamp` or `index`), then one column per function (node).
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
_datasets = {}


def list_datasets():
    """CSV files in data/ in the multivariate format, recognized by their first column."""
    available = []
    for filename in sorted(os.listdir(DATA_DIR)):
        if filename.endswith('.csv'):
            with open(os.path.join(DATA_DIR, filename)) as f:
                if f.readline().startswith('feature,'):
                    available.append(filename)
    return available


def labels_files():
    return sorted(f for f in os.listdir(DATA_DIR) if f.endswith('.labels.json'))


def feature_labels(filename):
    """Optional display names for a dataset's features, e.g. activity names for activity
    codes. A <name>.labels.json file in data/ holds {"datasets": [filenames], "labels":
    {feature: name}} and applies to each dataset it lists."""
    for labels_file in labels_files():
        with open(os.path.join(DATA_DIR, labels_file)) as f:
            spec = json.load(f)
        if filename in spec.get('datasets', []):
            return spec.get('labels', {})
    return {}


def load_dataset(filename):
    if filename not in list_datasets():
        raise FileNotFoundError(filename)
    csv_path = os.path.join(DATA_DIR, filename)
    # reload when the data or any labels file changes, e.g. after re-running combine_data.py
    version = (os.path.getmtime(csv_path),) + tuple(
        (f, os.path.getmtime(os.path.join(DATA_DIR, f))) for f in labels_files())
    cached = _datasets.get(filename)
    if cached is None or cached['version'] != version:
        combined = pd.read_csv(csv_path)
        time_col = 'timestamp' if 'timestamp' in combined.columns else 'index'
        features = list(dict.fromkeys(combined['feature']))
        blocks = {f: combined[combined['feature'] == f].drop(columns='feature').reset_index(drop=True)
                  for f in features}
        nodes = [c for c in combined.columns if c not in ('feature', time_col)]
        labels = feature_labels(filename)
        _datasets[filename] = {'time_col': time_col, 'features': features, 'nodes': nodes,
                               'blocks': blocks, 'labels': labels, 'version': version}
    return _datasets[filename]


@app.route("/getDatasets")
def get_datasets():
    return Response(json.dumps(list_datasets()), mimetype='application/json')


def error(message, status):
    return Response(json.dumps({'error': message}), status=status, mimetype='application/json')


def requested_rows(ds):
    """The `start` and `end` query parameters (inclusive row indices), defaulting to every row."""
    n = len(next(iter(ds['blocks'].values())))
    start = request.args.get('start', default=0, type=int)
    end = request.args.get('end', default=n - 1, type=int)
    if not (0 <= start < end < n):
        raise ValueError(f'rows {start}-{end} outside 0-{n - 1}')
    return start, end


@app.route("/getDatasetInfo/<filename>")
def get_dataset_info(filename):
    """What a dataset holds, without its values, for choosing features and a time range."""
    try:
        ds = load_dataset(filename)
    except FileNotFoundError:
        return error(f'unknown dataset {filename}', 404)
    times = next(iter(ds['blocks'].values()))[ds['time_col']].tolist()
    response = {
        'timeColumn': ds['time_col'],
        'features': ds['features'],
        'nodes': ds['nodes'],
        'labels': ds['labels'],
        'times': times,
    }
    return Response(json.dumps(response), mimetype='application/json')


@app.route("/getDataset/<filename>")
def get_dataset(filename):
    """The chosen features (repeated `feature` parameters, default all) over rows
    `start`..`end`, renumbered from 0; `start` in the response maps them back."""
    try:
        ds = load_dataset(filename)
        start, end = requested_rows(ds)
    except FileNotFoundError:
        return error(f'unknown dataset {filename}', 404)
    except ValueError as e:
        return error(str(e), 400)
    features = request.args.getlist('feature') or ds['features']
    unknown = [f for f in features if f not in ds['blocks']]
    if unknown:
        return error(f'unknown features {unknown}', 404)
    response = {
        'timeColumn': ds['time_col'],
        'features': features,
        'nodes': ds['nodes'],
        'labels': ds['labels'],
        'start': start,
        'data': {f: ds['blocks'][f].loc[start:end].to_dict(orient='records') for f in features},
    }
    return Response(json.dumps(response), mimetype='application/json')


@app.route("/getDepths/<filename>/<feature>/<int:start>/<int:end>")
def get_depths(filename, feature, start, end):
    """Elastic depths of every node's series for one feature over rows start..end (inclusive)."""
    try:
        ds = load_dataset(filename)
    except FileNotFoundError:
        return Response(json.dumps({'error': f'unknown dataset {filename}'}), status=404, mimetype='application/json')
    if feature not in ds['blocks']:
        return Response(json.dumps({'error': f'unknown feature {feature}'}), status=404, mimetype='application/json')
    block = ds['blocks'][feature]
    if not (0 <= start < end < len(block)):
        return Response(json.dumps({'error': f'window {start}-{end} outside 0-{len(block) - 1}'}), status=400, mimetype='application/json')

    F = block.loc[start:end, ds['nodes']].apply(pd.to_numeric, errors='coerce').to_numpy()
    elastic_out = StreamingDepth(F).elastic_outliers()
    print('depths for', filename, feature, 'rows', start, '-', end)

    depths_df = pd.DataFrame(elastic_out.depths)
    depths_df['measurement'] = ds['nodes']
    return Response(json.dumps({'depths': depths_df.to_dict()}), mimetype='application/json')


# depths need a few points per series
MIN_WINDOW = 5
_window_depths = {}


@app.route("/getWindowDepths/<filename>/<feature>/<int:count>")
def get_window_depths(filename, feature, count):
    """Elastic depths for one feature over `count` equal, consecutive windows covering the
    loaded rows `start`..`end` (any leftover rows join the last window). Window rows are
    relative to `start`. Independent of the brushed range, so each (dataset, feature,
    rows) is computed once and cached."""
    try:
        ds = load_dataset(filename)
        first, last = requested_rows(ds)
    except FileNotFoundError:
        return error(f'unknown dataset {filename}', 404)
    except ValueError as e:
        return error(str(e), 400)
    if feature not in ds['blocks']:
        return error(f'unknown feature {feature}', 404)
    block = ds['blocks'][feature].loc[first:last].reset_index(drop=True)
    count = max(1, min(count, len(block) // MIN_WINDOW))
    size = len(block) // count

    key = (filename, feature, count, first, last, ds['version'])
    if key not in _window_depths:
        values = block[ds['nodes']].apply(pd.to_numeric, errors='coerce').to_numpy()
        windows = []
        for i in range(count):
            start = i * size
            end = len(block) - 1 if i == count - 1 else start + size - 1
            amp, phase = StreamingDepth(values[start:end + 1]).elastic_depth()
            windows.append({'start': start, 'end': end, 'amplitude': amp.tolist(), 'phase': phase.tolist()})
        print('window depths for', filename, feature, f'rows {first}-{last}:', count, 'windows of', size)
        _window_depths[key] = windows
    return Response(json.dumps({'nodes': ds['nodes'], 'windows': _window_depths[key]}), mimetype='application/json')


@app.route("/getData/<filename>/<k>/<threshold>/<start>/<end>")
def get_data(filename, k, threshold, start=None, end=None):
    global fname 
    global df 

    fname = filename
    df = pd.read_csv('./data/'+filename)
    df = df.replace({np.nan: None})

    start = None 
    end = None

    return get_outliers(k, threshold, start, end)


@app.route("/getOutliers/<k>/<threshold>/<start>/<end>")
def get_outliers(k=1.5, threshold=0.5, start=None, end=None):
    global df 
    global depths

    if (start == 'undefined' or start == None):
        startIdx = round(len(df) * 0.3)
    else:
        startIdx = int(start)
    if (end == 'undefined' or end == None):
        endIdx = round(len(df) * 0.4)
    else:
        endIdx = int(end)

    if startIdx < 0 or startIdx >= len(df):
        raise ValueError(f"Start index {start} is out of range. It must be between 0 and {len(df) - 1}.")
    
    if endIdx < 0 or endIdx >= len(df):
        raise ValueError(f"End index {end} is out of range. It must be between 0 and {len(df) - 1}.")
    
    if startIdx > endIdx:
        raise ValueError(f"Start index {start} cannot be greater than end index {end}.")

    if ('timestamp' in df.columns):
        values_df = df.drop('timestamp', axis=1) \
            .apply(pd.to_numeric, errors='coerce')
        F = values_df.loc[startIdx:endIdx].to_numpy()
    elif ('index' in df.columns):
        values_df = df.drop('index', axis=1) \
            .apply(pd.to_numeric, errors='coerce')
        F = values_df.loc[startIdx:endIdx].to_numpy()
    else:
        values_df = df.apply(pd.to_numeric, errors='coerce')
        df['index'] = range(len(df))
        F = values_df.loc[startIdx:endIdx].to_numpy()
     
    depths = StreamingDepth(F)
    depths.k = float(k)
    depths.threshold = float(threshold)
    elastic_out = depths.elastic_outliers()

    print('getting amp and phase outliers...k:',k, 'threshold:',threshold, 'start:', startIdx, 'end:', endIdx)

    depths_df = pd.DataFrame(elastic_out.depths)
    labels_df = pd.DataFrame(elastic_out.labels)
    depths_df['measurement'] = values_df.columns.tolist()
    labels_df['measurement'] = values_df.columns.tolist()

    response = {
        'data': df.to_dict(orient='records'),
        'depths': depths_df.to_dict(),
        'labels': labels_df.to_dict()   
    }
    return Response(json.dumps(response), mimetype='application/json')

if __name__ == '__main__':
    app.run(debug=True, port=5001)