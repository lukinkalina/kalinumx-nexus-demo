var KXTrackWork;
(function () {
    const OWNER = 'APP.KX.TIME';
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (v) => { const n = Number(String(v ?? '').replace(',', '.').trim()); return String(v ?? '').trim() === '' || !Number.isFinite(n) ? NaN : n; };
    /* Czech number format (decimal comma, thin grouping) for everything shown; calculations stay in plain numbers */
    /* shown with 4 significant digits (percentages 3) – enough for practice, calculations stay exact */
    const r = (x, d = 3) => Number.isFinite(x) ? Number(x.toPrecision(d + 1)).toLocaleString('cs-CZ', { maximumFractionDigits: 6 }) : '—';
    /* A1 Ohm: any two of U, I, R, P */
    function ohm(i) {
        let { U, I, R, P } = i;
        const has = (x) => Number.isFinite(x);
        const n = [U, I, R, P].filter(has).length;
        if (n < 2)
            throw new Error('TW_NEED_TWO');
        if (has(U) && has(I)) {
            R = U / I;
            P = U * I;
        }
        else if (has(U) && has(R)) {
            I = U / R;
            P = U * U / R;
        }
        else if (has(U) && has(P)) {
            I = P / U;
            R = U * U / P;
        }
        else if (has(I) && has(R)) {
            U = I * R;
            P = I * I * R;
        }
        else if (has(I) && has(P)) {
            U = P / I;
            R = P / (I * I);
        }
        else if (has(R) && has(P)) {
            U = Math.sqrt(P * R);
            I = Math.sqrt(P / R);
        }
        return { U, I, R, P };
    }
    /* A2 / A3 power and current; motor with efficiency η */
    function power(i) { const k = i.phase === 3 ? Math.sqrt(3) : 1; const eta = Number.isFinite(i.eta) && i.eta > 0 ? i.eta : 1; const I = i.P / (k * i.U * i.cos * eta); const S = k * i.U * I, Q = S * Math.sin(Math.acos(Math.min(1, Math.max(0, i.cos)))); return { I, S, Q }; }
    /* A4 voltage drop and the reverse: cross-section for an allowed % */
    const GAMMA = { Cu: 56, Al: 35 };
    function voltageDrop(i) { const g = GAMMA[i.mat]; if (!g)
        throw new Error('TW_MATERIAL'); const k = i.phase === 3 ? Math.sqrt(3) : 2; const dU = k * i.L * i.I * i.cos / (g * i.S); return { dU, pct: dU / i.U * 100 }; }
    function crossSection(i) { const g = GAMMA[i.mat]; if (!g)
        throw new Error('TW_MATERIAL'); const k = i.phase === 3 ? Math.sqrt(3) : 2; return k * i.L * i.I * i.cos / (g * (i.pct / 100 * i.U)); }
    /* ---- N2.3u: more Elektro calculators per the user's document ---- */
    const list = (s) => String(s ?? '').split(/[;\s]+/).map(x => num(x)).filter(Number.isFinite);
    function resistors(i) { const v = i.list.filter(x => x > 0); if (!v.length)
        throw new Error('TW_NEED_VALUES'); return { series: v.reduce((a, b) => a + b, 0), parallel: 1 / v.reduce((a, b) => a + 1 / b, 0) }; }
    function divider(i) { return i.Uin * i.R2 / (i.R1 + i.R2); }
    function ledResistor(i) { const I = i.mA / 1000; if (!(i.Us > i.Uled) || !(I > 0))
        throw new Error('TW_LED_RANGE'); const R = (i.Us - i.Uled) / I, P = (i.Us - i.Uled) * I; return { R, P, P2: 2 * P }; }
    const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
    function nextE24(R) { if (!(R > 0))
        return NaN; const d = Math.pow(10, Math.floor(Math.log10(R))); for (const m of [...E24, 10]) {
        const v = Number((m * d).toPrecision(3));
        if (v >= R * 0.9999)
            return v;
    } return 10 * d; }
    function capacitors(i) { const v = i.list.filter(x => x > 0); if (!v.length)
        throw new Error('TW_NEED_VALUES'); return { parallel: v.reduce((a, b) => a + b, 0), series: 1 / v.reduce((a, b) => a + 1 / b, 0) }; }
    function reactance(i) { return 1 / (2 * Math.PI * i.f * i.C); }
    function capCode(code) { const m = String(code || '').trim().toUpperCase().match(/^(\d)(\d)(\d)([JKM])?$/); if (!m)
        throw new Error('TW_CAP_CODE'); const pF = Number(m[1] + m[2]) * Math.pow(10, Number(m[3])); const tol = { J: '±5 %', K: '±10 %', M: '±20 %' }; return { pF, nF: pF / 1000, uF: pF / 1e6, tol: m[4] ? tol[m[4]] : '' }; }
    function battery(i) { const Wh = i.Ah * i.V; return { Wh, hours: Wh * i.DoD * i.eta / i.P }; }
    function heating(i) { const Q = i.litres * 4186 * i.dT; return { Q, seconds: Q / (i.P * i.eta) }; }
    function energyCost(i) { const E = i.kW * i.hours * i.days; return { E, cost: E * i.rate }; }
    function wire(i) { if (Number.isFinite(i.d))
        return { d: i.d, S: Math.PI * Math.pow(i.d, 2) / 4 }; if (Number.isFinite(i.S))
        return { S: i.S, d: Math.sqrt(4 * i.S / Math.PI) }; throw new Error('TW_NEED_VALUES'); }
    /* ---- N2.3u: schematics drawn as own SVG (IEC 60617 style symbols; ČSN wire colours L brown/black/grey, N blue, PE green-yellow) ---- */
    const C_L1 = '#8b5a2b', C_L2 = '#222', C_L3 = '#8a8f96', C_N = '#2f6fd6', C_PE = '#3a9a3a';
    const svgWrap = (w, h, inner, title) => `<figure class="kx-tw-fig"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial,sans-serif" font-size="13"><rect width="${w}" height="${h}" rx="10" fill="#fbfaf7"/>${inner}</svg><figcaption>${esc(title)}</figcaption></figure>`;
    function svgTerminalBoard(kind) {
        const xs = [60, 140, 220], top = ['U1', 'V1', 'W1'], bot = ['W2', 'U2', 'V2'], cols = [C_L1, C_L2, C_L3];
        let s = '';
        xs.forEach((x, i) => { s += `<line x1="${x}" y1="18" x2="${x}" y2="58" stroke="${cols[i]}" stroke-width="3"/><text x="${x + 6}" y="30" fill="#333">L${i + 1}</text>`; });
        s += `<rect x="30" y="60" width="220" height="120" rx="8" fill="#fff" stroke="#555"/>`;
        xs.forEach((x, i) => { s += `<circle cx="${x}" cy="85" r="10" fill="#e9e5d8" stroke="#333"/><text x="${x + 14}" y="78" fill="#111" font-weight="600">${top[i]}</text><circle cx="${x}" cy="150" r="10" fill="#e9e5d8" stroke="#333"/><text x="${x}" y="176" text-anchor="middle" fill="#111" font-weight="600">${bot[i]}</text>`; });
        if (kind === 'Y')
            s += `<rect x="52" y="144" width="176" height="12" rx="4" fill="#c9a24a" stroke="#7a5b17"/>`;
        else
            xs.forEach(x => { s += `<rect x="${x - 6}" y="85" width="12" height="65" rx="4" fill="#c9a24a" stroke="#7a5b17"/>`; });
        s += `<text x="270" y="95" fill="#111" font-size="22" font-weight="700">${kind === 'Y' ? 'Y' : 'Δ'}</text><text x="270" y="118" fill="#555">${esc(kind === 'Y' ? TL('tw.svg.yBridge', 'bridge W2–U2–V2') : TL('tw.svg.dBridges', 'bridges U1–W2, V1–U2, W1–V2'))}</text>`;
        return svgWrap(470, 200, s, kind === 'Y' ? TL('tw.svg.c1y', 'C1 – motor terminal board: star (Y)') : TL('tw.svg.c1d', 'C1 – motor terminal board: delta (Δ)'));
    }
    const contact = (x, y, nc, label) => `<line x1="${x}" y1="${y}" x2="${x + 14}" y2="${y}" stroke="#111" stroke-width="2"/><line x1="${x + 14}" y1="${y}" x2="${x + 34}" y2="${y - 12}" stroke="#111" stroke-width="2"/>${nc ? `<line x1="${x + 34}" y1="${y - 14}" x2="${x + 34}" y2="${y}" stroke="#111" stroke-width="2"/>` : ''}<line x1="${x + 34}" y1="${y}" x2="${x + 48}" y2="${y}" stroke="#111" stroke-width="2"/><text x="${x + 24}" y="${y + 18}" text-anchor="middle" fill="#111" font-size="11">${label}</text>`;
    function svgSelfHold() {
        let s = '';
        const y = 70;
        const W = '#111';
        s += `<text x="16" y="${y + 4}" fill="${C_L1}" font-weight="700">L</text><line x1="30" y1="${y}" x2="52" y2="${y}" stroke="${C_L1}" stroke-width="2"/>`;
        s += `<rect x="52" y="${y - 8}" width="34" height="16" fill="#fff" stroke="${W}" stroke-width="2"/><text x="69" y="${y + 28}" text-anchor="middle" font-size="11">F1</text><line x1="86" y1="${y}" x2="120" y2="${y}" stroke="${W}" stroke-width="2"/>`;
        s += contact(120, y, true, 'F2 95-96') + `<line x1="168" y1="${y}" x2="210" y2="${y}" stroke="${W}" stroke-width="2"/>` + contact(210, y, true, 'S0 STOP') + `<line x1="258" y1="${y}" x2="300" y2="${y}" stroke="${W}" stroke-width="2"/>`;
        s += contact(300, y, false, 'S1 START') + `<line x1="300" y1="${y}" x2="300" y2="${y + 56}" stroke="${W}" stroke-width="2"/>` + contact(300, y + 56, false, 'K1 13-14') + `<line x1="348" y1="${y + 56}" x2="348" y2="${y}" stroke="${W}" stroke-width="2"/><circle cx="300" cy="${y}" r="3"/><circle cx="348" cy="${y}" r="3"/>`;
        s += `<line x1="348" y1="${y}" x2="390" y2="${y}" stroke="${W}" stroke-width="2"/><rect x="390" y="${y - 12}" width="44" height="24" fill="#fff" stroke="${W}" stroke-width="2"/><text x="412" y="${y + 4}" text-anchor="middle" font-weight="700">K1</text><text x="386" y="${y - 18}" font-size="11">A1</text><text x="424" y="${y - 18}" font-size="11">A2</text>`;
        s += `<line x1="434" y1="${y}" x2="474" y2="${y}" stroke="${C_N}" stroke-width="2"/><text x="480" y="${y + 4}" fill="${C_N}" font-weight="700">N</text>`;
        s += `<text x="16" y="168" fill="#333" font-size="12">${esc(TL('tw.svg.c2power', 'Power circuit: L1 L2 L3 → Q1 → K1 → F2 → motor M'))}</text>`;
        s += `<text x="16" y="186" fill="#333" font-size="12">${esc(TL('tw.svg.c2func', 'START closes K1, 13-14 holds the coil; STOP or overload opens it.'))}</text>`;
        return svgWrap(720, 204, s, TL('tw.svg.c2', 'C2 – direct-on-line control circuit with self-hold'));
    }
    function svgSocketE() {
        let s = '';
        s += `<circle cx="130" cy="110" r="78" fill="#fff" stroke="#555" stroke-width="2"/><circle cx="130" cy="110" r="60" fill="#f1eee6" stroke="#999"/>`;
        s += `<rect x="124" y="46" width="12" height="22" rx="3" fill="${C_PE}" stroke="#1f5f1f"/><text x="146" y="62" fill="${C_PE}" font-weight="700">${esc(TL('tw.svg.pePin', 'PE (pin)'))}</text>`;
        s += `<circle cx="98" cy="118" r="9" fill="#333"/><text x="70" y="148" fill="${C_L1}" font-weight="700">L</text><circle cx="162" cy="118" r="9" fill="#333"/><text x="176" y="148" fill="${C_N}" font-weight="700">N</text>`;
        s += `<text x="230" y="90" fill="#333">${esc(TL('tw.svg.front', 'front view'))}</text><text x="230" y="112" fill="#333">${esc(TL('tw.svg.lLeft', 'L left, N right'))}</text><text x="230" y="134" fill="#333">${esc(TL('tw.svg.pe', 'pin = protective conductor PE'))}</text>`;
        return svgWrap(520, 210, s, TL('tw.svg.c10', 'C10 – 230 V socket (CZ type E)'));
    }
    /* ---- N2.3v: more schematics per the user's document ---- */
    const ln = (x1, y1, x2, y2, c = '#111', w = 2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`;
    const coil = (x, y, label) => `<rect x="${x}" y="${y - 12}" width="44" height="24" fill="#fff" stroke="#111" stroke-width="2"/><text x="${x + 22}" y="${y + 4}" text-anchor="middle" font-weight="700">${label}</text>`;
    function svgReversing() {
        let s = '';
        const y1 = 60, y2 = 150;
        s += `<text x="12" y="${y1 + 4}" fill="${C_L1}" font-weight="700">L</text>` + ln(26, y1, 40, y1, C_L1) + contact(40, y1, true, 'F2 95-96') + ln(88, y1, 110, y1) + contact(110, y1, true, 'S0 STOP') + ln(158, y1, 190, y1) + ln(190, y1, 190, y2);
        s += contact(190, y1, false, TL('tw.svg.s1fwd', 'S1 FWD')) + ln(190, y1, 190, y1 + 44) + contact(190, y1 + 44, false, 'K1 13-14') + ln(238, y1 + 44, 238, y1) + ln(238, y1, 270, y1) + contact(270, y1, true, 'K2 21-22') + ln(318, y1, 350, y1) + coil(350, y1, 'K1');
        s += contact(190, y2, false, TL('tw.svg.s2rev', 'S2 REV')) + ln(190, y2, 190, y2 + 44) + contact(190, y2 + 44, false, 'K2 13-14') + ln(238, y2 + 44, 238, y2) + ln(238, y2, 270, y2) + contact(270, y2, true, 'K1 21-22') + ln(318, y2, 350, y2) + coil(350, y2, 'K2');
        s += ln(394, y1, 430, y1, C_N) + ln(394, y2, 430, y2, C_N) + ln(430, y1, 430, y2, C_N) + `<text x="438" y="${(y1 + y2) / 2 + 4}" fill="${C_N}" font-weight="700">N</text>`;
        s += `<text x="12" y="232" font-size="12" fill="#333">${esc(TL('tw.svg.c3a', 'K1 forward: L1→U1, L2→V1, L3→W1 · K2 reverse: L1→W1, L2→V1, L3→U1 (two phases swapped)'))}</text>`;
        s += `<text x="12" y="250" font-size="12" fill="#333">${esc(TL('tw.svg.c3b', 'Electrical interlock: the NC contact of the other contactor in series with the coil – never both at once.'))}</text>`;
        return svgWrap(720, 266, s, TL('tw.svg.c3', 'C3 – motor reversing with interlock'));
    }
    function svgSteinmetz() {
        let s = '';
        s += `<polygon points="200,40 120,180 280,180" fill="#fff" stroke="#111" stroke-width="2"/>`;
        s += `<circle cx="200" cy="40" r="7" fill="#e9e5d8" stroke="#333"/><text x="212" y="36" font-weight="700">U1</text><circle cx="120" cy="180" r="7" fill="#e9e5d8" stroke="#333"/><text x="92" y="200" font-weight="700">V1</text><circle cx="280" cy="180" r="7" fill="#e9e5d8" stroke="#333"/><text x="290" y="200" font-weight="700">W1</text>`;
        s += ln(40, 40, 193, 40, C_L1, 3) + `<text x="20" y="44" fill="${C_L1}" font-weight="700">L</text>` + ln(40, 180, 113, 180, C_N, 3) + `<text x="20" y="184" fill="${C_N}" font-weight="700">N</text>`;
        s += ln(287, 180, 340, 180) + ln(340, 180, 340, 120) + `<line x1="328" y1="110" x2="352" y2="110" stroke="#111" stroke-width="3"/><line x1="328" y1="100" x2="352" y2="100" stroke="#111" stroke-width="3"/>` + ln(340, 100, 340, 40) + ln(340, 40, 207, 40);
        s += `<text x="360" y="108" font-weight="700">C</text><text x="360" y="128" font-size="12" fill="#333">≈ 70 µF / kW</text>`;
        s += `<text x="420" y="60" font-size="12" fill="#333">${esc(TL('tw.svg.c5a', 'Motor in Δ (plate 230/400 V)'))}</text><text x="420" y="80" font-size="12" fill="#333">${esc(TL('tw.svg.c5b', 'C between W1 and U1 → one direction'))}</text><text x="420" y="100" font-size="12" fill="#333">${esc(TL('tw.svg.c5c', 'C between W1 and V1 → opposite direction'))}</text><text x="420" y="120" font-size="12" fill="#333">${esc(TL('tw.svg.c5d', 'Power about 60–70 %, weaker start'))}</text>`;
        return svgWrap(720, 220, s, TL('tw.svg.c5', 'C5 – Steinmetz connection (3-phase motor on 230 V)'));
    }
    function svgStaircase() {
        let s = '';
        const sw = (x, label) => `<circle cx="${x}" cy="90" r="5" fill="#111"/><circle cx="${x + 40}" cy="70" r="4" fill="#fff" stroke="#111" stroke-width="2"/><circle cx="${x + 40}" cy="110" r="4" fill="#fff" stroke="#111" stroke-width="2"/><line x1="${x}" y1="90" x2="${x + 37}" y2="72" stroke="#111" stroke-width="2"/><text x="${x + 20}" y="140" text-anchor="middle" font-size="12">${label}</text>`;
        s += `<text x="12" y="94" fill="${C_L1}" font-weight="700">L</text>` + ln(26, 90, 110, 90, C_L1) + sw(110, TL('tw.svg.sw6a', 'switch no. 6'));
        s += ln(154, 70, 330, 70) + ln(154, 110, 330, 110) + `<text x="242" y="62" text-anchor="middle" font-size="11" fill="#555">${esc(TL('tw.svg.corr', 'traveller wires'))}</text>`;
        s += `<circle cx="374" cy="90" r="5" fill="#111"/><circle cx="334" cy="70" r="4" fill="#fff" stroke="#111" stroke-width="2"/><circle cx="334" cy="110" r="4" fill="#fff" stroke="#111" stroke-width="2"/><line x1="374" y1="90" x2="337" y2="108" stroke="#111" stroke-width="2"/><text x="354" y="140" text-anchor="middle" font-size="12">${esc(TL('tw.svg.sw6b', 'switch no. 6'))}</text>`;
        s += ln(374, 90, 460, 90) + `<circle cx="480" cy="90" r="20" fill="#fff" stroke="#111" stroke-width="2"/><line x1="466" y1="76" x2="494" y2="104" stroke="#111" stroke-width="2"/><line x1="494" y1="76" x2="466" y2="104" stroke="#111" stroke-width="2"/>` + ln(500, 90, 560, 90, C_N) + `<text x="566" y="94" fill="${C_N}" font-weight="700">N</text>`;
        s += `<text x="12" y="176" font-size="12" fill="#333">${esc(TL('tw.svg.c8a', 'Two control places: two switches no. 6 joined by two traveller wires. Always switch the phase, never N.'))}</text>`;
        return svgWrap(720, 196, s, TL('tw.svg.c8', 'C8 – staircase (two-way) switching no. 6'));
    }
    const SCHEMATICS = { C1: () => svgTerminalBoard('Y') + svgTerminalBoard('D'), C2: svgSelfHold, C3: svgReversing, C5: svgSteinmetz, C8: svgStaircase, C10: svgSocketE };
    /* section C: every '## Cx' block gets its own drawing first (when there is one) */
    function mdSchematics(body) { return body.split(/\n(?=## C\d+\.)/).map(b => { const m = b.match(/^## (C\d+)\./); const fig = m && SCHEMATICS[m[1]] ? SCHEMATICS[m[1]]() : ''; if (!fig)
        return md(b); const nl = b.indexOf('\n'); return md(b.slice(0, nl)) + fig + md(b.slice(nl + 1)); }).join(''); }
    /* ---- N2.3v: Elektro A5, A8–A10 per the user's document ---- */
    const CABLE_TABLE = [[1.5, 10, 'B10'], [2.5, 16, 'B16'], [4, 25, 'B20–B25'], [6, 32, 'B32'], [10, 50, 'B40–B50'], [16, 63, 'B63']];
    function cableAndBreaker(i) { const row = CABLE_TABLE.find(r => r[1] >= i.I); if (!row)
        throw new Error('TW_CABLE_RANGE'); const du = voltageDrop({ phase: i.phase, L: i.L, I: i.I, S: row[0], mat: 'Cu', cos: 1, U: i.U }); return { S: row[0], breaker: row[2], dU: du.dU, pct: du.pct }; }
    function inductors(i) { const v = i.list.filter(x => x > 0); if (!v.length)
        throw new Error('TW_NEED_VALUES'); return { series: v.reduce((a, b) => a + b, 0), parallel: 1 / v.reduce((a, b) => a + 1 / b, 0) }; }
    function inductive(i) { return 2 * Math.PI * i.f * i.L; }
    function resonance(i) { return 1 / (2 * Math.PI * Math.sqrt(i.L * i.C)); }
    function wheeler(i) { const r = i.r_mm / 25.4, l = i.l_mm / 25.4; return r * r * i.N * i.N / (9 * r + 10 * l); }
    function transformer(i) { const ratio = i.U1 / i.U2; const N2 = Number.isFinite(i.N1) ? i.N1 / ratio : NaN; const S = Number.isFinite(i.I2) ? i.U2 * i.I2 : NaN; return { ratio, N2, S, Sdesign: S * 1.2, Udc: i.U2 * Math.SQRT2 - 1.4 }; }
    function motor(i) {
        const In = power({ phase: i.phase, U: i.U, P: i.P_kW * 1000, cos: i.cos, eta: i.eta }).I;
        const ns = 60 * i.f / (i.poles / 2);
        return { In, M: 9550 * i.P_kW / i.n, ns, slip: (ns - i.n) / ns * 100, startMin: 5 * In, startMax: 8 * In, steinmetzC: 70 * i.P_kW, steinmetzStartMin: 2 * 70 * i.P_kW, steinmetzStartMax: 3 * 70 * i.P_kW };
    }
    /* ---- N2.3x: Voda calculators per the user's document 02 ---- */
    const V_RANGES = { INNER: [0.5, 1.5], DHW: [0.2, 0.5], SUCTION: [0.5, 1.0], DELIVERY: [1, 2], HEATING: [0.3, 1.0] };
    function continuity(i) {
        const A = (d) => Math.PI * Math.pow(d / 1000, 2) / 4;
        const has = (x) => Number.isFinite(x);
        if (has(i.Q_ls) && has(i.d_mm))
            return { Q_ls: i.Q_ls, d_mm: i.d_mm, v: i.Q_ls / 1000 / A(i.d_mm) };
        if (has(i.Q_ls) && has(i.v))
            return { Q_ls: i.Q_ls, v: i.v, d_mm: Math.sqrt(4 * i.Q_ls / 1000 / (Math.PI * i.v)) * 1000 };
        if (has(i.v) && has(i.d_mm))
            return { v: i.v, d_mm: i.d_mm, Q_ls: i.v * A(i.d_mm) * 1000 };
        throw new Error('TW_NEED_TWO');
    }
    function velocityVerdict(v, use) { const r = V_RANGES[use]; if (!r)
        return 'unknown'; return v < r[0] ? 'low' : v > r[1] ? 'high' : 'ok'; }
    function hydrostatic(i) { const dp = 0.1 * i.h; return { dp_bar: dp, kPa: dp * 100, floor: Number.isFinite(i.pIn) ? i.pIn - dp - (Number.isFinite(i.loss) ? i.loss : 0) : NaN }; }
    const ROUGH_MM = { PLASTIC: 0.007, COPPER: 0.0015, STEEL_NEW: 0.05, STEEL_OLD: 0.15 };
    const NU = { T10: 1.3e-6, T60: 0.47e-6 };
    function pipeLoss(i) {
        const d = i.d_mm / 1000, A = Math.PI * d * d / 4, v = i.Q_ls / 1000 / A, nu = NU[i.temp] || NU.T10, k = (ROUGH_MM[i.mat] ?? 0.007) / 1000, rho = 1000;
        const Re = v * d / nu;
        const lambda = Re < 2300 ? 64 / Re : 0.25 / Math.pow(Math.log10(k / (3.7 * d) + 5.74 / Math.pow(Re, 0.9)), 2);
        const dyn = rho * v * v / 2;
        const dpL = lambda * (i.L / d) * dyn, dpM = (Number.isFinite(i.zeta) ? i.zeta : 0) * dyn, dp = dpL + dpM;
        return { v, Re, lambda, laminar: Re < 2300, dp_kPa: dp / 1000, dp_bar: dp / 1e5, dp_m: dp / (rho * 9.81), perMeter_kPa: dpL / 1000 / i.L };
    }
    function pump(i) { const Ph = 1000 * 9.81 * (i.Q_ls / 1000) * i.H; return { Ph, P: Ph / i.eta }; }
    function expansionVessel(i) { if (!(i.pmax > i.p0))
        throw new Error('TW_PRESSURE_RANGE'); return i.V * i.e * (i.pmax + 1) / (i.pmax - i.p0); }
    function waterHeat(i) { const kWh = i.litres * i.dT / 860; const h = Number.isFinite(i.P_kW) && i.P_kW > 0 ? i.litres * i.dT / (860 * i.P_kW * (Number.isFinite(i.eta) && i.eta > 0 ? i.eta : 1)) : NaN; return { kWh, hours: h }; }
    function mixTemp(i) { return (i.m1 * i.t1 + i.m2 * i.t2) / (i.m1 + i.m2); }
    const ALPHA = { PPR: 0.15, PPR_STABI: 0.04, PEX: 0.18, PE: 0.2, CU: 0.017, STEEL: 0.012, MULTI: 0.025 };
    function thermalExpansion(i) { const a = ALPHA[i.mat]; if (a == null)
        throw new Error('TW_MATERIAL'); return a * i.L * i.dT; }
    function rainwater(i) { return i.area * i.mm * i.coef; }
    /* ---- N2.3y: welding calculators per the user's document 05 ---- */
    const WELD_K = { MMA: 0.8, MIG: 0.8, TIG: 0.6 };
    const WELD_A = { MMA: [30, 40], MIG: [40, 40], TIG_STEEL: [30, 40], TIG_AL: [40, 50] };
    function weldCurrent(i) { const r = WELD_A[i.method]; if (!r)
        throw new Error('TW_METHOD'); return { min: r[0] * i.mm, max: r[1] * i.mm }; }
    function migVoltage(I) { return 14 + 0.05 * I; }
    function heatInput(i) { const k = WELD_K[i.method]; if (k == null)
        throw new Error('TW_METHOD'); return k * i.U * i.I / (i.v_mms * 1000); }
    function carbonEquivalent(i) { const z = (x) => Number.isFinite(x) ? x : 0; const CE = i.C + i.Mn / 6 + (z(i.Cr) + z(i.Mo) + z(i.V)) / 5 + (z(i.Ni) + z(i.Cu)) / 15; return { CE, verdict: CE < 0.40 ? 'GOOD' : CE <= 0.45 ? 'PREHEAT_THICK' : 'PREHEAT' }; }
    function weldConsumption(i) { const A = i.a * i.a, vol = A * i.L_m * 1000, kg = vol * 0.00785 / 1000; const wire = kg / i.eff; const gas = Number.isFinite(i.flow) && Number.isFinite(i.minutes) ? i.flow * i.minutes : NaN; return { A, kg, wire, gas_l: gas, cylinders: gas / 10000 }; }
    function filletThroat(i) { return { a: Number.isFinite(i.z) ? 0.7 * i.z : NaN, recMin: Number.isFinite(i.tmin) ? 0.5 * i.tmin : NaN, recMax: Number.isFinite(i.tmin) ? 0.7 * i.tmin : NaN }; }
    /* ---- N2.3z: Odpady (document 03) and Zámečník (document 04) calculators ---- */
    const DRAIN_K = { HOME: 0.5, PUBLIC: 0.7, SHOWERS: 1.0, LAB: 1.2 };
    function wasteFlow(i) { const s = i.DU.reduce((a, b) => a + b, 0), mx = Math.max(0, ...i.DU); const q = i.K * Math.sqrt(s); return { sum: s, Qww: q, design: Math.max(q, mx), maxRule: q < mx }; }
    const STACK = [[70, 1.5], [80, 2.0], [100, 4.0], [125, 5.8], [150, 9.5]];
    /* stack by capacity, but never below DN 100 when a WC is connected (document: WC min. DN 100) */
    function stackFor(Q, DU = []) { const r = STACK.find(x => x[1] >= Q); const byQ = r ? r[0] : NaN; const wc = DU.some(d => d >= 1.8); return { dn: wc && Number.isFinite(byQ) ? Math.max(byQ, 100) : byQ, byQ, wcRule: wc && byQ < 100 }; }
    function manningFull(i) { const d = i.d_mm / 1000, R = d / 4, A = Math.PI * d * d / 4; const v = (1 / i.n) * Math.pow(R, 2 / 3) * Math.sqrt(i.slopePct / 100); return { v, Q_ls: v * A * 1000, selfCleaning: v >= 0.7 }; }
    function slopeDrop(i) { return i.L * i.pct / 100; }
    function rainRunoff(i) { return i.r * i.A * i.C; }
    function spindle(i) { const n = i.vc * 1000 / (Math.PI * i.D); const vf = Number.isFinite(i.z) && Number.isFinite(i.fz) ? n * i.z * i.fz : Number.isFinite(i.f) ? n * i.f : NaN; return { n, vf }; }
    function tapDrill(i) { return i.form ? i.D - 0.45 * i.P : i.D - i.P; }
    const DENS = { STEEL: 7850, STAINLESS: 7950, AL: 2700, CU: 8960, BRASS: 8550, BRONZE: 8800, CAST: 7200, PB: 11340, TI: 4500 };
    function stockMass(i) {
        const rho = DENS[i.mat];
        if (!rho)
            throw new Error('TW_MATERIAL');
        let A = 0;
        if (i.shape === 'ROD')
            A = Math.PI * Math.pow(i.d, 2) / 4;
        else if (i.shape === 'TUBE')
            A = Math.PI / 4 * (Math.pow(i.D, 2) - Math.pow(i.d, 2));
        else if (i.shape === 'PLATE')
            A = i.a * i.t;
        else
            throw new Error('TW_SHAPE');
        return A * i.L_mm * 1e-9 * rho;
    }
    function bendLength(i) { const BA = Math.PI * (i.r + i.k * i.t) * i.angle / 180; return { BA, L: i.a + i.b + BA }; }
    function boltTorque(i) { return i.K * i.F_kN * 1000 * i.d / 1000; }
    function boltClass(cls) { const m = String(cls || '').match(/^(\d+)\.(\d+)$/); if (!m)
        throw new Error('TW_BOLT_CLASS'); const X = Number(m[1]), Y = Number(m[2]); return { Rm: X * 100, Re: X * Y * 10 }; }
    function beamPoint(i) {
        const M = i.F_kN * i.L_m / 4;
        const sigma = Number.isFinite(i.W_cm3) ? M * 1e6 / (i.W_cm3 * 1e3) : NaN;
        const E = (Number.isFinite(i.E_GPa) ? i.E_GPa : 210) * 1e3;
        const f = Number.isFinite(i.I_cm4) ? i.F_kN * 1e3 * Math.pow(i.L_m * 1e3, 3) / (48 * E * i.I_cm4 * 1e4) : NaN;
        return { M_kNm: M, sigma_MPa: sigma, f_mm: f };
    }
    function stairs(i) { const s = 2 * i.h + i.b; return { step: s, ok: s >= 600 && s <= 650 }; }
    const STD = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];
    const TRADES = [['ELEKTRO', '⚡', '01'], ['INSTALACE', '💧', '02 + 03'], ['KOVO', '🔩', '04 + 05'], ['STAVBA', '🧱', '08'], ['TECHNIKA', '📡', '09'], ['PROVOZ', '🧰', '10'], ['DALSI', '➕', '06']];
    /* N2.3w: every trade shows its own document(s); two-document trades get a switch */
    const TRADE_DOCS = { INSTALACE: ['VODA', 'ODPADY'], KOVO: ['ZAMECNIK', 'SVARECI'], STAVBA: ['STAVBA'], TECHNIKA: ['TECHNIKA'], PROVOZ: ['PROVOZ'], DALSI: ['DALSI'] };
    /* a document without A–J: its own top headings become the sections; the safety block (## ⚠️ …) is shown on top */
    function genericSections(text) {
        const parts = {};
        let safety = '';
        const blocks = text.split(/\n(?=# )/);
        let n = 0;
        for (const b of blocks) {
            const m = b.match(/^# (.+)/);
            if (!m)
                continue;
            const sIdx = b.indexOf('## ⚠️');
            if (sIdx >= 0 && !safety) {
                const rest = b.slice(sIdx).split('\n');
                const end = rest.findIndex((l, i) => i > 0 && /^## /.test(l));
                safety = rest.slice(1, end > 0 ? end : undefined).join('\n');
            }
            n++;
            parts['S' + n] = { title: m[1].replace(/^\d+\s*[–-]\s*/, '').trim(), body: b.split('\n').slice(1).join('\n') };
        }
        return { parts, safety };
    }
    /* the user's markdown, rendered: headings, lists, tables, bold, code (escaped first – never raw HTML) */
    function md(src) {
        const out = [];
        let list = false, table = null;
        const flush = () => { if (list) {
            out.push('</ul>');
            list = false;
        } if (table) {
            out.push(`<table class="kx-calc-table">${table.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`);
            table = null;
        } };
        const inl = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
        let fence = null;
        for (const raw of src.split('\n')) {
            const l = raw.trimEnd(); /* fenced text drawings from the document keep their alignment */
            if (/^```/.test(l.trim())) {
                if (fence) {
                    out.push(`<pre class="kx-tw-pre">${esc(fence.join('\n'))}</pre>`);
                    fence = null;
                }
                else {
                    flush();
                    fence = [];
                }
                continue;
            }
            if (fence) {
                fence.push(raw);
                continue;
            }
            if (/^\|/.test(l)) {
                if (/^\|[\s:|-]+\|$/.test(l))
                    continue;
                if (list) {
                    out.push('</ul>');
                    list = false;
                }
                (table = table || []).push(l.replace(/^\||\|$/g, '').split('|').map(c => inl(c.trim())));
                continue;
            }
            if (table)
                flush();
            if (/^\s*[-*] /.test(l)) {
                if (!list) {
                    out.push('<ul>');
                    list = true;
                }
                out.push(`<li>${inl(l.replace(/^\s*[-*] /, ''))}</li>`);
                continue;
            }
            flush();
            if (/^### /.test(l))
                out.push(`<h4>${inl(l.slice(4))}</h4>`);
            else if (/^## /.test(l))
                out.push(`<h3>${inl(l.slice(3))}</h3>`);
            else if (l.trim() && l.trim() !== '---')
                out.push(`<p>${inl(l)}</p>`);
        }
        flush();
        return out.join('');
    }
    function sections(text) {
        const parts = {};
        let safety = '';
        const blocks = text.split(/\n(?=# )/);
        for (const b of blocks) {
            const m = b.match(/^# ([A-J])\. (.+)/);
            if (m)
                parts[m[1]] = { title: m[2].trim(), body: b.split('\n').slice(1).join('\n') };
            else {
                const s = b.indexOf('## ⚠️');
                if (s >= 0)
                    safety = b.slice(s).split('\n').slice(1).join('\n');
            }
        }
        return { parts, safety };
    }
    KXTrackWork = { OWNER, TRADE_DOCS, genericSections, wasteFlow, stackFor, manningFull, slopeDrop, rainRunoff, spindle, tapDrill, stockMass, bendLength, boltTorque, boltClass, beamPoint, stairs, DRAIN_K, STACK, DENS, weldCurrent, migVoltage, heatInput, carbonEquivalent, weldConsumption, filletThroat, WELD_K, WELD_A, continuity, velocityVerdict, hydrostatic, pipeLoss, pump, expansionVessel, waterHeat, mixTemp, thermalExpansion, rainwater, ROUGH_MM, ALPHA, V_RANGES, ohm, power, voltageDrop, crossSection, GAMMA, STD, md, sections, resistors, divider, ledResistor, nextE24, capacitors, reactance, capCode, battery, heating, energyCost, wire, cableAndBreaker, inductors, inductive, resonance, wheeler, transformer, motor, CABLE_TABLE, SCHEMATICS,
        TABS: [['TECH', TL('tw.tabTech', 'Trades')], ['CALC', TL('tw.tabCalc', 'Calculators')], ['JOBS', TL('tw.tabJobs', 'Jobs and tasks')], ['TIME', TL('tw.tabTime', 'Time and reports')]],
        CALCULATORS: [{ id: 'el.ohm', tab: 'TECH', box: 'el-ohm', tags: ['electro'] }, { id: 'el.p1', tab: 'TECH', box: 'el-p1', tags: ['electro', 'power'] }, { id: 'el.p3', tab: 'TECH', box: 'el-p3', tags: ['electro', 'power'] }, { id: 'el.du', tab: 'TECH', box: 'el-du', tags: ['electro', 'cable'] }, { id: 'el.res', tab: 'TECH', box: 'el-res', tags: ['electro', 'electronics'] }, { id: 'el.cap', tab: 'TECH', box: 'el-cap', tags: ['electro', 'electronics'] }, { id: 'el.bat', tab: 'TECH', box: 'el-bat', tags: ['electro', 'battery'] }, { id: 'el.heat', tab: 'TECH', box: 'el-heat', tags: ['electro', 'energy'] }, { id: 'el.cost', tab: 'TECH', box: 'el-cost', tags: ['electro', 'energy', 'price'] }, { id: 'el.wire', tab: 'TECH', box: 'el-wire', tags: ['electro', 'cable'] }, { id: 'el.cable', tab: 'TECH', box: 'el-cable', tags: ['electro', 'cable'] }, { id: 'el.motor', tab: 'TECH', box: 'el-motor', tags: ['electro', 'motor'] }, { id: 'el.ind', tab: 'TECH', box: 'el-ind', tags: ['electro', 'electronics'] }, { id: 'el.tr', tab: 'TECH', box: 'el-tr', tags: ['electro', 'power'] }, { id: 'w.flow', tab: 'TECH', box: 'w-flow', trade: 'INSTALACE', doc: 'VODA', tags: ['water', 'pipe'] }, { id: 'w.loss', tab: 'TECH', box: 'w-loss', trade: 'INSTALACE', doc: 'VODA', tags: ['water', 'pipe'] }, { id: 'w.pump', tab: 'TECH', box: 'w-pump', trade: 'INSTALACE', doc: 'VODA', tags: ['water', 'pump'] }, { id: 'w.exp', tab: 'TECH', box: 'w-exp', trade: 'INSTALACE', doc: 'VODA', tags: ['water', 'heating'] }, { id: 'w.heat', tab: 'TECH', box: 'w-heat', trade: 'INSTALACE', doc: 'VODA', tags: ['water', 'energy'] }, { id: 'w.therm', tab: 'TECH', box: 'w-therm', trade: 'INSTALACE', doc: 'VODA', tags: ['water', 'pipe'] }, { id: 'w.rain', tab: 'TECH', box: 'w-rain', trade: 'INSTALACE', doc: 'VODA', tags: ['water'] }, { id: 'w.hydro', tab: 'TECH', box: 'w-hydro', trade: 'INSTALACE', doc: 'VODA', tags: ['water', 'pressure'] }, { id: 's.cur', tab: 'TECH', box: 's-cur', trade: 'KOVO', doc: 'SVARECI', tags: ['welding'] }, { id: 's.heat', tab: 'TECH', box: 's-heat', trade: 'KOVO', doc: 'SVARECI', tags: ['welding', 'energy'] }, { id: 's.ce', tab: 'TECH', box: 's-ce', trade: 'KOVO', doc: 'SVARECI', tags: ['welding', 'material'] }, { id: 's.cons', tab: 'TECH', box: 's-cons', trade: 'KOVO', doc: 'SVARECI', tags: ['welding', 'material'] }, { id: 'o.flow', tab: 'TECH', box: 'o-flow', trade: 'INSTALACE', doc: 'ODPADY', tags: ['waste', 'pipe'] }, { id: 'o.slope', tab: 'TECH', box: 'o-slope', trade: 'INSTALACE', doc: 'ODPADY', tags: ['waste', 'pipe'] }, { id: 'o.rain', tab: 'TECH', box: 'o-rain', trade: 'INSTALACE', doc: 'ODPADY', tags: ['waste', 'water'] }, { id: 'z.cut', tab: 'TECH', box: 'z-cut', trade: 'KOVO', doc: 'ZAMECNIK', tags: ['machining'] }, { id: 'z.mass', tab: 'TECH', box: 'z-mass', trade: 'KOVO', doc: 'ZAMECNIK', tags: ['material'] }, { id: 'z.bend', tab: 'TECH', box: 'z-bend', trade: 'KOVO', doc: 'ZAMECNIK', tags: ['material'] }, { id: 'z.bolt', tab: 'TECH', box: 'z-bolt', trade: 'KOVO', doc: 'ZAMECNIK', tags: ['bolt'] }, { id: 'z.beam', tab: 'TECH', box: 'z-beam', trade: 'KOVO', doc: 'ZAMECNIK', tags: ['structure'] }],
        install() { return null; },
        async mountHub(root, core, opts) {
            const st = root.__tw || (root.__tw = { tab: globalThis.__KX_TW_LAST || 'TECH', trade: 'ELEKTRO', sec: 'A' }); /* N2.6b+: reopen the last tab (e.g. time reports) */
            const req = globalThis.KXHubTabRequest?.[OWNER];
            if (req && KXTrackWork.TABS.some(([k]) => k === req)) {
                st.tab = req;
                delete globalThis.KXHubTabRequest[OWNER];
            }
            /* a calculator opened from the registry jumps to its own trade / document */ const fc = globalThis.KXTrackWorkFocus;
            if (fc) {
                st.tab = 'TECH';
                st.trade = fc.trade || 'ELEKTRO';
                st.doc = fc.doc || '';
                st.sec = 'A';
                delete globalThis.KXTrackWorkFocus;
            }
            root.innerHTML = `<div data-tw-hub><div class="kx-print3d-tabs">${KXTrackWork.TABS.map(([k, l]) => `<button class="chip ${st.tab === k ? 'active' : ''}" data-tw-tab="${k}">${esc(l)}</button>`).join('')}<button class="icon-btn" data-kx-manual="HUB:APP.KX.TIME" title="📖">📖</button></div><div data-tw-body></div></div>`;
            root.querySelectorAll('[data-tw-tab]').forEach(b => b.onclick = () => { st.tab = globalThis.__KX_TW_LAST = b.dataset.twTab; void KXTrackWork.mountHub(root, core, opts); });
            const body = root.querySelector('[data-tw-body]');
            const again = () => void KXTrackWork.mountHub(root, core, opts);
            if (st.tab === 'TECH')
                return mountTech(body, st, again);
            if (st.tab === 'CALC') {
                body.innerHTML = `<p class="muted">${esc(TL('tw.calcIntro', 'All TrackWork calculators – also in the core window Kalkulačky a nástroje.'))}</p>${KXTrackWork.CALCULATORS.map((c) => `<button class="kx-calc-open" data-tw-calc="${esc(c.box)}"><b>${esc(TL('calc.' + c.id, c.id))}</b><small>${esc(TL('calc.' + c.id + '.desc', ''))}</small></button>`).join('')}`;
                body.querySelectorAll('[data-tw-calc]').forEach(b => b.onclick = () => { const c = KXTrackWork.CALCULATORS.find((x) => x.box === b.dataset.twCalc) || {}; st.tab = 'TECH'; st.trade = c.trade || 'ELEKTRO'; st.doc = c.doc || ''; st.sec = 'A'; again(); setTimeout(() => { const x = root.querySelector(`[data-calc-box="${b.dataset.twCalc}"]`); if (x) {
                    x.scrollIntoView({ block: 'center' });
                    x.classList.add('kx-flash');
                } }, 80); });
                return;
            }
            if (st.tab === 'JOBS') {
                let orders = [];
                try {
                    orders = core.shopOrders ? await core.shopOrders.list(opts.actorId) : [];
                }
                catch { }
                if (opts.filter)
                    orders = orders.filter(opts.filter);
                body.innerHTML = `<p class="muted">${esc(TL('tw.jobsIntro', 'Orders from the SHOP hub; tasks of an order appear in Můj den and in the Calendar.'))}</p>${orders.length ? `<table class="kx-calc-table" data-tw-jobs>${orders.map((o) => `<tr><td><b>${esc(o.data.name)}</b></td><td>${esc(o.data.quantity)} ks</td><td>${esc(o.data.dueDate)}</td><td>${esc(TL('shop.status.' + o.data.status, o.data.status))}</td><td>${(o.data.taskIds || []).length} ${esc(TL('shop.tasks', 'Tasks'))}</td></tr>`).join('')}</table>` : `<p class="muted" data-tw-jobs-empty>${esc(TL('shop.noOrders', 'No orders yet.'))}</p>`}`;
                return;
            }
            body.innerHTML = `<p class="muted" data-tw-time-planned>${esc(TL('tw.timePlanned', 'Time tracking and reports for jobs come in a later step (TrackWork stopwatches, rates, reports).'))}</p>`;
        } };
    function field(k, label, val = '', hint = '') { return `<label class="kx-calc-f">${esc(label)}<input data-tw-f="${k}" value="${esc(val)}" inputmode="decimal" placeholder="${esc(hint)}"></label>`; }
    function mountTech(body, st, again) {
        const T = globalThis.KXTechElektroCS;
        const parsed = T ? sections(T.text) : { parts: {}, safety: '' };
        const left = `<div class="kx-tw-trades">${TRADES.map(([k, ic, src]) => `<button class="kx-tree-row ${st.trade === k ? 'on' : ''}" data-tw-trade="${k}"><span>${ic}</span> ${esc(TL('tw.trade.' + k, k))}${k !== 'ELEKTRO' ? `<small class="kx-tree-r">${esc(src)}</small>` : ''}</button>`).join('')}</div>`;
        if (st.trade !== 'ELEKTRO') {
            const docs = TRADE_DOCS[st.trade] || [];
            const TT = globalThis.KXTechTradesCS || {};
            if (!st.doc || !docs.includes(st.doc))
                st.doc = docs[0];
            const doc = TT[st.doc];
            if (!doc) {
                body.innerHTML = `<div class="kx-tw">${left}<div class="kx-tw-main"><p class="muted" data-tw-trade-planned>${esc(TL('tw.tradePlanned', 'This trade is being prepared from the source document.'))}</p></div></div>`;
                bindTrades(body, st, again);
                return;
            }
            const ps = sections(doc.text);
            const useAJ = Object.keys(ps.parts).length >= 5;
            const P = useAJ ? ps : genericSections(doc.text);
            const keys = Object.keys(P.parts).sort();
            if (!st.sec || !P.parts[st.sec])
                st.sec = keys[0];
            const sec = P.parts[st.sec];
            body.innerHTML = `<div class="kx-tw">${left}<div class="kx-tw-main" data-tw-doc="${esc(st.doc)}">${docs.length > 1 ? `<div class="kx-print3d-tabs">${docs.map(d => `<button class="chip ${st.doc === d ? 'active' : ''}" data-tw-docsel="${esc(d)}">${esc(TL('tw.doc.' + d, d))}</button>`).join('')}</div>` : ''}
        ${P.safety ? `<div class="kx-tw-safety" data-tw-safety>⚠ ${md(P.safety)}</div>` : ''}
        <div class="kx-print3d-tabs">${keys.map(k => `<button class="chip ${st.sec === k ? 'active' : ''}" data-tw-sec="${esc(k)}">${useAJ ? esc(k) + ' · ' : ''}${esc(P.parts[k].title.replace(/\s*\(.*\)$/, ''))}</button>`).join('')}</div>
        <div class="kx-tw-sec" data-tw-section="${esc(st.sec)}">${st.doc === 'ODPADY' && st.sec === 'A' ? wasteCalcsHtml() + `<details class="kx-tw-src"><summary>${esc(TL('tw.allCalcs', 'All calculators from the document (formulas)'))}</summary>${md(sec?.body || '')}</details>` : st.doc === 'ZAMECNIK' && st.sec === 'A' ? lockCalcsHtml() + `<details class="kx-tw-src"><summary>${esc(TL('tw.allCalcs', 'All calculators from the document (formulas)'))}</summary>${md(sec?.body || '')}</details>` : st.doc === 'SVARECI' && st.sec === 'A' ? weldCalcsHtml() + `<details class="kx-tw-src"><summary>${esc(TL('tw.allCalcs', 'All calculators from the document (formulas)'))}</summary>${md(sec?.body || '')}</details>` : st.doc === 'VODA' && st.sec === 'A' ? waterCalcsHtml() + `<details class="kx-tw-src"><summary>${esc(TL('tw.allCalcs', 'All calculators from the document (formulas)'))}</summary>${md(sec?.body || '')}</details>` : md(sec?.body || '')}</div><p class="muted kx-tw-src-note">${esc(TL('tw.sourceNote', 'Source'))}: ${esc(doc.source)}</p></div></div>`;
            if (st.doc === 'VODA' && st.sec === 'A')
                bindWater(body);
            if (st.doc === 'SVARECI' && st.sec === 'A')
                bindWeld(body);
            if (st.doc === 'ODPADY' && st.sec === 'A')
                bindWaste(body);
            if (st.doc === 'ZAMECNIK' && st.sec === 'A')
                bindLock(body);
            bindTrades(body, st, again);
            body.querySelectorAll('[data-tw-sec]').forEach(b => b.onclick = () => { st.sec = b.dataset.twSec; again(); });
            body.querySelectorAll('[data-tw-docsel]').forEach(b => b.onclick = () => { st.doc = b.dataset.twDocsel; st.sec = ''; again(); });
            return;
        }
        const secs = 'ABCDEFGHIJ'.split('').filter(k => parsed.parts[k]);
        const calc = `<div class="kx-tw-calcs">
      <section class="kx-calc" data-calc-box="el-ohm"><h3>${esc(TL('calc.el.ohm', 'Ohm'))}</h3><div class="kx-calc-grid">${field('U', 'U [V]')}${field('I', 'I [A]')}${field('R', 'R [Ω]')}${field('P', 'P [W]')}</div><div class="kx-calc-res" data-tw-out="ohm"></div></section>
      <section class="kx-calc" data-calc-box="el-p1"><h3>${esc(TL('calc.el.p1', '1f'))}</h3><div class="kx-calc-grid">${field('p1P', 'P [W]')}${field('p1U', 'U [V]', 230)}${field('p1cos', 'cos φ', 1)}${field('p1eta', 'η (motor)', '', '1')}</div><div class="kx-calc-res" data-tw-out="p1"></div></section>
      <section class="kx-calc" data-calc-box="el-p3"><h3>${esc(TL('calc.el.p3', '3f'))}</h3><div class="kx-calc-grid">${field('p3P', 'P [W]')}${field('p3U', 'U [V]', 400)}${field('p3cos', 'cos φ', 0.85)}${field('p3eta', 'η (motor)', '', '1')}</div><div class="kx-calc-res" data-tw-out="p3"></div></section>
      <section class="kx-calc" data-calc-box="el-du"><h3>${esc(TL('calc.el.du', 'ΔU'))}</h3><div class="kx-calc-grid">${field('duL', 'L [m]')}${field('duI', 'I [A]')}${field('duS', 'S [mm²]', 2.5)}<label class="kx-calc-f">${esc(TL('tw.material', 'Material'))}<select data-tw-f="duMat"><option>Cu</option><option>Al</option></select></label><label class="kx-calc-f">${esc(TL('tw.phase', 'System'))}<select data-tw-f="duPh"><option value="1">1f</option><option value="3">3f</option></select></label>${field('duU', 'U [V]', 230)}${field('duCos', 'cos φ', 1)}${field('duMax', 'max ΔU %', 3)}</div><div class="kx-calc-res" data-tw-out="du"></div></section>
      <section class="kx-calc" data-calc-box="el-res"><h3>${esc(TL('calc.el.res', 'Resistors'))}</h3><div class="kx-calc-grid">${field('resList', 'R [Ω] (1k; 2,2k…)', '', '100; 220')}${field('dvU', 'U vstup [V]')}${field('dvR1', 'R1 [Ω]')}${field('dvR2', 'R2 [Ω]')}${field('ledUs', 'LED: zdroj [V]')}${field('ledU', 'LED: U [V]', '2')}${field('ledI', 'LED: I [mA]', '20')}</div><div class="kx-calc-res" data-tw-out="res"></div></section>
      <section class="kx-calc" data-calc-box="el-cap"><h3>${esc(TL('calc.el.cap', 'Capacitors'))}</h3><div class="kx-calc-grid">${field('capList', 'C [µF] (10; 22…)')}${field('xcF', 'f [Hz]', 50)}${field('xcC', 'C [µF]')}${field('rcR', 'R [Ω]')}<label class="kx-calc-f">${esc(TL('tw.capCode', 'Marking'))}<input data-tw-f="capCode" placeholder="104J"></label></div><div class="kx-calc-res" data-tw-out="cap"></div></section>
      <section class="kx-calc" data-calc-box="el-bat"><h3>${esc(TL('calc.el.bat', 'Battery'))}</h3><div class="kx-calc-grid">${field('batAh', 'Ah')}${field('batV', 'V', 12)}${field('batDoD', 'DoD (0–1)', 0.5)}${field('batEta', 'η (0–1)', 0.9)}${field('batP', 'P [W]')}</div><div class="kx-calc-res" data-tw-out="bat"></div></section>
      <section class="kx-calc" data-calc-box="el-heat"><h3>${esc(TL('calc.el.heat', 'Heating'))}</h3><div class="kx-calc-grid">${field('htL', 'voda [l]', 80)}${field('htT1', 'z [°C]', 10)}${field('htT2', 'na [°C]', 60)}${field('htP', 'P [W]', 2000)}${field('htEta', 'η (0–1)', 1)}</div><div class="kx-calc-res" data-tw-out="heat"></div></section>
      <section class="kx-calc" data-calc-box="el-cost"><h3>${esc(TL('calc.el.cost', 'Energy cost'))}</h3><div class="kx-calc-grid">${field('ecKW', 'P [kW]')}${field('ecH', 'h / den')}${field('ecD', TL('tw.f.days', 'days'), 30)}${field('ecRate', TL('tw.f.rate', 'CZK / kWh'), 6)}</div><div class="kx-calc-res" data-tw-out="cost"></div></section>
      <section class="kx-calc" data-calc-box="el-wire"><h3>${esc(TL('calc.el.wire', 'Wire'))}</h3><div class="kx-calc-grid">${field('wD', TL('tw.f.diameter', 'diameter d [mm]'))}${field('wS', TL('tw.f.section', 'cross-section S [mm²]'))}</div><div class="kx-calc-res" data-tw-out="wire"></div></section>
      <section class="kx-calc" data-calc-box="el-cable"><h3>${esc(TL('calc.el.cable', 'Cable and breaker'))}</h3><div class="kx-calc-grid">${field('cbI', 'I [A]')}${field('cbL', 'L [m]')}${field('cbU', 'U [V]', 230)}<label class="kx-calc-f">${esc(TL('tw.phase', 'System'))}<select data-tw-f="cbPh"><option value="1">1f</option><option value="3">3f</option></select></label></div><div class="kx-calc-res" data-tw-out="cable"></div><small class="muted">${esc(TL('tw.cableNote', 'Indicative – verify per CSN 33 2000-5-52 and 33 2000-4-43.'))}</small></section>
      <section class="kx-calc" data-calc-box="el-motor"><h3>${esc(TL('calc.el.motor', 'Motor'))}</h3><div class="kx-calc-grid">${field('mP', 'P [kW]')}${field('mU', 'U [V]', 400)}<label class="kx-calc-f">${esc(TL('tw.phase', 'System'))}<select data-tw-f="mPh"><option value="3">3f</option><option value="1">1f</option></select></label>${field('mCos', 'cos φ', 0.82)}${field('mEta', 'η', 0.85)}${field('mN', 'n [min⁻¹]', 1440)}${field('mF', 'f [Hz]', 50)}${field('mPoles', TL('tw.f.poles', 'poles'), 4)}</div><div class="kx-calc-res" data-tw-out="motor"></div></section>
      <section class="kx-calc" data-calc-box="el-ind"><h3>${esc(TL('calc.el.ind', 'Inductors'))}</h3><div class="kx-calc-grid">${field('lList', 'L [mH] (1; 2,2…)')}${field('lF', 'f [Hz]', 50)}${field('lL', 'L [mH]')}${field('lC', 'C [µF]')}${field('wR', 'r [mm]')}${field('wLen', TL('tw.f.coilLen', 'l [mm]'))}${field('wN', 'N')}</div><div class="kx-calc-res" data-tw-out="ind"></div></section>
      <section class="kx-calc" data-calc-box="el-tr"><h3>${esc(TL('calc.el.tr', 'Transformer'))}</h3><div class="kx-calc-grid">${field('tU1', 'U1 [V]', 230)}${field('tU2', 'U2 [V]', 12)}${field('tN1', 'N1')}${field('tI2', 'I2 [A]')}</div><div class="kx-calc-res" data-tw-out="tr"></div></section></div>`;
        const sec = parsed.parts[st.sec];
        body.innerHTML = `<div class="kx-tw">${left}<div class="kx-tw-main"><div class="kx-tw-safety" data-tw-safety>⚠ ${md(parsed.safety)}</div>
      <div class="kx-print3d-tabs">${secs.map(k => `<button class="chip ${st.sec === k ? 'active' : ''}" data-tw-sec="${k}">${k} · ${esc(parsed.parts[k].title.replace(/\s*\(.*\)$/, ''))}</button>`).join('')}</div>
      <div class="kx-tw-sec" data-tw-section="${esc(st.sec)}">${st.sec === 'C' ? mdSchematics(sec?.body || '') : st.sec === 'A' ? `${calc}<details class="kx-tw-src"><summary>${esc(TL('tw.allCalcs', 'All calculators from the document (formulas)'))}</summary>${md(sec?.body || '')}</details>` : md(sec?.body || '')}</div></div></div>`;
        bindTrades(body, st, again);
        body.querySelectorAll('[data-tw-sec]').forEach(b => b.onclick = () => { st.sec = b.dataset.twSec; again(); });
        if (st.sec !== 'A')
            return;
        const v = (k) => num(body.querySelector(`[data-tw-f="${k}"]`)?.value);
        const sv = (k) => body.querySelector(`[data-tw-f="${k}"]`)?.value;
        const out = (k, html) => { body.querySelector(`[data-tw-out="${k}"]`).innerHTML = html; };
        const upd = () => {
            try {
                const o = ohm({ U: v('U'), I: v('I'), R: v('R'), P: v('P') });
                out('ohm', `U ${r(o.U)} V · I ${r(o.I)} A · R ${r(o.R)} Ω · P ${r(o.P)} W`);
            }
            catch {
                out('ohm', esc(TL('tw.needTwo', 'Enter any two values.')));
            }
            for (const [k, ph] of [['p1', 1], ['p3', 3]]) {
                const P = v(k + 'P'), U = v(k + 'U'), c = v(k + 'cos'), e = v(k + 'eta');
                if ([P, U, c].every(Number.isFinite) && U > 0 && c > 0) {
                    const x = power({ phase: ph, U, P, cos: c, eta: e });
                    out(k, `I = <b>${r(x.I)} A</b> · S ${r(x.S)} VA · Q ${r(x.Q)} var`);
                }
                else
                    out(k, '');
            }
            const L = v('duL'), I = v('duI'), S = v('duS'), U = v('duU'), c = v('duCos'), mx = v('duMax'), ph = Number(sv('duPh')) === 3 ? 3 : 1, mat = sv('duMat') || 'Cu';
            if ([L, I, S, U, c].every(Number.isFinite) && S > 0 && U > 0) {
                const x = voltageDrop({ phase: ph, L, I, S, mat, cos: c, U });
                const need = Number.isFinite(mx) && mx > 0 ? crossSection({ phase: ph, L, I, mat, cos: c, U, pct: mx }) : NaN;
                const std = STD.find(s => s >= need);
                out('du', `ΔU = <b>${r(x.dU)} V</b> · ${r(x.pct, 2)} % ${Number.isFinite(mx) ? (x.pct <= mx ? '<span class="kx-ok">✓</span>' : '<span class="kx-bad">✗</span>') : ''}${Number.isFinite(need) ? ` · ${esc(TL('tw.needS', 'needed S'))} ≥ ${r(need)} mm² → <b>${std != null ? r(std) : '> 240'} mm²</b>` : ''}<br><small>${ph === 3 ? '√3' : '2'} · L · I · cos φ / (γ · S), γ ${mat} = ${GAMMA[mat]}</small>`);
            }
            else
                out('du', '');
            const sh = (k, html) => { const el = body.querySelector(`[data-tw-out="${k}"]`); if (el)
                el.innerHTML = html; };
            const fx = (k) => body.querySelector(`[data-tw-f="${k}"]`)?.value;
            {
                const parts = [];
                const rl = list(fx('resList'));
                if (rl.length) {
                    const x = resistors({ list: rl });
                    parts.push(`${esc(TL('tw.series', 'series'))} <b>${r(x.series)} Ω</b> · ${esc(TL('tw.parallel', 'parallel'))} <b>${r(x.parallel)} Ω</b>`);
                }
                const Uin = v('dvU'), R1 = v('dvR1'), R2 = v('dvR2');
                if ([Uin, R1, R2].every(Number.isFinite) && R1 + R2 > 0)
                    parts.push(`${esc(TL('tw.divider', 'divider'))} U<sub>out</sub> = <b>${r(divider({ Uin, R1, R2 }))} V</b>`);
                const Us = v('ledUs'), Ul = v('ledU'), Im = v('ledI');
                if ([Us, Ul, Im].every(Number.isFinite)) {
                    try {
                        const x = ledResistor({ Us, Uled: Ul, mA: Im });
                        parts.push(`LED: R = <b>${r(x.R)} Ω</b> → E24 <b>${r(nextE24(x.R))} Ω</b> · P ${r(x.P)} W → ${esc(TL('tw.pick', 'pick'))} ≥ <b>${r(x.P2)} W</b>`);
                    }
                    catch {
                        parts.push(esc(TL('err.TW_LED_RANGE', 'Supply must be above the LED voltage')));
                    }
                }
                sh('res', parts.join('<br>'));
            }
            {
                const parts = [];
                const cl = list(fx('capList'));
                if (cl.length) {
                    const x = capacitors({ list: cl });
                    parts.push(`${esc(TL('tw.parallel', 'parallel'))} <b>${r(x.parallel)} µF</b> · ${esc(TL('tw.series', 'series'))} <b>${r(x.series)} µF</b>`);
                }
                const f = v('xcF'), C = v('xcC'), R = v('rcR');
                if (Number.isFinite(f) && Number.isFinite(C) && f > 0 && C > 0)
                    parts.push(`X<sub>C</sub> = <b>${r(reactance({ f, C: C * 1e-6 }))} Ω</b>`);
                if (Number.isFinite(R) && Number.isFinite(C) && R > 0 && C > 0) {
                    const tau = R * C * 1e-6;
                    parts.push(`τ = <b>${r(tau)} s</b> · 5τ ${r(5 * tau)} s`);
                }
                const code = fx('capCode');
                if (code) {
                    try {
                        const x = capCode(code);
                        parts.push(`${esc(code.toUpperCase())} = <b>${r(x.pF)} pF</b> = ${r(x.nF)} nF = ${r(x.uF)} µF ${esc(x.tol)}`);
                    }
                    catch {
                        parts.push(esc(TL('err.TW_CAP_CODE', 'Use three digits, e.g. 104 or 472K')));
                    }
                }
                sh('cap', parts.join('<br>'));
            }
            {
                const Ah = v('batAh'), V = v('batV'), DoD = v('batDoD'), eta = v('batEta'), P = v('batP');
                if ([Ah, V, DoD, eta, P].every(Number.isFinite) && P > 0) {
                    const x = battery({ Ah, V, DoD, eta, P });
                    sh('bat', `<b>${r(x.Wh)} Wh</b> · ${esc(TL('tw.runtime', 'runtime'))} <b>${r(x.hours)} h</b>`);
                }
                else
                    sh('bat', '');
            }
            {
                const L = v('htL'), t1 = v('htT1'), t2 = v('htT2'), P = v('htP'), eta = v('htEta');
                if ([L, t1, t2, P, eta].every(Number.isFinite) && P > 0 && eta > 0) {
                    const x = heating({ litres: L, dT: t2 - t1, P, eta });
                    sh('heat', `Q = ${r(x.Q / 1e6)} MJ (${r(x.Q / 3.6e6)} kWh) · ${esc(TL('tw.time', 'time'))} <b>${r(x.seconds / 3600)} h</b>`);
                }
                else
                    sh('heat', '');
            }
            {
                const kW = v('ecKW'), h = v('ecH'), d = v('ecD'), rate = v('ecRate');
                if ([kW, h, d, rate].every(Number.isFinite)) {
                    const x = energyCost({ kW, hours: h, days: d, rate });
                    sh('cost', `<b>${r(x.E)} kWh</b> · <b>${r(x.cost)} ${esc(TL('tw.f.czk', 'CZK'))}</b>`);
                }
                else
                    sh('cost', '');
            }
            {
                const I = v('cbI'), L = v('cbL'), U = v('cbU'), ph = Number(sv('cbPh')) === 3 ? 3 : 1;
                if ([I, L, U].every(Number.isFinite) && I > 0) {
                    try {
                        const x = cableAndBreaker({ I, L, U, phase: ph });
                        sh('cable', `Cu <b>${r(x.S)} mm²</b> · ${esc(TL('tw.breaker', 'breaker'))} <b>${esc(x.breaker)}</b> · ΔU ${r(x.dU)} V = ${r(x.pct, 2)} %`);
                    }
                    catch {
                        sh('cable', esc(TL('err.TW_CABLE_RANGE', 'Above 63 A – design individually')));
                    }
                }
                else
                    sh('cable', '');
            }
            {
                const P = v('mP'), U = v('mU'), c = v('mCos'), e = v('mEta'), n = v('mN'), f = v('mF'), pl = v('mPoles'), ph = Number(sv('mPh')) === 1 ? 1 : 3;
                if ([P, U, c, e, n, f, pl].every(Number.isFinite) && P > 0 && n > 0 && pl >= 2) {
                    const x = motor({ P_kW: P, U, phase: ph, cos: c, eta: e, n, f, poles: pl });
                    sh('motor', `I<sub>n</sub> <b>${r(x.In)} A</b> · M <b>${r(x.M)} Nm</b> · n<sub>s</sub> ${r(x.ns)} · ${esc(TL('tw.slip', 'slip'))} ${r(x.slip, 2)} %<br>${esc(TL('tw.start', 'start'))} ${r(x.startMin)}–${r(x.startMax)} A (5–8× I<sub>n</sub>)${ph === 3 ? ` · Steinmetz C ≈ <b>${r(x.steinmetzC)} µF</b> (${esc(TL('tw.startCap', 'start'))} ${r(x.steinmetzStartMin)}–${r(x.steinmetzStartMax)} µF, ≥ 400 V AC)` : ''}`);
                }
                else
                    sh('motor', '');
            }
            {
                const parts = [];
                const ll = list(fx('lList'));
                if (ll.length) {
                    const x = inductors({ list: ll });
                    parts.push(`${esc(TL('tw.series', 'series'))} <b>${r(x.series)} mH</b> · ${esc(TL('tw.parallel', 'parallel'))} <b>${r(x.parallel)} mH</b>`);
                }
                const f = v('lF'), L = v('lL'), C = v('lC');
                if (Number.isFinite(f) && Number.isFinite(L) && f > 0 && L > 0)
                    parts.push(`X<sub>L</sub> = <b>${r(inductive({ f, L: L / 1000 }))} Ω</b>`);
                if (Number.isFinite(L) && Number.isFinite(C) && L > 0 && C > 0)
                    parts.push(`f<sub>0</sub> = <b>${r(resonance({ L: L / 1000, C: C * 1e-6 }))} Hz</b>`);
                const rr = v('wR'), ln = v('wLen'), N = v('wN');
                if ([rr, ln, N].every(Number.isFinite) && rr > 0 && ln > 0 && N > 0)
                    parts.push(`Wheeler: L ≈ <b>${r(wheeler({ r_mm: rr, l_mm: ln, N }))} µH</b>`);
                sh('ind', parts.join('<br>'));
            }
            {
                const U1 = v('tU1'), U2 = v('tU2'), N1 = v('tN1'), I2 = v('tI2');
                if (Number.isFinite(U1) && Number.isFinite(U2) && U1 > 0 && U2 > 0) {
                    const x = transformer({ U1, U2, N1, I2 });
                    sh('tr', `${esc(TL('tw.ratio', 'ratio'))} ${r(x.ratio)} : 1${Number.isFinite(x.N2) ? ` · N2 <b>${r(x.N2)}</b>` : ''}${Number.isFinite(x.S) ? ` · S ${r(x.S)} VA → ${esc(TL('tw.design', 'design'))} <b>${r(x.Sdesign)} VA</b>` : ''}<br>U<sub>DC</sub> ≈ <b>${r(x.Udc)} V</b> (${esc(TL('tw.bridge', 'bridge, no load'))})`);
                }
                else
                    sh('tr', '');
            }
            {
                const d = v('wD'), S = v('wS');
                if (Number.isFinite(d) || Number.isFinite(S)) {
                    const x = wire(Number.isFinite(d) ? { d } : { S });
                    sh('wire', `d <b>${r(x.d)} mm</b> ↔ S <b>${r(x.S)} mm²</b>`);
                }
                else
                    sh('wire', '');
            }
        };
        body.querySelectorAll('[data-tw-f]').forEach((x) => { x.oninput = upd; x.onchange = upd; });
        upd();
    }
    const opt = (k, list) => `<select data-tw-f="${k}">${list.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
    function waterCalcsHtml() {
        const T2 = (k, fb) => TL(k, fb);
        const uses = Object.keys(V_RANGES).map(k => [k, T2('tw.wuse.' + k, k)]);
        const mats = Object.keys(ROUGH_MM).map(k => [k, T2('tw.wmat.' + k, k)]);
        const alph = Object.keys(ALPHA).map(k => [k, T2('tw.walpha.' + k, k)]);
        return `<div class="kx-tw-calcs">
      <section class="kx-calc" data-calc-box="w-flow"><h3>${esc(T2('calc.w.flow', 'Flow'))}</h3><div class="kx-calc-grid">${field('wfQ', 'Q [l/s]')}${field('wfV', 'v [m/s]')}${field('wfD', 'd ' + T2('tw.f.inner', 'inner') + ' [mm]')}<label class="kx-calc-f">${esc(T2('tw.f.use', 'Use'))}${opt('wfUse', uses)}</label></div><div class="kx-calc-res" data-tw-out="wflow"></div></section>
      <section class="kx-calc" data-calc-box="w-loss"><h3>${esc(T2('calc.w.loss', 'Pressure loss'))}</h3><div class="kx-calc-grid">${field('wlQ', 'Q [l/s]')}${field('wlD', 'd ' + T2('tw.f.inner', 'inner') + ' [mm]')}${field('wlL', 'L [m]')}<label class="kx-calc-f">${esc(T2('tw.material', 'Material'))}${opt('wlMat', mats)}</label><label class="kx-calc-f">${esc(T2('tw.f.temp', 'Water'))}${opt('wlT', [['T10', '10 °C'], ['T60', '60 °C']])}</label>${field('wlZ', 'Σζ')}</div><div class="kx-calc-res" data-tw-out="wloss"></div></section>
      <section class="kx-calc" data-calc-box="w-hydro"><h3>${esc(T2('calc.w.hydro', 'Hydrostatic'))}</h3><div class="kx-calc-grid">${field('whH', 'h [m]')}${field('whP', 'p ' + T2('tw.f.entry', 'entry') + ' [bar]')}${field('whLoss', T2('tw.f.losses', 'losses') + ' [bar]')}</div><div class="kx-calc-res" data-tw-out="whydro"></div></section>
      <section class="kx-calc" data-calc-box="w-pump"><h3>${esc(T2('calc.w.pump', 'Pump'))}</h3><div class="kx-calc-grid">${field('wpQ', 'Q [l/s]')}${field('wpH', 'H [m]')}${field('wpEta', 'η', 0.5)}</div><div class="kx-calc-res" data-tw-out="wpump"></div></section>
      <section class="kx-calc" data-calc-box="w-exp"><h3>${esc(T2('calc.w.exp', 'Expansion vessel'))}</h3><div class="kx-calc-grid">${field('weV', 'V ' + T2('tw.f.system', 'system') + ' [l]')}<label class="kx-calc-f">e${opt('weE', [['0.0227', '≤ 70 °C · 0,0227'], ['0.029', '80 °C · 0,029'], ['0.036', '90 °C · 0,036']])}</label>${field('wePmax', 'p max [bar]', 2.5)}${field('weP0', 'p0 [bar]', 1.2)}</div><div class="kx-calc-res" data-tw-out="wexp"></div></section>
      <section class="kx-calc" data-calc-box="w-heat"><h3>${esc(T2('calc.w.heat', 'Water heating'))}</h3><div class="kx-calc-grid">${field('wwL', 'V [l]', 80)}${field('wwDt', 'Δt [K]', 40)}${field('wwP', 'P [kW]', 2)}${field('wwEta', 'η', 1)}${field('wmM1', 'm1 [l]')}${field('wmT1', 't1 [°C]')}${field('wmM2', 'm2 [l]')}${field('wmT2', 't2 [°C]')}</div><div class="kx-calc-res" data-tw-out="wheat"></div></section>
      <section class="kx-calc" data-calc-box="w-therm"><h3>${esc(T2('calc.w.therm', 'Thermal expansion'))}</h3><div class="kx-calc-grid"><label class="kx-calc-f">${esc(T2('tw.material', 'Material'))}${opt('wtMat', alph)}</label>${field('wtL', 'L [m]')}${field('wtDt', 'Δt [K]')}</div><div class="kx-calc-res" data-tw-out="wtherm"></div></section>
      <section class="kx-calc" data-calc-box="w-rain"><h3>${esc(T2('calc.w.rain', 'Rainwater'))}</h3><div class="kx-calc-grid">${field('wrA', 'A [m²]')}${field('wrMm', T2('tw.f.rain', 'rain') + ' [mm]')}<label class="kx-calc-f">${esc(T2('tw.f.roof', 'Roof'))}${opt('wrC', [['0.85', T2('tw.roof.tile', 'tile 0,8–0,9')], ['0.9', T2('tw.roof.metal', 'metal 0,9')], ['0.4', T2('tw.roof.green', 'green roof 0,3–0,5')]])}</label></div><div class="kx-calc-res" data-tw-out="wrain"></div></section></div>`;
    }
    function bindWater(body) {
        const v = (k) => num(body.querySelector(`[data-tw-f="${k}"]`)?.value);
        const sv = (k) => body.querySelector(`[data-tw-f="${k}"]`)?.value;
        const sh = (k, h) => { const e = body.querySelector(`[data-tw-out="${k}"]`); if (e)
            e.innerHTML = h; };
        const upd = () => {
            {
                const Q = v('wfQ'), vv = v('wfV'), d = v('wfD');
                const n = [Q, vv, d].filter(Number.isFinite).length;
                if (n >= 2) {
                    try {
                        const x = continuity({ Q_ls: Q, v: vv, d_mm: d });
                        const verdict = velocityVerdict(x.v, sv('wfUse'));
                        const rg = V_RANGES[sv('wfUse')];
                        sh('wflow', `Q <b>${r(x.Q_ls)} l/s</b> · v <b>${r(x.v)} m/s</b> · d <b>${r(x.d_mm)} mm</b><br><span class="${verdict === 'ok' ? 'kx-ok' : 'kx-bad'}">${esc(TL('tw.v.' + verdict, verdict))}</span> (${r(rg[0])}–${r(rg[1])} m/s)`);
                    }
                    catch {
                        sh('wflow', '');
                    }
                }
                else
                    sh('wflow', esc(TL('tw.needTwo', 'Enter any two values.')));
            }
            {
                const Q = v('wlQ'), d = v('wlD'), L = v('wlL'), z = v('wlZ');
                if ([Q, d, L].every(Number.isFinite) && Q > 0 && d > 0 && L > 0) {
                    const x = pipeLoss({ Q_ls: Q, d_mm: d, L, mat: sv('wlMat'), temp: sv('wlT'), zeta: z });
                    sh('wloss', `Δp <b>${r(x.dp_kPa)} kPa</b> = ${r(x.dp_bar)} bar = ${r(x.dp_m)} m · ${r(x.perMeter_kPa)} kPa/m<br><small>v ${r(x.v)} m/s · Re ${r(x.Re)} (${esc(TL(x.laminar ? 'tw.laminar' : 'tw.turbulent', ''))}) · λ ${r(x.lambda)}</small>`);
                }
                else
                    sh('wloss', '');
            }
            {
                const h = v('whH'), p = v('whP'), l = v('whLoss');
                if (Number.isFinite(h)) {
                    const x = hydrostatic({ h, pIn: p, loss: l });
                    sh('whydro', `${r(x.dp_bar)} bar (${r(x.kPa)} kPa)${Number.isFinite(x.floor) ? ` · ${esc(TL('tw.floorP', 'pressure on the floor'))} <b>${r(x.floor)} bar</b>` : ''}`);
                }
                else
                    sh('whydro', '');
            }
            {
                const Q = v('wpQ'), H = v('wpH'), e = v('wpEta');
                if ([Q, H, e].every(Number.isFinite) && e > 0) {
                    const x = pump({ Q_ls: Q, H, eta: e });
                    sh('wpump', `P<sub>h</sub> ${r(x.Ph)} W · ${esc(TL('tw.input', 'input'))} <b>${r(x.P)} W</b>`);
                }
                else
                    sh('wpump', '');
            }
            {
                const V = v('weV'), e = Number(sv('weE')), pm = v('wePmax'), p0 = v('weP0');
                if ([V, pm, p0].every(Number.isFinite)) {
                    try {
                        sh('wexp', `V<sub>e</sub> ≈ <b>${r(expansionVessel({ V, e, pmax: pm, p0 }))} l</b>`);
                    }
                    catch {
                        sh('wexp', esc(TL('err.TW_PRESSURE_RANGE', 'p max must be above p0')));
                    }
                }
                else
                    sh('wexp', '');
            }
            {
                const parts = [];
                const L = v('wwL'), dt = v('wwDt'), P = v('wwP'), e = v('wwEta');
                if ([L, dt].every(Number.isFinite)) {
                    const x = waterHeat({ litres: L, dT: dt, P_kW: P, eta: e });
                    parts.push(`<b>${r(x.kWh)} kWh</b>${Number.isFinite(x.hours) ? ` · ${esc(TL('tw.time', 'time'))} <b>${r(x.hours)} h</b>` : ''}`);
                }
                const m1 = v('wmM1'), t1 = v('wmT1'), m2 = v('wmM2'), t2 = v('wmT2');
                if ([m1, t1, m2, t2].every(Number.isFinite) && m1 + m2 > 0)
                    parts.push(`${esc(TL('tw.mix', 'mixed'))} <b>${r(mixTemp({ m1, t1, m2, t2 }))} °C</b>`);
                sh('wheat', parts.join('<br>'));
            }
            {
                const L = v('wtL'), dt = v('wtDt');
                if ([L, dt].every(Number.isFinite)) {
                    sh('wtherm', `ΔL <b>${r(thermalExpansion({ mat: sv('wtMat'), L, dT: dt }))} mm</b>`);
                }
                else
                    sh('wtherm', '');
            }
            {
                const A = v('wrA'), mm = v('wrMm');
                if ([A, mm].every(Number.isFinite)) {
                    sh('wrain', `<b>${r(rainwater({ area: A, mm, coef: Number(sv('wrC')) }))} l</b>`);
                }
                else
                    sh('wrain', '');
            }
        };
        body.querySelectorAll('[data-tw-f]').forEach((x) => { x.oninput = upd; x.onchange = upd; });
        upd();
    }
    function weldCalcsHtml() {
        const T2 = (k, fb) => TL(k, fb);
        const meth = Object.keys(WELD_A).map(k => [k, T2('tw.weld.' + k, k)]);
        const methK = Object.keys(WELD_K).map(k => [k, T2('tw.weldk.' + k, k)]);
        return `<div class="kx-tw-calcs">
      <section class="kx-calc" data-calc-box="s-cur"><h3>${esc(T2('calc.s.cur', 'Current'))}</h3><div class="kx-calc-grid"><label class="kx-calc-f">${esc(T2('tw.f.method', 'Method'))}${opt('scM', meth)}</label>${field('scMm', T2('tw.f.weldMm', 'mm'))}${field('scI', T2('tw.f.migI', 'MIG/MAG I [A]'))}</div><div class="kx-calc-res" data-tw-out="scur"></div></section>
      <section class="kx-calc" data-calc-box="s-heat"><h3>${esc(T2('calc.s.heat', 'Heat input'))}</h3><div class="kx-calc-grid"><label class="kx-calc-f">${esc(T2('tw.f.method', 'Method'))}${opt('shM', methK)}</label>${field('shU', 'U [V]')}${field('shI', 'I [A]')}${field('shV', 'v [mm/s]')}</div><div class="kx-calc-res" data-tw-out="sheat"></div></section>
      <section class="kx-calc" data-calc-box="s-ce"><h3>${esc(T2('calc.s.ce', 'Carbon equivalent'))}</h3><div class="kx-calc-grid">${field('seC', 'C %')}${field('seMn', 'Mn %')}${field('seCr', 'Cr %')}${field('seMo', 'Mo %')}${field('seV', 'V %')}${field('seNi', 'Ni %')}${field('seCu', 'Cu %')}</div><div class="kx-calc-res" data-tw-out="sce"></div></section>
      <section class="kx-calc" data-calc-box="s-cons"><h3>${esc(T2('calc.s.cons', 'Consumption'))}</h3><div class="kx-calc-grid">${field('soA', 'a [mm]')}${field('soL', 'L [m]')}${field('soEff', T2('tw.f.eff', 'efficiency'), 0.92)}${field('soFlow', T2('tw.f.gasFlow', 'gas [l/min]'))}${field('soMin', T2('tw.f.arcMin', 'arc time [min]'))}${field('soZ', 'z [mm]')}${field('soT', 't min [mm]')}</div><div class="kx-calc-res" data-tw-out="scons"></div></section></div>`;
    }
    function bindWeld(body) {
        const v = (k) => num(body.querySelector(`[data-tw-f="${k}"]`)?.value);
        const sv = (k) => body.querySelector(`[data-tw-f="${k}"]`)?.value;
        const sh = (k, h) => { const e = body.querySelector(`[data-tw-out="${k}"]`); if (e)
            e.innerHTML = h; };
        const upd = () => {
            {
                const parts = [];
                const mm = v('scMm');
                if (Number.isFinite(mm) && mm > 0) {
                    const x = weldCurrent({ method: sv('scM'), mm });
                    parts.push(`I ≈ <b>${r(x.min)}${x.max !== x.min ? `–${r(x.max)}` : ''} A</b>`);
                }
                const I = v('scI');
                if (Number.isFinite(I) && I > 0)
                    parts.push(`MIG/MAG U ≈ <b>${r(migVoltage(I))} V</b>`);
                sh('scur', parts.join('<br>'));
            }
            {
                const U = v('shU'), I = v('shI'), vv = v('shV');
                if ([U, I, vv].every(Number.isFinite) && vv > 0) {
                    sh('sheat', `Q = <b>${r(heatInput({ method: sv('shM'), U, I, v_mms: vv }))} kJ/mm</b> (k ${r(WELD_K[sv('shM')])})`);
                }
                else
                    sh('sheat', '');
            }
            {
                const C = v('seC'), Mn = v('seMn');
                if ([C, Mn].every(Number.isFinite)) {
                    const x = carbonEquivalent({ C, Mn, Cr: v('seCr'), Mo: v('seMo'), V: v('seV'), Ni: v('seNi'), Cu: v('seCu') });
                    sh('sce', `CE = <b>${r(x.CE)}</b> · <span class="${x.verdict === 'GOOD' ? 'kx-ok' : 'kx-bad'}">${esc(TL('tw.ce.' + x.verdict, x.verdict))}</span>`);
                }
                else
                    sh('sce', '');
            }
            {
                const parts = [];
                const a = v('soA'), L = v('soL'), eff = v('soEff');
                if ([a, L, eff].every(Number.isFinite) && eff > 0) {
                    const x = weldConsumption({ a, L_m: L, eff, flow: v('soFlow'), minutes: v('soMin') });
                    parts.push(`${esc(TL('tw.weldMass', 'weld'))} <b>${r(x.kg)} kg</b> · ${esc(TL('tw.wire', 'wire'))} <b>${r(x.wire)} kg</b>${Number.isFinite(x.gas_l) ? ` · ${esc(TL('tw.gas', 'gas'))} <b>${r(x.gas_l)} l</b> (${r(x.cylinders)} × 50 l / 200 bar)` : ''}`);
                }
                const z = v('soZ'), t = v('soT');
                if (Number.isFinite(z) || Number.isFinite(t)) {
                    const x = filletThroat({ z, tmin: t });
                    parts.push(`${Number.isFinite(x.a) ? `a ≈ <b>${r(x.a)} mm</b>` : ''}${Number.isFinite(x.recMin) ? ` · ${esc(TL('tw.rec', 'recommended'))} a ${r(x.recMin)}–${r(x.recMax)} mm` : ''}`);
                }
                sh('scons', parts.join('<br>'));
            }
        };
        body.querySelectorAll('[data-tw-f]').forEach((x) => { x.oninput = upd; x.onchange = upd; });
        upd();
    }
    function wasteCalcsHtml() {
        const T2 = (k, fb) => TL(k, fb);
        const ks = Object.keys(DRAIN_K).map(k => [String(DRAIN_K[k]), T2('tw.drainK.' + k, k)]);
        return `<div class="kx-tw-calcs">
      <section class="kx-calc" data-calc-box="o-flow"><h3>${esc(T2('calc.o.flow', 'Waste flow'))}</h3><div class="kx-calc-grid"><label class="kx-calc-f">K${opt('ofK', ks)}</label>${field('ofDU', 'DU [l/s] (0,5; 2…)')}</div><div class="kx-calc-res" data-tw-out="oflow"></div></section>
      <section class="kx-calc" data-calc-box="o-slope"><h3>${esc(T2('calc.o.slope', 'Horizontal pipe'))}</h3><div class="kx-calc-grid">${field('osD', 'DN [mm]', 100)}${field('osPct', T2('tw.f.slope', 'slope') + ' [%]', 2)}<label class="kx-calc-f">n${opt('osN', [['0.01', 'PVC / PP 0,010'], ['0.012', T2('tw.n.clay', 'clay 0,012')], ['0.014', T2('tw.n.concrete', 'concrete 0,014')]])}</label>${field('osL', 'L [m]')}</div><div class="kx-calc-res" data-tw-out="oslope"></div></section>
      <section class="kx-calc" data-calc-box="o-rain"><h3>${esc(T2('calc.o.rain', 'Rain runoff'))}</h3><div class="kx-calc-grid">${field('orR', 'r [l/s·m²]', 0.03)}${field('orA', 'A [m²]')}<label class="kx-calc-f">C${opt('orC', [['1', T2('tw.c.pitched', 'pitched 1,0')], ['0.8', T2('tw.c.flat', 'flat 0,8')], ['0.4', T2('tw.c.green', 'green 0,3–0,5')]])}</label></div><div class="kx-calc-res" data-tw-out="orain"></div></section></div>`;
    }
    function bindWaste(body) {
        const v = (k) => num(body.querySelector(`[data-tw-f="${k}"]`)?.value);
        const sv = (k) => body.querySelector(`[data-tw-f="${k}"]`)?.value;
        const fx = (k) => body.querySelector(`[data-tw-f="${k}"]`)?.value;
        const sh = (k, h) => { const e = body.querySelector(`[data-tw-out="${k}"]`); if (e)
            e.innerHTML = h; };
        const upd = () => {
            {
                const du = list(fx('ofDU'));
                if (du.length) {
                    const x = wasteFlow({ K: Number(sv('ofK')), DU: du });
                    const st = stackFor(x.design, du);
                    const dn = st.dn;
                    sh('oflow', `ΣDU ${r(x.sum)} · Q<sub>ww</sub> ${r(x.Qww)} l/s${x.maxRule ? ` → ${esc(TL('tw.maxDU', 'largest DU'))}` : ''} · ${esc(TL('tw.design', 'design'))} <b>${r(x.design)} l/s</b>${Number.isFinite(dn) ? ` · ${esc(TL('tw.stack', 'stack'))} ≥ <b>DN ${dn}</b>${st.wcRule ? ` (${esc(TL('tw.wcRule', 'WC connected – min. DN 100'))})` : ''}` : ''}`);
                }
                else
                    sh('oflow', '');
            }
            {
                const d = v('osD'), pc = v('osPct'), L = v('osL');
                if ([d, pc].every(Number.isFinite) && d > 0 && pc > 0) {
                    const x = manningFull({ d_mm: d, slopePct: pc, n: Number(sv('osN')) });
                    sh('oslope', `v <b>${r(x.v)} m/s</b> <span class="${x.selfCleaning ? 'kx-ok' : 'kx-bad'}">${esc(TL(x.selfCleaning ? 'tw.selfClean' : 'tw.notSelfClean', ''))}</span> · Q<sub>${esc(TL('tw.full', 'full'))}</sub> ${r(x.Q_ls)} l/s${Number.isFinite(L) ? ` · ${esc(TL('tw.drop', 'height difference'))} <b>${r(slopeDrop({ L, pct: pc }) * 100)} cm</b>` : ''}`);
                }
                else
                    sh('oslope', '');
            }
            {
                const rr = v('orR'), A = v('orA');
                if ([rr, A].every(Number.isFinite)) {
                    sh('orain', `Q<sub>r</sub> <b>${r(rainRunoff({ r: rr, A, C: Number(sv('orC')) }))} l/s</b>`);
                }
                else
                    sh('orain', '');
            }
        };
        body.querySelectorAll('[data-tw-f]').forEach((x) => { x.oninput = upd; x.onchange = upd; });
        upd();
    }
    function lockCalcsHtml() {
        const T2 = (k, fb) => TL(k, fb);
        const mats = Object.keys(DENS).map(k => [k, T2('tw.dens.' + k, k)]);
        return `<div class="kx-tw-calcs">
      <section class="kx-calc" data-calc-box="z-cut"><h3>${esc(T2('calc.z.cut', 'Speeds'))}</h3><div class="kx-calc-grid">${field('zcVc', 'v<sub>c</sub> [m/min]')}${field('zcD', 'D [mm]')}${field('zcF', 'f [mm/ot]')}${field('ztD', T2('tw.f.thread', 'thread') + ' D [mm]')}${field('ztP', 'P [mm]')}</div><div class="kx-calc-res" data-tw-out="zcut"></div></section>
      <section class="kx-calc" data-calc-box="z-mass"><h3>${esc(T2('calc.z.mass', 'Mass'))}</h3><div class="kx-calc-grid"><label class="kx-calc-f">${esc(T2('tw.material', 'Material'))}${opt('zmMat', mats)}</label><label class="kx-calc-f">${esc(T2('tw.f.shape', 'Shape'))}${opt('zmShape', [['ROD', T2('tw.shape.ROD', 'rod')], ['TUBE', T2('tw.shape.TUBE', 'tube')], ['PLATE', T2('tw.shape.PLATE', 'plate')]])}</label>${field('zmL', 'L [mm]', 1000)}${field('zmD', 'D / a [mm]')}${field('zmd', 'd / t [mm]')}</div><div class="kx-calc-res" data-tw-out="zmass"></div></section>
      <section class="kx-calc" data-calc-box="z-bend"><h3>${esc(T2('calc.z.bend', 'Bend'))}</h3><div class="kx-calc-grid">${field('zbA', 'a [mm]')}${field('zbB', 'b [mm]')}${field('zbR', 'r [mm]')}${field('zbT', 't [mm]')}${field('zbK', 'k', 0.4)}${field('zbAng', 'α [°]', 90)}</div><div class="kx-calc-res" data-tw-out="zbend"></div></section>
      <section class="kx-calc" data-calc-box="z-bolt"><h3>${esc(T2('calc.z.bolt', 'Bolts'))}</h3><div class="kx-calc-grid"><label class="kx-calc-f">${esc(T2('tw.f.class', 'Class'))}<input data-tw-f="zbCls" placeholder="8.8"></label>${field('zbF', 'F [kN]')}${field('zbd', 'd [mm]')}${field('zbKk', 'K', 0.2)}</div><div class="kx-calc-res" data-tw-out="zbolt"></div></section>
      <section class="kx-calc" data-calc-box="z-beam"><h3>${esc(T2('calc.z.beam', 'Beam'))}</h3><div class="kx-calc-grid">${field('zeF', 'F [kN]')}${field('zeL', 'L [m]')}${field('zeW', 'W [cm³]')}${field('zeI', 'I [cm⁴]')}${field('zsH', T2('tw.f.stepH', 'step h') + ' [mm]')}${field('zsB', T2('tw.f.stepB', 'step b') + ' [mm]')}</div><div class="kx-calc-res" data-tw-out="zbeam"></div><small class="muted">${esc(T2('tw.beamNote', 'Indicative – structural design is for a structural engineer.'))}</small></section></div>`;
    }
    function bindLock(body) {
        const v = (k) => num(body.querySelector(`[data-tw-f="${k}"]`)?.value);
        const sv = (k) => body.querySelector(`[data-tw-f="${k}"]`)?.value;
        const fx = (k) => body.querySelector(`[data-tw-f="${k}"]`)?.value;
        const sh = (k, h) => { const e = body.querySelector(`[data-tw-out="${k}"]`); if (e)
            e.innerHTML = h; };
        const upd = () => {
            {
                const parts = [];
                const vc = v('zcVc'), D = v('zcD'), f = v('zcF');
                if ([vc, D].every(Number.isFinite) && D > 0) {
                    const x = spindle({ vc, D, f });
                    parts.push(`n <b>${r(x.n)} min⁻¹</b>${Number.isFinite(x.vf) ? ` · v<sub>f</sub> ${r(x.vf)} mm/min` : ''}`);
                }
                const tD = v('ztD'), tP = v('ztP');
                if ([tD, tP].every(Number.isFinite))
                    parts.push(`${esc(TL('tw.tapDrill', 'tap drill'))} <b>${r(tapDrill({ D: tD, P: tP }))} mm</b> (${esc(TL('tw.formTap', 'forming tap'))} ${r(tapDrill({ D: tD, P: tP, form: true }))} mm)`);
                sh('zcut', parts.join('<br>'));
            }
            {
                const shape = sv('zmShape'), L = v('zmL'), A = v('zmD'), B = v('zmd');
                try {
                    const m = shape === 'ROD' && Number.isFinite(A) ? stockMass({ shape, mat: sv('zmMat'), L_mm: L, d: A }) : shape === 'TUBE' && [A, B].every(Number.isFinite) ? stockMass({ shape, mat: sv('zmMat'), L_mm: L, D: A, d: B }) : shape === 'PLATE' && [A, B].every(Number.isFinite) ? stockMass({ shape, mat: sv('zmMat'), L_mm: L, a: A, t: B }) : NaN;
                    sh('zmass', Number.isFinite(m) ? `<b>${r(m)} kg</b>` : '');
                }
                catch {
                    sh('zmass', '');
                }
            }
            {
                const a = v('zbA'), b = v('zbB'), rr = v('zbR'), t = v('zbT'), k = v('zbK'), ang = v('zbAng');
                if ([a, b, rr, t, k, ang].every(Number.isFinite)) {
                    const x = bendLength({ a, b, r: rr, t, k, angle: ang });
                    sh('zbend', `BA ${r(x.BA)} mm · L <b>${r(x.L)} mm</b>`);
                }
                else
                    sh('zbend', '');
            }
            {
                const parts = [];
                const cls = fx('zbCls');
                if (cls) {
                    try {
                        const x = boltClass(cls);
                        parts.push(`${esc(cls)}: R<sub>m</sub> <b>${r(x.Rm)} MPa</b> · R<sub>e</sub> <b>${r(x.Re)} MPa</b>`);
                    }
                    catch {
                        parts.push(esc(TL('err.TW_BOLT_CLASS', 'Use a class like 8.8')));
                    }
                }
                const F = v('zbF'), d = v('zbd'), K = v('zbKk');
                if ([F, d, K].every(Number.isFinite))
                    parts.push(`M ≈ <b>${r(boltTorque({ F_kN: F, d, K }))} Nm</b>`);
                sh('zbolt', parts.join('<br>'));
            }
            {
                const parts = [];
                const F = v('zeF'), L = v('zeL');
                if ([F, L].every(Number.isFinite)) {
                    const x = beamPoint({ F_kN: F, L_m: L, W_cm3: v('zeW'), I_cm4: v('zeI') });
                    parts.push(`M<sub>max</sub> <b>${r(x.M_kNm)} kNm</b>${Number.isFinite(x.sigma_MPa) ? ` · σ <b>${r(x.sigma_MPa)} MPa</b>` : ''}${Number.isFinite(x.f_mm) ? ` · f <b>${r(x.f_mm)} mm</b>` : ''}`);
                }
                const h = v('zsH'), b = v('zsB');
                if ([h, b].every(Number.isFinite)) {
                    const x = stairs({ h, b });
                    parts.push(`2h + b = <b>${r(x.step)} mm</b> <span class="${x.ok ? 'kx-ok' : 'kx-bad'}">${x.ok ? '✓' : '✗'} 600–650</span>`);
                }
                sh('zbeam', parts.join('<br>'));
            }
        };
        body.querySelectorAll('[data-tw-f]').forEach((x) => { x.oninput = upd; x.onchange = upd; });
        upd();
    }
    function bindTrades(body, st, again) { body.querySelectorAll('[data-tw-trade]').forEach(b => b.onclick = () => { st.trade = b.dataset.twTrade; st.sec = st.trade === 'ELEKTRO' ? 'A' : ''; st.doc = ''; again(); }); }
})();
