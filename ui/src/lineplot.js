import * as d3 from 'd3';
import { pallette, outlierStyle, amplitudeColor, phaseColor } from './colors.js';

// Overview (Time Series View): one row per feature over the full time range; clicking
// anywhere in a row selects that feature. A time bar above the rows holds the brush
// that sets the window depths are computed over, shaded across every row.
// Focus (above the depth space): the selected feature, zoomed to the window, split
// into normal nodes, amplitude outliers and phase outliers (a node outlying in both
// appears in both outlier panels).
// Lines are colored by the selected feature's outlier labels in every row, so a
// node keeps its color across features; their datum is [node, points], which the
// shared selection highlighting relies on.

// rowHeight is recomputed on mount to give each row ROW_HEIGHT_PX of plot on screen
const ROW_HEIGHT_PX = 100;
const overview = { width: 800, margin: { left: 100, right: 20, top: 0, bottom: 8 }, rowHeight: 90, rowGap: 34 };
// shares the overview's width and side margins so its brush lines up with the rows
const timebar = { height: 52, track: [6, 28] };
// panelHeight is refit on every draw so the depth space view fills its panel
const focus = { width: 800, panelHeight: 80, panelGap: 28, margin: { left: 100, right: 36, top: 4, bottom: 30 } };
const MIN_PANEL_PX = 60;
// the combined panel's plot height on screen, rather than filling the view
const COMBINED_PANEL_PX = 180;
// the focus view shows normal nodes and each kind of outlier on separate panels, or
// everything on one panel (outliers drawn over the normal nodes)
const focusLayouts = {
    separate: [
        { key: 'normal', title: 'Normal', color: '#555', test: (amp, phs) => !amp && !phs },
        { key: 'amplitude', title: 'Amplitude outliers', color: amplitudeColor, test: amp => amp },
        { key: 'phase', title: 'Phase outliers', color: phaseColor, test: (amp, phs) => phs }
    ],
    combined: [
        { key: 'all', title: 'Normal and outliers', color: '#555', test: () => true }
    ]
};
let focusPanels = focusLayouts.separate;

export function setFocusLayout(layout) {
    focusPanels = focusLayouts[layout];
    if (dataset) drawFocus();
}
// depths need a few points per series
const MIN_WINDOW = 5;

let dataset;
let times = [];
let series = {};
let selectedFeature;
let timeWindow = [0, 0];
let labels = null;
let x;
let brush;
let brushGroup;

let handlers = { onWindow: () => {}, onFeature: () => {} };
export function setTimeSeriesHandlers(newHandlers) {
    handlers = { ...handlers, ...newHandlers };
}

export function getWindow() {
    return timeWindow;
}

const defaultColor = pallette.lightgray;
function getLineProperties(node) {
    const index = labels ? Object.values(labels.measurement).indexOf(node) : -1;
    if (index !== -1) {
        const style = outlierStyle(labels, index);
        if (style.outlier) {
            return { color: style.line, opacity: 1, width: 1.2 };
        }
    }
    return { color: defaultColor, opacity: 0.5, width: 1 };
}

function styleLines(selection) {
    selection
        .style('stroke', d => getLineProperties(d[0]).color)
        .style('opacity', d => getLineProperties(d[0]).opacity)
        .style('stroke-width', d => getLineProperties(d[0]).width);
}

function formatTick(d) {
    if (Math.abs(d) < 1000) {
        return d3.format(".2f")(d);
    } else {
        return d3.format(".2e")(d).replace(/e\+0$/, '');
    }
}

// a feature with its display name when the dataset provides one, e.g. "A - Walking"
export function featureTitle(feature) {
    const label = dataset.labels && dataset.labels[feature];
    return label ? `${feature} - ${label}` : feature;
}

function timeScale() {
    return dataset.timeColumn == 'timestamp' ? d3.scaleTime() : d3.scaleLinear();
}

// a row range with its date(s) when the data has timestamps, e.g.
// "2019-11-30, 05:39:00 – 15:38:00"; plain indices otherwise
export function rangeLabel([start, end]) {
    if (dataset.timeColumn != 'timestamp') return windowLabel([start, end]);
    const date = d3.timeFormat('%Y-%m-%d');
    const time = d3.timeFormat('%H:%M:%S');
    return date(times[start]) == date(times[end])
        ? `${date(times[start])}, ${time(times[start])} – ${time(times[end])}`
        : `${date(times[start])} ${time(times[start])} – ${date(times[end])} ${time(times[end])}`;
}

export function windowLabel([start, end]) {
    if (dataset.timeColumn == 'timestamp') {
        const fmt = d3.timeFormat('%H:%M:%S');
        return `${fmt(times[start])} – ${fmt(times[end])}`;
    }
    return `${times[start]} – ${times[end]}`;
}

export function mountOverview(newDataset, feature, initialWindow) {
    dataset = newDataset;
    selectedFeature = feature;
    timeWindow = initialWindow;
    labels = null;

    const parse = d3.timeParse('%Y-%m-%d %H:%M:%S');
    const firstBlock = dataset.data[dataset.features[0]];
    times = firstBlock.map(r => dataset.timeColumn == 'timestamp' ? parse(r.timestamp) : +r.index);
    series = {};
    dataset.features.forEach(f => {
        const rows = dataset.data[f];
        series[f] = dataset.nodes.map(node => [node, rows.map((r, i) => ({ t: times[i], value: +r[node] }))]);
    });

    const { width, margin, rowGap } = overview;
    // the SVG scales with the panel's width, so convert the on-screen height through it
    const overviewWidth = document.getElementById('overview-container').clientWidth;
    if (overviewWidth) {
        overview.rowHeight = ROW_HEIGHT_PX * width / overviewWidth;
    }
    const rowHeight = overview.rowHeight;
    const height = margin.top + dataset.features.length * (rowGap + rowHeight) + margin.bottom;
    const svg = d3.select('#overview-svg');
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    x = timeScale()
        .domain(d3.extent(times))
        .range([margin.left, width - margin.right]);
    const rowTop = i => margin.top + i * (rowGap + rowHeight) + rowGap;

    dataset.features.forEach((f, i) => {
        const values = series[f].flatMap(s => s[1].map(p => p.value));
        const y = d3.scaleLinear()
            .domain(d3.extent(values))
            .range([rowHeight, 0]);
        const line = d3.line().x(p => x(p.t)).y(p => y(p.value));

        const row = svg.append('g')
            .attr('class', 'feature-row')
            .datum(f)
            .attr('transform', `translate(0, ${rowTop(i)})`)
            .on('click', () => {
                if (f != selectedFeature) handlers.onFeature(f);
            });
        row.append('rect')
            .attr('class', 'row-bg')
            .attr('x', 0)
            .attr('y', -rowGap + 4)
            .attr('width', width)
            .attr('height', rowHeight + rowGap - 4);
        row.append('rect')
            .attr('class', 'row-accent')
            .attr('x', 0)
            .attr('y', -rowGap + 4)
            .attr('width', 5)
            .attr('height', rowHeight + rowGap - 4);
        row.append('g')
            .attr('class', 'context')
            .selectAll('.line')
            .data(series[f])
            .join('path')
            .attr('class', 'line')
            .style('fill', 'none')
            .attr('d', d => line(d[1]))
            .call(styleLines);
        row.append('rect')
            .attr('class', 'window-band')
            .attr('y', 0)
            .attr('height', rowHeight);
        row.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(y).ticks(3).tickFormat(formatTick));
        row.append('text')
            .attr('class', 'feature-label')
            .attr('x', 14)
            .attr('y', -10)
            .text(featureTitle(f));
    });

    mountTimebar();
    markSelectedFeature();
    drawFocus();
}

function mountTimebar() {
    const { width, margin } = overview;
    const [top, bottom] = timebar.track;
    const svg = d3.select('#timebar-svg');
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${timebar.height}`);

    svg.append('rect')
        .attr('class', 'timebar-track')
        .attr('x', margin.left)
        .attr('y', top)
        .attr('width', width - margin.left - margin.right)
        .attr('height', bottom - top);
    svg.append('g')
        .attr('transform', `translate(0, ${bottom})`)
        .call(d3.axisBottom(x).ticks(6));
    svg.append('text')
        .attr('class', 'timebar-label')
        .attr('x', margin.left - 8)
        .attr('y', (top + bottom) / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .text('Time range');

    brush = d3.brushX()
        .extent([[margin.left, top], [width - margin.right, bottom]])
        .on('brush', event => {
            if (event.selection) drawWindowBands(event.selection);
        })
        .on('end', brushed);
    brushGroup = svg.append('g')
        .attr('class', 'x-brush')
        .call(brush)
        .call(brush.move, timeWindow.map(i => x(times[i])));
    drawWindowBands(timeWindow.map(i => x(times[i])));
}

// shades the brushed range across every feature row
function drawWindowBands([x0, x1]) {
    d3.selectAll('#overview-svg .window-band')
        .attr('x', x0)
        .attr('width', Math.max(x1 - x0, 1));
    // the same range as fractions of the loaded time, for the functions' heatmap strips
    const [left, right] = x.range();
    const list = document.getElementById('fs-list');
    list.style.setProperty('--window-left', `${100 * (x0 - left) / (right - left)}%`);
    list.style.setProperty('--window-width', `${100 * Math.max(x1 - x0, 1) / (right - left)}%`);
}

function brushed(event) {
    // only react to the user; programmatic moves (mount, restore) pass no sourceEvent
    if (!event.sourceEvent) return;
    if (!event.selection) {
        // a click without dragging would clear the brush; keep the current window
        brushGroup.call(brush.move, timeWindow.map(i => x(times[i])));
        drawWindowBands(timeWindow.map(i => x(times[i])));
        return;
    }
    const [t0, t1] = event.selection.map(x.invert);
    let start = d3.bisectLeft(times, t0);
    let end = Math.min(d3.bisectRight(times, t1) - 1, times.length - 1);
    if (end - start + 1 < MIN_WINDOW) {
        end = Math.min(start + MIN_WINDOW - 1, times.length - 1);
        start = end - MIN_WINDOW + 1;
        brushGroup.call(brush.move, [x(times[start]), x(times[end])]);
    }
    drawWindowBands([x(times[start]), x(times[end])]);
    if (start == timeWindow[0] && end == timeWindow[1]) return;
    timeWindow = [start, end];
    drawFocus();
    handlers.onWindow(timeWindow);
}

export function selectFeature(feature) {
    selectedFeature = feature;
    markSelectedFeature();
    drawFocus();
}

function markSelectedFeature() {
    d3.selectAll('#overview-svg .feature-row').classed('selected', f => f == selectedFeature);
    d3.selectAll('#overview-svg .feature-label').classed('selected', f => f == selectedFeature);
}

// Gives the focus panels the Depth Space View's height left over after its other
// parts, with the scatterplot at its natural (width-based) size, so the view fills
// its panel. When space is short the panels keep a minimum and the scatterplot shrinks.
function fitFocusPanels() {
    const view = document.getElementById('ds_view');
    const lineSvg = document.getElementById('line-svg');
    const graphSvg = document.getElementById('graph-svg');
    const scale = lineSvg.clientWidth / focus.width;
    if (!scale || !view.clientHeight) return;

    const outer = el => {
        const style = getComputedStyle(el);
        return parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    };
    let fixed = 0;
    for (const child of view.children) {
        if (getComputedStyle(child).position == 'absolute') continue;
        fixed += outer(child);
        if (child != lineSvg && child != graphSvg) fixed += child.getBoundingClientRect().height;
    }
    const box = graphSvg.viewBox.baseVal;
    const scatter = box && box.width ? graphSvg.clientWidth * box.height / box.width : 0;

    const { panelGap, margin } = focus;
    const panels = focusPanels.length;
    const chrome = (margin.top + margin.bottom + panels * panelGap) * scale;
    let focusPx = Math.max(view.clientHeight - fixed - scatter, chrome + panels * MIN_PANEL_PX);
    if (focusPanels == focusLayouts.combined) {
        focusPx = Math.min(focusPx, chrome + COMBINED_PANEL_PX);
    }
    focus.panelHeight = (focusPx - chrome) / panels / scale;
}

// redraw when the panel resizes so the fit holds
new ResizeObserver(() => {
    if (dataset) drawFocus();
}).observe(document.getElementById('ds_view'));

function drawFocus() {
    fitFocusPanels();
    const { width, panelHeight, panelGap, margin } = focus;
    const [start, end] = timeWindow;
    const windowed = series[selectedFeature].map(([node, points]) => [node, points.slice(start, end + 1)]);

    d3.select('#focus-title').text(featureTitle(selectedFeature));

    const height = margin.top + focusPanels.length * (panelGap + panelHeight) + margin.bottom;
    const svg = d3.select('#line-svg');
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // all panels share one time and value scale so they can be compared directly
    const fx = timeScale()
        .domain([times[start], times[end]])
        .range([margin.left, width - margin.right]);
    const fy = d3.scaleLinear()
        .domain(d3.extent(windowed.flatMap(s => s[1].map(p => p.value))))
        .nice()
        .range([panelHeight, 0]);
    const line = d3.line().x(p => fx(p.t)).y(p => fy(p.value));

    const nodeIndex = labels ? Object.values(labels.measurement) : [];
    const flags = node => {
        const i = nodeIndex.indexOf(node);
        return i == -1 ? [false, false] : [labels.amp[i], labels.phs[i]];
    };

    focusPanels.forEach((panel, i) => {
        // outliers last so they're drawn over the normal nodes
        const members = windowed.filter(([node]) => panel.test(...flags(node)))
            .sort((a, b) => d3.ascending(flags(a[0]).some(Boolean), flags(b[0]).some(Boolean)));
        const g = svg.append('g')
            .attr('transform', `translate(0, ${margin.top + i * (panelGap + panelHeight) + panelGap})`);
        g.append('text')
            .attr('class', 'panel-title')
            .attr('x', margin.left)
            .attr('y', -8)
            .attr('fill', panel.color)
            .text(`${panel.title} (${members.length})`);
        g.append('g')
            .attr('class', 'focus')
            .selectAll('.line')
            .data(members)
            .join('path')
            .attr('class', 'line')
            .style('fill', 'none')
            .attr('d', d => line(d[1]))
            .call(styleLines);
        if (!members.length) {
            g.append('text')
                .attr('class', 'panel-empty')
                .attr('x', (margin.left + width - margin.right) / 2)
                .attr('y', panelHeight / 2)
                .attr('text-anchor', 'middle')
                .text('none');
        }
        g.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(fy).ticks(3).tickFormat(formatTick));
        g.append('g')
            .attr('transform', `translate(0, ${panelHeight})`)
            .call(d3.axisBottom(fx).ticks(6).tickFormat(i == focusPanels.length - 1 ? null : ''));
    });
}

// Recolors every line from the analyzed feature's outlier labels and re-sorts the
// focus panels.
export function updateLineColors(newLabels) {
    labels = newLabels;
    d3.selectAll('.context .line').call(styleLines);
    drawFocus();
}

export function resetLineOpacity() {
    d3.selectAll('.focus .line, .context .line')
        .style('opacity', d => getLineProperties(d[0]).opacity);
}
