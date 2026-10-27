import * as d3 from 'd3';
import { outlierStyle } from './colors.js';
import { labelOutliers } from './outliers.js';
import { getSelection, highlight, restoreSelection, toggleSelection } from './selection.js';

// Functions list (left panel): one row per node with its name, colored by its outlier
// label in the depth space, and a heatmap strip of its outlyingness in fixed windows
// across the whole series. The strips are global: they don't follow the brushed range.

let depths;
let labels;
let sortMetric = 'name';

const NORMAL_TILE = '#eceff3';

export function mountFuncs(newDepths, newLabels) {
    depths = newDepths;
    labels = newLabels;
    const fsList = document.getElementById('fs-list');
    fsList.innerHTML = '';

    Object.keys(depths.measurement).forEach((key, i) => {
        const node = depths.measurement[key];
        const row = document.createElement('div');
        row.classList.add('fs_row');
        row.dataset.index = i;
        row.dataset.node = node;

        const fn = document.createElement('div');
        fn.classList.add('fs_option');
        fn.textContent = node;
        const strip = document.createElement('div');
        strip.classList.add('strip');
        row.append(fn, strip);

        // hovering previews a node alongside the current selection; clicking toggles it
        row.addEventListener('mouseover', () => highlight([...getSelection(), node]));
        row.addEventListener('mouseout', restoreSelection);
        row.addEventListener('click', () => toggleSelection(node));

        fsList.appendChild(row);
    });
    styleFuncs();
}

export function updateFuncs(newDepths, newLabels) {
    depths = newDepths;
    labels = newLabels;
    styleFuncs();
}

// Colors each function by its outlier label and refreshes its depths for sorting.
function styleFuncs() {
    document.querySelectorAll('.fs_row').forEach(row => {
        const i = row.dataset.index;
        const fn = row.querySelector('.fs_option');
        const style = outlierStyle(labels, i);
        fn.style.background = style.outlier ? style.fill : '';
        fn.style.borderColor = style.outlier ? style.stroke : '';
        fn.style.color = style.outlier ? style.text : '';
        fn.title = `amplitude depth ${d3.format('.4g')(depths.amplitude[i])}\nphase depth ${d3.format('.4g')(depths.phase[i])}`;
    });
    sortFuncs(sortMetric);
}

// Orders the functions list by 'name', or by 'amplitude' / 'phase' depth with the
// most outlying (lowest depth) first.
export function sortFuncs(metric) {
    sortMetric = metric;
    const fsList = document.getElementById('fs-list');
    const rows = Array.from(fsList.children);
    if (metric == 'name') {
        rows.sort((a, b) => a.dataset.node.localeCompare(b.dataset.node, undefined, { numeric: true }));
    } else {
        const values = depths[metric];
        rows.sort((a, b) => d3.ascending(values[a.dataset.index], values[b.dataset.index]));
    }
    rows.forEach(row => fsList.appendChild(row));
}

// Colors each function's strip from window depths ({ nodes, windows: [{ start, end,
// amplitude, phase }] }), labeling each window with the current thresholds. Tiles are
// reused when the window count matches, so switching features only recolors them.
// null keeps the current tiles, faded, while new window depths load. formatRange
// turns a window's [start, end] rows into text.
export function renderStrips(windowDepths, thresholdParams, formatRange) {
    const rows = document.querySelectorAll('.fs_row');
    document.getElementById('fs-list').classList.toggle('strips-loading', !windowDepths);
    if (!windowDepths) return;

    const nodeIndex = new Map(windowDepths.nodes.map((node, i) => [node, i]));
    const measurement = { ...windowDepths.nodes };
    const windowLabels = windowDepths.windows.map(w => labelOutliers(
        { amplitude: { ...w.amplitude }, phase: { ...w.phase }, measurement },
        thresholdParams
    ).labels);

    rows.forEach(row => {
        const strip = row.querySelector('.strip');
        const i = nodeIndex.get(row.dataset.node);
        if (i === undefined) {
            strip.innerHTML = '';
            return;
        }
        while (strip.children.length < windowDepths.windows.length) {
            const tile = document.createElement('div');
            tile.classList.add('tile');
            strip.appendChild(tile);
        }
        while (strip.children.length > windowDepths.windows.length) {
            strip.lastChild.remove();
        }
        windowDepths.windows.forEach((w, wi) => {
            const l = windowLabels[wi];
            const style = outlierStyle(l, i);
            const kind = l.amp[i] && l.phs[i] ? 'amplitude and phase outlier'
                : l.amp[i] ? 'amplitude outlier' : l.phs[i] ? 'phase outlier' : 'normal';
            const tile = strip.children[wi];
            // sized by the rows it covers, so the strip's x axis is time like the plots'
            tile.style.flexGrow = w.end - w.start + 1;
            tile.style.background = style.outlier ? style.fill : NORMAL_TILE;
            tile.title = `${formatRange([w.start, w.end])}: ${kind}`;
        });
    });
}
