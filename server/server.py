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