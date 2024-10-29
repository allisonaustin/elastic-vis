import * as d3 from 'd3';
import axios from 'axios';
import { pallette, scale, percentColToD3Rgb } from './colors.js';
import { isEmpty, debounce, isUndefined } from 'lodash';

const margin = { left: 50, right: 30, top: 20, bottom: 30 }
let size = { width: 0, height1: 0, height2: 0 }
let chartContainer = d3.select('#line-svg')
let x1;
let x2;
let y1;
let y2;
let svgdata = []
let depths = []
let labels = []

let defaultColor = pallette.lightgray;
let colorScale = d3.scaleOrdinal()
    .domain([0, 1, 2])
    .range([pallette.blue, pallette.purple].map(percentColToD3Rgb));

const onResize = (targets) => {
    targets.forEach(target => {
        if (target.target.getAttribute('id') !== 'ts-container') return;
        size = { width: target.contentRect.width, height: target.contentRect.height }
        if (!isEmpty(size) && !isEmpty(svgdata)) {
            d3.select('#line-svg').selectAll('*').remove()
            //console.log(size, bars)
            focusView(svgdata)
        }
    })
}

function getLineColor(measurement) {
    const index = Object.values(labels.measurement).indexOf(measurement);
    if (index !== -1) {
        if (labels.amp[index]) return pallette.red;
        if (labels.phs[index]) return pallette.green;
    }
    return defaultColor; 
}

function getLineProperties(measurement) {
    const index = Object.values(labels.measurement).indexOf(measurement);
    let color = defaultColor; 
    let opacity = 0.3; 

    if (index !== -1) {
        if (labels.amp[index]) {
            color = pallette.red;
            opacity = 1; 
        }
        if (labels.phs[index]) {
            color = pallette.green;
            opacity = 1; 
        }
    }
    return { color, opacity }; 
}

function processData(data) {
    let processed = []
    data.forEach(d => {
        (Object.keys(d)).forEach((c) => {
            if (c != 'timestamp') {
                processed.push({ 
                    timestamp: d3.timeParse('%Y-%m-%d %H:%M:%S')(d.timestamp),
                    value: +d[c],
                    measurement: c,
                });
            }
        })
    })
    return processed;
}

function groupBy(arr, property) {
    return arr.reduce(function (acc, obj) {
        let key = obj[property];

        if (key != null && key !== undefined) {
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(obj);
        }

        return acc;
    }, {});
}

const chartObserver = new ResizeObserver(debounce(onResize, 100))

export function mountChart(chartdata) { // registering this element to watch its size change
    let chartContainer = document.querySelector('#ts-container')
    chartObserver.observe(chartContainer)
    svgdata = chartdata.data
    depths = chartdata.depths
    labels = chartdata.labels
    console.log(labels)
}

// https://observablehq.com/@thetylerwolf/day-16-zoomable-area-chart
export function focusView(data) {
    d3.select('#line-svg').selectAll('*').remove()

    data = processData(svgdata)
    const grouped = d3.group(data, d => d.measurement)

    size = { width: 700, height1: 250, height2: 100 }
    
    const format = d3.format(",.0f");

    x1 = d3.scaleTime()
      .domain(d3.extent(data, function(d) { return d.timestamp }))
      .range([ 0, size.width ]);

    y1 = d3.scaleLinear()
      .domain([d3.min(data, function(d) { return +d.value }), d3.max(data, function(d) { return +d.value; })])
      .range([ size.height1, 0 ]);

    const line = d3.line()
        .x(function(d) { return x1(d.timestamp) })
        .y(function(d) { return y1(+d.value) })

    chartContainer.append('defs')
        .append('clipPath')
            .attr('id', 'clip')
        .append('rect')
            .attr('width', size.width)
            .attr('height', size.height1)
    
    const focus = chartContainer.append('g')
        .attr('class', 'focus')
        .attr('transform', `translate(${margin.left},${margin.top})`)
    
    focus.selectAll('.line')
        .data(grouped)
        .enter()
            .append('path')
            .attr('class', 'line')
            .attr('clip-path', 'url(#clip)')
            .style('fill', 'none')
            // .style('stroke', (d, i) => d3.schemeCategory10[i % 10])
            .style('stroke', (d) => getLineColor(d[0]))
            .style('opacity', (d) => getLineProperties(d[0]))
            .attr('d', d => line(d[1]))

    focus.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${ size.height1 })`)
          .call(d3.axisBottom(x1))
          .select('.domain')
          .remove()

    focus.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(y1))
        // .select('.domain')
        // .remove()

    contextView(data, grouped)
}

function contextView(data, grouped) {
    x2 = d3.scaleTime()
        .domain(d3.extent(data, function(d) { return d.timestamp }))
        .range([ 0, size.width ]);

    y2 = d3.scaleLinear()
        .domain([d3.min(data, function(d) { return +d.value }), d3.max(data, function(d) { return +d.value; })])
        .range([ size.height2, 0 ]);

    let line2 = d3.line()
        .x(function(d) { return x2(d.timestamp) })
        .y(function(d) { return y2(+d.value) })

    const context = chartContainer.append('g')
      .attr('class', 'context')
      .attr('transform', `translate(${ margin.left },${ size.height1 + size.height2 - margin.bottom - margin.top })`)

    context.selectAll('.line')
        .data(grouped)
        .enter()
            .append('path')
            .attr('class', 'line')
            .attr('clip-path', 'url(#clip)')
            .style('fill', 'none')
            // .style('stroke', (d, i) => d3.schemeCategory10[i % 10])
            .style('stroke', (d) => getLineColor(d[0]))
            .style('opacity', (d) => getLineProperties(d[0]))
            .attr('d', d => line2(d[1]))

    context.append('g')
        .attr('class', 'x-axis')
        .attr('transform',  `translate(0,${ size.height2 })`)
        .call( d3.axisBottom(x2) )

    context.append("g")
        .call(d3.axisLeft(y2));

    context.append('g')
        .attr('class', 'x-brush')

    const start = Math.floor(data.length * 0.3);
    const end = Math.floor(data.length * 0.6);

    const defaultWindow = [
        x2(data[start].timestamp),
        x2(data[end].timestamp)
    ]

    const brush = d3.brushX(x2)
        .extent([[0, 20 ], [size.width, size.height2 + margin.top]])
        .on('brush', brushed)
    
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

        d3.selectAll('.focus .line').attr('d', d => d3.line()
            .x(d => x1(d.timestamp))
            .y(d => y1(d.value))
            (d[1]) 
        );

        d3.select('.focus .x-axis').call(d3.axisBottom(x1));
    }
}

