import * as d3 from 'd3';
import { resetLineOpacity } from './lineplot.js';

// Measurements selected from the functions list or lassoed in the depth space.
let selected = new Set();

// Dims everything except the given measurements in all views. An empty list restores
// the defaults unless dimAll is set (e.g. while a lasso hasn't enclosed anything yet).
export function highlight(ids, dimAll = false) {
    if (!ids.length && !dimAll) {
        resetLineOpacity();
        d3.selectAll('.ds-circle').style('opacity', 0.8);
        d3.selectAll('.ds-text').style('opacity', 1);
        return;
    }
    const keep = new Set(ids);
    d3.selectAll('.focus .line, .context .line')
        .style('opacity', d => keep.has(d[0]) ? 1 : 0.1);
    d3.selectAll('.ds-circle')
        .style('opacity', d => keep.has(d.id) ? 0.8 : 0.1);
    d3.selectAll('.ds-text')
        .style('opacity', d => keep.has(d.id) ? 1 : 0.1);
}

export function getSelection() {
    return [...selected];
}

export function restoreSelection() {
    highlight(getSelection());
}

export function setSelection(ids) {
    selected = new Set(ids);
    document.querySelectorAll('.fs_option').forEach(fn => {
        fn.classList.toggle('active', selected.has(fn.textContent));
    });
    restoreSelection();
}

export function toggleSelection(id) {
    const ids = new Set(selected);
    ids.has(id) ? ids.delete(id) : ids.add(id);
    setSelection([...ids]);
}
