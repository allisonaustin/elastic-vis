// Setup card: choose a dataset, a time range and features before anything loads.
// Only dataset info (features, times) is fetched here; the values load on submit.

// enough rows for a brushed window and a few strip windows
const MIN_POINTS = 10;
// most rows a selection may span: keeps the browser responsive and the heatmap strips
// (40 windows across the selection) to about a minute per feature at 1 s data
const MAX_POINTS = 10000;
// datasets with up to ALL_FEATURES_UP_TO features start with all selected, larger
// ones with the first DEFAULT_FEATURES
const ALL_FEATURES_UP_TO = 12;
const DEFAULT_FEATURES = 8;

let fetchInfo;
let onLoad;
let info;
let infoFile;

const $ = id => document.getElementById(id);

function featureTitle(feature) {
    const label = info.labels && info.labels[feature];
    return label ? `${feature} - ${label}` : feature;
}

// files: dataset filenames; fetchInfo(file) resolves to the server's dataset info;
// onLoad(file, { features, start, end, totalFeatures }) receives the choice.
export function initSetup(files, fetchInfoFn, onLoadFn) {
    fetchInfo = fetchInfoFn;
    onLoad = onLoadFn;
    files.forEach(file => $('setup-dataset').add(new Option(file.replace(/\.csv$/, ''), file)));

    $('setup-dataset').addEventListener('change', () => showDataset($('setup-dataset').value));
    $('setup-start').addEventListener('input', () => updateRange('start'));
    $('setup-end').addEventListener('input', () => updateRange('end'));
    $('setup-all').addEventListener('click', () => setAllFeatures(true));
    $('setup-none').addEventListener('click', () => setAllFeatures(false));
    $('setup-features').addEventListener('change', updateFeatureNote);
    $('setup-cancel').addEventListener('click', closeSetup);
    document.addEventListener('keydown', event => {
        if (event.key == 'Escape' && !$('setup').hidden && !$('setup-cancel').hidden) closeSetup();
    });
    $('setup-form').addEventListener('submit', event => {
        event.preventDefault();
        const features = [...$('setup-features').querySelectorAll('input:checked')].map(box => box.value);
        if (!features.length) return;
        closeSetup();
        onLoad(infoFile, {
            features,
            start: +$('setup-start').value,
            end: +$('setup-end').value,
            totalFeatures: info.features.length,
        });
    });
}

// cancellable: false the first time, when there's nothing loaded to go back to
export async function openSetup(cancellable) {
    $('setup-cancel').hidden = !cancellable;
    $('setup').hidden = false;
    if (!info) await showDataset($('setup-dataset').value);
}

function closeSetup() {
    $('setup').hidden = true;
}

async function showDataset(file) {
    $('setup-load').disabled = true;
    const newInfo = await fetchInfo(file);
    if (!newInfo || file != $('setup-dataset').value) return;
    info = newInfo;
    infoFile = file;

    const last = info.times.length - 1;
    for (const id of ['setup-start', 'setup-end']) $(id).max = last;
    $('setup-extent').textContent = `${info.times[0]} – ${info.times[last]}`;
    // default to the latest data, as much as a selection may hold
    $('setup-start').value = Math.max(last - MAX_POINTS + 1, 0);
    $('setup-end').value = last;
    updateRange();

    const selected = info.features.length <= ALL_FEATURES_UP_TO
        ? info.features : info.features.slice(0, DEFAULT_FEATURES);
    $('setup-features').innerHTML = '';
    info.features.forEach(feature => {
        const label = document.createElement('label');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = feature;
        box.checked = selected.includes(feature);
        label.append(box, ` ${featureTitle(feature)}`);
        $('setup-features').appendChild(label);
    });
    updateFeatureNote();
}

// keeps MIN_POINTS to MAX_POINTS rows between the handles, moving the other one if needed
function updateRange(moved) {
    const last = info.times.length - 1;
    let start = +$('setup-start').value;
    let end = +$('setup-end').value;
    const span = Math.min(Math.max(end - start + 1, MIN_POINTS), MAX_POINTS);
    if (end - start + 1 != span) {
        if (moved == 'start') {
            end = Math.min(start + span - 1, last);
            start = end - span + 1;
        } else {
            start = Math.max(end - span + 1, 0);
            end = start + span - 1;
        }
        $('setup-start').value = start;
        $('setup-end').value = end;
    }
    $('setup-start-label').textContent = info.times[start];
    $('setup-end-label').textContent = info.times[end];
    const percent = i => `${(100 * i / Math.max(last, 1)).toFixed(3)}%`;
    $('setup-range-fill').style.left = percent(start);
    $('setup-range-fill').style.width = `calc(${percent(end)} - ${percent(start)})`;
    $('setup-range-note').textContent =
        `${(end - start + 1).toLocaleString()} / ${info.times.length.toLocaleString()}`;
    $('setup-range-note').title = `time points selected / total (at most ${MAX_POINTS.toLocaleString()} can be selected)`;
}

function setAllFeatures(checked) {
    $('setup-features').querySelectorAll('input').forEach(box => { box.checked = checked; });
    updateFeatureNote();
}

function updateFeatureNote() {
    const count = $('setup-features').querySelectorAll('input:checked').length;
    $('setup-feature-note').textContent = count
        ? `${count} of ${info.features.length} variables selected`
        : 'Select at least one variable';
    $('setup-load').disabled = !count;
}
