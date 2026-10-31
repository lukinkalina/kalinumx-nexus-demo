// N2.5s (user + original KalinumX Laser Parameter Hub v5.8.10): SOURCE PROTECTION for every laser source.
// Ranges of the source (max speed, frequency, Q-pulse range and allowed values, passes) + manufacturer table (Q-pulse → cut-off, max frequency).
// Built-in: JPT M7 60 W (YDFLP-E-60-M7-M-R, 1.5 mJ) – taken over from the original program (manufacturer table) – „verify in your manual“.
// A table is SUGGESTED by the source name only as a suggestion (marked); nothing is applied silently as verified. Values never invented.
var KXLaserGuard;
(function () {
    const TABLES = { JPT_M7_60_1_5MJ: { id: 'JPT_M7_60_1_5MJ', name: 'JPT M7 60 W MOPA (YDFLP-E-60-M7-M-R, 1,5 mJ)', sourceModel: 'YDFLP-E-60-M7-M-R', nominalPowerW: 60, maxPulseEnergy_mJ: 1.5, frequencyMinKHz: 1, frequencyMaxKHz: 4000, pulseMinNs: 2, pulseMaxNs: 500,
            origin: 'Manufacturer table JPT M7 taken over from KalinumX Laser Parameter Hub v5.8.10 – verify in the manual of your source.', originKey: 'lg.origin.JPT_M7',
            rows: [[2, 1950, 4000], [4, 1350, 4000], [6, 975, 4000], [9, 600, 4000], [13, 412, 3000], [20, 225, 3000], [30, 187, 3000], [45, 150, 2000], [60, 135, 2000], [80, 112, 2000], [100, 105, 1000], [150, 57, 1000], [200, 45, 1000], [250, 42, 900], [350, 40, 600], [500, 30, 500]].map(([pulse, cutoff, max]) => ({ pulse, cutoff, max })) } };
    const num = (v) => { if (v === undefined || v === null || v === '')
        return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
    /* clean + validate a guard (ranges + optional table id); empty = unknown (only general limits apply) */
    function normalize(g) {
        const r = {};
        const R = g?.ranges || {};
        for (const k of ['speedMaxMmS', 'speedMaxMmMin', 'frequencyMinKHz', 'frequencyMaxKHz', 'pulseMinNs', 'pulseMaxNs', 'passesMax', 'powerW']) {
            const n = num(R[k]);
            if (n === null)
                continue;
            if (Number.isNaN(n) || n < 0)
                throw new Error('LASER_GUARD_RANGE:' + k);
            r[k] = n;
        }
        if (r.frequencyMinKHz != null && r.frequencyMaxKHz != null && r.frequencyMinKHz > r.frequencyMaxKHz)
            throw new Error('LASER_GUARD_RANGE:frequency');
        if (r.pulseMinNs != null && r.pulseMaxNs != null && r.pulseMinNs > r.pulseMaxNs)
            throw new Error('LASER_GUARD_RANGE:pulse');
        let pv = [];
        if (R.pulseValues != null && R.pulseValues !== '') {
            pv = (Array.isArray(R.pulseValues) ? R.pulseValues : String(R.pulseValues).split(/[,; ]+/)).map((x) => Number(String(x).replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0);
            pv = [...new Set(pv)].sort((a, b) => a - b);
        }
        if (pv.length)
            r.pulseValues = pv;
        const tableId = g?.tableId && TABLES[g.tableId] ? String(g.tableId) : null;
        if (g?.tableId && !tableId)
            throw new Error('LASER_GUARD_TABLE_UNKNOWN');
        return { ranges: r, tableId, source: String(g?.source || '').slice(0, 300), updatedAt: g?.updatedAt || null };
    }
    /* suggestion by the source name / power – never applied as verified */
    function suggest(src) { const t = `${src?.name || ''} ${src?.sourceFamily || ''} ${src?.notes || ''}`; if (/JPT/i.test(t) && /M7/i.test(t) && (src?.nominalPowerW == null || Number(src.nominalPowerW) === 60))
        return { tableId: 'JPT_M7_60_1_5MJ', reason: 'JPT M7 60 W by the source name' }; return null; }
    /* effective guard: explicit (from the source) or suggested (flag) */
    function effective(src) { const g = src?.guard ? normalize(src.guard) : null; if (g && (g.tableId || Object.keys(g.ranges).length))
        return { ...g, suggested: false }; const s = suggest(src); return s ? { ranges: {}, tableId: s.tableId, source: s.reason, suggested: true } : null; }
    /* evaluate parameters → findings (danger / warn / info) with one-click fixes; overall status: danger > warn > safe; na = no guard */
    function evaluate(guard, p) {
        if (!guard)
            return { status: 'na', findings: [] };
        const F = [];
        const t = guard.tableId ? TABLES[guard.tableId] : null;
        const R = { ...(t ? { frequencyMinKHz: t.frequencyMinKHz, frequencyMaxKHz: t.frequencyMaxKHz, pulseMinNs: t.pulseMinNs, pulseMaxNs: t.pulseMaxNs } : {}), ...guard.ranges };
        const f = num(p?.frequencyKHz), q = num(p?.qPulseNs), pw = num(p?.powerPercent), vs = num(p?.speedMmPerS), vm = num(p?.speedMmPerMin), ps = num(p?.passes);
        if (pw != null && (Number.isNaN(pw) || pw < 0 || pw > 100))
            F.push({ field: 'powerPercent', status: 'danger', code: 'POWER_INVALID', fix: { field: 'powerPercent', value: Number.isNaN(pw) ? null : Math.min(100, Math.max(0, pw)) } });
        if (vs != null && R.speedMaxMmS != null && vs > R.speedMaxMmS)
            F.push({ field: 'speedMmPerS', status: 'danger', code: 'SPEED_OVER', max: R.speedMaxMmS, value: vs, fix: { field: 'speedMmPerS', value: R.speedMaxMmS } });
        if (vm != null && R.speedMaxMmMin != null && vm > R.speedMaxMmMin)
            F.push({ field: 'speedMmPerMin', status: 'danger', code: 'SPEED_OVER', max: R.speedMaxMmMin, value: vm, fix: { field: 'speedMmPerMin', value: R.speedMaxMmMin } });
        if (ps != null && R.passesMax != null && ps > R.passesMax)
            F.push({ field: 'passes', status: 'warn', code: 'PASSES_OVER', max: R.passesMax, value: ps, fix: { field: 'passes', value: R.passesMax } });
        const allowed = R.pulseValues || (t ? t.rows.map((x) => x.pulse) : []);
        if (q != null) {
            if (Number.isNaN(q))
                F.push({ field: 'qPulseNs', status: 'danger', code: 'NAN' });
            else if ((R.pulseMinNs != null && q < R.pulseMinNs) || (R.pulseMaxNs != null && q > R.pulseMaxNs))
                F.push({ field: 'qPulseNs', status: 'danger', code: 'PULSE_RANGE', min: R.pulseMinNs, max: R.pulseMaxNs, value: q, fix: { field: 'qPulseNs', value: Math.min(R.pulseMaxNs ?? q, Math.max(R.pulseMinNs ?? q, q)) } });
            else if (allowed.length && !allowed.includes(q)) {
                const near = [...allowed].sort((a, b) => Math.abs(a - q) - Math.abs(b - q)).slice(0, 3);
                F.push({ field: 'qPulseNs', status: 'danger', code: 'PULSE_NOT_ALLOWED', value: q, options: near, fix: { field: 'qPulseNs', value: near[0] } });
            }
        }
        if (f != null) {
            if (Number.isNaN(f))
                F.push({ field: 'frequencyKHz', status: 'danger', code: 'NAN' });
            else if ((R.frequencyMinKHz != null && f < R.frequencyMinKHz) || (R.frequencyMaxKHz != null && f > R.frequencyMaxKHz))
                F.push({ field: 'frequencyKHz', status: 'danger', code: 'FREQ_RANGE', min: R.frequencyMinKHz, max: R.frequencyMaxKHz, value: f, fix: { field: 'frequencyKHz', value: Math.min(R.frequencyMaxKHz ?? f, Math.max(R.frequencyMinKHz ?? f, f)) } });
            else if (t && q != null && !Number.isNaN(q)) {
                const row = t.rows.find((x) => x.pulse === q);
                if (row) {
                    if (f > row.max)
                        F.push({ field: 'frequencyKHz', status: 'danger', code: 'STOP_OVER_MAX', pulse: q, value: f, max: row.max, cutoff: row.cutoff, fix: { field: 'frequencyKHz', value: row.max } });
                    else if (f < row.cutoff)
                        F.push({ field: 'frequencyKHz', status: 'warn', code: 'BELOW_CUTOFF', pulse: q, value: f, cutoff: row.cutoff, max: row.max, estimatedW: Math.round(t.nominalPowerW * f / row.cutoff * 10) / 10, fix: { field: 'frequencyKHz', value: row.cutoff } });
                    else
                        F.push({ field: 'frequencyKHz', status: 'info', code: 'IN_RANGE', pulse: q, value: f, cutoff: row.cutoff, max: row.max });
                }
            }
        }
        const status = F.some(x => x.status === 'danger') ? 'danger' : F.some(x => x.status === 'warn') ? 'warn' : 'safe';
        return { status, findings: F, table: t ? { id: t.id, name: t.name, origin: String(globalThis.KXI18n?.UI?.[t.originKey]?.cs || t.origin) } : null, suggested: !!guard.suggested };
    }
    function install(core) {
        if (core.laserGuard)
            return core.laserGuard;
        const OWNER = 'APP.KX.LASER';
        const sources = async (machineId) => (await core.laserDomain.list('APP.LASER.SOURCE_MODULE')).filter((r) => !r.archivedAt && r.data.machineId === machineId);
        const svc = { TABLES, normalize, suggest, effective, evaluate,
            /* the guard of a source: by sourceModuleId, or by profile (→ its source), or the only source of the machine */
            async guardFor(p) {
                let src = null;
                if (p?.sourceModuleId)
                    src = await core.laserDomain.get(String(p.sourceModuleId), 'APP.LASER.SOURCE_MODULE').catch(() => null);
                if (!src && p?.profileId) {
                    const pr = await core.laserDomain.get(String(p.profileId), 'APP.LASER.PROFILE').catch(() => null);
                    if (pr?.data?.sourceModuleId)
                        src = await core.laserDomain.get(String(pr.data.sourceModuleId), 'APP.LASER.SOURCE_MODULE').catch(() => null);
                }
                if (!src && p?.machineId) {
                    const all = await sources(String(p.machineId));
                    if (all.length === 1)
                        src = all[0];
                    else {
                        for (const s of all) {
                            const e = effective(s.data);
                            if (e) {
                                src = s;
                                break;
                            }
                        }
                    }
                }
                return src ? { source: { id: src.id, name: src.data.name, nominalPowerW: src.data.nominalPowerW ?? null }, guard: effective(src.data) } : { source: null, guard: null };
            },
            async check(p) { const g = await svc.guardFor(p); return { ...evaluate(g.guard, p?.params || {}), source: g.source }; },
            async setGuard(p, ctx) {
                const src = await core.laserDomain.get(String(p?.sourceModuleId || ''), 'APP.LASER.SOURCE_MODULE');
                if (!src)
                    throw new Error('LASER_GUARD_SOURCE_UNKNOWN');
                const g = p?.guard == null ? null : { ...normalize(p.guard), updatedAt: new Date().toISOString() };
                const data = { ...src.data };
                if (g)
                    data.guard = g;
                else
                    delete data.guard;
                return core.laserDomain.saveSourceModule({ id: src.id, expectedRevision: src.revision, spaceIds: src.spaceIds, data }, { ...ctx, appCode: OWNER });
            } };
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.LASER.GUARD.CHECK', 'READ', (p) => svc.check(p));
        reg('ACTION.LASER.GUARD.FOR', 'READ', (p) => svc.guardFor(p));
        reg('ACTION.LASER.GUARD.SET', 'SAFE_WRITE', (p, c) => svc.setGuard(p, c));
        reg('ACTION.LASER.GUARD.TABLES', 'READ', () => Object.values(TABLES).map((t) => ({ id: t.id, name: t.name, origin: t.origin, rows: t.rows.length })));
        core.laserGuard = svc;
        return svc;
    }
    KXLaserGuard = { TABLES, normalize, suggest, effective, evaluate, install };
    globalThis.KXLaserGuard = KXLaserGuard;
})();
