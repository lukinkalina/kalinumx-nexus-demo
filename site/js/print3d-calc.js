// N2.3h (R70): PRINT3D calculators – pure, testable functions (no DOM). Densities are orientation values (g/cm³).
var KXPrint3DCalc;
(function (NS) {
    const num = (v) => { if (v === null || v === undefined || v === '')
        return NaN; const n = Number(String(v).replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : NaN; };
    const ok = (n) => Number.isFinite(n) && n > 0;
    const r2 = (n) => Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN, r3 = (n) => Number.isFinite(n) ? Math.round(n * 1000) / 1000 : NaN;
    NS.DENSITY = { PLA: 1.24, 'PLA-CF': 1.29, PETG: 1.27, 'PETG-CF': 1.30, 'PET-CF': 1.33, ABS: 1.04, ASA: 1.07, PC: 1.20, PA: 1.14, 'PA-CF': 1.20, PPA: 1.30, PPS: 1.35, TPU95A: 1.21, TPU68D: 1.21, PVA: 1.23, SUPPORT: 1.25, HIPS: 1.04, PP: 0.90, DECOR: 1.20 };
    /* grams of filament per metre: cross-section (mm²) × 1000 mm → mm³ → cm³ (÷1000) × density = π(d/2)² × ρ */
    NS.gramsPerMetre = (diameterMm, density) => Math.PI * Math.pow(diameterMm / 2, 2) * density;
    /* filament price converter – fill any pair, the rest is computed. `edited` = the field the user changed last.
       Fields: weightG (net filament on the spool), lengthM, priceSpool, pricePerKg, pricePerM; diameter (mm), density (g/cm³). */
    NS.convert = (input) => {
        const d = ok(num(input.diameter)) ? num(input.diameter) : 1.75, rho = ok(num(input.density)) ? num(input.density) : 1.24, gpm = NS.gramsPerMetre(d, rho);
        let w = num(input.weightG), L = num(input.lengthM), ps = num(input.priceSpool), pk = num(input.pricePerKg), pm = num(input.pricePerM);
        const e = String(input.edited || '');
        /* amount: weight ↔ length */
        if (e === 'lengthM' && ok(L))
            w = L * gpm;
        else if (ok(w))
            L = w / gpm;
        else if (ok(L))
            w = L * gpm;
        /* price anchor: the edited price wins, otherwise the first known one */
        const anchor = ['priceSpool', 'pricePerKg', 'pricePerM'].includes(e) ? e : ok(ps) ? 'priceSpool' : ok(pk) ? 'pricePerKg' : ok(pm) ? 'pricePerM' : '';
        if (anchor === 'pricePerM' && ok(pm))
            pk = pm / gpm * 1000;
        else if (anchor === 'priceSpool' && ok(ps) && ok(w))
            pk = ps / w * 1000;
        if (ok(pk)) {
            pm = pk / 1000 * gpm;
            if (ok(w))
                ps = pk * w / 1000;
        }
        return { diameter: d, density: rho, gramsPerMetre: r3(gpm), weightG: r2(w), lengthM: r2(L), priceSpool: r2(ps), pricePerKg: r2(pk), pricePerM: r3(pm) };
    };
    /* purchase comparator – offers [{name, spools, spoolWeightG, priceTotal | pricePerSpool, shipping}] → per kg incl. shipping, ranking */
    NS.compare = (offers) => {
        const rows = (offers || []).map((o, i) => {
            const n = ok(num(o.spools)) ? num(o.spools) : 1, w = num(o.spoolWeightG), ship = Number.isFinite(num(o.shipping)) ? num(o.shipping) : 0;
            const total = ok(num(o.priceTotal)) ? num(o.priceTotal) : ok(num(o.pricePerSpool)) ? num(o.pricePerSpool) * n : NaN;
            const kg = ok(w) ? n * w / 1000 : NaN;
            const all = total + ship;
            return { i, name: String(o.name || `#${i + 1}`), spools: n, kg: r3(kg), total: r2(all), perKg: r2(all / kg), perSpool: r2(all / n), valid: ok(kg) && ok(all) };
        });
        const valid = rows.filter((r) => r.valid).sort((a, b) => a.perKg - b.perKg);
        const best = valid[0] || null;
        return { rows: rows.map((r) => ({ ...r, rank: r.valid ? valid.indexOf(valid.find((x) => x.i === r.i)) + 1 : null, overBestPct: best && r.valid ? r2((r.perKg / best.perKg - 1) * 100) : null })), best: best ? best.name : null };
    };
    /* print cost – materials [{grams, pricePerKg, role MAIN | SUPPORT | PURGE}], time, energy, amortisation, maintenance, labour,
       failure reserve, markup, VAT, quantity → breakdown per job and per piece */
    NS.printCost = (p) => {
        const n = (k, def = 0) => Number.isFinite(num(p[k])) ? num(p[k]) : def;
        const q = Math.max(1, Math.floor(n('quantity', 1)));
        const mats = (p.materials || []).map((m) => { const g = Math.max(0, num(m.grams) || 0), c = g * (num(m.pricePerKg) || 0) / 1000; return { role: m.role || 'MAIN', grams: r2(g), cost: r2(c) }; });
        const material = mats.reduce((s, m) => s + m.cost, 0), h = n('hours'), energy = h * n('powerW') / 1000 * n('kWhPrice');
        const amort = n('lifetimeHours') > 0 ? h * n('printerPrice') / n('lifetimeHours') : 0, maint = h * n('maintenancePerHour'), labor = n('laborMin') / 60 * n('laborRate');
        const base = material + energy + amort + maint + labor, failure = base * n('failurePct') / 100, subtotal = base + failure, markup = subtotal * n('markupPct') / 100, net = subtotal + markup, vat = net * n('vatPct') / 100, total = net + vat;
        return { materials: mats, material: r2(material), energy: r2(energy), amortisation: r2(amort), maintenance: r2(maint), labor: r2(labor), failure: r2(failure), subtotal: r2(subtotal), markup: r2(markup), net: r2(net), vat: r2(vat), total: r2(total), perPiece: r2(total / q), quantity: q,
            grams: r2(mats.reduce((s, m) => s + m.grams, 0)) };
    };
    /* what is left on a spool: gross weight − empty spool (tare) → grams and metres */
    NS.remaining = (p) => { const g = Math.max(0, num(p.grossG) - num(p.tareG)); const d = ok(num(p.diameter)) ? num(p.diameter) : 1.75, rho = ok(num(p.density)) ? num(p.density) : 1.24; return { grams: r2(g), metres: r2(g / NS.gramsPerMetre(d, rho)) }; };
})(KXPrint3DCalc || (KXPrint3DCalc = {}));
