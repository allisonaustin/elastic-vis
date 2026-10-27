# ElasticVis

## About

Tool for visualizing/exploring anomalies in multivariate time series (MTS) data using elastic depth measures. Elastic depths are introduced in [1].

- Available in ``fdasrsf`` python package (https://fdasrsf-python.readthedocs.io/en/latest/)
- The source code can be found at [github.com/jdtuck/fdasrsf_python](https://github.com/jdtuck/fdasrsf_python).

Tested on macOS Sonoma, macOS Tahoe.

## Requirements

- Python 3.8–3.11
- Node.js (with npm)

## Datasets

1. [WISDM Smartphone and Smartwatch Activity and Biometrics Dataset](https://archive.ics.uci.edu/ml/machine-learning-databases/00507/WISDM-dataset-description.pdf)
2. [HPC-ODA Dataset Collection](https://data.niaid.nih.gov/resources?id=zenodo_3701439)

## Quick start

1. Add MTS data (.csv) to `server/data/`
2. From the repository root, run: ``./start.sh``

## References

[1] Elastic Depths for Detecting Shape Anomalies in Functional Data Trevor Harris, J. Derek Tucker, Bo Li, & Lyndsay Shand. Technometrics, 63(4), 466–476. https://doi.org/10.1080/00401706.2020.1811156
