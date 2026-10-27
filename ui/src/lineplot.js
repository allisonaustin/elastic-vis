import * as d3 from 'd3';
import axios from 'axios';
import { pallette, scale, percentColToD3Rgb, outlierStyle } from './colors.js';
import { isEmpty, debounce, isUndefined } from 'lodash';
import { getSelection, highlight, restoreSelection, toggleSelection, setSelection } from './selection.js';

const margin = { left: 70, right: 30, top: 20, bottom: 30 }
let size = { width: 0, height1: 0, height2: 0 }
let chartContainer;
let svg;
let x1;
let x2;
let y1;
let y2;
let svgdata = []
let depths = []
let labels = []
let viewType = 1;
let initial = true;
let sortMetric = 'name';

export let brushStart;
export let brushEnd;

// called after the brush settles on a new window; set by main.js
let onBrush = () => {};
export function setBrushHandler(handler) {
    onBrush = handler;
}

let defaultColor = pallette.lightgray;
function getLineProperties(measurement) {
    const index = Object.values(labels.measurement).indexOf(measurement);
    if (index !== -1) {
        const style = outlierStyle(labels, index);
        if (style.outlier) {
            return { color: style.line, opacity: 1, width: 1.2 };
        }
    }
    return { color: defaultColor, opacity: 0.5, width: 1 };
}

function processData(data) {
    let processed = []
    data.forEach((d, index) => {
        (Object.keys(d)).forEach((c) => {
            if (c != 'timestamp' && c != 'index') {
                processed.push({ 
                    index: d.timestamp ? d3.timeParse('%Y-%m-%d %H:%M:%S')(d.timestamp) : index,
                    value: +d[c],
                    measurement: c,
                });
            }
        })
    })
    return processed;
}

function formatTick(d) {
    if (Math.abs(d) < 1000) {
        return d3.format(".2f")(d);
    } else {
        return d3.format(".2e")(d).replace(/e\+0$/, '');
    }
}

function getXAxisScale(data, width) {
    if (svgdata.some(d => d.hasOwnProperty('timestamp'))) {
        return d3.scaleTime()
            .domain(d3.extent(data, function(d) { return d.index }))
            .range([ 0, width ]);
    } else {
        return d3.scaleLinear()
            .domain(d3.extent(data, function(d) { return d.index }))
            .range([0, width]);
    }
}

export function mountChart(chartdata, viewType, start, end) {
    svgdata = chartdata.data
    depths = chartdata.depths
    labels = chartdata.labels
    viewType = viewType
    brushStart = start 
    brushEnd = end

    size = { width: 700, height1: 200, height2: 100 }

    d3.select('#line-svg').selectAll('*').remove()

    chartContainer = d3.select('#line-svg').attr('viewBox', `0 0 ${size.width + margin.right + margin.left} ${size.height1 + size.height2 + margin.top}`);

    if (viewType == 1) {
        addFuncs();
    }
    focusView(chartdata.data);
    initial = false;
}

// https://observablehq.com/@thetylerwolf/day-16-zoomable-area-chart
export function focusView(data) {
    data = processData(svgdata)
    const grouped = d3.group(data, d => d.measurement)
    
    const format = d3.format(",.0f");

    x1 = getXAxisScale(data, size.width)

    y1 = d3.scaleLinear()
      .domain([d3.min(data, function(d) { return +d.value }), d3.max(data, function(d) { return +d.value; })])
      .range([ size.height1, 0 ]);

    const line = d3.line()
        .x(function(d) { return x1(d.index) })
        .y(function(d) { return y1(+d.value) })

    chartContainer.append('defs')
        .append('clipPath')
            .attr('id', 'clip')
        .append('rect')
            .attr('width', size.width)
            .attr('height', size.height1)
    
    const focus = chartContainer.append('g')
        .attr('class', 'focus')
        .attr('transform', `translate(${margin.left},${-margin.top - margin.bottom})`)
    
    focus.selectAll('.line')
        .data(grouped)
        .enter()
            .append('path')
            .attr('id', (d) => `${d[0]}-focus`)
            .attr('class', (d, i) => {
                let classes = `line `;
                if (labels.amp[i]) classes += '.amplitude';
                if (labels.phs[i]) classes += '.phase';
                return classes;
            })
            .attr('clip-path', 'url(#clip)')
            .style('fill', 'none')
            .style('stroke', (d, i) => viewType == 0 ? d3.schemeCategory10[i % 10] : getLineProperties(d[0]).color)
            .style('opacity', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).opacity)
            .style('stroke-width', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).width)
            .attr('d', d => line(d[1]))

    focus.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${ size.height1 })`)
          .call(d3.axisBottom(x1))
          .select('.domain')
          .remove()

    focus.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(y1).tickFormat(formatTick));
        // .select('.domain')
        // .remove()

    contextView(data, grouped)
}

function contextView(data, grouped) {
    x2 = getXAxisScale(data, size.width)

    y2 = d3.scaleLinear()
        .domain([d3.min(data, function(d) { return +d.value }), d3.max(data, function(d) { return +d.value; })])
        .range([ size.height2, 0 ]);

    let line2 = d3.line()
        .x(function(d) { return x2(d.index) })
        .y(function(d) { return y2(+d.value) })

    const context = chartContainer.append('g')
      .attr('class', 'context')
      .attr('transform', `translate(${ margin.left },${ size.height1 })`)
    
    context.selectAll('.line')
        .data(grouped)
        .enter()
            .append('path')
            .attr('id', (d) => `${d[0]}-context`)
            .attr('class', (d, i) => {
                let classes = `line `;
                if (labels.amp[i]) classes += '.amplitude';
                if (labels.phs[i]) classes += '.phase';
                return classes;
            })
            .attr('clip-path', 'url(#clip)')
            .style('fill', 'none')
            .style('stroke', (d, i) => viewType == 0 ? d3.schemeCategory10[i % 10] : getLineProperties(d[0]).color)
            .style('opacity', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).opacity)
            .style('stroke-width', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).width)
            .attr('d', d => line2(d[1]))

    context.append('g')
        .attr('class', 'x-axis')
        .attr('transform',  `translate(0,${ size.height2 })`)
        .call( d3.axisBottom(x2) )

    context.append("g")
        .call(d3.axisLeft(y2).tickFormat(formatTick));

    context.append('g')
        .attr('class', 'x-brush')

    brushStart = Math.floor(data.length * 0.3);
    brushEnd = Math.floor(data.length * 0.4);

    const defaultWindow = [
        x2(data[brushStart].index),
        x2(data[brushEnd].index)
    ]

    const brush = d3.brushX(x2)
        .extent([[0, 20 ], [size.width, size.height2 + margin.top]])
        .on('end', brushed)
    
    context.append('g')
        .attr('class', 'x-brush')
        .attr('transform', `translate(0, ${-margin.top})`)
        .call(brush)
        .call(brush.move, defaultWindow)
}

function brushed(event) {
    if (event.selection) {
        let extent = event.selection.map(d => x2.invert(d));

        x1.domain(extent);

        const isDateIndex = svgdata.some(d => d.hasOwnProperty('timestamp'));

        brushStart = svgdata.findIndex(d => {
            if (isDateIndex) {
                return new Date(d.timestamp) >= extent[0]
            } else {
                return Math.round(d.index) >= Math.round(extent[0])
            }
        });

        brushEnd = svgdata.findIndex(d => {
            if (isDateIndex) {
                return new Date(d.timestamp) > extent[1]
            } else {
                return Math.round(d.index) > Math.round(extent[1])
            }
        }) - 1;

        console.log(brushStart, brushEnd)

        const t = d3.transition()
            .duration(400) 
            .ease(d3.easeCubicInOut);

        if (!initial) {
            d3.selectAll('.focus .line')
                .transition(t)
                .attr('d', d => d3.line()
                    .x(d => x1(d.index))
                    .y(d => y1(d.value))
                    (d[1]) 
            );
        } else {
            d3.selectAll('.focus .line')
                .attr('d', d => d3.line()
                    .x(d => x1(d.index))
                    .y(d => y1(d.value))
                    (d[1]) 
            );
        }

        d3.select('.focus .x-axis').transition(t).call(d3.axisBottom(x1));

        onBrush();
    }
}

export function changeView(type) {
    viewType = type
    d3.selectAll('.focus .line')
        .style('stroke', (d, i) => viewType == 0 ? d3.schemeCategory10[i % 10] : getLineProperties(d[0]).color)
        .style('opacity', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).opacity)
        .style('stroke-width', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).width)
    
    d3.selectAll('.context .line')
        .style('stroke', (d, i) => viewType == 0 ? d3.schemeCategory10[i % 10] : getLineProperties(d[0]).color)
        .style('opacity', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).opacity)
        .style('stroke-width', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).width)

    if (viewType == 1) {
        showFuncs();
    } else if (viewType == 0) {
        hideFuncs();
    }
}

export function addFuncs() {
    removeFuncs();
    const fsList = document.getElementById('fs-list');

    let dataList = Object.keys(depths.amplitude).map(key => ({
        amplitude: depths.amplitude[key],
        phase: depths.phase[key],
        measurement: depths.measurement[key]
    }));

    dataList.forEach((item, i) => {
        const fn = document.createElement('div');
        fn.classList.add('fs_option');
        fn.textContent = item.measurement;
        fn.dataset.index = i;

        // hovering previews a node alongside the current selection; clicking toggles it
        fn.addEventListener('mouseover', () => highlight([...getSelection(), item.measurement]));
        fn.addEventListener('mouseout', restoreSelection);
        fn.addEventListener('click', () => toggleSelection(item.measurement));

        fsList.appendChild(fn);
    });
    styleFuncs();
}

// Colors each function by its outlier label and refreshes its depths for sorting.
function styleFuncs() {
    document.querySelectorAll('.fs_option').forEach(fn => {
        const i = fn.dataset.index;
        const style = outlierStyle(labels, i);
        fn.style.background = style.outlier ? style.fill : '';
        fn.style.borderColor = style.outlier ? style.stroke : '';
        fn.style.color = style.outlier ? style.text : '';
        fn.title = `amplitude depth ${d3.format('.4f')(depths.amplitude[i])}\nphase depth ${d3.format('.4f')(depths.phase[i])}`;
    });
    sortFuncs(sortMetric);
}

// Orders the functions list by 'name', or by 'amplitude' / 'phase' depth with the
// most outlying (lowest depth) first.
export function sortFuncs(metric) {
    sortMetric = metric;
    const fsList = document.getElementById('fs-list');
    const fns = Array.from(fsList.children);
    if (metric == 'name') {
        fns.sort((a, b) => a.textContent.localeCompare(b.textContent, undefined, { numeric: true }));
    } else {
        const values = depths[metric];
        fns.sort((a, b) => d3.ascending(values[a.dataset.index], values[b.dataset.index]));
    }
    fns.forEach(fn => fsList.appendChild(fn));
}

export function showFuncs() {
    const fs = document.querySelectorAll('.fs_option');
    fs.forEach(fn => {
        fn.style.display = 'inline-block';
    });
}

export function hideFuncs() {
    const fs = document.querySelectorAll('.fs_option');
    fs.forEach(fn => {
        fn.style.display = 'none';
    });
}

export function removeFuncs() {
    const fContainer = document.getElementById('fs-list');
    fContainer.innerHTML = '';
}

export function resetLineOpacity() {
    d3.selectAll('.focus .line, .context .line')
        .style('opacity', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).opacity);
}

export function updateLabels(chartdata) {
    depths = chartdata.depths
    labels = chartdata.labels

    // updating line properties for focus and context views
    d3.selectAll('.focus .line')
        .attr('class', (d, i) => {
            let classes = `line `;
            if (labels.amp[i]) classes += '.amplitude';
            if (labels.phs[i]) classes += '.phase';
            return classes;
        })
        .style('stroke', (d, i) => viewType == 0 ? d3.schemeCategory10[i % 10] : getLineProperties(d[0]).color)
        .style('opacity', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).opacity)
        .style('stroke-width', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).width)
    
    d3.selectAll('.context .line')
        .attr('class', (d, i) => {
            let classes = `line `;
            if (labels.amp[i]) classes += '.amplitude';
            if (labels.phs[i]) classes += '.phase';
            return classes;
        })
        .style('stroke', (d, i) => viewType == 0 ? d3.schemeCategory10[i % 10] : getLineProperties(d[0]).color)
        .style('opacity', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).opacity)
        .style('stroke-width', (d) => viewType == 0 ? 1 : getLineProperties(d[0]).width)


    styleFuncs();
}

// clicking elsewhere clears the selection; the depth space handles its own clicks
document.addEventListener('click', function(event) {
    const keep = ['fs-list', 'ds_view'].some(id => document.getElementById(id).contains(event.target));
    if (!keep) {
        setSelection([]);
    }
});
