// N2.4t: accessibility – colour vision modes per user (protan / deutan / tritan / achromatopsia): ONE set of semantic colours
// (ok / warn / bad / info) and chart series as CSS variables, palettes from Okabe & Ito (2008) + a grey ramp; symbols (✓ ⚠ ✕ ★)
// so that nothing depends on colour alone. simulate() = Machado et al. (2009) matrices – used by the tests.
var KXA11y;
(function () {
    const MODES = ['NONE', 'PROTAN', 'DEUTAN', 'TRITAN', 'ACHROMA'];
    const PALETTES = { "NONE": { "ok": "#5fbf7f", "warn": "#e5c07b", "bad": "#e06c75", "info": "#61afef", "series": ["#61afef", "#5fbf7f", "#e5c07b", "#e06c75", "#c678dd", "#56b6c2", "#d19a66", "#abb2bf"] }, "PROTAN": { "ok": "#0072B2", "warn": "#F0E442", "bad": "#E69F00", "info": "#56B4E9", "series": ["#0072B2", "#E69F00", "#56B4E9", "#F0E442", "#CC79A7", "#009E73", "#000000", "#999999"] }, "DEUTAN": { "ok": "#0072B2", "warn": "#F0E442", "bad": "#D55E00", "info": "#56B4E9", "series": ["#0072B2", "#D55E00", "#56B4E9", "#F0E442", "#CC79A7", "#009E73", "#000000", "#999999"] }, "TRITAN": { "ok": "#009E73", "warn": "#CC79A7", "bad": "#D55E00", "info": "#000000", "series": ["#009E73", "#D55E00", "#CC79A7", "#000000", "#E69F00", "#999999", "#882255", "#44AA99"] }, "ACHROMA": { "ok": "#f2f2f2", "warn": "#9a9a9a", "bad": "#2b2b2b", "info": "#cfcfcf", "series": ["#000000", "#555555", "#888888", "#bbbbbb", "#dddddd", "#333333", "#777777", "#aaaaaa"] } };
    function apply(doc, mode) {
        const m = MODES.includes(mode) ? mode : 'NONE';
        const el = doc.documentElement;
        el.dataset.colorVision = m;
        const p = PALETTES[m];
        for (const k of ['ok', 'warn', 'bad', 'info'])
            el.style.setProperty('--kx-' + k, p[k]);
        p.series.forEach((c, i) => el.style.setProperty(`--kx-series-${i + 1}`, c));
        el.style.setProperty('--danger', p.bad);
        return m;
    }
    const M = { PROTAN: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], DEUTAN: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]], TRITAN: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]] };
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const rgb = (h) => { const x = h.replace('#', ''); const f = x.length === 3 ? x.split('').map(c => c + c).join('') : x; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)); };
    /* simulated linear RGB as seen with the given deficiency (ACHROMA → luminance only) */
    function simulate(hex, mode) { const l = rgb(hex).map(lin); if (mode === 'ACHROMA') {
        const y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
        return [y, y, y];
    } const m = M[mode]; if (!m)
        return l; return m.map((r) => Math.max(0, Math.min(1, r[0] * l[0] + r[1] * l[1] + r[2] * l[2]))); }
    /* perceptual-ish distance in simulated space (OKLab-free approximation: Euclidean on cube-root of linear RGB) */
    function distance(a, b, mode) { const A = simulate(a, mode).map((v) => Math.cbrt(v)), B = simulate(b, mode).map((v) => Math.cbrt(v)); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); }
    KXA11y = { MODES, PALETTES, apply, simulate, distance };
    globalThis.KXA11y = KXA11y;
})();
