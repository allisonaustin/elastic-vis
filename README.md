# ElasticVis

## About

Visualizing elastic depths introduced in:

- **Elastic Depths for Detecting Shape Anomalies in Functional Data** Trevor Harris, J. Derek Tucker, Bo Li, & Lyndsay Shand. Technometrics, 63(4), 466–476. https://doi.org/10.1080/00401706.2020.1811156
- Available in fdasrsf python package (https://fdasrsf-python.readthedocs.io/en/latest/)
- The source code can be found here: https://github.com/jdtuck/fdasrsf_python.

Note: Tested on macOS Sonoma, macOS Tahoe.

## Requirements

- Python 3.8–3.11
- Node.js (with npm)

## Quick start

From the repository root, run:

``./start.sh``

## Manual setup

### UI

Open a terminal and run:
``cd ui``

``npm install``

``npm run dev``

### Server

Open another terminal and run:

``cd server``

``pip install -r requirements.txt``

``python server.py``
