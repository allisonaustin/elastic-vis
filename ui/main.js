import { mountChart, focusView, changeView, updateLabels, sortFuncs, setBrushHandler, brushStart, brushEnd } from './src/lineplot.js'
import { mountGraph, updateData, drawRegions, setRegionsVisible, setThresholdHandler } from './src/scatterplot.js';
import { labelOutliers, idsInCategory } from './src/outliers.js';
import { highlight, restoreSelection, setSelection } from './src/selection.js';
import { outlierGradient } from './src/colors.js';
import { syncSvgFontSize } from './src/fontsize.js';
import * as d3 from 'd3';
import './styles/main.css'

// The server still takes these, but outlier labels are recomputed client-side
// from the threshold inputs so they can change without a round trip.
const DEFAULT_K = 1.5;
const DEFAULT_QUANTILE = 0.5;

let previousStart;
let previousEnd;
let errorStatus;
let currentData;

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

// Relabels outliers in data from the threshold inputs and returns the stats behind the cutoffs.
function applyThresholds(data) {
  const { labels, stats } = labelOutliers(data.depths, thresholdParams());
  data.labels = labels;
  return stats;
}

function refreshOutliers(data) {
  currentData = data;
  const stats = applyThresholds(data);
  updateLabels(data);
  updateData(data, stats);
  drawRegions(stats);
  restoreSelection();
}

async function getData(filename, kValue, thresholdValue, start, end) {
  console.log('getting data...')
  const flaskUrl = `http://127.0.0.1:5001/getData/${filename}/${kValue}/${thresholdValue}/${start}/${end}`;
  try {
    const res = await fetch(flaskUrl);
    if (!res.ok) {
      throw new Error('Error getting data.');
    }
    const data = await res.json();
    if (data) {
      clearError()
      errorStatus = false;
      return data
    }
  } catch (error) {
    errorStatus = error.message;
    displayError(error.message + ". Please check that the server is running.");
  }
}

async function computeOutliers(k, threshold, start, end) {
  const flaskUrl = `http://127.0.0.1:5001/getOutliers/${k}/${threshold}/${start}/${end}`;
  try {
    const res = await fetch(flaskUrl);
    if (!res.ok) {
      throw new Error('Error getting data.');
    }
    const data = await res.json();
    if (data) {
      errorStatus = false;
      clearError()
      return data;
    }
  } catch (error) {
    errorStatus = error.message;
    displayError(error.message + ". Please check that the server is running.");
    console.error('Error:', error);
  }
}

// getData always computes depths over the server's default window (30%-40% of the
// series), so record it to avoid recomputing when the brush lands on the same window.
function mountViews(timeSeriesData, viewType) {
  previousStart = Math.round(timeSeriesData.data.length * 0.3);
  previousEnd = Math.round(timeSeriesData.data.length * 0.4);
  currentData = timeSeriesData;
  const stats = applyThresholds(timeSeriesData);
  mountChart(timeSeriesData, viewType, previousStart, previousEnd)
  mountGraph(timeSeriesData, stats)
  drawRegions(stats)
  setSelection([])
  syncSvgFontSize()
}

async function mount(file, viewType) {
  const timeSeriesData = await getData(file, DEFAULT_K, DEFAULT_QUANTILE);
  if (!errorStatus) {
    mountViews(timeSeriesData, viewType)
  }
}

// new chart with file change
async function reloadChart(file) {
  const timeSeriesData = await getData(file, DEFAULT_K, DEFAULT_QUANTILE);
  // let viewType = document.querySelector('.active').value;
  let viewType = 1;
  if (!errorStatus) {
    mountViews(timeSeriesData, viewType)
  }
}

function getDatasetFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('domain');
}

function updateFileOptions(domain) {
  let selectElement = document.getElementById('data_selection');
  selectElement.innerHTML = ''; 

  let options = [];

  if (domain == 0) {
    options = [
      { value: 'hpc_oda_col_idle.csv', text: 'col_idle' },
      { value: 'hpc_oda_col_system.csv', text: 'col_system' },
      { value: 'hpc_oda_cpu_cycles.csv', text: 'cpu_cycles' },
      { value: 'hpc_oda_cache_misses.csv', text: 'cache_misses' }
    ];
  } else if (domain == 1) {
    options = [
      { value: 'accel_phone_A_x.csv', text: 'Accel Phone Walking' },
      { value: 'gyro_phone_A_x.csv', text: 'Gyro Phone Walking' },
      { value: 'gyro_phone_B_x.csv', text: 'Gyro Phone Jogging' }
    ];
  }

  options.forEach(option => {
    let optElement = document.createElement('option');
    optElement.value = option.value;
    optElement.text = option.text;
    selectElement.appendChild(optElement);
  });
}

function updateViewType(viewType) {
  changeView(viewType);
}

function init() {
  let filename = document.getElementById('data_selection').value;
  // let filename = "";
  // let dataset = getDatasetFromUrl();
  // if (dataset == 0) {
  //   filename = 'hpc_oda_col_idle.csv';
  // } else if (dataset == 1) {
  //   filename = 'gyro_phone_A_x.csv';
  // }
  // document.getElementById('data_selection').value = filename;
  // updateFileOptions(dataset);
  // let viewType = document.querySelector('.active').value;
  let viewType = 1;
  mount(filename, viewType);
}

function toggleButton(button) {
  document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  updateViewType(button.value);
}

// document.getElementById('btn1').addEventListener('click', function() {
//   toggleButton(this);
// });

// document.getElementById('btn2').addEventListener('click', function() {
//   toggleButton(this);
// });

window.update = () => {
  let filename = document.getElementById('data_selection').value;
  reloadChart(filename);
}

document.addEventListener('DOMContentLoaded', function () {
  // document.getElementById("depth-params").addEventListener("submit", submitDepthParams);
  if (!window.hasInitialized) {
    window.hasInitialized = true;
    init();  
  }
})

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

setBrushHandler(submitDepthParams);

// document.getElementsByClassName("num-input").addEventListener("input", function (event) {
//   this.value = this.value.replace(/[^0-9]/g, '');
// });

async function submitDepthParams() {
  // only a new brush window needs new depths; thresholds are applied client-side
  if ((parseFloat(previousStart) != parseFloat(brushStart)) 
        || (parseFloat(previousEnd) != parseFloat(brushEnd))) {
    document.body.classList.add('freeze');
    const timeSeriesData = await computeOutliers(DEFAULT_K, DEFAULT_QUANTILE, brushStart, brushEnd)
    if (timeSeriesData) {
      refreshOutliers(timeSeriesData)
      previousStart = brushStart;
      previousEnd = brushEnd;
    }
    document.body.classList.remove('freeze');
  }
}

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