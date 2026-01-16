import { mountChart, focusView, changeView, updateLabels, brushStart, brushEnd } from './src/lineplot.js'
import { mountGraph, updateData, drawBox } from './src/scatterplot.js';
import './styles/main.css'

let previousStart;
let previousEnd;
let errorStatus;

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

async function mount(file, viewType) {
  const kValue = document.getElementById('k-input').value;
  const thresholdValue = document.getElementById('threshold-input').value;
  const timeSeriesData = await getData(file, kValue, thresholdValue);
  if (!errorStatus) {
    previousStart = Math.floor(timeSeriesData.data.length * 0.3);
    previousEnd = Math.floor(timeSeriesData.data.length * 0.4);
    mountChart(timeSeriesData, viewType, previousStart, previousEnd)
    mountGraph(timeSeriesData)
    drawBox(kValue, thresholdValue)
  }
}

// new chart with file change
async function reloadChart(file) {
  const kValue = document.getElementById('k-input').value;
  const thresholdValue = document.getElementById('threshold-input').value;
  const timeSeriesData = await getData(file, kValue, thresholdValue, brushStart, brushEnd);
  // let viewType = document.querySelector('.active').value;
  let viewType = 1;
  if (!errorStatus) {
    mountChart(timeSeriesData, viewType, brushStart, brushEnd)
    mountGraph(timeSeriesData)
    drawBox(kValue, thresholdValue)
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
  // let filename = document.getElementById('data_selection').value;
  let filename = "";
  let dataset = getDatasetFromUrl();
  if (dataset == 0) {
    filename = 'hpc_oda_col_idle.csv';
  } else if (dataset == 1) {
    filename = 'gyro_phone_A_x.csv';
  }
  document.getElementById('data_selection').value = filename;
  updateFileOptions(dataset);
  // let viewType = document.querySelector('.active').value;
  let viewType = 1;
  
  if (viewType == 0) {
    document.getElementById('depth-config').style.display = 'none';
  } else if (viewType == 1) {
    document.getElementById('depth-config').style.display = 'block';
  }
  mount(filename, viewType);
}

function toggleButton(button) {
  document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  updateViewType(button.value);

  if (button.value == 0) {
    document.getElementById('depth-config').style.display = 'none';
  } else if (button.value == 1) {
    document.getElementById('depth-config').style.display = 'block';
  }
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

// document.getElementsByClassName("num-input").addEventListener("input", function (event) {
//   this.value = this.value.replace(/[^0-9]/g, '');
// });

export async function submitDepthParams(event) {
  event.preventDefault();

  const kValue = document.getElementById('k-input').value;
  const thresholdValue = document.getElementById('threshold-input').value;

  // change in defaults
  if ((parseFloat(kValue) != 1.5) || (parseFloat(thresholdValue) != 0.5) 
        || (parseFloat(previousStart) != parseFloat(brushStart)) 
          || (parseFloat(previousEnd) != parseFloat(brushEnd))) {
    document.body.classList.add('freeze');
    const timeSeriesData = await computeOutliers(kValue, thresholdValue, brushStart, brushEnd)
    updateLabels(timeSeriesData)
    updateData(timeSeriesData)
    previousStart = brushStart;
    previousEnd = brushEnd;
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