// N2.5k (user 2026-10-25): 3D print calculator + 3D models. Filament conversions g ↔ m ↔ kg (by diameter and density), price per kg /
// g / m, a spool’s remaining length and value (from the 3D hub spool: remaining g, price / kg, diameter, material), pieces from a spool
// incl. WASTE (purge, supports, misprints in %), cost of a piece (material with waste, energy, labour, margin), comparing spools by
// price per g / m. Densities: TYPICAL values only for well-known materials, labelled as typical (user rule: ranges / type of source,
// never invented); for others the calculator asks for the density. 3D models: accessory / add-on / product with print settings,
// linked (📎) to an order / laser job / product.
var KXPrint3DCalc;
(function () {
    const OWNER = 'APP.KX.NEXUS', HUB = 'APP.KX.PRINT3D', SPOOL = 'PRINT3D_FILAMENT.SPOOL', MODEL = 'CORE.P3D.MODEL';
    /* typical densities g/cm³ (general – verify in the maker’s TDS) */
    const DENS = { PLA: 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, PC: 1.20, TPU: 1.21, PA: 1.14, PVA: 1.23 };
    const USES = ['ACCESSORY', 'ADDON', 'PRODUCT'];
    const num = (v) => { if (v === null || v === undefined || v === '')
        return NaN; const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return n; };
    const r = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
    function density(p) {
        const own = num(p?.density);
        if (Number.isFinite(own) && own > 0.5 && own < 3)
            return { value: own, source: 'OWN' };
        const code = String(p?.material || '').toUpperCase().split(/[\s/+-]/)[0];
        const exact = DENS[String(p?.material || '').toUpperCase()];
        if (exact)
            return { value: exact, source: 'TYPICAL' };
        if (/CF|GF/.test(String(p?.material || '').toUpperCase()))
            return null;
        if (DENS[code])
            return { value: DENS[code], source: 'TYPICAL' };
        return null;
    }
    function gPerM(diameterMm, dens) { const rcm = (diameterMm / 10) / 2; return Math.PI * rcm * rcm * 100 * dens; }
    const svc = { DENS, USES,
        convert(p) {
            const d = num(p?.diameter || 1.75);
            if (!(d > 0 && d < 5))
                throw new Error('FIL_DIAMETER_INVALID');
            const de = density(p);
            if (!de)
                throw new Error('FIL_DENSITY_REQUIRED');
            const gpm = gPerM(d, de.value);
            const g = num(p?.grams), m = num(p?.meters);
            return { diameter: d, density: de.value, densitySource: de.source, gPerM: r(gpm, 3), mPerKg: r(1000 / gpm, 1), meters: Number.isFinite(g) ? r(g / gpm, 2) : undefined, grams: Number.isFinite(m) ? r(m * gpm, 2) : undefined };
        },
        prices(p) { const c = svc.convert(p); const kg = num(p?.pricePerKg); if (!(kg >= 0))
            throw new Error('FIL_PRICE_REQUIRED'); return { ...c, pricePerKg: kg, pricePerG: r(kg / 1000, 4), pricePerM: r(kg / 1000 * c.gPerM, 4) }; },
        /* a pack of several spools (shop bundles): count × weight per spool for a pack price → price per spool / kg / g / m, total length */
        pack(p) {
            const count = Math.floor(num(p?.count));
            const w = num(p?.weightG || 1000);
            const price = num(p?.price);
            if (!(count >= 1) || !(w > 0))
                throw new Error('FIL_PACK_INVALID');
            if (!(price >= 0))
                throw new Error('FIL_PRICE_REQUIRED');
            const totalG = count * w, perKg = price / (totalG / 1000);
            let perM, totalM;
            try {
                const c = svc.convert(p);
                perM = r(perKg / 1000 * c.gPerM, 4);
                totalM = r(totalG / c.gPerM, 1);
            }
            catch { }
            return { count, weightG: w, price, totalG, pricePerSpool: r(price / count), pricePerKg: r(perKg), pricePerG: r(perKg / 1000, 4), pricePerM: perM, totalM };
        },
        /* pieces from a spool: per piece g (or m) + waste % (purge, supports, misprints) + fixed purge g per piece */
        pieces(p) {
            const left = num(p?.remainingG);
            if (!(left >= 0))
                throw new Error('FIL_REMAINING_REQUIRED');
            let per = num(p?.perPieceG);
            if (!(per > 0) && num(p?.perPieceM) > 0) {
                per = num(p.perPieceM) * svc.convert(p).gPerM;
            }
            if (!(per > 0))
                throw new Error('FIL_PER_PIECE_REQUIRED');
            const waste = Math.max(0, Math.min(90, num(p?.wastePct) || 0));
            const purge = Math.max(0, num(p?.purgeG) || 0);
            const eff = per * (1 + waste / 100) + purge;
            const n = Math.floor(left / eff + 1e-9);
            return { pieces: n, perPieceG: r(per, 2), effectivePerPieceG: r(eff, 2), wastePct: waste, purgeG: purge, usedG: r(n * eff, 1), leftoverG: r(left - n * eff, 1) };
        },
        /* cost of one piece – material (with waste) + energy + labour; margin → selling price */
        cost(p) {
            const grams = num(p?.grams);
            if (!(grams > 0))
                throw new Error('FIL_GRAMS_REQUIRED');
            const kg = num(p?.pricePerKg);
            if (!(kg >= 0))
                throw new Error('FIL_PRICE_REQUIRED');
            const waste = Math.max(0, Math.min(90, num(p?.wastePct) || 0));
            const mat = grams * (1 + waste / 100) / 1000 * kg + Math.max(0, num(p?.purgeG) || 0) / 1000 * kg;
            const energy = (Math.max(0, num(p?.watts) || 0) / 1000) * Math.max(0, num(p?.printHours) || 0) * Math.max(0, num(p?.kwhPrice) || 0);
            const labour = Math.max(0, num(p?.laborHours) || 0) * Math.max(0, num(p?.laborRate) || 0);
            const extras = Math.max(0, num(p?.extras) || 0);
            const total = mat + energy + labour + extras;
            const margin = Math.max(0, num(p?.marginPct) || 0);
            return { material: r(mat), energy: r(energy), labour: r(labour), extras: r(extras), cost: r(total), marginPct: margin, price: r(total * (1 + margin / 100)) };
        },
        async readableSpools(ctx) { const out = []; for (const rr of await core0().entities.list()) {
            if (rr.type !== SPOOL || rr.archivedAt)
                continue;
            try {
                if (!await core0().ownerReadGate.allows(rr.ownerApp, ctx.actorId))
                    continue;
                if (!await core0().access.can({ kind: 'ENTITY', id: rr.id, ownerApp: rr.ownerApp, spaceIds: rr.spaceIds }, ctx.actorId, 'READ'))
                    continue;
            }
            catch {
                continue;
            }
            out.push(rr);
        } return out; },
        async spoolStats(p, ctx) {
            const rr = (await svc.readableSpools(ctx)).find((x) => x.id === String(p?.id || ''));
            if (!rr)
                throw new Error('FIL_SPOOL_NOT_FOUND');
            const d = rr.data || {};
            const base = { id: rr.id, name: d.name, material: d.material, brand: d.brand, diameter: num(d.diameter) || 1.75, remainingG: num(d.remainingG), pricePerKg: num(d.pricePerKg) };
            try {
                const c = svc.convert({ material: d.material, diameter: base.diameter, density: p?.density, grams: base.remainingG });
                const pr = Number.isFinite(base.pricePerKg) ? svc.prices({ material: d.material, diameter: base.diameter, density: p?.density, pricePerKg: base.pricePerKg }) : null;
                return { ...base, density: c.density, densitySource: c.densitySource, gPerM: c.gPerM, remainingM: c.meters, pricePerG: pr?.pricePerG, pricePerM: pr?.pricePerM, valueLeft: pr && Number.isFinite(base.remainingG) ? r(base.remainingG / 1000 * base.pricePerKg) : undefined };
            }
            catch (e) {
                return { ...base, error: String(e?.message || e) };
            }
        },
        /* compare spools by price per g / m (cheapest first); those without a price / density are listed with the reason */
        async compare(p, ctx) {
            const rows = [];
            for (const rr of await svc.readableSpools(ctx)) {
                if (p?.material && String(rr.data?.material || '') !== p.material)
                    continue;
                rows.push(await svc.spoolStats({ id: rr.id }, ctx));
            }
            return rows.sort((a, b) => (a.pricePerM ?? Infinity) - (b.pricePerM ?? Infinity));
        },
        /* 3D models – accessory / add-on / product with how to print; 📎 to an order / product / laser job */
        async saveModel(p, ctx) {
            const C = core0();
            const name = String(p?.name || '').trim().slice(0, 160);
            if (!name)
                throw new Error('P3D_MODEL_NAME_REQUIRED');
            const use = USES.includes(p?.use) ? p.use : 'ACCESSORY';
            const link = p?.link ? String(p.link).slice(0, 600) : '';
            if (link && !/^https?:\/\//i.test(link))
                throw new Error('P3D_MODEL_LINK_NOT_WEB');
            const nz = (v, a, b) => { const n = num(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : undefined; };
            const data = { name, use, link, license: String(p?.license || '').slice(0, 200), note: String(p?.note || '').slice(0, 1000), imageFileId: p?.imageFileId ? String(p.imageFileId) : undefined,
                print: { printer: String(p?.print?.printer || '').slice(0, 120), nozzleMm: nz(p?.print?.nozzleMm, 0.1, 1.2), nozzleMaterial: String(p?.print?.nozzleMaterial || '').slice(0, 40), material: String(p?.print?.material || '').slice(0, 40), spoolId: p?.print?.spoolId ? String(p.print.spoolId) : undefined,
                    nozzleC: nz(p?.print?.nozzleC, 150, 350), bedC: nz(p?.print?.bedC, 0, 130), chamberC: nz(p?.print?.chamberC, 0, 70), layerMm: nz(p?.print?.layerMm, 0.04, 1), infillPct: nz(p?.print?.infillPct, 0, 100), supports: String(p?.print?.supports || '').slice(0, 120),
                    timeMin: nz(p?.print?.timeMin, 0, 100000), grams: nz(p?.print?.grams, 0, 100000), perPlate: nz(p?.print?.perPlate, 1, 1000) } };
            if (p?.id) {
                const rr = await C.entities.get(String(p.id));
                if (!rr || rr.type !== MODEL)
                    throw new Error('P3D_MODEL_NOT_FOUND');
                return C.entities.save({ ...rr, expectedRevision: p.expectedRevision ?? rr.revision, data: { ...rr.data, ...data } }, { ...ctx, appCode: OWNER });
            }
            const space = p?.spaceId || ((await C.propagate.spaces(ctx.actorId)).find((s) => s.kind === 'PERSONAL') || {}).id;
            const rec = await C.entities.save({ type: MODEL, ownerApp: HUB, schema: 'KX.P3D_MODEL/1', spaceIds: [space], data }, { ...ctx, appCode: HUB });
            if (p?.attachTo && C.links) {
                try {
                    await C.links.link({ from: String(p.attachTo), to: C.deepLinks.build({ kind: 'ENTITY', type: MODEL, id: rec.id }), type: use === 'PRODUCT' ? 'LINKED' : 'BELONGS_TO' }, ctx);
                }
                catch (e) {
                    throw new Error('P3D_ATTACH_FAILED ' + String(e?.message || e));
                }
            }
            return rec;
        },
        async models(p, ctx) {
            const C = core0();
            const out = [];
            for (const rr of await C.entities.list()) {
                if (rr.type !== MODEL || rr.archivedAt)
                    continue;
                try {
                    if (!await C.ownerReadGate.allows(rr.ownerApp, ctx.actorId))
                        continue;
                    if (!await C.access.can({ kind: 'ENTITY', id: rr.id, ownerApp: rr.ownerApp, spaceIds: rr.spaceIds }, ctx.actorId, 'READ'))
                        continue;
                }
                catch {
                    continue;
                }
                if (p?.use && rr.data?.use !== p.use)
                    continue;
                out.push({ id: rr.id, revision: rr.revision, ...rr.data });
            }
            return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'cs'));
        } };
    let CORE = null;
    const core0 = () => CORE;
    function install(core) {
        if (core.filament)
            return core.filament;
        CORE = core;
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.FILAMENT.CONVERT', 'READ', (p) => svc.convert(p));
        reg('ACTION.CORE.FILAMENT.PRICES', 'READ', (p) => svc.prices(p));
        reg('ACTION.CORE.FILAMENT.PIECES', 'READ', (p) => svc.pieces(p));
        reg('ACTION.CORE.FILAMENT.PACK', 'READ', (p) => svc.pack(p));
        reg('ACTION.CORE.FILAMENT.COST', 'READ', (p) => svc.cost(p));
        reg('ACTION.CORE.FILAMENT.SPOOL', 'READ', (p, c) => svc.spoolStats(p, c));
        reg('ACTION.CORE.FILAMENT.COMPARE', 'READ', (p, c) => svc.compare(p, c));
        reg('ACTION.CORE.P3D.MODEL.SAVE', 'SAFE_WRITE', (p, c) => svc.saveModel(p, c));
        reg('ACTION.CORE.P3D.MODEL.LIST', 'READ', (p, c) => svc.models(p, c));
        core.filament = svc;
        return svc;
    }
    KXPrint3DCalc = { install, DENS };
    globalThis.KXPrint3DCalc = KXPrint3DCalc;
})();
