import * as d3 from 'd3';

// Thresholds behind the outlier cutoff, mirroring StreamingDepth.elastic_outliers:
// a node is an outlier when its depth is below both lim = median - k * (max - median)
// (floored at 0) and the given quantile of all depths, i.e. below min(lim, quantile).
export function outlierStats(values, k, quantile) {
    const median = d3.median(values);
    const max = d3.max(values);
    const lim = Math.max(median - k * (max - median), 0);
    const quantileValue = d3.quantile(values, quantile);
    return {
        k, quantileLevel: quantile, median, max, lim, quantile: quantileValue,
        cutoff: Math.min(lim, quantileValue), min: d3.min(values), values
    };
}

// How far past the cutoff a depth is: 0 just below it, 1 for the deepest outlier.
function severity(depth, stats) {
    const span = stats.cutoff - stats.min;
    return span > 0 ? (stats.cutoff - depth) / span : 1;
}

// Labels in the same shape the server returns, plus per-node severities and the stats used.
export function labelOutliers(depths, params) {
    const amp = outlierStats(Object.values(depths.amplitude), params.amp.k, params.amp.quantile);
    const phs = outlierStats(Object.values(depths.phase), params.phs.k, params.phs.quantile);

    const labels = { amp: {}, phs: {}, ampSeverity: {}, phsSeverity: {}, measurement: { ...depths.measurement } };
    Object.keys(depths.amplitude).forEach(key => {
        labels.amp[key] = depths.amplitude[key] < amp.cutoff;
        labels.phs[key] = depths.phase[key] < phs.cutoff;
        labels.ampSeverity[key] = labels.amp[key] ? severity(depths.amplitude[key], amp) : 0;
        labels.phsSeverity[key] = labels.phs[key] ? severity(depths.phase[key], phs) : 0;
    });
    return { labels, stats: { amp, phs } };
}

// Measurements in a legend category: 'normal', 'amplitude', 'phase' or 'both'.
export function idsInCategory(labels, category) {
    return Object.keys(labels.measurement).filter(key => {
        const amp = labels.amp[key];
        const phs = labels.phs[key];
        return {
            normal: !amp && !phs,
            amplitude: amp && !phs,
            phase: phs && !amp,
            both: amp && phs
        }[category];
    }).map(key => labels.measurement[key]);
}
