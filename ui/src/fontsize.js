// Keeps SVG text at the page font size (--font-size in main.css) however far
// the viewBox is scaled to fit its container.
const scaledSvgs = ['line-svg', 'graph-svg'];

export function syncSvgFontSize() {
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-size'));
    scaledSvgs.forEach(id => {
        const node = document.getElementById(id);
        const ctm = node && node.getScreenCTM();
        if (ctm && ctm.a) {
            node.style.setProperty('--svg-font-size', `${px / ctm.a}px`);
        }
    });
}

const observer = new ResizeObserver(syncSvgFontSize);
scaledSvgs.forEach(id => {
    const node = document.getElementById(id);
    if (node) observer.observe(node);
});
