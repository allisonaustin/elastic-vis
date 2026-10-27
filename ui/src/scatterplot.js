import * as d3 from 'd3';
import axios from 'axios';
import { pallette, scale, percentColToD3Rgb, outlierStyle, amplitudeColor, phaseColor } from './colors.js';
import { isEmpty, debounce, isUndefined } from 'lodash';
import { getSelection, highlight, setSelection } from './selection.js';

// top and right margins hold the depth distributions behind the outlier thresholds
const margin = { left: 145, right: 165, top: 135, bottom: 80 }
const tickCount = { x: 5, y: 8 }
// square plot area
const size = { width: 800, height: 800 - margin.left - margin.right + margin.top + margin.bottom }
let svgdata = []
let depths = []
let labels = []
let viewType = 1;
let showRegions = true;

// Dragging a k marker reports the new k here; set by main.js.
let onThresholdChange = () => {};
export function setThresholdHandler(handler) {
    onThresholdChange = handler;
}
// while a marker is dragged the axes hold still and updates skip their transitions
let draggingThreshold = false;
const duration = () => draggingThreshold ? 0 : 500;

let container;
let svg;

let defaultColor = pallette.lightgray;

// At least 3 decimals, and more when ticks are closer together than that shows.
function axisFormat(axisScale, count = 10) {
    const [lo, hi] = axisScale.domain();
    const precision = Math.max(3, d3.precisionFixed(d3.tickStep(lo, hi, count) || 0.001));
    return d3.format(`.${precision}f`);
}

let xScale = d3.scaleLinear();
let yScale = d3.scaleLinear();
let xAxis, yAxis;

// Data extent widened to take in the outlier cutoff, so the cutoff stays on the
// chart even when no node falls below it.
function depthDomain(values, cutoff) {
    const [lo, hi] = d3.extent([...values, cutoff]);
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
}

function toNodes(depths) {
    return Object.keys(depths.measurement).map(key => ({
        id: depths.measurement[key],
        amplitude: depths.amplitude[key],
        phase: depths.phase[key]
    }));
}

export function mountGraph(data, stats) {
    d3.select('#graph-svg').selectAll('*').remove();

    depths = data.depths;
    labels = data.labels;

    let nodes = toNodes(depths);

    svg = d3.select('#graph-svg')
        .attr('viewBox', `0 0 ${size.width} ${size.height}`);

    xScale = d3.scaleLinear()
        .domain(depthDomain(nodes.map(d => d.phase), stats.phs.cutoff))
        .range([margin.left, size.width - margin.right]);

    yScale = d3.scaleLinear()
        .domain(depthDomain(nodes.map(d => d.amplitude), stats.amp.cutoff))
        .range([size.height - margin.bottom, margin.top]);

    container = svg.append('g').attr('id', 'scatter-container');
    container.append('g')
        .attr('class', 'regions')
        .style('display', showRegions ? null : 'none');
    container.append('g').attr('class', 'marginal phase-marginal');
    container.append('g').attr('class', 'marginal amplitude-marginal');

    // X-axis
    xAxis = d3.axisBottom(xScale).ticks(tickCount.x).tickFormat(axisFormat(xScale, tickCount.x));
    container.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0, ${size.height - margin.bottom})`)
        .call(xAxis)
        .append('text')
        .attr('x', (margin.left + size.width - margin.right) / 2)
        .attr('y', margin.bottom - 10)
        .attr('class', 'axis-title')
        .attr('fill', 'black')
        .attr('text-anchor', 'middle')
        .text('Phase Depth')

    // Y-axis
    yAxis = d3.axisLeft(yScale).ticks(tickCount.y).tickFormat(axisFormat(yScale, tickCount.y));
    container.append('g')
        .attr('class', 'y-axis')
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(yAxis)
        .append('text')
        .attr('x', -(margin.top + size.height - margin.bottom) / 2)
        .attr('y', -margin.left + 18)
        .attr('dy', '1em')
        .attr('class', 'axis-title')
        .attr('fill', 'black')
        .attr('text-anchor', 'middle')
        .attr('transform', 'rotate(-90)')
        .text('Amplitude Depth');

    appendCircles(nodes);
    addLasso();
}

// Drag inside the plot area to lasso nodes; shift-drag adds to the current
// selection, and a click without dragging clears it. While drawing, nodes stay
// faded until the lasso encloses them.
function addLasso() {
    let points = [];
    let base = [];
    const path = container.append('g')
        .attr('class', 'lasso')
        .append('path')
        .attr('class', 'drawn');

    const inPlot = ([x, y]) => {
        const [left, right] = xScale.range();
        const [bottom, top] = yScale.range();
        return x >= left && x <= right && y >= top && y <= bottom;
    };
    // the polygon is clipped to the plot area as it's drawn
    const clampToPlot = ([x, y]) => {
        const [left, right] = xScale.range();
        const [bottom, top] = yScale.range();
        return [Math.min(Math.max(x, left), right), Math.min(Math.max(y, top), bottom)];
    };
    const enclosed = () => container.selectAll('.ds-circle').data()
        .filter(d => d3.polygonContains(points, [xScale(d.phase), yScale(d.amplitude)]))
        .map(d => d.id);

    svg.call(d3.drag()
        .container(svg.node())
        .filter(event => !event.button && inPlot(d3.pointer(event, svg.node())))
        .on('start', (event) => {
            points = [clampToPlot([event.x, event.y])];
            base = event.sourceEvent.shiftKey ? getSelection() : [];
        })
        .on('drag', (event) => {
            points.push(clampToPlot([event.x, event.y]));
            path.attr('d', `${d3.line()(points)}Z`);
            highlight([...base, ...(points.length > 2 ? enclosed() : [])], true);
        })
        .on('end', () => {
            path.attr('d', null);
            if (points.length < 3) {
                setSelection(base);
                return;
            }
            setSelection([...base, ...enclosed()]);
        }));
}

function appendCircles(data) {
    let circs = container.append('g')
        .selectAll('.ds-circle')
        .data(data)
        .enter()
        .append('circle')
        .attr('class', 'ds-circle')
        .attr('cx', d => xScale(d.phase)) // x-position based on phase depth
        .attr('cy', d => yScale(d.amplitude)) // y-position based on amplitude depth
        .attr('r', 7)
        .attr('fill', (d, i) => outlierStyle(labels, i).fill)
        .attr('stroke', (d, i) => outlierStyle(labels, i).stroke)
        .attr('stroke-width', 2)
        .attr('opacity', 0.8);

    circs
        .transition()
        .duration(800)
        .style("opacity", 0.8);

    container.append('g')
        .selectAll('.text')
        .data(data)
        .enter()
            .append('text')
            .attr('class', 'ds-text')
            .attr('x', d => xScale(d.phase) + 7)
            .attr('y', d => yScale(d.amplitude) - 7)
            .text(d => d.id)
            .attr('fill', 'black');
}

function updateAxis(data, stats) {
    if (draggingThreshold) return;
    xScale.domain(depthDomain(data.map(d => d.phase), stats.phs.cutoff));
    yScale.domain(depthDomain(data.map(d => d.amplitude), stats.amp.cutoff));
    xAxis.tickFormat(axisFormat(xScale, tickCount.x));
    yAxis.tickFormat(axisFormat(yScale, tickCount.y));

    container.select('.x-axis')
        .transition()
        .duration(500)
        .call(xAxis);

    container.select('.y-axis')
        .transition()
        .duration(500)
        .call(yAxis);
}

export function updateData(newdata, stats) {
    depths = newdata.depths;
    labels = newdata.labels;

    let newdepths = toNodes(depths);

    updateAxis(newdepths, stats);
    updateCircles(newdepths);
}


function updateCircles(newdata) {
    let circles = container
        .selectAll(".ds-circle")
        .data(newdata)

    let circleText = container
        .selectAll('.ds-text')
        .data(newdata)

    circles
        .transition()
        .duration(duration())
        .attr('cx', d => xScale(d.phase))
        .attr('cy', d => yScale(d.amplitude))
        .attr('fill', (d, i) => outlierStyle(labels, i).fill)
        .attr('stroke', (d, i) => outlierStyle(labels, i).stroke)
        .attr('stroke-width', 2)

    circleText
        .transition()
        .duration(500)
        .attr('x', d => xScale(d.phase) + 7)
        .attr('y', d => yScale(d.amplitude) - 7)
}

export function setRegionsVisible(visible) {
    showRegions = visible;
    if (container) {
        container.select('.regions').style('display', visible ? null : 'none');
    }
}

// Shades the depth ranges labeled as outliers: amplitude outliers lie below the
// horizontal cutoff and phase outliers left of the vertical one. The cutoff values
// are labeled in the marginals, next to the k / q markers.
export function drawRegions(stats) {
    const [left, right] = xScale.range();
    const [bottom, top] = yScale.range();
    const ampY = yScale(stats.amp.cutoff);
    const phsX = xScale(stats.phs.cutoff);

    const regions = [
        {
            key: 'amplitude', color: amplitudeColor,
            rect: { x: left, y: ampY, width: right - left, height: bottom - ampY },
            line: { x1: left, y1: ampY, x2: right, y2: ampY }
        },
        {
            key: 'phase', color: phaseColor,
            rect: { x: left, y: top, width: phsX - left, height: bottom - top },
            line: { x1: phsX, y1: top, x2: phsX, y2: bottom }
        }
    ];

    const groups = container.select('.regions')
        .selectAll('.region')
        .data(regions, d => d.key)
        .join(enter => {
            const g = enter.append('g').attr('class', d => `region ${d.key}`);
            g.append('rect')
                .attr('fill', d => d.color)
                .attr('fill-opacity', 0.1);
            g.append('line')
                .attr('stroke', d => d.color)
                .attr('stroke-width', 1.5)
                .style('stroke-dasharray', '6,4');
            return g;
        });

    const t = d3.transition().duration(duration());
    groups.select('rect').transition(t)
        .attr('x', d => d.rect.x)
        .attr('y', d => d.rect.y)
        .attr('width', d => d.rect.width)
        .attr('height', d => d.rect.height);
    groups.select('line').transition(t)
        .attr('x1', d => d.line.x1)
        .attr('y1', d => d.line.y1)
        .attr('x2', d => d.line.x2)
        .attr('y2', d => d.line.y2);

    drawMarginal(container.select('.phase-marginal'), stats.phs, 'phs', xScale, 'horizontal', phaseColor);
    drawMarginal(container.select('.amplitude-marginal'), stats.amp, 'amp', yScale, 'vertical', amplitudeColor);
}

// Histogram of one depth along its axis, marking the median and max (whose gap
// k scales), the k limit, and the quantile q. The cutoff is the lower of k and q,
// shaded like the outlier region. The k marker can be dragged to set k; q is set
// only from its Quantile input.
function drawMarginal(g, stats, dim, axisScale, orientation, color) {
    g.selectAll('*').remove();

    const horizontal = orientation == 'horizontal';
    const [lo, hi] = axisScale.domain();
    const fmt = axisFormat(axisScale);

    // extent across the histogram: base and far edge of the bars
    const base = horizontal ? margin.top - 15 : size.width - margin.right + 15;
    const reach = 50;
    const along = v => horizontal ? base - v : base + v;

    const bins = d3.bin()
        .domain([lo, hi])
        .thresholds(axisScale.ticks(20))(stats.values);
    const count = d3.scaleLinear()
        .domain([0, d3.max(bins, b => b.length) || 1])
        .range([0, reach]);

    // shaded cutoff range
    if (stats.cutoff > lo) {
        const p0 = axisScale(lo), p1 = axisScale(stats.cutoff);
        g.append('rect')
            .attr('fill', color)
            .attr('fill-opacity', 0.15)
            .attr('x', horizontal ? Math.min(p0, p1) : base)
            .attr('y', horizontal ? along(reach) : Math.min(p0, p1))
            .attr('width', horizontal ? Math.abs(p1 - p0) : reach)
            .attr('height', horizontal ? reach : Math.abs(p1 - p0));
    }

    g.append('g')
        .selectAll('rect')
        .data(bins.filter(b => b.length))
        .join('rect')
        .attr('fill', pallette.lightblue)
        .attr('stroke', pallette.teal)
        .attr('stroke-width', 0.5)
        .attr('x', b => horizontal ? axisScale(b.x0) : base)
        .attr('y', b => horizontal ? along(count(b.length)) : axisScale(b.x1))
        .attr('width', b => horizontal ? Math.max(axisScale(b.x1) - axisScale(b.x0), 1) : count(b.length))
        .attr('height', b => horizontal ? count(b.length) : Math.max(axisScale(b.x0) - axisScale(b.x1), 1));

    const lineAt = (sel, pos) => sel
        .attr('x1', horizontal ? pos : base)
        .attr('x2', horizontal ? pos : along(reach))
        .attr('y1', horizontal ? base : pos)
        .attr('y2', horizontal ? along(reach) : pos);

    // median and max: context only, labeled inside the strip
    const reference = g.selectAll('.reference')
        .data([{ key: 'med', value: stats.median }, { key: 'max', value: stats.max }])
        .join('g')
        .attr('class', 'reference');
    reference.append('title').text(m => `${m.key == 'med' ? 'median' : 'max'} = ${fmt(m.value)}`);
    reference.append('line')
        .attr('stroke', '#555')
        .attr('stroke-width', 2)
        .each(function (m) { lineAt(d3.select(this), axisScale(m.value)); });
    reference.append('text')
        .attr('class', 'halo')
        .attr('fill', '#555')
        .attr('text-anchor', horizontal ? 'end' : 'end')
        .attr('dy', horizontal ? '0.9em' : '-0.3em')
        .attr('x', m => horizontal ? axisScale(m.value) - 3 : along(reach))
        .attr('y', m => horizontal ? along(reach) : axisScale(m.value))
        .text(m => m.key);

    // k and q, labeled with their depth outside the strip. Whichever sits
    // nearer the axis start labels on that side, so the two never overlap.
    const spread = stats.max - stats.median;
    const thresholds = [
        { key: 'k', value: stats.lim, dash: '5,3', draggable: spread > 0,
          title: spread > 0
              ? `k = ${stats.k}: max(median − k·(max − median), 0) = ${fmt(stats.lim)}. Drag to change k.`
              : `k has no effect here: median and max are equal` },
        { key: 'q', value: stats.quantile, dash: '2,2', draggable: false,
          title: `q = ${stats.quantileLevel}: quantile = ${fmt(stats.quantile)}. Set q in the Quantile box.` }
    ].map(m => ({ ...m, pos: axisScale(m.value), cutoff: m.value == stats.cutoff }));
    const first = d3.least(thresholds, m => horizontal ? m.pos : -m.pos);

    const valueAt = event => {
        const pos = horizontal ? event.x : event.y;
        return axisScale.invert(Math.min(Math.max(pos, d3.min(axisScale.range())), d3.max(axisScale.range())));
    };
    // k = (median - lim) / (max - median), with lim dragged no higher than the median
    const reportK = event => {
        const lim = Math.min(valueAt(event), stats.median);
        onThresholdChange(dim, Math.max((stats.median - lim) / spread, 0));
    };
    const drag = d3.drag()
        .container(g.node().ownerSVGElement)
        .filter(function (event, m) { return !event.button && m.draggable; })
        .on('start', () => { draggingThreshold = true; })
        .on('drag', reportK)
        .on('end', event => {
            draggingThreshold = false;
            reportK(event);
        });

    const threshold = g.selectAll('.threshold')
        .data(thresholds)
        .join('g')
        .attr('class', m => `threshold${m.draggable ? ' draggable' : ''}${horizontal ? ' horizontal' : ''}`)
        .call(drag);
    threshold.append('title').text(m => m.title);
    threshold.append('line')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .style('stroke-dasharray', m => m.dash)
        .each(function (m) { lineAt(d3.select(this), m.pos); });
    // wide invisible line and an end grip make the marker easy to grab
    threshold.append('line')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 16)
        .each(function (m) { lineAt(d3.select(this), m.pos); });
    threshold.filter(m => m.draggable)
        .append('circle')
        .attr('r', 5)
        .attr('fill', color)
        .attr('cx', m => horizontal ? m.pos : along(reach))
        .attr('cy', m => horizontal ? along(reach) : m.pos);
    threshold.append('text')
        .attr('class', 'halo')
        .attr('fill', color)
        .style('font-weight', m => m.cutoff ? 'bold' : null)
        .attr('text-anchor', m => horizontal ? (m == first ? 'end' : 'start') : 'start')
        .attr('dy', m => horizontal ? '-0.3em' : (m == first ? '1em' : '-0.3em'))
        .attr('x', m => horizontal ? m.pos + (m == first ? -8 : 8) : along(reach) + 9)
        .attr('y', m => horizontal ? along(reach) : m.pos)
        .text(m => `${m.key} ${fmt(m.value)}`);
}
