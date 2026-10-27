import * as d3 from 'd3';

export const percentColToD3Rgb = percentCol => {
    const col256 = percentCol.map(elm => Math.round(elm * 255))
    return `rgb(${col256[0]}, ${col256[1]}, ${col256[2]})`;
}

export const pallette = {
    blue: [0.31, 0.48, 0.65],
    purple: [0.345, 0.24, 0.315],
    lightgray: '#9499a0',
    red: '#B85B68',
    green: '#457500',
    orange: '#DA7400',
    pink: '#DA73A1',
    lightblue: '#9bcfd6',
    teal: '#6ea6ae',
    gray: '#b5c2d5',
    purple: '#745ea7',
    darkred: '#782731',
    darkgreen: '#2b4704',
}

export const scale = {
    0: '#443665',
    1: '#49457E',
    2: '#535C96',
    3: '#637CAE',
    4: '#72A0C5',
    5: '#84BBCE',
    6: '#96D2D7',
    7: '#A8DFD9',
    8: '#BBE7D9',
    9: '#CEEEDE',
    10:'#E1F5E8'
}

// Outliers sit on RdYlGn: amplitude-only in the red quarter, phase-only in the green
// quarter, both in the yellow middle. Within each segment, distance from the yellow
// center shows how far past the cutoff a node is.
export const amplitudeColor = d3.interpolateRdYlGn(0.1);
export const phaseColor = d3.interpolateRdYlGn(0.9);

export function outlierGradient() {
    const stops = d3.range(0, 1.0001, 0.1).map(t => d3.interpolateRdYlGn(t));
    return `linear-gradient(90deg, ${stops.join(', ')})`;
}

// Colors for node i. Normal nodes stay light blue.
export function outlierStyle(labels, i) {
    const amp = labels.amp[i];
    const phs = labels.phs[i];
    if (!amp && !phs) {
        return { outlier: false, fill: pallette.lightblue, stroke: pallette.teal, text: '#006064' };
    }
    const ampSeverity = amp ? labels.ampSeverity[i] : 0;
    const phsSeverity = phs ? labels.phsSeverity[i] : 0;
    let fill;
    if (amp && phs) {
        // leans toward the more severe depth, darkening the yellow as either grows
        const total = ampSeverity + phsSeverity;
        const position = 0.4 + 0.2 * (total > 0 ? phsSeverity / total : 0.5);
        // darken in HCL with extra chroma so yellows turn gold rather than olive
        const severity = Math.max(ampSeverity, phsSeverity);
        const hcl = d3.hcl(d3.interpolateRdYlGn(position)).darker(0.2 + 0.8 * severity);
        hcl.c *= 1 + 0.6 * severity;
        fill = d3.rgb(hcl);
    } else if (amp) {
        fill = d3.color(d3.interpolateRdYlGn(0.25 * (1 - ampSeverity)));
    } else {
        fill = d3.color(d3.interpolateRdYlGn(0.75 + 0.25 * phsSeverity));
    }
    const stroke = fill.darker(0.8).formatHex();
    return {
        outlier: true,
        fill: fill.formatHex(),
        stroke,
        // pale yellows would vanish as thin lines on white
        line: d3.hcl(fill).l > 75 ? stroke : fill.formatHex(),
        text: d3.hcl(fill).l < 60 ? 'white' : 'black'
    };
}
