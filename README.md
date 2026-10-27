# ElasticVis

## About

Tool for visualizing/exploring anomalies in multivariate time series (MTS) data using elastic depth measures. Elastic depths are introduced in [1].

- Available in ``fdasrsf`` python package (https://fdasrsf-python.readthedocs.io/en/latest/)
- The source code can be found at [github.com/jdtuck/fdasrsf_python](https://github.com/jdtuck/fdasrsf_python).

Tested on macOS Sonoma, macOS Tahoe.

## Requirements

Install these first; `start.sh` installs everything else.

- Python 3.8–3.11 (if `python3` is a different version, run `PYTHON=python3.11 ./start.sh`)
- Node.js (with npm)
- git
- An internet connection on the first run, to install the Python and npm packages

## Datasets

1. [WISDM Smartphone and Smartwatch Activity and Biometrics Dataset](https://archive.ics.uci.edu/ml/machine-learning-databases/00507/WISDM-dataset-description.pdf)
2. [HPC-ODA Dataset Collection](https://data.niaid.nih.gov/resources?id=zenodo_3701439)

## Quick start

1. Add MTS data (.csv) to `server/data/`, in the format below
2. From the repository root, run: ``./start.sh``
3. Open http://127.0.0.1:3001

The first run creates a Python virtual environment in `server/.venv` and installs the UI's npm packages, which takes a few minutes.

## Data format

Each dataset is one CSV file in `server/data/`. Its rows stack the variables: all of the first variable's time points, then all of the second's, and so on.

| Column | Contents |
|---|---|
| `feature` (must be the first column) | The variable the row belongs to |
| `timestamp` or `index` | The time point: `YYYY-MM-DD HH:MM:SS` for `timestamp`, a number for `index` |
| One column per function | That function's value (e.g. a node or a person), numeric with no missing values |

Every variable must have the same time points, in the same order. For example:

```csv
feature,timestamp,node0,node1,node2
cpu-cycles,2019-11-30 00:39:00,1.2e9,1.1e9,1.3e9
cpu-cycles,2019-11-30 00:40:00,1.4e9,1.2e9,1.3e9
col-idle,2019-11-30 00:39:00,7994,8072,7810
col-idle,2019-11-30 00:40:00,6120,6305,6011
```

CSV files whose first column isn't `feature` are ignored.

Optionally, a `<name>.labels.json` file in `server/data/` gives variables display names (e.g. `A - Walking`) for the datasets it lists:

```json
{
  "datasets": ["accel_phone_x.csv", "gyro_phone_x.csv"],
  "labels": { "A": "Walking", "B": "Jogging" }
}
```

## References

[1] Elastic Depths for Detecting Shape Anomalies in Functional Data Trevor Harris, J. Derek Tucker, Bo Li, & Lyndsay Shand. Technometrics, 63(4), 466–476. https://doi.org/10.1080/00401706.2020.1811156
