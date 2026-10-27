import { mountOverview, selectFeature, getWindow, windowLabel, rangeLabel, featureTitle, updateLineColors, setTimeSeriesHandlers, setFocusLayout } from './src/lineplot.js'
import { mountGraph, updateData, drawRegions, setRegionsVisible, setThresholdHandler } from './src/scatterplot.js';
import { mountFuncs, updateFuncs, sortFuncs, renderStrips } from './src/functions.js';
import { labelOutliers, idsInCategory } from './src/outliers.js';
import { highlight, restoreSelection, setSelection } from './src/selection.js';
import { outlierGradient } from './src/colors.js';
import { syncSvgFontSize } from './src/fontsize.js';
import { initSetup, openSetup } from './src/setup.js';
import * as d3 from 'd3';
import './styles/main.css'

const API = 'http://127.0.0.1:5001';
const DEFAULT_K = 1.5;
const DEFAULT_QUANTILE = 0.5;
// windows the whole series is split into for the functions' heatmap strips
const STRIP_WINDOWS = 40;

// The loaded multivariate file, the selected feature, and the depths shown (with
// labels from the threshold inputs) along with the feature and window they were
// computed for, which can lag the selection until the user recomputes.
let datasetFile;
// rows of the file that are loaded (chosen in setup); views index from dataRows[0]
let dataRows = [0, 0];
let feature;
let currentData;
let computedFor;
let computing = false;
// window depths per feature for the loaded dataset; computed once each, since they
// cover the whole series and don't depend on the brushed range
let stripDepths = {};
// lets a slow depth request be ignored once a newer one has started
let requestId = 0;

function readParam(id, fallback, min, max) {
  const value = parseFloat(document.getElementById(id).value);
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
}

function thresholdParams() {
  return {
    amp: { k: readParam('amp-k', DEFAULT_K, 0, Infinity), quantile: readParam('amp-q', DEFAULT_QUANTILE, 0, 1) },
    phs: { k: readParam('phs-k', DEFAULT_K, 0, Infinity), quantile: readParam('phs-q', DEFAULT_QUANTILE, 0, 1) }
  };
}

// Labels outliers in data from the threshold inputs and returns the stats behind the cutoffs.
function applyThresholds(data) {
  const { labels, stats } = labelOutliers(data.depths, thresholdParams());
  data.labels = labels;
  return stats;
}

// First depths for a dataset: builds the depth space and functions list.
function mountDepthViews(data) {
  currentData = data;
  const stats = applyThresholds(data);
  mountGraph(data, stats);
  drawRegions(stats);
  mountFuncs(data.depths, data.labels);
  showStrips();
  updateLineColors(data.labels);
  setSelection([]);
  syncSvgFontSize();
}

// New depths (another window or feature) or new thresholds for the same nodes.
function refreshOutliers(data) {
  currentData = data;
  const stats = applyThresholds(data);
  updateLineColors(data.labels);
  updateFuncs(data.depths, data.labels);
  showStrips();
  updateData(data, stats);
  drawRegions(stats);
  restoreSelection();
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || 'Error getting data.');
    }
    clearError();
    return body;
  } catch (error) {
    displayError(`${error.message}. Please check that the server is running.`);
  }
}

// loads the features and rows chosen in setup
async function loadDataset(file, { features, start, end, totalFeatures }) {
  const params = new URLSearchParams({ start, end });
  features.forEach(f => params.append('feature', f));
  const dataset = await fetchJson(`${API}/getDataset/${file}?${params}`);
  if (!dataset) return;
  datasetFile = file;
  dataRows = [start, end];
  feature = dataset.features[0];
  currentData = null;
  computedFor = null;
  stripDepths = {};
  // the previous dataset's nodes would be misleading while the new depths compute
  d3.select('#graph-svg').selectAll('*').remove();
  document.getElementById('fs-list').innerHTML = '';
  const n = dataset.data[feature].length;
  // first brushed window: 10% of the rows from 30% in, at least 5 rows and at most
  // 600 (depth cost grows with the square of the window length)
  const windowStart = Math.round(n * 0.3);
  const windowLength = Math.min(Math.max(Math.round(n * 0.1), 5), 600);
  mountOverview(dataset, feature, [windowStart, Math.min(windowStart + windowLength - 1, n - 1)]);
  document.getElementById('data-summary-name').textContent = file.replace(/\.csv$/, '');
  document.getElementById('data-summary-detail').textContent =
    `${features.length} of ${totalFeatures} variables · ${rangeLabel([0, n - 1])}`;
  syncSvgFontSize();
  computeDepths();
  loadStrips(feature);
}

// Fetches the selected feature's window depths the first time it's selected.
async function loadStrips(f) {
  const file = datasetFile;
  if (stripDepths[f]) {
    showStrips();
    return;
  }
  showStrips();
  const [start, end] = dataRows;
  const res = await fetchJson(`${API}/getWindowDepths/${file}/${encodeURIComponent(f)}/${STRIP_WINDOWS}?start=${start}&end=${end}`);
  if (file != datasetFile || !res) return;
  stripDepths[f] = res;
  if (f == feature) showStrips();
}

// Draws the selected feature's strips (or says they're loading).
function showStrips() {
  const header = document.getElementById('strip-header');
  const windows = stripDepths[feature];
  header.textContent = windows ? featureTitle(feature) : `${featureTitle(feature)} (computing…)`;
  renderStrips(windows || null, thresholdParams(), windowLabel);
}

async function computeDepths() {
  const id = ++requestId;
  const request = { feature, window: [...getWindow()] };
  const [start, end] = request.window;
  computing = true;
  updateDepthStatus();
  // the brush indexes the loaded rows; the server wants the file's
  const res = await fetchJson(`${API}/getDepths/${datasetFile}/${encodeURIComponent(request.feature)}/${start + dataRows[0]}/${end + dataRows[0]}`);
  if (id != requestId) return;
  computing = false;
  if (res) {
    const data = { depths: res.depths };
    computedFor = request;
    if (currentData) {
      refreshOutliers(data);
    } else {
      mountDepthViews(data);
    }
  }
  updateDepthStatus();
}

function depthsStale() {
  const [start, end] = getWindow();
  return !computedFor || computedFor.feature != feature
    || computedFor.window[0] != start || computedFor.window[1] != end;
}

// Says which feature and window the shown depths belong to, and enables
// Recompute once the selection has moved away from them.
function updateDepthStatus() {
  const status = document.getElementById('depth-status');
  const button = document.getElementById('recompute-btn');
  button.disabled = computing || !depthsStale();
  if (computing) {
    status.textContent = `Computing ${feature} depths…`;
  } else if (computedFor) {
    status.textContent = depthsStale()
      ? `Showing depths for ${computedFor.feature}, ${windowLabel(computedFor.window)}`
      : '';
  } else {
    status.textContent = '';
  }
  status.classList.toggle('stale', !computing && depthsStale());
}

document.getElementById('recompute-btn').addEventListener('click', computeDepths);

setTimeSeriesHandlers({
  onWindow: () => {
    restoreSelection();
    updateDepthStatus();
  },
  // a new variable recomputes right away; a new window waits for Recompute
  onFeature: (newFeature) => {
    feature = newFeature;
    selectFeature(feature);
    restoreSelection();
    computeDepths();
    loadStrips(feature);
  }
});

// lists the datasets the server has built, then asks what to load
async function init() {
  const files = await fetchJson(`${API}/getDatasets`);
  if (!files || !files.length) return;
  initSetup(files, file => fetchJson(`${API}/getDatasetInfo/${file}`), loadDataset);
  openSetup(false);
}

document.getElementById('change-data').addEventListener('click', () => openSetup(true));

document.addEventListener('DOMContentLoaded', init);

const thresholdForm = document.getElementById('threshold-config');
thresholdForm.addEventListener('submit', event => event.preventDefault());
// only the threshold inputs relabel outliers; the checkboxes just change what's shown
thresholdForm.querySelectorAll('.num-input').forEach(input => {
  input.addEventListener('input', () => {
    if (currentData) refreshOutliers(currentData);
  });
});

// dragging a k marker in the depth space writes back to its input
setThresholdHandler((dim, k) => {
  document.getElementById(`${dim}-k`).value = k.toFixed(2);
  if (currentData) refreshOutliers(currentData);
});

document.querySelectorAll('#focus-header .toggle-group button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('#focus-header .toggle-group button').forEach(b => {
      b.classList.toggle('active', b == button);
      b.setAttribute('aria-pressed', b == button);
    });
    setFocusLayout(button.dataset.layout);
    restoreSelection();
  });
});

document.getElementById('show-regions').addEventListener('change', event => {
  setRegionsVisible(event.target.checked);
});

document.getElementById('show-labels').addEventListener('change', event => {
  d3.select('#graph-svg').classed('hide-labels', !event.target.checked);
});

document.getElementById('fs-sort-select').addEventListener('change', event => sortFuncs(event.target.value));

// legend ramps share the outlier colors; hovering a category highlights its nodes
document.querySelector('#ds-legend .ramp').style.background = outlierGradient();
document.querySelectorAll('#ds-legend .legend-item').forEach(item => {
  item.addEventListener('mouseover', () => {
    if (currentData) highlight(idsInCategory(currentData.labels, item.dataset.category));
  });
  item.addEventListener('mouseout', restoreSelection);
});

// clicking elsewhere clears the selection; brushing time and the depth space don't
document.addEventListener('click', event => {
  const keep = ['fs-list', 'ds_view', 'ts_view'].some(id => document.getElementById(id).contains(event.target));
  if (!keep) {
    setSelection([]);
  }
});

function clearError() {
  const errorElement = document.getElementById('error-message');
  if (errorElement) {
    errorElement.textContent = '';
  }
}

function displayError(message) {
  const errorElement = document.getElementById('error-message');
  if (!errorElement) {
    const newErrorElement = document.createElement('p');
    newErrorElement.id = 'error-message';
    newErrorElement.textContent = message;
    document.body.appendChild(newErrorElement);
  } else {
    errorElement.textContent = message;
  }
}
