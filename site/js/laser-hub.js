var KXLaserHub;
(function () {
    const OWNER = 'APP.KX.LASER';
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    /* machine definitions: user's machines from the original Laser Parameter Hub P566 + demo machines. Lens field sizes are NOT invented (only focal lengths from P566). */
    const SEEDS = [
        { uid: 'KX.LASER.PERSONAL.HAOTIAN_MOPA_60W_JPT_M7', origin: 'PERSONAL', name: 'Haotian Galvo fiber MOPA 60W JPT M7', manufacturer: 'Haotian', model: 'Galvo fiber MOPA 60W (JPT M7)', tech: ['FIBER_MOPA', 'GALVO'],
            sources: [{ key: 'IR', name: 'JPT M7 MOPA 1064 nm', tech: 'FIBER_MOPA', nm: 1064, w: 60, caps: 'GALVO_P566' }], lenses: [110, 210, 310], capacity: 8 },
        { uid: 'KX.LASER.PERSONAL.LASERPECKER_LP4', origin: 'PERSONAL', name: 'LaserPecker LP4', manufacturer: 'LaserPecker', model: 'LP4', tech: ['LP4', 'DIODE', 'FIBER'],
            sources: [{ key: 'BLUE', name: TL('laser.src.blue450', 'Blue 450 nm'), tech: 'DIODE', nm: 450, w: 10, caps: 'LP4_P566' }, { key: 'IR', name: 'IR 1064 nm', tech: 'FIBER', nm: 1064, w: 2, caps: 'LP4_P566' }], lenses: [], modes: ['STANDARD', 'SLIDE', 'ROTARY'], capacity: 6 },
        { uid: 'KX.LASER.DEMO.UV_10W', origin: 'DEMO', name: TL('laser.demo.UV_10W', 'UV laser 10 W (demo)'), manufacturer: '', model: 'UV 355 nm 10 W', tech: ['UV', 'GALVO'], sources: [{ key: 'UV', name: 'UV 355 nm', tech: 'UV', nm: 355, w: 10 }], lenses: [110], capacity: 8 },
        { uid: 'KX.LASER.DEMO.UV_15W', origin: 'DEMO', name: TL('laser.demo.UV_15W', 'UV laser 15 W (demo)'), manufacturer: '', model: 'UV 355 nm 15 W', tech: ['UV', 'GALVO'], sources: [{ key: 'UV', name: 'UV 355 nm', tech: 'UV', nm: 355, w: 15 }], lenses: [110], capacity: 8 },
        { uid: 'KX.LASER.DEMO.FIBER_MOPA_60W', origin: 'DEMO', name: TL('laser.demo.FIBER_MOPA_60W', 'Fiber MOPA 60 W (demo)'), manufacturer: '', model: 'Galvo fiber MOPA 60 W', tech: ['FIBER_MOPA', 'GALVO'], sources: [{ key: 'IR', name: 'MOPA 1064 nm', tech: 'FIBER_MOPA', nm: 1064, w: 60 }], lenses: [110, 210, 310], capacity: 8 },
        { uid: 'KX.LASER.DEMO.COMBI_450_1064', origin: 'DEMO', name: TL('laser.demo.COMBI', 'Combi laser 450 + 1064 nm (demo)'), manufacturer: '', model: 'Combi (diodový + IR)', tech: ['DIODE', 'FIBER'], sources: [{ key: 'BLUE', name: TL('laser.src.blue450', 'Blue 450 nm'), tech: 'DIODE', nm: 450 }, { key: 'IR', name: 'IR 1064 nm', tech: 'FIBER', nm: 1064 }], lenses: [], capacity: 6 },
        { uid: 'KX.LASER.DEMO.CO2_PLOTTER', origin: 'DEMO', name: TL('laser.demo.CO2_PLOTTER', 'CO₂ plotter (demo)'), manufacturer: '', model: 'CO₂ portálový (DSP)', tech: ['CO2', 'DSP'], sources: [{ key: 'CO2', name: 'CO₂ trubice 10 600 nm', tech: 'CO2', nm: 10600 }], lenses: [], capacity: 8 }
    ];
    const ctxOf = (opts) => ({ actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.CONFIG.EDIT'], confirmed: true });
    /* N2.4e: stable order – own, other own, demo; then by name (it used to follow storage order and changed between openings) */
    const ORIGIN_ORDER = { PERSONAL: 0, USER: 1, DEMO: 2 };
    async function machines(core) { return (await core.laserDomain.list('APP.LASER.MACHINE')).filter((r) => !r.archivedAt).sort((a, b) => ((ORIGIN_ORDER[a.data.origin || 'USER'] ?? 1) - (ORIGIN_ORDER[b.data.origin || 'USER'] ?? 1)) || String(a.data.name).localeCompare(String(b.data.name), 'cs')); }
    /* functions of a laser derived from its technology, sources, lenses and modes – labelled as derived (not a measured capability) */
    function functionsOf(d, srcs, lenses) {
        const t = new Set(d.technologyCodes || []);
        const f = [];
        if (t.has('FIBER_MOPA'))
            f.push('QPULSE', 'COLOR_MARK');
        else if (t.has('FIBER'))
            f.push('METAL_MARK');
        if (t.has('GALVO'))
            f.push('WOBBLE', 'GALVO_TIMING');
        if (t.has('UV'))
            f.push('COLD_MARK');
        if (t.has('CO2'))
            f.push('CUT', 'KERF');
        if (t.has('DIODE'))
            f.push('CUT_THIN');
        if (t.has('LP4') || /ROTARY/.test(String(d.notes || '')))
            f.push('ROTARY');
        if (t.has('LP4') || /SLIDE/.test(String(d.notes || '')))
            f.push('SLIDE');
        if (srcs.length > 1)
            f.push('DUAL_SOURCE');
        if (lenses.length > 1)
            f.push('MULTI_LENS');
        if (d.allowOvernight)
            f.push('OVERNIGHT');
        return [...new Set(f)];
    }
    /* columns of the machine list – the user chooses what is shown (setting laser.list.columns, user scope) */
    const COLS = ['tech', 'sources', 'functions', 'status', 'capacity', 'util', 'rotary', 'slide', 'prep', 'overnight', 'lenses', 'outages', 'model'];
    const COLS_DEFAULT = ['tech', 'sources', 'functions', 'status', 'capacity', 'util', 'rotary', 'slide']; /* N2.4i: Rotary and Table visible by default (user's request) */
    const COLS_KEY = 'laser.list.columns';
    /* N2.4g: cards and table share ONE choice in the field registry (scope LASER.MACHINES) – hiding / renaming a column in the table
       changes the cards too; the N2.4e setting laser.list.columns is migrated once and then cleared (both ways of choosing stay) */
    const CARD_TO_REG = { rotary: ['rotary'], slide: ['slide'], tech: ['tech'], sources: ['sources'], functions: ['functions'], status: ['status'], capacity: ['capacityHoursPerDay'], util: ['util'], prep: ['prepMinutesDefault', 'finishMinutesDefault'], overnight: ['allowOvernight'], lenses: ['lenses'], outages: ['outages'], model: ['manufacturer', 'model'] };
    const fCtx = (actorId) => ({ actorId, appCode: OWNER, permissions: ['CORE.SETTING.EDIT'], confirmed: true });
    async function migrateCols(core, actorId) {
        try {
            const x = await core.settingsDefaults.explain(core.settings, COLS_KEY, [{ scopeType: 'USER', scopeId: actorId }]);
            const v = String(x?.effectiveValue || '').split(',').map((z) => z.trim()).filter((z) => COLS.includes(z));
            if (!v.length)
                return false;
            for (const c of COLS)
                for (const k of CARD_TO_REG[c])
                    await core.actions.invoke('ACTION.CORE.FIELDS.SET', { scope: TABLE_SCOPE, key: k, patch: { hidden: !v.includes(c) } }, fCtx(actorId));
            await core.actions.invoke('ACTION.CORE.SETTING.SET', { key: COLS_KEY, scopeType: 'USER', scopeId: actorId, value: '' }, fCtx(actorId));
            return true;
        }
        catch {
            return false;
        }
    }
    async function columnsOf(core, actorId) { registerTable(core); await migrateCols(core, actorId); try {
        const effR = await core.fields.effective(TABLE_SCOPE, actorId);
        const eff = Array.isArray(effR) ? effR : (effR?.fields || []);
        const vis = new Set(eff.filter((f) => !f.hidden).map((f) => f.key));
        const v = COLS.filter(c => CARD_TO_REG[c].some(k => vis.has(k)));
        return v;
    }
    catch {
        return COLS_DEFAULT;
    } }
    async function labelsOf(core, actorId) { try {
        const effR = await core.fields.effective(TABLE_SCOPE, actorId);
        const eff = Array.isArray(effR) ? effR : (effR?.fields || []);
        const m = {};
        for (const f of eff)
            m[f.key] = f.label;
        return m;
    }
    catch {
        return {};
    } }
    /* idempotent: a machine is recognised by its recordUid – running again never creates a second copy */
    async function seed(core, opts, spaceIds, which = 'ALL') {
        const existing = new Set((await machines(core)).map((r) => r.data.recordUid));
        const created = [];
        for (const s of SEEDS) {
            if (which !== 'ALL' && s.origin !== which)
                continue;
            if (existing.has(s.uid))
                continue;
            const m = await core.actions.invoke('ACTION.LASER.MACHINE.SAVE', { spaceIds, data: { recordUid: s.uid, name: s.name, manufacturer: s.manufacturer, model: s.model, physicalOwned: s.origin === 'PERSONAL', technologyCodes: s.tech, origin: s.origin, capacityHoursPerDay: s.capacity, status: 'ACTIVE', allowOvernight: false, prepMinutesDefault: 15, finishMinutesDefault: 10, prepBlocksMachine: true, notes: s.modes ? `${esc(TL('laser.modes', 'Modes'))}: ${s.modes.join(' / ')}` : '' } }, ctxOf(opts));
            for (const src of s.sources)
                await core.actions.invoke('ACTION.LASER.SOURCE_MODULE.SAVE', { spaceIds, data: { recordUid: `${s.uid}.SRC.${src.key}`, machineId: m.id, name: src.name, technologyCode: src.tech, wavelengthNm: src.nm, nominalPowerW: src.w } }, ctxOf(opts));
            for (const f of s.lenses)
                await core.actions.invoke('ACTION.LASER.LENS.SAVE', { spaceIds, data: { recordUid: `${s.uid}.LENS.F${f}`, machineId: m.id, name: `F${f} mm`, focalLengthMm: f, kind: 'FIELD' } }, ctxOf(opts));
            created.push(s.uid);
        }
        return created;
    }
    /* the „(demo)“ / „(copy)“ suffix in the current language is removed before „(copy)“ is added – plain string check, no regular expression */
    function stripSuffix(n) { for (const w of [TL('laser.demoWord', 'demo'), TL('laser.copy', 'copy')]) {
        const suf = ` (${w})`;
        if (n.endsWith(suf))
            return n.slice(0, -suf.length);
    } return n; }
    /* duplicate a machine with its sources and lenses as the user's own (origin USER) */
    async function duplicate(core, opts, machineId, spaceIds) {
        const m = await core.laserDomain.get(machineId, 'APP.LASER.MACHINE');
        if (!m)
            throw new Error('LASER_MACHINE_NOT_FOUND');
        const uid = `KX.LASER.USER.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 7)}`;
        const d = { ...m.data, recordUid: uid, name: `${stripSuffix(String(m.data.name))} (${TL('laser.copy', 'copy')})`, origin: 'USER', physicalOwned: true };
        const n = await core.actions.invoke('ACTION.LASER.MACHINE.SAVE', { spaceIds, data: d }, ctxOf(opts));
        const all = await core.laserDomain.list();
        for (const r of all.filter((x) => x.type === 'APP.LASER.SOURCE_MODULE' && x.data.machineId === machineId && !x.archivedAt))
            await core.actions.invoke('ACTION.LASER.SOURCE_MODULE.SAVE', { spaceIds, data: { ...r.data, recordUid: `${uid}.SRC.${r.data.recordUid.split('.').pop()}`, machineId: n.id } }, ctxOf(opts));
        for (const r of all.filter((x) => x.type === 'APP.LASER.LENS' && x.data.machineId === machineId && !x.archivedAt))
            await core.actions.invoke('ACTION.LASER.LENS.SAVE', { spaceIds, data: { ...r.data, recordUid: `${uid}.LENS.${r.data.recordUid.split('.').pop()}`, machineId: n.id, profileId: undefined } }, ctxOf(opts));
        return n;
    }
    async function updatePlanning(core, opts, machineId, patch) {
        const m = await core.laserDomain.get(machineId, 'APP.LASER.MACHINE');
        if (!m)
            throw new Error('LASER_MACHINE_NOT_FOUND');
        return core.actions.invoke('ACTION.LASER.MACHINE.SAVE', { id: m.id, expectedRevision: m.revision, spaceIds: m.spaceIds, data: { ...m.data, ...patch } }, ctxOf(opts));
    }
    /* N2.4c: is the machine available on a day (YYYY-MM-DD)? – state ACTIVE, capacity set, day outside outage periods; the planner uses this */
    function availableOn(d, day) { if (!d || (d.status && d.status !== 'ACTIVE'))
        return false; if (!(Number(d.capacityHoursPerDay) > 0))
        return false; return !(d.outages || []).some((o) => day >= o.from && day <= o.to); }
    /* field rules – inline help instead of pop-ups (design §I): range, suggestion, where to find it */
    const RULES = { capacityHoursPerDay: { min: 0, max: 24, unit: 'h' }, prepMinutesDefault: { min: 0, max: 1440, unit: 'min' }, finishMinutesDefault: { min: 0, max: 1440, unit: 'min' } };
    function checkField(k, raw) {
        const r = RULES[k];
        if (!r)
            return null;
        const v = String(raw).replace(',', '.').trim();
        if (v === '')
            return k === 'capacityHoursPerDay' ? { level: 'warn', msg: TL('laser.v.capEmpty', 'Capacity is empty – this laser is not counted in production planning.'), fix: null } : null;
        const n = Number(v);
        if (!Number.isFinite(n))
            return { level: 'err', msg: TL('laser.v.nan', 'Enter a number.'), fix: null };
        if (n < r.min || n > r.max) {
            const fix = Math.min(r.max, Math.max(r.min, n));
            return { level: 'err', msg: `${TL('laser.v.range', 'Allowed range')} ${r.min}–${r.max} ${r.unit}.`, fix: String(fix) };
        }
        return null;
    }
    const TABS = [['MACHINES', TL('laser.tab.MACHINES', 'Lasers')], ['PROJECTS', TL('laser.tab.PROJECTS', 'Projects')], ['TESTS', TL('laser.tab.TESTS', 'Tests')], ['IMPORTS', TL('laser.tab.IMPORTS', 'Import Lab')], ['MATERIALS', TL('laser.tab.MATERIALS', 'Materials')], ['UTIL', TL('laser.tab.UTIL', 'Utilisation')]];
    const ORIGIN_BADGE = { PERSONAL: '🔒', DEMO: '◇', USER: '' };
    const num0 = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
    const fmtMin = (m) => m >= 60 ? `${Math.floor(m / 60)} h${Math.round(m % 60) ? ` ${Math.round(m % 60)} min` : ''}` : `${Math.round(m)} min`;
    const techLabel = (c) => TL('laser.tech.' + c, c);
    /* N2.4g: the machine list as a table in the ONE table engine (field registry) + inline edit of planning fields with the card validation */
    const TABLE_SCOPE = 'LASER.MACHINES';
    const T = (k, fb) => TL(k, fb);
    const TABLE_FIELDS = () => [
        { key: 'name', type: 'TEXT', label: T('laser.col.name', 'Name'), info: T('laser.help.name', 'Name of the laser.'), width: 220 },
        { key: 'origin', type: 'SELECT', label: T('laser.col.origin', 'Origin'), listId: 'LASER.ORIGIN', info: T('laser.help.origin', 'Own / other own / demo.'), width: 120 },
        { key: 'tech', type: 'TEXT', label: T('laser.col.tech', 'Technology'), info: T('laser.help.tech', 'Source type and head.'), width: 150 },
        { key: 'sources', type: 'TEXT', label: T('laser.col.sources', 'Sources'), info: T('laser.help.sources', 'Wavelength and power.'), width: 130 },
        { key: 'functions', type: 'TEXT', label: T('laser.col.functions', 'Functions'), info: T('laser.fnDerived', 'Derived from the technology, sources and lenses of the laser'), width: 230 },
        { key: 'status', type: 'SELECT', label: T('laser.col.status', 'State'), listId: 'LASER.STATUS', info: T('laser.help.status', 'Only a laser in operation gets jobs.'), width: 110 },
        { key: 'capacityHoursPerDay', type: 'NUMBER', label: T('laser.col.capacity', 'Capacity'), unit: 'h', info: T('laser.help.capacity', 'Hours per day (0–24).'), width: 80 },
        { key: 'util', type: 'NUMBER', label: T('laser.col.util', 'Utilisation'), unit: '%', info: T('laser.help.util', 'Planned against capacity.'), width: 80 },
        { key: 'prepMinutesDefault', type: 'NUMBER', hidden: true, label: T('laser.col.prepOnly', 'Preparation'), unit: 'min', info: T('laser.help.prep', 'Default preparation.'), width: 90 },
        { key: 'finishMinutesDefault', type: 'NUMBER', hidden: true, label: T('laser.col.finish', 'Finishing'), unit: 'min', info: T('laser.help.finish', 'Default finishing.'), width: 90 },
        { key: 'allowOvernight', type: 'BOOL', hidden: true, label: T('laser.col.overnight', 'Overnight'), info: T('laser.help.overnight', 'Unattended overnight jobs.'), width: 80 },
        { key: 'rotary', type: 'TEXT', label: T('laser.col.rotary', 'Rotary'), info: T('laser.help.rotary', 'Enabled rotaries.'), width: 200 },
        { key: 'slide', type: 'TEXT', label: T('laser.col.slide', 'Table'), info: T('laser.help.slide', 'Enabled slide / conveyor.'), width: 160 },
        { key: 'lenses', type: 'TEXT', hidden: true, label: T('laser.col.lenses', 'Lenses'), info: T('laser.help.lenses', 'Focal lengths.'), width: 120 },
        { key: 'outages', type: 'TEXT', hidden: true, label: T('laser.col.outages', 'Next unavailability'), info: T('laser.help.outages', 'Planner allocates nothing.'), width: 150 },
        { key: 'manufacturer', type: 'TEXT', hidden: true, label: T('laser.col.manufacturer', 'Manufacturer'), width: 120 },
        { key: 'model', type: 'TEXT', hidden: true, label: T('laser.col.modelOnly', 'Model'), width: 160 }
    ];
    const STATUS_LIST = () => ({ name: T('laser.list.status', 'Laser state'), owner: OWNER, items: ['ACTIVE', 'MAINTENANCE', 'FAULT', 'OFF'].map(k => ({ key: k, label: T('laser.status.' + k, k) })) });
    const ORIGIN_LIST = () => ({ name: T('laser.list.origin', 'Laser origin'), owner: OWNER, items: ['PERSONAL', 'USER', 'DEMO'].map(k => ({ key: k, label: T('laser.origin.' + k, k) })) });
    function registerTable(core) { if (core.__laserTable)
        return; core.__laserTable = true; try {
        core.lists?.registerList('LASER.STATUS', STATUS_LIST());
        core.lists?.registerList('LASER.ORIGIN', ORIGIN_LIST());
        core.fields?.registerDefaults(TABLE_SCOPE, TABLE_FIELDS());
    }
    catch (e) {
        globalThis.KXBugs?.pushErr?.(e);
    } }
    const EDITABLE = new Set(['status', 'capacityHoursPerDay', 'prepMinutesDefault', 'finishMinutesDefault', 'allowOvernight']);
    /* N2.4h: material library (APP.LASER.MATERIAL) – created once from the seed (P566 + e-shop + added), checked in every editor */
    const WL = ['355', '450', '1064', '10600'];
    const slug = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
    async function materials(core) { return (await core.laserDomain.list('APP.LASER.MATERIAL')).filter((r) => !r.archivedAt).sort((a, b) => String(a.data.group).localeCompare(String(b.data.group), 'cs') || String(a.data.name).localeCompare(String(b.data.name), 'cs')); }
    async function seedMaterials(core, opts, spaceIds) {
        const seed = globalThis.KXLaserMaterialSeed || [];
        if (!seed.length)
            return 0;
        const have = new Set((await core.laserDomain.list('APP.LASER.MATERIAL')).map((r) => r.data.recordUid));
        let n = 0;
        for (const m of seed) {
            const uidM = 'KX.LASER.MATERIAL.' + slug(m.name);
            if (have.has(uidM))
                continue;
            const data = { recordUid: uidM };
            for (const [k, v] of Object.entries(m))
                if (v != null)
                    data[k] = v;
            await core.actions.invoke('ACTION.LASER.MATERIAL.SAVE', { spaceIds, data }, { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.CONFIG.EDIT'], confirmed: true });
            n++;
        }
        return n;
    }
    function checkMaterial(mat, machine, srcsOf, allMachines = []) {
        if (!mat)
            return { level: 'none' };
        const d = mat.data;
        const wl = (m) => srcsOf(m.id).map((x) => String(x.data.wavelengthNm));
        const compatOn = (m) => { if (!d.compat)
            return 'UNKNOWN'; const vals = wl(m).map((w) => d.compat[w]).filter(Boolean); if (!vals.length)
            return 'UNKNOWN'; return vals.includes('OK') ? 'OK' : vals.includes('PREP') ? 'PREP' : 'NO'; };
        const c = machine ? compatOn(machine) : 'UNKNOWN';
        const others = c === 'NO' ? allMachines.filter((m) => m.id !== machine?.id && compatOn(m) === 'OK').map((m) => ({ id: m.id, name: m.data.name })) : [];
        const level = d.status === 'FORBIDDEN' ? 'err' : (d.status === 'CAUTION' || c === 'NO' || c === 'PREP') ? 'warn' : 'ok';
        return { level, status: d.status, title: d.hazardTitle || '', why: d.why || '', whatToDo: d.whatToDo || '', compat: c, others, prep: d.prep || '', verified: d.verified === true, source: d.source };
    }
    /* N2.4h: basic grid test (material test) guide per material × laser technology – starting points marked „default – verify“;
       a material can override it with its own note (data.gridNote). Axes follow LightBurn Material Test / LaserPecker Design Space. */
    function gridGuide(mat, machine, srcsOf) {
        const d = mat?.data || {};
        const t = new Set(machine?.data?.technologyCodes || []);
        const wl = machine ? srcsOf(machine.id).map((x) => Number(x.data.wavelengthNm)) : [];
        const g = String(d.group || '');
        const n = String(d.name || '').toLowerCase();
        let kind = 'GENERIC';
        if (t.has('LP4'))
            kind = 'LP4';
        else if (t.has('FIBER_MOPA'))
            kind = (g === 'Kovy' && /nerez|titan|stainless/.test(n)) ? 'MOPA_COLOR' : g === 'Kovy' ? 'MOPA_METAL' : 'MOPA_OTHER';
        else if (t.has('FIBER'))
            kind = 'FIBER';
        else if (t.has('UV'))
            kind = 'UV';
        else if (t.has('CO2'))
            kind = 'CO2';
        else if (t.has('DIODE'))
            kind = 'DIODE';
        const special = /sklo|glass/.test(n) ? 'GLASS' : /kůže|kuze|leather|koženka/.test(n) ? 'LEATHER' : /elox|anod/.test(n) ? 'ANODIZED' : /břidlice|bridlice|slate|kámen|kamen|stone/.test(n) ? 'STONE' : /akryl|pmma/.test(n) ? 'ACRYLIC' : '';
        return { kind, special, axes: TL('laser.grid.axes.' + kind, ''), range: TL('laser.grid.range.' + kind, ''), fixed: TL('laser.grid.fixed.' + kind, ''), note: special ? TL('laser.grid.special.' + special, '') : '', own: d.gridNote || '',
            steps: [1, 2, 3, 4, 5, 6].map(i => TL('laser.grid.step' + i, '')), blocked: d.status === 'FORBIDDEN' ? TL('laser.grid.blocked', '') : '' };
    }
    function gridGuideHtml(gg) {
        if (!gg)
            return '';
        return `<div class="kx-grid-guide" data-grid-guide="${esc(gg.kind)}"><b>${esc(TL('laser.grid.title', 'Grid test'))}</b> <small class="muted">${esc(TL('laser.grid.defaultVerify', 'default – verify'))}</small>
      ${gg.blocked ? `<p class="kx-off">⛔ ${esc(gg.blocked)}</p>` : ''}<p><b>${esc(TL('laser.grid.axesLabel', 'Axes'))}:</b> ${esc(gg.axes)}</p><p><b>${esc(TL('laser.grid.rangeLabel', 'Start ranges'))}:</b> ${esc(gg.range)}</p><p><b>${esc(TL('laser.grid.fixedLabel', 'Keep fixed'))}:</b> ${esc(gg.fixed)}</p>
      ${gg.note ? `<p>⚠ ${esc(gg.note)}</p>` : ''}${gg.own ? `<p><b>${esc(TL('laser.grid.ownLabel', 'Your note'))}:</b> ${esc(gg.own)}</p>` : ''}<ol>${gg.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>`;
    }
    /* N2.4i: accessories of the user's machines – rotaries D60 / D80 / ring for the MOPA, LaserPecker Rotary Extension + Slide for the LP4.
       Unknown values (steps per rotation, axis of D60 / D80) stay EMPTY – the card asks to fill them; sources are stated. */
    const ACC_SEEDS = () => ({
        'KX.LASER.PERSONAL.HAOTIAN_MOPA_60W_JPT_M7': [{ id: 'D60', kind: 'CHUCK', name: TL('laser.accSeed.D60', 'Rotary D60 (chuck)'), chuckDiameterMm: 60, source: 'USER', verified: false, enabled: false, state: 'OK' }, { id: 'D80', kind: 'CHUCK', name: TL('laser.accSeed.D80', 'Rotary D80 (chuck)'), chuckDiameterMm: 80, source: 'USER', verified: false, enabled: true, state: 'OK' }, { id: 'RING', kind: 'RING', name: TL('laser.accSeed.RING', 'Ring rotary (jewellery)'), source: 'USER', verified: false, enabled: true, state: 'OK' }],
        'KX.LASER.PERSONAL.LASERPECKER_LP4': [{ id: 'LP_ROTARY', kind: 'LP_ROTARY', name: 'LaserPecker Rotary Extension', maxObjectMm: 200, jaws: [{ name: TL('laser.accSeed.jawChuck', 'chuck'), minMm: 52, maxMm: 80 }, { name: TL('laser.accSeed.jaw1', 'single-step jaws'), minMm: 66, maxMm: 145 }, { name: TL('laser.accSeed.jaw2', 'double-step jaws'), minMm: 1, maxMm: 128 }, { name: TL('laser.accSeed.jawStud', 'stud set'), minMm: 13, maxMm: 78 }], workAreaMm: { w: 160, h: 628 }, command: 'M3032', source: 'MANUFACTURER', verified: false, enabled: true, state: 'OK' },
            { id: 'LP_SLIDE', kind: 'SLIDE', name: 'LaserPecker Slide Extension', workAreaMm: { w: 160, h: 300 }, command: 'M3031', source: 'P566', verified: false, enabled: true, state: 'OK' }]
    });
    async function ensureAccessories(core, opts) {
        let n = 0;
        for (const m of await machines(core)) {
            const want = ACC_SEEDS()[m.data.recordUid];
            if (!want)
                continue;
            const have = new Set((m.data.accessories || []).map((a) => a.id));
            const add = want.filter(a => !have.has(a.id));
            if (add.length) {
                await updatePlanning(core, opts, m.id, { accessories: [...(m.data.accessories || []), ...add] });
                n += add.length;
            }
        }
        return n;
    }
    /* N2.4j: profiles (software × source × mode × lens) from the P566 presets – a project needs machine → source → profile → lenses.
       MOPA: one profile per lens (LightBurn), focus 174 mm known only for 110 mm. LP4: 450 / 1064 nm × Standard / Slide / Rotary (LightBurn + Design Space),
       integrated optics (no invented focal length; working distance 150 mm per P566). */
    const PROFILE_SEEDS = () => ({
        'KX.LASER.PERSONAL.HAOTIAN_MOPA_60W_JPT_M7': [110, 210, 310].map(f => ({ id: 'hao' + f, name: TL('laser.prof.lens', '{f} mm lens').replace('{f}', String(f)), nm: 1064, mode: 'Standard', software: 'LightBurn', lens: f, speedUnit: 'mm/s', ...(f === 110 ? { focusMm: 174 } : {}), notes: f === 110 ? TL('laser.prof.focus174', 'focus 174 mm (original program)') : '' })),
        'KX.LASER.PERSONAL.LASERPECKER_LP4': [['450', 'std', 'Standard', '160 × 120 mm', 'M3010', 'M3030'], ['ir', 'std', 'Standard', '160 × 120 mm', 'M3011', 'M3030'], ['450', 'slide', 'Slide Extension', '160 × 300 mm', 'M3010', 'M3031'], ['ir', 'slide', 'Slide Extension', '160 × 300 mm', 'M3011', 'M3031'], ['450', 'rot', 'Rotary', '160 × 628 mm', 'M3010', 'M3032'], ['ir', 'rot', 'Rotary', '160 × 628 mm', 'M3011', 'M3032']].map(([w, m, mode, area, lc, mc]) => ({ id: `lp4_${w}_${m}`, name: `${w === '450' ? '450' : '1064'} nm · ${mode === 'Slide Extension' ? 'Slide' : mode}`, nm: w === '450' ? 450 : 1064, mode, software: 'LightBurn + LaserPecker Design Space', lens: 'INTEGRATED', speedUnit: 'Depth %', workspace: area, focusMm: 150, maxSpeedMmS: 4000, laserCommand: lc, modeCommand: mc, notes: `${TL('laser.prof.area', 'work area')} ${area} · ${TL('laser.prof.distance', 'working distance 150 mm')} · ${lc} / ${mc} (P566)` }))
    });
    async function ensureProfiles(core, opts) {
        let n = 0;
        const all = await core.laserDomain.list();
        const C2 = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.CONFIG.EDIT'], confirmed: true };
        for (const m of await machines(core)) {
            const want = PROFILE_SEEDS()[m.data.recordUid];
            if (!want)
                continue;
            const srcs = all.filter((x) => x.type === 'APP.LASER.SOURCE_MODULE' && x.data.machineId === m.id && !x.archivedAt);
            let lenses = all.filter((x) => x.type === 'APP.LASER.LENS' && x.data.machineId === m.id && !x.archivedAt);
            if (want.some(w => w.lens === 'INTEGRATED') && !lenses.some((l) => l.data.recordUid === 'KX.LASER.LENS.' + m.data.recordUid.split('.').pop() + '_INTEGRATED')) {
                const l = await core.actions.invoke('ACTION.LASER.LENS.SAVE', { spaceIds: m.spaceIds, data: { recordUid: 'KX.LASER.LENS.' + m.data.recordUid.split('.').pop() + '_INTEGRATED', machineId: m.id, name: TL('laser.prof.integrated', 'Integrated optics'), kind: 'OTHER', notes: TL('laser.prof.distance', 'working distance 150 mm') + ' (P566)' } }, C2);
                lenses = [...lenses, l];
                n++;
            }
            /* N2.6b+ (P566 1:1): fill only MISSING source data (power, capabilities) and structured profile data – never overwrite what the user set */
            const seedM = SEEDS.find((x) => x.uid === m.data.recordUid);
            for (const ss of (seedM?.sources || [])) {
                const src = srcs.find((x) => Number(x.data.wavelengthNm) === ss.nm);
                if (!src)
                    continue;
                const patch = {};
                if (src.data.nominalPowerW == null && ss.w != null)
                    patch.nominalPowerW = ss.w;
                if (!src.data.capabilities && ss.caps && globalThis.KXLaserGuard?.PRESET_CAPS?.[ss.caps])
                    patch.capabilities = { ...globalThis.KXLaserGuard.PRESET_CAPS[ss.caps] };
                if (Object.keys(patch).length) {
                    try {
                        await core.actions.invoke('ACTION.LASER.SOURCE_MODULE.SAVE', { id: src.id, expectedRevision: src.revision, spaceIds: src.spaceIds, data: { ...src.data, ...patch } }, C2);
                        n++;
                    }
                    catch (err) {
                        globalThis.KXBugs?.pushErr?.(err);
                    }
                }
            }
            const PK = ['speedUnit', 'workspace', 'focusMm', 'maxSpeedMmS', 'laserCommand', 'modeCommand'];
            for (const w of want) {
                const ex = all.find((x) => x.type === 'APP.LASER.PROFILE' && x.data.recordUid === 'KX.LASER.PROFILE.' + w.id && !x.archivedAt);
                if (!ex)
                    continue;
                const patch = {};
                for (const k of PK)
                    if ((ex.data[k] == null || ex.data[k] === '') && w[k] != null)
                        patch[k] = w[k];
                if (Object.keys(patch).length) {
                    try {
                        await core.actions.invoke('ACTION.LASER.PROFILE.SAVE', { id: ex.id, expectedRevision: ex.revision, spaceIds: ex.spaceIds, data: { ...ex.data, ...patch } }, C2);
                        n++;
                    }
                    catch (err) {
                        globalThis.KXBugs?.pushErr?.(err);
                    }
                }
            }
            const have = new Set(all.filter((x) => x.type === 'APP.LASER.PROFILE').map((x) => x.data.recordUid));
            for (const w of want) {
                const uidP = 'KX.LASER.PROFILE.' + w.id;
                if (have.has(uidP))
                    continue;
                const src = srcs.find((x) => Number(x.data.wavelengthNm) === w.nm);
                if (!src)
                    continue;
                const lens = w.lens === 'INTEGRATED' ? lenses.find((l) => String(l.data.recordUid || '').endsWith('_INTEGRATED')) : lenses.find((l) => Number(l.data.focalLengthMm) === w.lens);
                await core.actions.invoke('ACTION.LASER.PROFILE.SAVE', { spaceIds: m.spaceIds, data: { recordUid: uidP, machineId: m.id, sourceModuleId: src.id, name: w.name, mode: w.mode, software: w.software, defaultLensId: lens?.id, notes: w.notes, ...Object.fromEntries(['speedUnit', 'workspace', 'focusMm', 'maxSpeedMmS', 'laserCommand', 'modeCommand'].filter(k => w[k] != null).map(k => [k, w[k]])) } }, C2);
                n++;
            }
        }
        return n;
    }
    /* N2.4j: layer parameters in the LightBurn 2.1 order; only fields the machine can do; guard ranges from P566 (JPT M7: 1–4000 kHz, 2–500 ns) */
    const PARAMS = [{ k: 'speedMmPerS', u: 'mm/s', min: 0.1, max: 20000, need: 'GALVO' }, { k: 'speedMmPerMin', u: 'mm/min', min: 1, max: 240000, need: 'NOGALVO' }, { k: 'powerPercent', u: '%', min: 0, max: 100 }, { k: 'frequencyKHz', u: 'kHz', min: 1, max: 4000, need: 'GALVO' }, { k: 'qPulseNs', u: 'ns', min: 2, max: 500, need: 'FIBER_MOPA' },
        { k: 'lineIntervalMm', u: 'mm', min: 0.001, max: 5 }, { k: 'dpi', u: 'DPI', min: 10, max: 5000, need: 'NOGALVO' }, { k: 'passes', u: '×', min: 1, max: 100 }, { k: 'hatchAngleDeg', u: '°', min: 0, max: 360, need: 'GALVO' }, { k: 'wobbleMm', u: 'mm', min: 0, max: 10, need: 'GALVO' }, { k: 'depthPercent', u: '%', min: 0, max: 100, need: 'LP4' }];
    /* ---------- N2.6b+ LAYER EDITOR (P566 1:1 + LightBurn): catalogue of 88 parameters (docs/laser/LASER_LAYER_PARAMS_CZ.json), sections by mode,
       only what the chosen SOURCE can do (ACTION.LASER.CAPS.FOR), ⓘ description per field, live cut-off guard (ACTION.LASER.GUARD.CHECK):
       red / orange panel + highlighted fields + one-click fix; inherited values from the parent layer as hints; saves core values + extras ---------- */
    const LCAT = [{ "g": "evidence", "params": [{ "k": "projectName", "lb": "Project name", "t": "text", "st": "title", "req": true }, { "k": "machine", "lb": "Laser", "t": "machine", "st": "machineId", "req": true }, { "k": "preset", "lb": "Profile / lens / mode", "t": "profile", "st": "profileId", "req": true }, { "k": "projectSoftware", "lb": "Software", "t": "select", "st": "extras", "opts": ["LIGHTBURN", "EZCAD_2", "EZCAD_3", "LASERPECKER_DESIGN_SPACE", "XTOOL_CREATIVE_SPACE", "RDWORKS", "JINY"] }, { "k": "projectSoftwareVersion", "lb": "Version", "t": "text", "st": "extras" }, { "k": "speedUnit", "lb": "Speed unit", "t": "select", "st": "extras", "opts": ["MM_S", "MM_MIN", "MM_ROTATION", "DEPTH", "VLASTNI"] }, { "k": "nativeDepth", "lb": "Depth", "t": "number", "st": "depthPercent", "u": "%", "min": 0, "max": 100 }, { "k": "material", "lb": "Material", "t": "material", "st": "material", "req": true }, { "k": "thickness", "lb": "Thickness", "t": "number", "st": "extras", "u": "mm", "min": 0 }, { "k": "focusOffset", "lb": "Focus offset", "t": "number", "st": "extras", "u": "mm" }, { "k": "surface", "lb": "Surface", "t": "text", "st": "extras" }, { "k": "quantity", "lb": "Quantity", "t": "number", "st": "extras", "min": 1 }, { "k": "purpose", "lb": "Purpose / effect", "t": "select", "st": "extras", "opts": ["GRAVIROVANI", "HLUBOKE_GRAVIROVANI", "3D_RELIEF", "ZNACENI", "CERNE_ZNACENI", "BAREVNE_ZNACENI", "REZANI", "CISTENI_ODSTRANENI_POVRCHU", "TESTOVACI_MATICE"] }, { "k": "result", "lb": "Result", "t": "select", "st": "extras", "opts": ["NEOZNACENO", "FINALNI_NEJLEPSI", "TEST_ROZPRACOVANO", "NEVYHOVUJE"] }, { "k": "projectFile", "lb": "Project file", "t": "file", "st": "extras" }, { "k": "time", "lb": "Time", "t": "duration", "st": "timing" }, { "k": "projectFavorite", "lb": "Favourite", "t": "checkbox", "st": "extras" }, { "k": "projectLocked", "lb": "Lock parameters", "t": "checkbox", "st": "extras" }, { "k": "projectTags", "lb": "Tags", "t": "tags", "st": "tags" }] }, { "g": "layer", "params": [{ "k": "layerName", "lb": "Name", "t": "text", "st": "name" }, { "k": "output", "lb": "Output", "t": "select", "st": "extras", "opts": ["ANO", "NE"] }, { "k": "layer", "lb": "LightBurn layer", "t": "text", "st": "layerName" }, { "k": "speed", "lb": "Speed", "t": "number", "st": "speedMmPerS", "u": "mm/s", "min": 0 }, { "k": "power", "lb": "Max Power", "t": "number", "st": "powerPercent", "u": "%", "min": 0, "max": 100 }, { "k": "minPower", "lb": "Min Power", "t": "number", "st": "extras", "u": "%", "min": 0, "max": 100, "modes": ["LINE", "FILL", "OFFSET_FILL", "IMAGE"] }, { "k": "frequency", "lb": "Frequency", "t": "number", "st": "frequencyKHz", "u": "kHz", "min": 1, "cap": "frequency" }, { "k": "pulseWidth", "lb": "Q-Pulse Width", "t": "number", "st": "qPulseNs", "u": "ns", "min": 1, "cap": "qpulse" }, { "k": "globalPasses", "lb": "Global Passes", "t": "number", "st": "extras", "min": 1 }, { "k": "useLaser2", "lb": "Use Laser 2", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "constantPower", "lb": "Constant Power Mode", "t": "select", "st": "extras", "opts": ["NE_M4_VARIABLE", "ANO_M3_CONSTANT"] }, { "k": "airAssist", "lb": "Air Assist", "t": "select", "st": "extras", "cap": "airAssist", "opts": ["NE", "ANO", "N_A"] }, { "k": "mode", "lb": "Mode", "t": "select", "st": "operationType", "opts": ["LINE", "FILL", "OFFSET_FILL", "IMAGE"] }] }, { "g": "line", "params": [{ "k": "passes", "lb": "Number of Passes", "t": "number", "st": "passes", "min": 1 }, { "k": "zOffset", "lb": "Z Offset", "t": "number", "st": "extras", "u": "mm" }, { "k": "zStep", "lb": "Z Step per Pass", "t": "number", "st": "extras", "u": "mm" }, { "k": "kerfOffset", "lb": "Kerf Offset", "t": "number", "st": "extras", "u": "mm" }, { "k": "perforationEnabled", "lb": "Perforation Mode", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "perforationCut", "lb": "Cut Length", "t": "number", "st": "extras", "u": "mm", "min": 0 }, { "k": "perforationSkip", "lb": "Skip Length", "t": "number", "st": "extras", "u": "mm", "min": 0 }, { "k": "tabsEnabled", "lb": "Tabs / Bridges", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "cutThrough", "lb": "Cut Through", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "pausePower", "lb": "Cut Through Power", "t": "number", "st": "extras", "u": "%", "min": 0, "max": 100 }, { "k": "overcutEnabled", "lb": "Overcut", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "overcut", "lb": "Overcut Distance", "t": "number", "st": "extras", "u": "mm", "min": 0 }, { "k": "leadInEnabled", "lb": "Lead-In", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "leadInAngle", "lb": "Lead-In Angle", "t": "number", "st": "extras", "u": "\u00b0" }, { "k": "leadInLength", "lb": "Lead-In Length", "t": "number", "st": "extras", "u": "mm", "min": 0 }, { "k": "leadInStyle", "lb": "Lead-In Style", "t": "select", "st": "extras", "opts": ["CARA", "OBLOUK"] }, { "k": "leadOutEnabled", "lb": "Lead-Out", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "leadOutAngle", "lb": "Lead-Out Angle", "t": "number", "st": "extras", "u": "\u00b0" }, { "k": "leadOutLength", "lb": "Lead-Out Length", "t": "number", "st": "extras", "u": "mm", "min": 0 }, { "k": "leadOutStyle", "lb": "Lead-Out Style", "t": "select", "st": "extras", "opts": ["CARA", "OBLOUK"] }, { "k": "dotModeEnabled", "lb": "Dot Mode", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "dotTime", "lb": "Dot Time", "t": "number", "st": "extras", "u": "ms", "min": 0 }, { "k": "dotSpacing", "lb": "Dot Spacing", "t": "number", "st": "extras", "u": "mm", "min": 0 }, { "k": "overridePwmFrequency", "lb": "Override PWM Frequency", "t": "number", "st": "extras", "u": "kHz", "min": 0 }, { "k": "ppiEnabled", "lb": "PPI", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "ppiValue", "lb": "PPI Value", "t": "number", "st": "extras", "min": 0 }, { "k": "uOffset", "lb": "U Offset", "t": "number", "st": "extras", "u": "mm" }], "modes": ["LINE"] }, { "g": "fill", "params": [{ "k": "bidirectional", "lb": "Bi-directional Fill", "t": "select", "st": "extras", "opts": ["ANO", "NE"] }, { "k": "crossHatch", "lb": "Cross-Hatch", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "overscanEnabled", "lb": "Overscanning", "t": "select", "st": "extras", "cap": "overscan", "opts": ["NE", "ANO"] }, { "k": "overscan", "lb": "Overscan", "t": "number", "st": "extras", "u": "%", "min": 0, "cap": "overscan" }, { "k": "lineInterval", "lb": "Line Interval", "t": "number", "st": "lineIntervalMm", "u": "mm", "min": 0 }, { "k": "dpi", "lb": "Lines per Inch / DPI", "t": "number", "st": "dpi", "min": 0 }, { "k": "scanAngle", "lb": "Scan Angle", "t": "number", "st": "hatchAngleDeg", "u": "\u00b0" }, { "k": "fillGrouping", "lb": "Fill Grouping", "t": "select", "st": "extras", "opts": ["VYCHOZI_AUTO", "VSECHNY_TVARY_NAJEDNOU", "PO_SKUPINACH", "PO_JEDNOTLIVYCH_TVARECH"] }, { "k": "rampLength", "lb": "Ramp Length", "t": "number", "st": "extras", "u": "mm", "min": 0 }, { "k": "floodFill", "lb": "Flood Fill", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "rampOuterEdge", "lb": "Ramp Outer Edge", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }], "modes": ["FILL"] }, { "g": "image", "params": [{ "k": "imageMode", "lb": "Image Mode", "t": "select", "st": "extras", "opts": ["THRESHOLD", "ORDERED", "ATKINSON", "DITHER", "STUCKI", "JARVIS", "NEWSPRINT", "HALFTONE", "SKETCH", "GRAYSCALE", "3D_SLICED"] }, { "k": "negativeImage", "lb": "Negative Image", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "dotWidth", "lb": "Dot Width Correction", "t": "number", "st": "extras", "u": "mm" }, { "k": "angleIncrement", "lb": "Angle Increment", "t": "number", "st": "extras", "u": "\u00b0" }, { "k": "cellsPerInch", "lb": "Cells per Inch", "t": "number", "st": "extras" }, { "k": "halftoneAngle", "lb": "Halftone Angle", "t": "number", "st": "extras", "u": "\u00b0" }, { "k": "passThrough", "lb": "Pass-Through", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }], "modes": ["IMAGE"] }, { "g": "imageAdjust", "params": [{ "k": "gamma", "lb": "Gamma", "t": "number", "st": "extras" }, { "k": "contrast", "lb": "Contrast", "t": "number", "st": "extras" }, { "k": "brightness", "lb": "Brightness", "t": "number", "st": "extras" }, { "k": "enhanceRadius", "lb": "Enhance Radius", "t": "number", "st": "extras" }, { "k": "enhanceAmount", "lb": "Enhance Amount", "t": "number", "st": "extras" }, { "k": "enhanceDenoise", "lb": "Enhance Denoise", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }], "modes": ["IMAGE"] }, { "g": "galvo", "params": [{ "k": "wobble", "lb": "Wobble", "t": "select", "st": "extras", "cap": "wobble", "opts": ["NE", "ANO"] }, { "k": "wobbleSize", "lb": "Wobble Size", "t": "number", "st": "wobbleMm", "u": "mm", "cap": "wobble" }, { "k": "wobbleStep", "lb": "Wobble Step", "t": "number", "st": "extras", "u": "mm", "cap": "wobble" }, { "k": "autoRotate", "lb": "Auto-Rotate", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "dotWidthAdjust", "lb": "Dot Width Adjust", "t": "number", "st": "extras", "u": "mm" }], "cap": "wobble" }, { "g": "depth3d", "params": [{ "k": "cleanupPass", "lb": "Enable Cleanup Pass", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "cleanAfter", "lb": "Clean after # of passes", "t": "number", "st": "extras", "min": 1 }, { "k": "cleanWhole", "lb": "Clean Whole Image", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "depthMapFile", "lb": "Depth map", "t": "file", "st": "extras" }], "cap": "sliced3d" }, { "g": "galvoTimings", "params": [{ "k": "overrideTimings", "lb": "Override Default Timings", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "jumpSpeed", "lb": "Jump Speed", "t": "number", "st": "extras", "u": "mm/s" }, { "k": "minJumpDelay", "lb": "Min Jump Delay", "t": "number", "st": "extras", "u": "\u00b5s" }, { "k": "maxJumpDelay", "lb": "Max Jump Delay", "t": "number", "st": "extras", "u": "\u00b5s" }, { "k": "jumpDistanceLimit", "lb": "Jump Distance Limit", "t": "number", "st": "extras", "u": "mm" }, { "k": "laserOnTC", "lb": "Laser On TC", "t": "number", "st": "extras", "u": "\u00b5s" }, { "k": "laserOffTC", "lb": "Laser Off TC", "t": "number", "st": "extras", "u": "\u00b5s" }, { "k": "endTC", "lb": "End TC", "t": "number", "st": "extras", "u": "\u00b5s" }, { "k": "polygonTC", "lb": "Polygon TC", "t": "number", "st": "extras", "u": "\u00b5s" }, { "k": "pauseBefore", "lb": "Pause Before", "t": "number", "st": "extras", "u": "ms" }, { "k": "pauseAfter", "lb": "Pause After", "t": "number", "st": "extras", "u": "ms" }], "cap": "galvoTimings" }, { "g": "rotary", "params": [{ "k": "rotaryEnabled", "lb": "Rotary Enabled", "t": "select", "st": "extras", "opts": ["NE", "ANO"] }, { "k": "rotaryType", "lb": "Rotary type", "t": "select", "st": "extras", "opts": ["CHUCK", "ROLLER", "JINY"] }, { "k": "rotaryAxis", "lb": "Axis", "t": "select", "st": "extras", "opts": ["Y", "X"] }, { "k": "objectDiameter", "lb": "Object diameter", "t": "number", "st": "rotaryDiameterMm", "u": "mm" }, { "k": "circumference", "lb": "Circumference", "t": "number", "st": "rotaryCircumferenceMm", "u": "mm" }, { "k": "rotationSpeed", "lb": "mm per rotation", "t": "number", "st": "extras", "u": "mm/rot" }], "cap": "rotary" }, { "g": "lds", "params": [{ "k": "ldsResolution", "lb": "Resolution", "t": "select", "st": "extras", "opts": ["1K", "2K", "4K"] }, { "k": "engravingDensity", "lb": "Engraving Density", "t": "number", "st": "extras", "min": 0 }, { "k": "lowerFocus", "lb": "Lower Focus", "t": "number", "st": "extras", "u": "mm", "min": 0 }] }, { "g": "notes", "params": [{ "k": "preparation", "lb": "Preparation", "t": "textarea", "st": "extras" }, { "k": "notes", "lb": "Result notes", "t": "textarea", "st": "notes" }, { "k": "gallery", "lb": "Photos", "t": "gallery", "st": "extras" }] }];
    const LC_CORE = { speed: 'speedMmPerS', power: 'powerPercent', frequency: 'frequencyKHz', pulseWidth: 'qPulseNs', lineInterval: 'lineIntervalMm', dpi: 'dpi', passes: 'passes', scanAngle: 'hatchAngleDeg', wobbleSize: 'wobbleMm', objectDiameter: 'rotaryDiameterMm', circumference: 'rotaryCircumferenceMm' };
    const LC_GUARD_FIELD = { frequencyKHz: 'frequency', qPulseNs: 'pulseWidth', powerPercent: 'power', speedMmPerS: 'speed', passes: 'passes' };
    const LC_LAYER_GROUPS = ['layer', 'line', 'fill', 'image', 'imageAdjust', 'galvo', 'depth3d', 'galvoTimings', 'rotary', 'lds'];
    function lcValue(op, k, st) { const pr = op?.data?.parameters || {}; if (st === 'name')
        return op?.data?.name; if (st === 'layerName')
        return op?.data?.layerName; if (st === 'operationType')
        return pr.extras?.mode || ''; if (LC_CORE[k])
        return pr[LC_CORE[k]]; return pr.extras?.[k]; }
    const YES = (x) => ['ANO', 'YES', 'TRUE', '1'].includes(String(x || '').toUpperCase());
    const LBL = (c) => c.softwareId === 'lightburn';
    const LINE = (c) => c.mode === 'Line';
    const FILL = (c) => c.mode === 'Fill';
    const IMG = (c) => c.mode === 'Image';
    const NG = (c) => c.controller !== 'galvo';
    const GV = (c) => c.controller === 'galvo';
    const LBLINE = (c) => LBL(c) && LINE(c) && NG(c);
    const NOTW = (c) => c.variant !== 'topwisdom';
    const RUIDA = (c) => c.controller === 'dsp' && c.variant === 'ruida';
    const VEC = (c) => ['Line', 'Fill', 'Offset Fill'].includes(c.mode);
    const LC_WHEN = {
        speed: c => !(c.softwareId === 'lds' && c.lp4), nativeDepth: c => c.softwareId === 'lds' && c.lp4, minPower: c => (LBL(c) && c.controller === 'dsp') || (IMG(c) && c.imageMode === 'GRAYSCALE'),
        frequency: c => GV(c) && !!c.cap?.frequency, pulseWidth: c => GV(c) && !!c.cap?.pulse && ['mopa-fiber', 'uv'].includes(c.sourceType), globalPasses: c => GV(c) && LBL(c), useLaser2: c => GV(c) && LBL(c),
        constantPower: c => c.controller === 'gcode' && LBL(c), airAssist: c => ['gcode', 'dsp'].includes(c.controller) && !!c.cap?.air,
        passes: c => ['Line', 'Cut'].includes(c.mode), zOffset: c => LINE(c) && NG(c), zStep: c => LINE(c) && NG(c), kerfOffset: c => LINE(c) && NG(c),
        wobble: c => LINE(c) && GV(c) && !!c.cap?.wobble, wobbleSize: c => LINE(c) && GV(c) && !!c.cap?.wobble, wobbleStep: c => LINE(c) && GV(c) && !!c.cap?.wobble,
        bidirectional: FILL, crossHatch: FILL, lineInterval: c => FILL(c) && c.softwareId !== 'lds', dpi: c => FILL(c) && c.softwareId !== 'lds', scanAngle: FILL,
        fillGrouping: c => FILL(c) && LBL(c), overscanEnabled: c => FILL(c) && c.controller === 'gcode' && LBL(c), overscan: c => FILL(c) && c.controller === 'gcode' && LBL(c),
        rampLength: c => FILL(c) && NG(c) && LBL(c), floodFill: c => FILL(c) && NG(c) && LBL(c), autoRotate: c => FILL(c) && GV(c) && LBL(c), angleIncrement: c => (FILL(c) && GV(c) && LBL(c)) || IMG(c), dotWidth: c => (FILL(c) && GV(c) && LBL(c)) || IMG(c),
        negativeImage: IMG, imageMode: IMG, passThrough: c => IMG(c) && LBL(c), cellsPerInch: c => IMG(c) && c.imageMode === 'HALFTONE', halftoneAngle: c => IMG(c) && c.imageMode === 'HALFTONE',
        gamma: c => IMG(c) && !YES(c.passThrough), contrast: c => IMG(c) && !YES(c.passThrough), brightness: c => IMG(c) && !YES(c.passThrough), enhanceRadius: c => IMG(c) && !YES(c.passThrough), enhanceAmount: c => IMG(c) && !YES(c.passThrough), enhanceDenoise: c => IMG(c) && !YES(c.passThrough),
        cleanupPass: c => IMG(c) && c.imageMode === '3D_SLICED' && GV(c) && !!c.cap?.threeD, cleanAfter: c => IMG(c) && c.imageMode === '3D_SLICED' && GV(c) && !!c.cap?.threeD, cleanWhole: c => IMG(c) && c.imageMode === '3D_SLICED' && GV(c) && !!c.cap?.threeD, depthMapFile: c => IMG(c) && c.imageMode === '3D_SLICED' && GV(c) && !!c.cap?.threeD,
        overrideTimings: c => GV(c) && !!c.cap?.timings, jumpSpeed: c => GV(c) && !!c.cap?.timings, minJumpDelay: c => GV(c) && !!c.cap?.timings, maxJumpDelay: c => GV(c) && !!c.cap?.timings, jumpDistanceLimit: c => GV(c) && !!c.cap?.timings, laserOnTC: c => GV(c) && !!c.cap?.timings, laserOffTC: c => GV(c) && !!c.cap?.timings, endTC: c => GV(c) && !!c.cap?.timings, polygonTC: c => GV(c) && !!c.cap?.timings,
        pauseBefore: c => (GV(c) && !!c.cap?.timings) || (LBLINE(c) && NOTW(c)), pauseAfter: c => (GV(c) && !!c.cap?.timings) || (LBLINE(c) && NOTW(c)),
        ldsResolution: c => c.softwareId === 'lds' && ['Fill', 'Image'].includes(c.mode), engravingDensity: c => c.softwareId === 'lds' && !c.lp4 && ['Fill', 'Image'].includes(c.mode), lowerFocus: c => c.softwareId === 'lds' && c.mode === 'Cut',
        perforationEnabled: LBLINE, perforationCut: c => LBLINE(c) && YES(c.v('perforationEnabled')), perforationSkip: c => LBLINE(c) && YES(c.v('perforationEnabled')), tabsEnabled: LBLINE,
        cutThrough: c => LBLINE(c) && NOTW(c), pausePower: c => LBLINE(c) && NOTW(c) && YES(c.v('cutThrough')), overcutEnabled: LBLINE, overcut: c => LBLINE(c) && YES(c.v('overcutEnabled')),
        leadInEnabled: LBLINE, leadInAngle: c => LBLINE(c) && YES(c.v('leadInEnabled')), leadInLength: c => LBLINE(c) && YES(c.v('leadInEnabled')), leadInStyle: c => LBLINE(c) && YES(c.v('leadInEnabled')),
        leadOutEnabled: LBLINE, leadOutAngle: c => LBLINE(c) && YES(c.v('leadOutEnabled')), leadOutLength: c => LBLINE(c) && YES(c.v('leadOutEnabled')), leadOutStyle: c => LBLINE(c) && YES(c.v('leadOutEnabled')),
        dotModeEnabled: c => LBL(c) && LINE(c) && RUIDA(c), dotTime: c => LBL(c) && LINE(c) && RUIDA(c) && YES(c.v('dotModeEnabled')), dotSpacing: c => LBL(c) && LINE(c) && RUIDA(c) && YES(c.v('dotModeEnabled')),
        rampOuterEdge: c => FILL(c) && LBL(c) && NG(c) && Number(c.v('rampLength') || 0) > 0, overridePwmFrequency: c => LBL(c) && RUIDA(c) && VEC(c), ppiEnabled: c => LBL(c) && c.controller === 'dsp' && c.variant === 'trocen' && VEC(c), ppiValue: c => LBL(c) && c.controller === 'dsp' && c.variant === 'trocen' && VEC(c) && YES(c.v('ppiEnabled')), uOffset: c => LBL(c) && RUIDA(c) && VEC(c),
        /* rotary: only with a rotary capable source, the fields when the profile is a rotary one or rotary is switched on; dot width adjust: galvo, fill / image */
        rotaryEnabled: c => !!c.cap?.rotary, rotaryType: c => !!c.cap?.rotary && (c.rotaryProfile || YES(c.v('rotaryEnabled'))), rotaryAxis: c => !!c.cap?.rotary && (c.rotaryProfile || YES(c.v('rotaryEnabled'))), objectDiameter: c => !!c.cap?.rotary && (c.rotaryProfile || YES(c.v('rotaryEnabled'))), circumference: c => !!c.cap?.rotary && (c.rotaryProfile || YES(c.v('rotaryEnabled'))), rotationSpeed: c => !!c.cap?.rotary && (c.rotaryProfile || YES(c.v('rotaryEnabled'))), dotWidthAdjust: c => GV(c) && (FILL(c) || IMG(c))
    };
    const LC_ADV = new Set(['dotWidthAdjust', 'rotaryEnabled', 'minPower', 'globalPasses', 'useLaser2', 'constantPower', 'zOffset', 'zStep', 'kerfOffset', 'wobble', 'wobbleSize', 'wobbleStep', 'fillGrouping', 'overscanEnabled', 'overscan', 'rampLength', 'floodFill', 'autoRotate', 'angleIncrement', 'dotWidth', 'passThrough', 'gamma', 'contrast', 'brightness', 'enhanceRadius', 'enhanceAmount', 'enhanceDenoise', 'cleanupPass', 'cleanAfter', 'cleanWhole', 'depthMapFile', 'overrideTimings', 'jumpSpeed', 'minJumpDelay', 'maxJumpDelay', 'jumpDistanceLimit', 'laserOnTC', 'laserOffTC', 'endTC', 'polygonTC', 'lowerFocus', 'tabsEnabled', 'cutThrough', 'pausePower', 'pauseBefore', 'pauseAfter', 'overcutEnabled', 'overcut', 'leadInEnabled', 'leadInAngle', 'leadInLength', 'leadInStyle', 'leadOutEnabled', 'leadOutAngle', 'leadOutLength', 'leadOutStyle', 'dotModeEnabled', 'dotTime', 'dotSpacing', 'rampOuterEdge', 'overridePwmFrequency', 'ppiEnabled', 'ppiValue', 'uOffset']);
    const LC_MODE_TXT = { LINE: 'Line', FILL: 'Fill', OFFSET_FILL: 'Offset Fill', IMAGE: 'Image', CUT: 'Cut' };
    const LC_SW = { LIGHTBURN: 'lightburn', EZCAD_2: 'ezcad', EZCAD_3: 'ezcad', LASERPECKER_DESIGN_SPACE: 'lds', XTOOL_CREATIVE_SPACE: 'xtool', RDWORKS: 'rdworks' };
    const LC_SRC = { FIBER_MOPA: 'mopa-fiber', FIBER: 'fiber', UV: 'uv', CO2: 'co2', DIODE: 'diode' };
    function lcControllerOf(m) { const t = (m?.data?.technologyCodes || []).map((x) => String(x).toUpperCase()); if (m?.data?.controller)
        return String(m.data.controller).toLowerCase(); if (t.includes('GALVO'))
        return 'galvo'; if (t.includes('DSP') || t.includes('CO2'))
        return 'dsp'; return 'gcode'; }
    function lcSoftwareOf(project, profile) { const ev = String(project?.data?.evidence?.projectSoftware || ''); if (LC_SW[ev])
        return LC_SW[ev]; if (ev)
        return 'other'; const sw = String(profile?.data?.software || ''); return /lightburn/i.test(sw) ? 'lightburn' : /design space|\blds\b/i.test(sw) ? 'lds' : /ezcad/i.test(sw) ? 'ezcad' : 'lightburn'; }
    async function openLayerEditor(core, opts, ctx) {
        const { project, op, layers } = ctx;
        const parent = ctx.parentId ? layers.find((x) => x.id === ctx.parentId) : (op?.data?.parentId ? layers.find((x) => x.id === op.data.parentId) : null);
        const RC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.READ'], confirmed: true };
        let capsRes = null, guardFor = null;
        try {
            capsRes = await core.actions.invoke('ACTION.LASER.CAPS.FOR', { profileId: project.data.profileId }, RC);
        }
        catch { }
        try {
            guardFor = await core.actions.invoke('ACTION.LASER.GUARD.FOR', { profileId: project.data.profileId }, RC);
        }
        catch { }
        const caps = capsRes?.caps || null;
        const mach = await core.laserDomain.get(String(project.data.machineId || ''), 'APP.LASER.MACHINE').catch(() => null);
        const prof = await core.laserDomain.get(String(project.data.profileId || ''), 'APP.LASER.PROFILE').catch(() => null);
        let adv = localStorage.getItem('kx.laser.adv') === '1';
        const CAPMAP = { qpulse: 'pulse', galvoTimings: 'timings', airAssist: 'air', sliced3d: 'threeD' }; /* catalogue names → core capability keys; an unknown name is never treated as allowed */
        const capOk = (c) => { if (!c || !caps)
            return true; const k = CAPMAP[c] || c; return k in caps ? caps[k] === true : false; };
        const G = globalThis.KXLaserGuard;
        const gt = guardFor?.guard?.customTable || (guardFor?.guard?.tableId ? G?.TABLES?.[guardFor.guard.tableId] : null);
        const pulses = (guardFor?.guard?.ranges?.pulseValues) || (gt?.rows || []).map((r) => r.pulse);
        const mode0 = String(lcValue(op, 'mode', 'operationType') || lcValue(parent, 'mode', 'operationType') || 'FILL');
        const field = (q) => {
            const v = lcValue(op, q.k, q.st);
            const inh = parent ? lcValue(parent, q.k, q.st) : undefined;
            const ph = inh != null && inh !== '' ? `↳ ${inh}` : '';
            const lab = TL('lc.' + q.k, q.lb);
            const desc = TL('lc.' + q.k + '.d', '');
            let ctl = '';
            if (q.t === 'select')
                ctl = `<select data-lce="${q.k}"><option value="">${esc(ph || '—')}</option>${(q.opts || []).map((c) => `<option value="${c}" ${String(v ?? '') === c ? 'selected' : ''}>${esc(TL('lc.o.' + q.k + '.' + c, c))}</option>`).join('')}</select>`;
            else if (q.t === 'textarea')
                ctl = `<textarea data-lce="${q.k}" rows="2" placeholder="${esc(ph)}">${esc(v ?? '')}</textarea>`;
            else if (q.t === 'number')
                ctl = `<input data-lce="${q.k}" type="number" step="any" ${q.min != null ? `min="${q.min}"` : ''} ${q.max != null ? `max="${q.max}"` : ''} value="${esc(v ?? '')}" placeholder="${esc(ph)}" ${q.k === 'pulseWidth' && pulses.length ? 'list="lcePulses"' : ''}>`;
            else if (q.t === 'checkbox')
                ctl = `<input data-lce="${q.k}" type="checkbox" ${v ? 'checked' : ''}>`;
            else
                ctl = `<input data-lce="${q.k}" type="text" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`;
            return `<label class="lce-f" data-lce-f="${q.k}" ${q.cap ? `data-cap="${q.cap}"` : ''}><span class="lce-l">${esc(lab)}${q.u ? ` <small>[${esc(q.u)}]</small>` : ''} <i class="lce-i" title="${esc(desc)}" tabindex="0">ⓘ</i></span>${ctl}<small class="lce-h" data-lce-h="${q.k}"></small></label>`;
        };
        const groups = LCAT.filter((g) => LC_LAYER_GROUPS.includes(g.g));
        const w = document.createElement('div');
        w.className = 'lce-wrap';
        w.setAttribute('data-keep-open', '');
        w.setAttribute('data-laser-layer-editor', '');
        w.innerHTML = `<div class="lce" role="dialog" aria-modal="true"><div class="lce-head"><div><b>⚙ ${esc(ctx.title || (op ? TL('lce.edit', 'Layer settings') : TL('lce.new', 'New layer')))}</b><small>${esc(project.data.title || '')}${capsRes?.source ? ` · ${esc(capsRes.source.name)}${capsRes.source.nominalPowerW ? ` ${capsRes.source.nominalPowerW} W` : ''}` : ''}${capsRes?.profile?.name ? ` · ${esc(capsRes.profile.name)}` : ''}</small></div><button type="button" class="icon-btn" data-lce-close title="${esc(TL('vault.cancel', 'Cancel'))}">✕</button></div>
      <div class="lce-sub"><small class="muted" data-lce-ctx></small><span class="kx-seg-mini"><button type="button" data-lce-lvl="0" class="${adv ? '' : 'on'}" title="${esc(TL('lce.lvl.basicHelp', 'Only the usual parameters'))}">${esc(TL('lce.lvl.basic', 'Beginner'))}</button><button type="button" data-lce-lvl="1" class="${adv ? 'on' : ''}" title="${esc(TL('lce.lvl.advHelp', 'All parameters of the program'))}">${esc(TL('lce.lvl.adv', 'Advanced'))}</button></span></div><div class="lce-guard" data-lce-guard hidden></div>${ctx.images?.length ? `<div class="lce-imgs" data-lce-imgs>${ctx.images.map(u => `<img src="${esc(u)}" alt="" data-lce-zoom>`).join('')}<small class="muted">${esc(TL('li.zoomHint', 'Click a picture to enlarge'))}</small></div>` : ''}
      <div class="lce-body">${groups.map((g) => `<details class="lce-g" data-lce-g="${g.g}" ${g.modes ? `data-modes="${g.modes.join(',')}"` : ''} ${g.cap ? `data-cap="${g.cap}"` : ''} open><summary>${esc(TL('lc.g.' + g.g, g.g))}</summary><div class="lce-grid">${g.params.map(field).join('')}</div></details>`).join('')}</div>
      ${pulses.length ? `<datalist id="lcePulses">${pulses.map(x => `<option value="${x}">`).join('')}</datalist>` : ''}
      <div class="lce-foot"><small class="muted">${caps ? esc(TL('lce.capsNote', 'Only parameters the chosen source supports are shown.')) : esc(TL('lce.noCaps', 'Source capabilities unknown – all parameters are shown.'))}</small><span class="lce-err" data-lce-err></span><button type="button" class="btn ghost" data-lce-close>${esc(TL('vault.cancel', 'Cancel'))}</button><button type="button" class="btn primary" data-lce-save>✓ ${esc(TL('cv.save', 'Save'))}</button></div></div>`;
        document.body.appendChild(w);
        ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(ev => w.addEventListener(ev, (e) => e.stopPropagation())); /* clicks never reach the page-level outside-click rule (it closed the Laser window) */
        w.querySelectorAll('[data-lce-zoom]').forEach(im => im.onclick = () => im.classList.toggle('big'));
        const $ = (q) => w.querySelector(q);
        const all = (q) => Array.from(w.querySelectorAll(q));
        const modeSel = $('[data-lce="mode"]');
        if (modeSel && !modeSel.value)
            modeSel.value = mode0;
        const ctxOf = () => { const v = read(); const m = modeSel?.value || mode0; return { controller: lcControllerOf(mach), variant: String(mach?.data?.controllerVariant || '').toLowerCase(), softwareId: lcSoftwareOf(project, prof), sourceType: LC_SRC[String(capsRes?.source?.technologyCode || '')] || '', mode: LC_MODE_TXT[m] || m, imageMode: String(v.imageMode || lcValue(op, 'imageMode', 'extras') || ''), passThrough: String(v.passThrough || ''), cap: caps ? { ...caps, threeD: caps.threeD } : { frequency: true, pulse: true, wobble: true, timings: true, overscan: true, air: true, threeD: true, rotary: true, autoRotate: true }, lp4: (mach?.data?.technologyCodes || []).includes('LP4'), rotaryProfile: /rotary/i.test(String(prof?.data?.mode || prof?.data?.name || '')), v: (k) => v[k] ?? lcValue(op, k, 'extras') }; };
        const vis = () => {
            const c = ctxOf();
            all('[data-lce-f]').forEach(f => { const k = String(f.dataset.lceF); const rule = LC_WHEN[k]; let ok = capOk(f.dataset.cap) && (rule ? rule(c) : true) && (adv || !LC_ADV.has(k)); if (['layerName', 'layer', 'mode', 'output', 'speed', 'power'].includes(k) && !(rule && !rule(c)))
                ok = capOk(f.dataset.cap) || k === 'mode'; f.hidden = !ok; });
            all('[data-lce-g]').forEach(g => { const md = g.dataset.modes; const anyVis = Array.from(g.querySelectorAll('[data-lce-f]')).some(f => !f.hidden); g.hidden = !anyVis || (!!md && !md.split(',').includes(modeSel?.value || mode0) && !g.querySelector('[data-lce-f]:not([hidden])')); });
            const info = $('[data-lce-ctx]');
            if (info)
                info.textContent = `${TL('lce.ctx.ctl', 'controller')}: ${c.controller}${c.variant ? ' (' + c.variant + ')' : ''} · ${TL('lce.ctx.sw', 'program')}: ${c.softwareId} · ${TL('lce.ctx.src', 'source')}: ${c.sourceType || '—'}`;
        };
        const read = () => { const out = {}; all('[data-lce]').forEach((el) => { const k = el.dataset.lce; if (el.type === 'checkbox') {
            out[k] = !!el.checked;
            return;
        } const v = String(el.value ?? '').trim(); if (v !== '')
            out[k] = v; }); return out; };
        const guardParams = () => { const v = read(); const eff = (k) => v[k] ?? (parent ? lcValue(parent, k, LC_CORE[k] ? '' : 'extras') : undefined); const o = {}; for (const [k, dk] of Object.entries(LC_CORE)) {
            if (!LC_GUARD_FIELD[dk])
                continue;
            const x = eff(k);
            if (x != null && x !== '')
                o[dk] = Number(String(x).replace(',', '.'));
        } return o; };
        let ovr = op?.data?.parameters?.extras?.guardOverride || null;
        let gTimer = null;
        const runGuard = async () => {
            all('[data-lce-f]').forEach(f => f.classList.remove('lce-bad', 'lce-warn'));
            all('[data-lce-h]').forEach(h => h.textContent = '');
            const box = $('[data-lce-guard]');
            let r = null;
            try {
                r = await core.actions.invoke('ACTION.LASER.GUARD.CHECK', { profileId: project.data.profileId, params: guardParams() }, RC);
            }
            catch { }
            if (!r || r.status === 'na' || !r.findings?.length) {
                box.hidden = true;
                return r;
            }
            const probs = r.findings.filter((x) => x.status !== 'info');
            for (const f of r.findings) {
                const k = LC_GUARD_FIELD[f.field];
                const el = k && w.querySelector(`[data-lce-f="${k}"]`);
                const h = k && w.querySelector(`[data-lce-h="${k}"]`);
                if (el && f.status !== 'info')
                    el.classList.add(f.status === 'danger' ? 'lce-bad' : 'lce-warn');
                if (h)
                    h.textContent = lceMsg(f);
            }
            const off = !!ovr && r.status === 'danger';
            box.className = `lce-guard lce-guard-${off ? 'off' : r.status}`;
            box.innerHTML = `${off ? `<b>🛡 ${esc(TL('lce.guard.off', 'Protection switched off for this layer'))}</b> <small>${esc(new Date(ovr.at).toLocaleString('cs-CZ'))}</small> <button type="button" class="btn compact" data-lce-ovr-on>${esc(TL('lce.guard.on', 'Switch protection on'))}</button><br>` : ''}<b>${r.status === 'danger' ? '⛔' : r.status === 'warn' ? '⚠' : '✓'} ${esc(TL('lce.guard.' + r.status, r.status))}</b>${r.table ? ` <small>${esc(r.table.name)}${r.suggested ? ' · ' + esc(TL('lce.guard.suggested', 'suggested by the source name – verify')) : ''}</small>` : ''}${probs.map((f) => `<div class="lce-gf lce-gf-${f.status}"><span>${esc(lceMsg(f))}</span>${f.fix && f.fix.value != null ? `<button type="button" class="btn compact" data-lce-fix="${esc(LC_GUARD_FIELD[f.fix.field] || '')}" data-v="${esc(f.fix.value)}">${esc(TL('lce.fix', 'Set'))} ${esc(f.fix.value)}</button>` : ''}</div>`).join('')}`;
            box.hidden = false;
            if (r.status === 'danger' && !off)
                box.insertAdjacentHTML('beforeend', `<div class="lce-ovr"><button type="button" class="btn ghost compact" data-lce-ovr>${esc(TL('lce.guard.offBtn', 'Switch STOP off for this layer…'))}</button></div>`);
            $('[data-lce-ovr]')?.addEventListener('click', () => { if (!confirm(TL('lce.guard.offConfirm', 'Switch off the STOP protection for this layer?')))
                return; ovr = { at: new Date().toISOString(), by: String(opts.actorId || ''), status: r.status }; void runGuard(); });
            $('[data-lce-ovr-on]')?.addEventListener('click', () => { ovr = null; void runGuard(); });
            all('[data-lce-fix]').forEach(b => b.onclick = () => { const el = $(`[data-lce="${b.dataset.lceFix}"]`); if (el) {
                el.value = String(b.dataset.v);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } });
            return r;
        };
        w.querySelectorAll('[data-lce-lvl]').forEach(b => b.onclick = () => { adv = b.dataset.lceLvl === '1'; try {
            localStorage.setItem('kx.laser.adv', adv ? '1' : '0');
        }
        catch { } w.querySelectorAll('[data-lce-lvl]').forEach(x => x.classList.toggle('on', x === b)); vis(); });
        w.addEventListener('input', (e) => { vis(); clearTimeout(gTimer); gTimer = setTimeout(() => void runGuard(), 180); });
        w.addEventListener('change', () => vis());
        const close = () => w.remove();
        all('[data-lce-close]').forEach(b => b.onclick = close);
        w.addEventListener('keydown', (e) => { if (e.key === 'Escape')
            close(); });
        $('[data-lce-save]').onclick = async () => {
            const v = read();
            const err = $('[data-lce-err]');
            err.textContent = '';
            const name = String(v.layerName || op?.data?.name || '').trim();
            if (!name && !ctx.saveStep) {
                err.textContent = TL('lce.nameReq', 'Enter the layer name.');
                $('[data-lce="layerName"]')?.focus();
                return;
            }
            for (const g of groups)
                for (const q of g.params) {
                    if (q.t === 'number' && v[q.k] != null) {
                        const n = Number(String(v[q.k]).replace(',', '.'));
                        if (!Number.isFinite(n)) {
                            err.textContent = `${TL('lc.' + q.k, q.lb)}: ${TL('lce.notNumber', 'not a number')}`;
                            return;
                        }
                        if (q.min != null && n < q.min || q.max != null && n > q.max) {
                            err.textContent = `${TL('lc.' + q.k, q.lb)}: ${q.min ?? '−∞'}–${q.max ?? '∞'}`;
                            return;
                        }
                    }
                }
            const g = await runGuard();
            if (g?.status === 'danger' && (g?.mode ?? 'hard-stop') === 'hard-stop' && !ovr && !confirm(TL('lce.saveDanger', 'The guard reports a dangerous combination. Save anyway (marked ⚠)?')))
                return;
            const pr = { ...(op?.data?.parameters || {}) };
            const ex = { ...(pr.extras || {}) };
            for (const gg of groups)
                for (const q of gg.params) {
                    if (['name', 'layerName', 'operationType'].includes(q.st))
                        continue;
                    const has = Object.prototype.hasOwnProperty.call(v, q.k);
                    const val = has ? (q.t === 'number' ? Number(String(v[q.k]).replace(',', '.')) : v[q.k]) : undefined;
                    if (LC_CORE[q.k]) {
                        if (has)
                            pr[LC_CORE[q.k]] = val;
                        else
                            delete pr[LC_CORE[q.k]];
                    }
                    else {
                        if (has && val !== false)
                            ex[q.k] = val;
                        else
                            delete ex[q.k];
                    }
                }
            ex.mode = v.mode || mode0;
            if (g?.status === 'danger' || g?.status === 'warn')
                ex.guardWarning = g.status;
            else
                delete ex.guardWarning;
            if (ovr && g?.status === 'danger')
                ex.guardOverride = { ...ovr, status: 'danger' };
            else
                delete ex.guardOverride;
            pr.extras = ex;
            if (ctx.saveStep) {
                try {
                    await ctx.saveStep(pr, name);
                    close();
                    opts.onToast?.(TL('lts.stepSaved', 'Step saved'));
                    ctx.onSaved();
                }
                catch (e) {
                    err.textContent = String(e?.message || e);
                }
                return;
            } /* test step: same editor, saved as a test run */
            const lens = project.data.defaultLensId || (project.data.lensIds || [])[0];
            const seq = op ? op.data.sequence : (Math.max(-1, ...layers.filter((x) => (x.data.parentId || null) === (ctx.parentId || null)).map((x) => Number(x.data.sequence) || 0)) + 1);
            const data = { ...(op?.data || {}), projectId: project.id, name, sequence: seq, lensId: op?.data?.lensId || lens, parameters: pr, layerName: v.layer || op?.data?.layerName || '', ...(ctx.parentId ? { parentId: ctx.parentId } : {}) };
            if (!data.operationType)
                data.operationType = ex.mode;
            try {
                await core.actions.invoke('ACTION.LASER.OPERATION.SAVE', op ? { id: op.id, expectedRevision: op.revision, spaceIds: op.spaceIds, data } : { spaceIds: project.spaceIds, data }, ctx.PC);
                close();
                opts.onToast?.(TL('lce.saved', 'Layer saved'));
                ctx.onSaved();
            }
            catch (e) {
                err.textContent = String(e?.message || e);
            }
        };
        vis();
        void runGuard();
        if (project.data.evidence?.projectLocked) {
            all('[data-lce]').forEach((el) => el.disabled = true);
            const sb = $('[data-lce-save]');
            sb.disabled = true;
            $('.lce-body').insertAdjacentHTML('afterbegin', `<div class="lce-guard lce-guard-off" data-lce-locked><b>🔒 ${esc(TL('lce.locked', 'Parameters are locked'))}</b><small>${esc(TL('lce.lockedHow', 'Unlock in the project evidence (✎ Evidence) to change them, or duplicate the project as a new version.'))}</small></div>`);
        }
        else
            setTimeout(() => $('[data-lce="layerName"]')?.focus(), 0);
    }
    /* N2.6b+ projects table: live protection state over all layers (guard of the project's source + override flags) */
    function lceProjectGuard(project, layers, byId) {
        const G = globalThis.KXLaserGuard;
        if (!G || !layers.length)
            return '';
        const src = byId(project.data.sourceModuleId);
        const guard = src ? G.effective(src.data) : null;
        if (!guard)
            return TL('lce.gs.na', '— no table');
        let worst = 'safe', off = false;
        for (const o of layers) {
            if (o.archivedAt)
                continue;
            const pr = o.data.parameters || {};
            const r = G.evaluate(guard, pr);
            if (pr.extras?.guardOverride && r.status === 'danger') {
                off = true;
                continue;
            }
            if (r.status === 'danger')
                worst = 'danger';
            else if (r.status === 'warn' && worst !== 'danger')
                worst = 'warn';
        }
        const lab = worst === 'danger' ? '⛔ ' + TL('lce.gs.danger', 'STOP') : worst === 'warn' ? '⚠ ' + TL('lce.gs.warn', 'caution') : '✓ ' + TL('lce.gs.safe', 'OK');
        return off ? `${lab} · 🛡 ${TL('lce.guard.offShort', 'protection off')}` : lab;
    }
    /* N2.6b+ project evidence (P566 1:1): all evidence fields except machine / profile (chosen at creation); stored in data.evidence, title / tags / material on the project */
    async function openProjectEvidence(core, opts, ctx) {
        const pj = ctx.project;
        const ev = pj.data.evidence || {};
        const ex = new Set(['machineId', 'profileId', 'timing', 'extras:gallery']);
        const fields = LCAT.filter((g) => g.g === 'evidence' || g.g === 'notes').flatMap((g) => g.params).filter((q) => !ex.has(q.st) && !['machine', 'profile', 'gallery', 'duration'].includes(q.t));
        const val = (q) => q.st === 'title' ? pj.data.title : q.st === 'tags' ? (pj.data.tags || []).join(', ') : q.st === 'material' ? pj.data.material : ev[q.k];
        const ctl = (q) => { const v = val(q); if (q.t === 'select')
            return `<select data-pe="${q.k}"><option value="">—</option>${(q.opts || []).map((c) => `<option value="${c}" ${String(v ?? '') === c ? 'selected' : ''}>${esc(TL('lc.o.' + q.k + '.' + c, c))}</option>`).join('')}</select>`; if (q.t === 'checkbox')
            return `<input type="checkbox" data-pe="${q.k}" ${v ? 'checked' : ''}>`; if (q.t === 'textarea')
            return `<textarea data-pe="${q.k}" rows="2">${esc(v ?? '')}</textarea>`; return `<input data-pe="${q.k}" type="${q.t === 'number' ? 'number' : 'text'}" step="any" ${q.min != null ? `min="${q.min}"` : ''} ${q.max != null ? `max="${q.max}"` : ''} value="${esc(v ?? '')}">`; };
        const w = document.createElement('div');
        w.className = 'lce-wrap';
        w.setAttribute('data-keep-open', '');
        w.setAttribute('data-laser-evidence', '');
        w.innerHTML = `<div class="lce" role="dialog" aria-modal="true"><div class="lce-head"><div><b>✎ ${esc(TL('lce.ev.title', 'Project evidence'))}</b><small>${esc(pj.data.recordCode || '')} · ${esc(pj.data.title || '')}</small></div><button type="button" class="icon-btn" data-pe-close>✕</button></div><div class="lce-body"><div class="lce-grid"><label class="lce-f"><span class="lce-l">📅 ${esc(TL('lhd.deadline', 'Deadline'))} <i class="lce-i" title="${esc(TL('lhd.deadlineHelp', 'With “To the calendar” a task appears in the Calendar and My day; clearing the date closes it.'))}" tabindex="0">ⓘ</i></span><input type="date" data-pe-deadline value="${esc(ev.deadline || '')}"></label><label class="lce-f"><span class="lce-l">${esc(TL('lhd.toCal', 'To the calendar'))}</span><input type="checkbox" data-pe-tocal ${ev.deadlineToCalendar === false ? '' : 'checked'}></label>${fields.map((q) => `<label class="lce-f"><span class="lce-l">${esc(TL('lc.' + q.k, q.lb))}${q.u ? ` <small>[${esc(q.u)}]</small>` : ''}${q.req ? ' *' : ''} <i class="lce-i" title="${esc(TL('lc.' + q.k + '.d', ''))}" tabindex="0">ⓘ</i></span>${ctl(q)}</label>`).join('')}</div></div><div class="lce-foot"><span class="lce-err" data-pe-err></span><button type="button" class="btn ghost" data-pe-close>${esc(TL('vault.cancel', 'Cancel'))}</button><button type="button" class="btn primary" data-pe-save>✓ ${esc(TL('cv.save', 'Save'))}</button></div></div>`;
        document.body.appendChild(w);
        ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(e2 => w.addEventListener(e2, (e) => e.stopPropagation()));
        const close = () => w.remove();
        w.querySelectorAll('[data-pe-close]').forEach(b => b.onclick = close);
        w.addEventListener('keydown', (e) => { if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        } });
        w.querySelector('[data-pe-save]').onclick = async () => {
            const err = w.querySelector('[data-pe-err]');
            const v = {};
            w.querySelectorAll('[data-pe]').forEach(el => { v[el.dataset.pe] = el.type === 'checkbox' ? !!el.checked : String(el.value ?? '').trim(); });
            if (!v.projectName) {
                err.textContent = TL('laser.prj.titleReq', 'Title is required.');
                return;
            }
            for (const q of fields) {
                if (q.t === 'number' && v[q.k] !== '' && v[q.k] != null) {
                    const n = Number(String(v[q.k]).replace(',', '.'));
                    if (!Number.isFinite(n) || (q.min != null && n < q.min) || (q.max != null && n > q.max)) {
                        err.textContent = `${TL('lc.' + q.k, q.lb)}: ${q.min ?? '−∞'}–${q.max ?? '∞'}`;
                        return;
                    }
                    v[q.k] = n;
                }
            }
            const evidence = { ...ev };
            for (const q of fields) {
                if (['title', 'tags', 'material'].includes(q.st))
                    continue;
                const x = v[q.k];
                if (x === '' || x === false || x == null)
                    delete evidence[q.k];
                else
                    evidence[q.k] = x;
            }
            const dl = String(w.querySelector('[data-pe-deadline]').value || '');
            const toCal = !!w.querySelector('[data-pe-tocal]').checked;
            if (dl)
                evidence.deadline = dl;
            else
                delete evidence.deadline;
            evidence.deadlineToCalendar = toCal;
            const data = { ...pj.data, title: v.projectName, tags: String(v.projectTags || '').split(',').map((t) => t.trim()).filter(Boolean), material: v.material || pj.data.material, evidence };
            try {
                let saved = await core.actions.invoke('ACTION.LASER.PROJECT.SAVE', { id: pj.id, expectedRevision: pj.revision, spaceIds: pj.spaceIds, data }, ctx.PC);
                try {
                    const tid = await lhDeadlineTask(core, opts, saved, 'PROJECT', toCal ? dl : '', ev.deadlineTaskId);
                    if ((tid || '') !== (ev.deadlineTaskId || '')) {
                        saved = await core.actions.invoke('ACTION.LASER.PROJECT.SAVE', { id: saved.id, expectedRevision: saved.revision, spaceIds: saved.spaceIds, data: { ...saved.data, evidence: { ...saved.data.evidence, deadlineTaskId: tid || undefined } } }, ctx.PC);
                    }
                }
                catch (e2) {
                    opts.onToast?.(TL('lhd.taskFail', 'The calendar task could not be saved') + ': ' + String(e2?.message || e2));
                }
                close();
                opts.onToast?.(TL('lce.ev.saved', 'Evidence saved'));
                ctx.onSaved();
            }
            catch (e) {
                err.textContent = String(e?.message || e);
            }
        };
    }
    /* ---------- N2.6b+ TEST SESSION WITH STEPS (original hub: baseline → steps, what changed, result, note, compare, return to an older step, combine, REC timer, save as project) ---------- */
    const LC_INV = Object.fromEntries(Object.entries({ speed: 'speedMmPerS', power: 'powerPercent', frequency: 'frequencyKHz', pulseWidth: 'qPulseNs', lineInterval: 'lineIntervalMm', dpi: 'dpi', passes: 'passes', scanAngle: 'hatchAngleDeg', wobbleSize: 'wobbleMm', objectDiameter: 'rotaryDiameterMm', circumference: 'rotaryCircumferenceMm' }).map(([a, b]) => [b, a]));
    function lcsFlat(pr) { const o = {}; for (const [k, v] of Object.entries(pr || {})) {
        if (k === 'extras')
            continue;
        if (v != null && v !== '')
            o[LC_INV[k] || k] = v;
    } for (const [k, v] of Object.entries(pr?.extras || {})) {
        if (['guardWarning', 'guardOverride'].includes(k))
            continue;
        if (v != null && v !== '' && v !== false)
            o[k] = v;
    } return o; }
    function lcsDiff(a, b) { const A = lcsFlat(a), B = lcsFlat(b); const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])]; return keys.filter(k => String(A[k] ?? '') !== String(B[k] ?? '')).map(k => ({ k, from: A[k], to: B[k] })); }
    function lcsName(k) { const v = TL('lc.' + k, ''); return v && v !== 'lc.' + k ? v : k; }
    function lcsVal(k, v) { if (v == null || v === '')
        return '—'; if (typeof v === 'string' && /^[A-Z0-9_]+$/.test(v)) {
        const t = TL('lc.o.' + k + '.' + v, '');
        if (t && t !== 'lc.o.' + k + '.' + v)
            return t;
    } return String(v); }
    function renderSession(core, opts, root, cur, all, byId, again) {
        const det = root.querySelector('[data-lt-detail]');
        const runs = all.filter((x) => x.type === 'APP.LASER.TEST_RUN' && x.data.testId === cur.id && !x.archivedAt).sort((a, b) => a.data.sequence - b.data.sequence);
        const TC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.TEST.EDIT', 'LASER.CONFIG.EDIT', 'LASER.PROJECT.EDIT'], confirmed: true };
        const G = globalThis.KXLaserGuard;
        const src = byId(cur.data.sourceModuleId);
        const guard = src && G ? G.effective(src.data) : null;
        const recKey = 'kx.laser.rec.' + cur.id;
        const recRaw = localStorage.getItem(recKey) || '';
        let recInfo = {};
        try {
            recInfo = recRaw.startsWith('{') ? JSON.parse(recRaw) : { at: Number(recRaw || 0) };
        }
        catch {
            recInfo = { at: 0 };
        }
        const recAt = Number(recInfo.at || 0);
        const fmtMs = (ms) => { const s2 = Math.round(ms / 1000); return `${Math.floor(s2 / 3600)}:${String(Math.floor(s2 % 3600 / 60)).padStart(2, '0')}:${String(s2 % 60).padStart(2, '0')}`; };
        const RS = { PENDING: '⏳', PASS: '✓', FAIL: '✗', MIXED: '≈' };
        const KEY = ['speed', 'power', 'frequency', 'pulseWidth', 'lineInterval', 'passes', 'mode'];
        const gst = (pr) => { if (!guard)
            return ''; const r = G.evaluate(guard, pr || {}); if (pr?.extras?.guardOverride && r.status === 'danger')
            return `<span class="kx-badge kx-badge-off">🛡</span>`; return r.status === 'danger' ? '<span class="kx-badge kx-badge-bad">⛔</span>' : r.status === 'warn' ? '<span class="kx-badge kx-badge-warn">⚠</span>' : '<span class="kx-badge kx-badge-ok">✓</span>'; };
        det.innerHTML = `<section class="kx-lcard open" data-lt-test="${esc(cur.id)}" data-lts-session><header class="kx-lcard-h"><b>${esc(cur.data.recordCode)} · ${esc(cur.data.title)}</b><small class="muted">${esc(byId(cur.data.machineId)?.data.name || '')} · ${esc(byId(cur.data.profileId)?.data.name || '')}${cur.data.material ? ' · ' + esc(cur.data.material) : ''} · ${esc(TL('lts.status.' + cur.data.status, cur.data.status))}</small><button class="icon-btn" data-lt-close title="${esc(TL('lts.close', 'Close the session'))}">×</button></header>
      <div class="kx-lts-bar"><label class="lts-plan" title="${esc(TL('lhd.planHelp', 'Planned test date – shows in the Calendar and My day'))}">📅 <input type="date" data-lts-plan value="${esc(cur.data.plannedDate || '')}"></label><button class="btn" data-lts-qr title="${esc(TL('lq.title', 'QR identity'))}">▦ QR</button><button class="btn primary" data-lts-next>＋ ${esc(TL('lts.next', 'Next step'))}</button><button class="btn ${recAt ? 'kx-rec-on' : ''}" data-lts-rec>${recAt ? '■ ' + esc(TL('lts.recStop', 'Stop')) + ' <b data-lts-recclock>' + fmtMs(Date.now() - recAt) + '</b>' : '● ' + esc(TL('lts.rec', 'REC'))}</button>${cur.data.status !== 'DONE' ? `<button class="btn" data-lts-done>✓ ${esc(TL('lts.finish', 'Finish the session'))}</button>` : ''}<small class="muted">${esc(TL('lts.hint', 'Each step remembers all parameters; changes against the previous step are highlighted.'))}</small></div>
      ${runs.length ? `<table class="kx-calc-table kx-lts-table"><thead><tr><th>#</th><th>${esc(TL('lts.changed', 'What changed'))}</th>${KEY.map(k => `<th>${esc(lcsName(k))}</th>`).join('')}<th>${esc(TL('lce.col.guard', 'Protection'))}</th><th>${esc(TL('lts.result', 'Result'))}</th><th>${esc(TL('lts.note', 'Note'))}</th><th>${esc(TL('lts.time', 'Time'))}</th><th></th></tr></thead><tbody>
      ${runs.map((r, i) => {
            const pr = r.data.parameters || {};
            const F = lcsFlat(pr);
            const dif = i ? lcsDiff(runs[i - 1].data.parameters, pr) : [];
            return `<tr data-lts-step="${esc(r.id)}"><td><b>${i + 1}</b></td><td class="kx-lts-diff">${i ? (dif.length ? dif.slice(0, 6).map(d => `<span class="kx-chip-diff">${esc(lcsName(d.k))}: ${esc(lcsVal(d.k, d.from))} → <b>${esc(lcsVal(d.k, d.to))}</b></span>`).join('') : `<small class="muted">${esc(TL('lts.noChange', 'no change'))}</small>`) : `<small class="muted">${esc(TL('lts.baseline', 'baseline'))}</small>`}</td>${KEY.map(k => `<td class="${dif.some(d => d.k === k) ? 'kx-lts-chg' : ''}">${esc(lcsVal(k, F[k]))}</td>`).join('')}<td>${gst(pr)}</td>
          <td class="kx-lts-res">${['PENDING', 'PASS', 'FAIL', 'MIXED'].map(x => `<button class="icon-btn ${r.data.result === x ? 'on' : ''}" data-lts-res="${x}" title="${esc(TL('lts.r.' + x, x))}">${RS[x]}</button>`).join('')}</td>
          <td><input class="kx-lts-note" data-lts-note value="${esc(r.data.notes || '')}" placeholder="${esc(TL('lts.notePh', 'what did you see?'))}"></td><td>${r.data.durationMs ? fmtMs(r.data.durationMs) : '—'}</td>
          <td class="kx-lts-act"><button class="icon-btn" data-lts-edit title="${esc(TL('lts.edit', 'Edit the step'))}">⚙</button>${i ? `<button class="icon-btn" data-lts-cmp title="${esc(TL('lts.compare', 'Compare with the previous step'))}">⇄</button>` : ''}${i < runs.length - 1 ? `<button class="icon-btn" data-lts-back title="${esc(TL('lts.back', 'Return to this step (new step with its values)'))}">↺</button><button class="icon-btn" data-lts-comb title="${esc(TL('lts.combine', 'Combine values of this step with the last one'))}">⊕</button>` : ''}<button class="icon-btn" data-lts-photo title="${esc(TL('lhg.stepPhotos', 'Photos of the step'))}">📷${(r.data.photos || []).length ? `<sup>${(r.data.photos || []).length}</sup>` : ''}</button><button class="icon-btn" data-lts-proj title="${esc(TL('lts.toProject', 'Save as a project'))}">💾</button></td></tr>`;
        }).join('')}</tbody></table>` : `<p class="muted">${esc(TL('lts.empty', 'No steps yet – add the baseline with “＋ Next step”.'))}</p>`}
      <div data-lts-panel></div></section>`;
        const runOf = (el) => runs.find((x) => x.id === el.closest('[data-lts-step]')?.dataset.ltsStep);
        const pj = { id: cur.id, spaceIds: cur.spaceIds, data: { profileId: cur.data.profileId, title: cur.data.title, defaultLensId: cur.data.lensIds?.[0], lensIds: cur.data.lensIds } };
        const saveRun = async (pr, base, patch = {}) => core.actions.invoke('ACTION.LASER.TEST_RUN.SAVE', base ? { id: base.id, expectedRevision: base.revision, spaceIds: base.spaceIds, data: { ...base.data, parameters: pr, ...patch } } : { spaceIds: cur.spaceIds, data: { testId: cur.id, lensId: cur.data.lensIds?.[0], sequence: runs.length ? Math.max(...runs.map((x) => Number(x.data.sequence) || 0)) + 1 : 0, parameters: pr, result: 'PENDING', ...patch } }, TC);
        const editStep = (start, base, title) => void openLayerEditor(core, opts, { project: pj, op: start ? { data: { name: '', parameters: start } } : undefined, layers: [], onSaved: again, PC: TC, title: title || TL('lts.stepTitle', 'Test step'), saveStep: async (pr) => { await saveRun(pr, base); } });
        det.querySelector('[data-lt-close]').onclick = () => { globalThis.__kxLtsClose?.(); det.innerHTML = ''; };
        det.querySelector('[data-lts-plan]').onchange = async (ev2) => { const dl = String(ev2.target.value || ''); try {
            let saved = await core.actions.invoke('ACTION.LASER.TEST.SAVE', { id: cur.id, expectedRevision: cur.revision, spaceIds: cur.spaceIds, data: { ...cur.data, plannedDate: dl || undefined } }, TC);
            const tid = await lhDeadlineTask(core, opts, saved, 'TEST', dl, cur.data.plannedTaskId);
            if ((tid || '') !== (cur.data.plannedTaskId || ''))
                await core.actions.invoke('ACTION.LASER.TEST.SAVE', { id: saved.id, expectedRevision: saved.revision, spaceIds: saved.spaceIds, data: { ...saved.data, plannedTaskId: tid || undefined } }, TC);
            opts.onToast?.(dl ? TL('lhd.planned', 'Planned – in the calendar') : TL('lhd.unplanned', 'Plan removed'));
            again();
        }
        catch (e3) {
            opts.onToast?.(String(e3?.message || e3));
        } };
        det.querySelector('[data-lts-qr]').onclick = () => openLaserQr(core, opts, cur, 'TEST');
        det.querySelector('[data-lts-next]').onclick = () => editStep(runs.length ? structuredClone(runs[runs.length - 1].data.parameters) : null, undefined, runs.length ? `${TL('lts.stepTitle', 'Test step')} ${runs.length + 1}` : TL('lts.baselineTitle', 'Baseline'));
        det.querySelector('[data-lts-rec]').onclick = async () => {
            const TMC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: [], confirmed: true };
            const last = runs[runs.length - 1];
            if (!recAt) {
                let timer = '';
                try {
                    const tm = await core.actions.invoke('ACTION.CORE.TIMER.START', { target: { kind: 'ENTITY', id: last?.id || cur.id }, label: `${cur.data.title} · ${TL('lts.stepTitle', 'Test step')} ${runs.length || 1}`, ownerApp: OWNER }, TMC);
                    timer = String(tm?.id || '');
                }
                catch (e) {
                    globalThis.KXBugs?.pushErr?.(e);
                }
                localStorage.setItem(recKey, JSON.stringify({ at: Date.now(), timer }));
                again();
                return;
            }
            localStorage.removeItem(recKey);
            let ms = Date.now() - recAt;
            if (recInfo.timer) {
                try {
                    const v = await core.actions.invoke('ACTION.CORE.TIMER.STOP', { id: recInfo.timer }, TMC);
                    if (Number(v?.elapsedMs) > 0)
                        ms = Number(v.elapsedMs);
                }
                catch (e) {
                    globalThis.KXBugs?.pushErr?.(e);
                }
            }
            if (last) {
                try {
                    await saveRun(last.data.parameters, last, { durationMs: (Number(last.data.durationMs) || 0) + ms });
                    opts.onToast?.(TL('lts.recSaved', 'Time added to the last step'));
                }
                catch (e) {
                    opts.onToast?.(String(e?.message || e));
                }
            }
            again();
        };
        det.querySelector('[data-lts-done]')?.addEventListener('click', async () => { try {
            await core.actions.invoke('ACTION.LASER.TEST.SAVE', { id: cur.id, expectedRevision: cur.revision, spaceIds: cur.spaceIds, data: { ...cur.data, status: 'DONE' } }, TC);
            again();
        }
        catch (e) {
            opts.onToast?.(String(e?.message || e));
        } });
        det.querySelectorAll('[data-lts-res]').forEach(b => b.onclick = async () => { const r = runOf(b); if (!r)
            return; try {
            await saveRun(r.data.parameters, r, { result: b.dataset.ltsRes });
            again();
        }
        catch (e) {
            opts.onToast?.(String(e?.message || e));
        } });
        det.querySelectorAll('[data-lts-note]').forEach(inp => inp.onchange = async () => { const r = runOf(inp); if (!r)
            return; try {
            await saveRun(r.data.parameters, r, { notes: inp.value.trim() });
            opts.onToast?.(TL('lts.noteSaved', 'Note saved'));
        }
        catch (e) {
            opts.onToast?.(String(e?.message || e));
        } });
        det.querySelectorAll('[data-lts-edit]').forEach(b => b.onclick = () => { const r = runOf(b); if (r)
            editStep(structuredClone(r.data.parameters), r); });
        det.querySelectorAll('[data-lts-back]').forEach(b => b.onclick = async () => { const r = runOf(b); if (!r)
            return; try {
            await saveRun(structuredClone(r.data.parameters), undefined, { notes: TL('lts.backNote', 'returned to step {n}').replace('{n}', String(runs.indexOf(r) + 1)) });
            again();
        }
        catch (e) {
            opts.onToast?.(String(e?.message || e));
        } });
        det.querySelectorAll('[data-lts-cmp]').forEach(b => b.onclick = () => { const r = runOf(b); const i = runs.indexOf(r); const dif = lcsDiff(runs[i - 1].data.parameters, r.data.parameters); det.querySelector('[data-lts-panel]').innerHTML = `<div class="kx-lts-panel"><b>⇄ ${esc(TL('lts.compare', 'Compare with the previous step'))}: ${i} → ${i + 1}</b>${dif.length ? `<table class="kx-calc-table"><tr><th></th><th>${i}</th><th>${i + 1}</th></tr>${dif.map(d => `<tr><td>${esc(lcsName(d.k))}</td><td>${esc(lcsVal(d.k, d.from))}</td><td><b>${esc(lcsVal(d.k, d.to))}</b></td></tr>`).join('')}</table>` : `<p class="muted">${esc(TL('lts.noChange', 'no change'))}</p>`}<p>${esc(TL('lts.result', 'Result'))}: ${RS[runs[i - 1].data.result]} → ${RS[r.data.result]}</p></div>`; });
        det.querySelectorAll('[data-lts-comb]').forEach(b => b.onclick = () => {
            const r = runOf(b);
            const last = runs[runs.length - 1];
            const dif = lcsDiff(last.data.parameters, r.data.parameters);
            const panel = det.querySelector('[data-lts-panel]');
            panel.innerHTML = `<div class="kx-lts-panel"><b>⊕ ${esc(TL('lts.combine', 'Combine values of this step with the last one'))}</b><p class="muted">${esc(TL('lts.combineHelp', 'Tick the values to take from step {a}; the rest stays from the last step {b}.').replace('{a}', String(runs.indexOf(r) + 1)).replace('{b}', String(runs.length)))}</p>${dif.map(d => `<label class="kx-lts-cb"><input type="checkbox" data-lts-pick="${esc(d.k)}" checked> ${esc(lcsName(d.k))}: ${esc(lcsVal(d.k, d.from))} → <b>${esc(lcsVal(d.k, d.to))}</b></label>`).join('') || `<p class="muted">${esc(TL('lts.noChange', 'no change'))}</p>`}<button class="btn primary" data-lts-combgo>⊕ ${esc(TL('lts.combineGo', 'Create the combined step'))}</button></div>`;
            panel.querySelector('[data-lts-combgo]').onclick = () => { const pr = structuredClone(last.data.parameters || {}); pr.extras = { ...(pr.extras || {}) }; const src2 = r.data.parameters || {}; panel.querySelectorAll('[data-lts-pick]').forEach(cb => { if (!cb.checked)
                return; const k = cb.dataset.ltsPick; const ck = Object.entries(LC_INV).find(([, v]) => v === k)?.[0]; if (ck) {
                if (src2[ck] != null)
                    pr[ck] = src2[ck];
                else
                    delete pr[ck];
            }
            else {
                if (src2.extras?.[k] != null)
                    pr.extras[k] = src2.extras[k];
                else
                    delete pr.extras[k];
            } }); editStep(pr, undefined, TL('lts.combineTitle', 'Combined step')); };
        });
        det.querySelectorAll('[data-lts-photo]').forEach(b => b.onclick = () => { const r = runOf(b); if (!r)
            return; const w = document.createElement('div'); w.className = 'lce-wrap'; w.setAttribute('data-keep-open', ''); ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(ev => w.addEventListener(ev, (x) => x.stopPropagation())); w.innerHTML = `<div class="lce" role="dialog" aria-modal="true"><div class="lce-head"><b>📷 ${esc(TL('lhg.stepPhotos', 'Photos of the step'))} ${runs.indexOf(r) + 1}</b><button type="button" class="icon-btn" data-lhg-close title="${esc(TL('lts.close', 'Close'))}">✕</button></div><div class="lce-body" data-lhg-host></div></div>`; document.body.appendChild(w); w.querySelector('[data-lhg-close]').onclick = () => { w.remove(); again(); }; w.addEventListener('keydown', (x) => { if (x.key === 'Escape') {
            w.remove();
            again();
        } }); let curR = r; const draw = async () => { await lhGallery(core, opts, w.querySelector('[data-lhg-host]'), (curR.data.photos || []), cur.spaceIds, async (ids) => { curR = await saveRun(curR.data.parameters, curR, { photos: ids }); await draw(); }); }; void draw(); });
        det.querySelectorAll('[data-lts-proj]').forEach(b => b.onclick = async () => {
            const r = runOf(b);
            if (!r)
                return;
            const n = runs.indexOf(r) + 1;
            try {
                const pj2 = await core.actions.invoke('ACTION.LASER.PROJECT.SAVE', { spaceIds: cur.spaceIds, data: { title: `${cur.data.title} – ${TL('lts.fromStep', 'from step')} ${n}`, machineId: cur.data.machineId, sourceModuleId: cur.data.sourceModuleId, profileId: cur.data.profileId, lensIds: cur.data.lensIds, defaultLensId: cur.data.lensIds?.[0], status: 'DRAFT', material: cur.data.material || '', evidence: { fromTest: cur.data.recordCode, fromStep: n } } }, TC);
                await core.actions.invoke('ACTION.LASER.OPERATION.SAVE', { spaceIds: cur.spaceIds, data: { projectId: pj2.id, name: `${TL('lts.stepTitle', 'Test step')} ${n}`, sequence: 0, lensId: cur.data.lensIds?.[0], parameters: structuredClone(r.data.parameters), operationType: r.data.parameters?.extras?.mode || 'FILL' } }, TC);
                opts.onToast?.(TL('lts.projMade', 'Project created from the step') + ': ' + (pj2.data?.recordCode || ''));
            }
            catch (e) {
                opts.onToast?.(String(e?.message || e));
            }
        });
        if (recAt) {
            const t = setInterval(() => { const c = det.querySelector('[data-lts-recclock]'); if (!c || !det.isConnected) {
                clearInterval(t);
                return;
            } c.textContent = fmtMs(Date.now() - recAt); }, 1000);
        }
    }
    /* ---------- N2.6b+ IMPORT LAB (original: third table of the hub) – screenshots / photos → layers (typed from the picture, AI in the server phase) → cut-off check BEFORE conversion → project / test / to consider / reference / reject; merge selected ---------- */
    async function renderImports(core, opts, body, all, st, again) {
        const IC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.READ', 'LASER.IMPORT.EDIT', 'LASER.PROJECT.EDIT', 'LASER.TEST.EDIT', 'LASER.CONFIG.EDIT', 'CORE.ENTITY.CREATE', 'CORE.FILE.WRITE'], confirmed: true };
        const say = (m) => { st.liMsg = m; const el = body.querySelector('[data-li-msg]'); if (el)
            el.textContent = m; try {
            opts.onToast?.(m);
        }
        catch { } };
        const byId = (id) => all.find((x) => x.id === id);
        const imps = all.filter((x) => x.type === 'APP.LASER.IMPORT' && !x.archivedAt).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        const profs = all.filter((x) => x.type === 'APP.LASER.PROFILE' && !x.archivedAt);
        const G = globalThis.KXLaserGuard;
        const guardOf = (im) => { const pf = byId(im.data.profileId); const src = pf && byId(pf.data.sourceModuleId); return src && G ? G.effective(src.data) : null; };
        const layerStatus = (im, pr) => { const g = guardOf(im); if (!g)
            return 'na'; const r = G.evaluate(g, pr || {}); if (pr?.extras?.guardOverride && r.status === 'danger')
            return 'off'; return r.status; };
        const worst = (im) => { const L = im.data.layers || []; if (!L.length)
            return ''; const ss = L.map((l) => layerStatus(im, l.parameters)); return ss.includes('danger') ? 'danger' : ss.includes('warn') ? 'warn' : ss.includes('off') ? 'off' : ss.includes('na') ? 'na' : 'safe'; };
        const badge = (s2) => s2 === 'danger' ? '<span class="kx-badge kx-badge-bad">⛔ ' + esc(TL('lce.gs.danger', 'STOP')) + '</span>' : s2 === 'warn' ? '<span class="kx-badge kx-badge-warn">⚠ ' + esc(TL('lce.gs.warn', 'caution')) + '</span>' : s2 === 'off' ? '<span class="kx-badge kx-badge-off">🛡</span>' : s2 === 'safe' ? '<span class="kx-badge kx-badge-ok">✓</span>' : s2 === 'na' ? '<small class="muted">' + esc(TL('lce.gs.na', '— no table')) + '</small>' : '';
        const stLab = (im) => im.data.status === 'REJECTED' ? TL('li.st.REJECTED', 'rejected') : im.data.status === 'IMPORTED' ? (im.data.targetKind === 'REFERENCE' ? TL('li.st.REFERENCE', 'reference') : TL('li.st.IMPORTED', 'converted')) : im.data.consider ? TL('li.st.CONSIDER', 'to consider') : TL('li.st.PREVIEW', 'new');
        const q2 = String(st.liQ || '').toLowerCase();
        const shown = imps.filter((im) => !q2 || JSON.stringify(im.data).toLowerCase().includes(q2));
        st.liSel = st.liSel || new Set();
        const cur = st.liOpen ? imps.find((x) => x.id === st.liOpen) : null;
        body.innerHTML = `<div class="kx-li-msg" data-li-msg role="status" aria-live="polite">${esc(st.liMsg || '')}</div><div class="kx-li-bar"><label class="btn primary kx-li-up">＋ ${esc(TL('li.new', 'New import (screenshot / photo)'))}<input type="file" accept="image/*" multiple capture="environment" data-li-file hidden></label><input class="kx-li-q" data-li-q placeholder="${esc(TL('li.search', 'Search import, material, product…'))}" value="${esc(st.liQ || '')}"><span class="kx-li-sel">${st.liSel.size ? `${st.liSel.size} ${esc(TL('li.selected', 'selected'))} · <button class="btn compact" data-li-merge="PROJECT">${esc(TL('li.mergeP', 'Merge → Project'))}</button><button class="btn compact" data-li-merge="TEST">${esc(TL('li.mergeT', 'Merge → Test'))}</button><button class="btn ghost compact" data-li-clearsel>${esc(TL('li.clearSel', 'Clear selection'))}</button>` : ''}</span></div>
      <details class="kx-li-mig" data-li-mig ${st.migOpen ? 'open' : ''}><summary>⇪ ${esc(TL('mig.title', 'Transfer from the old Laser Parameter Hub (P566)'))}</summary><p class="muted">${esc(TL('mig.help', 'Load the backup (.json) or the portable file (.html) of the old hub – first a preview, then the transfer. A restore point is made before writing; records already transferred are skipped.'))}</p><div class="sg-lbar"><label class="btn compact">📂 ${esc(TL('mig.pick', 'Choose the file'))}<input type="file" accept=".json,.html,.htm,application/json,text/html" data-mig-file hidden></label><label>${esc(TL('lw.space', 'Area'))} <select data-mig-space data-keep-select>${['SPACE.COMPANY', 'SPACE.PERSONAL', 'SPACE.FAMILY'].map(x => `<option value="${x}" ${(st.migSpace || 'SPACE.COMPANY') === x ? 'selected' : ''}>${esc(TL('lw.sp.' + x, x))}</option>`).join('')}</select></label></div><div data-mig-out>${st.migOut || ''}</div></details><p class="muted kx-acc-help">${esc(TL('li.help', 'Screenshots of LightBurn / EZCAD / LaserPecker settings and photos of results. Type the values from the picture (AI reading comes with the server phase); the source protection is checked BEFORE conversion.'))}</p>
      ${shown.length ? `<table class="kx-calc-table kx-li-table"><thead><tr><th></th><th>${esc(TL('li.col.code', 'Code'))}</th><th>${esc(TL('li.col.title', 'Name'))}</th><th>${esc(TL('li.col.pics', 'Pictures'))}</th><th>${esc(TL('li.col.profile', 'Laser / profile'))}</th><th>${esc(TL('li.col.layers', 'Layers'))}</th><th>${esc(TL('lce.col.guard', 'Protection'))}</th><th>${esc(TL('li.col.state', 'State'))}</th></tr></thead><tbody>${shown.map((im) => `<tr data-li-row="${esc(im.id)}" class="${cur?.id === im.id ? 'on' : ''}"><td><input type="checkbox" data-li-pick="${esc(im.id)}" ${st.liSel.has(im.id) ? 'checked' : ''}></td><td>${esc(im.data.recordCode || '')}</td><td><button class="kx-link" data-li-open="${esc(im.id)}">${esc(im.data.title)}</button></td><td>${(im.data.fileIds || []).length}</td><td>${esc(byId(im.data.profileId)?.data.name || '—')}</td><td>${(im.data.layers || []).length}</td><td>${badge(worst(im))}</td><td>${esc(stLab(im))}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${esc(TL('li.empty', 'No imports yet – add a screenshot or a photo.'))}</p>`}
      <div data-li-detail></div>`;
        /* P566 transfer: preview (ANALYZE) → confirm → APPLY */
        const migBox = body.querySelector('[data-mig-out]');
        body.querySelector('[data-mig-space]').onchange = (e) => { st.migSpace = e.target.value; };
        body.querySelector('[data-li-mig]').ontoggle = (e) => { st.migOpen = e.target.open; };
        const MC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.READ', 'LASER.MIGRATION.PREVIEW'], confirmed: true };
        const T2 = { machines: TL('mig.c.machines', 'lasers'), sourceModules: TL('mig.c.sources', 'sources'), profiles: TL('mig.c.profiles', 'profiles'), lenses: TL('mig.c.lenses', 'lenses'), projects: TL('mig.c.projects', 'projects'), operations: TL('mig.c.operations', 'layers'), tests: TL('mig.c.tests', 'tests'), testRuns: TL('mig.c.runs', 'test steps'), imports: TL('mig.c.imports', 'imports') };
        body.querySelector('[data-mig-file]').onchange = async (e) => {
            const f = e.target.files?.[0];
            if (!f)
                return;
            migBox.innerHTML = `<p class="muted">${esc(TL('mig.reading', 'Reading…'))}</p>`;
            try {
                const text = await f.text();
                const r = await core.actions.invoke('ACTION.LASER.P566.MIGRATION.ANALYZE', { source: text }, MC);
                if (r.sourceKind === 'UNKNOWN') {
                    migBox.innerHTML = `<p class="lce-err">${esc(TL('mig.unknown', 'The file is not a backup of the old Laser hub.'))}</p>`;
                    st.migOut = migBox.innerHTML;
                    return;
                }
                const pc = r.parity || {};
                migBox.innerHTML = `<table class="kx-calc-table"><tr><td>${esc(TL('mig.format', 'Format'))}</td><td><b>${esc(r.sourceKind)}</b> · ${esc(f.name)}</td></tr>${Object.entries(r.counts || {}).map(([k, v]) => `<tr><td>${esc(T2[k] || k)}</td><td><b>${v}</b></td></tr>`).join('')}<tr><td>${esc(TL('mig.parity', 'Mapping'))}</td><td>${esc(TL('mig.p', 'mapped {m} · kept {k} · derived {d} · unresolved {u} · blocking {b}').replace('{m}', pc.mapped).replace('{k}', pc.preserved).replace('{d}', pc.derived).replace('{u}', pc.unresolved).replace('{b}', pc.blocking))}</td></tr></table>${Number(pc.blocking) > 0 ? `<p class="lce-err">${esc(TL('mig.blocking', 'Some data block the transfer – see the mapping.'))}</p>` : `<button type="button" class="btn primary" data-mig-apply>⇪ ${esc(TL('mig.apply', 'Transfer to NEXUS'))}</button>`}`;
                migBox.querySelector('[data-mig-apply]')?.addEventListener('click', async () => {
                    if (!confirm(TL('mig.confirm', 'Transfer the data of the old hub to NEXUS? A restore point is made first; already transferred records are skipped.')))
                        return;
                    migBox.insertAdjacentHTML('beforeend', `<p class="muted" data-mig-run>${esc(TL('mig.running', 'Transferring…'))}</p>`);
                    try {
                        const a = await core.actions.invoke('ACTION.LASER.P566.MIGRATION.APPLY', { source: text, spaceIds: [st.migSpace || 'SPACE.COMPANY'] }, { ...MC, permissions: [...MC.permissions, 'LASER.CONFIG.EDIT', 'LASER.PROJECT.EDIT', 'LASER.TEST.EDIT', 'LASER.IMPORT.EDIT', 'CORE.ENTITY.CREATE'] });
                        const sum = (o) => Object.values(o || {}).reduce((x, y) => x + Number(y), 0);
                        st.migOut = `<p><b>✓ ${esc(TL('mig.done', 'Transferred'))}</b> · ${esc(TL('mig.created', 'created'))} ${sum(a.created)} · ${esc(TL('mig.skipped', 'skipped (already transferred)'))} ${sum(a.skipped)}${a.errors.length ? ` · <span class="lce-err">${esc(TL('mig.errors', 'errors'))} ${a.errors.length}</span>` : ''}${a.restorePoint ? ` · ${esc(TL('mig.rp', 'restore point made'))}` : ''}</p>${a.errors.length ? `<ul>${a.errors.slice(0, 8).map((x) => `<li><small>${esc(x.key)}: ${esc(x.error)}</small></li>`).join('')}</ul>` : ''}`;
                        st.migOpen = true;
                        again();
                    }
                    catch (err) {
                        migBox.querySelector('[data-mig-run]')?.remove();
                        migBox.insertAdjacentHTML('beforeend', `<p class="lce-err">${esc(String(err?.message || err))}</p>`);
                    }
                });
                st.migOut = '';
            }
            catch (err) {
                migBox.innerHTML = `<p class="lce-err">${esc(String(err?.message || err))}</p>`;
            }
        };
        body.querySelector('[data-li-q]').onchange = (e) => { st.liQ = e.target.value; again(); };
        body.querySelectorAll('[data-li-pick]').forEach(cb => cb.onchange = () => { cb.checked ? st.liSel.add(cb.dataset.liPick) : st.liSel.delete(cb.dataset.liPick); again(); });
        body.querySelector('[data-li-clearsel]')?.addEventListener('click', () => { st.liSel.clear(); again(); });
        body.querySelectorAll('[data-li-open]').forEach(b => b.onclick = () => { st.liOpen = b.dataset.liOpen; again(); });
        body.querySelector('[data-li-file]').onchange = async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length)
                return;
            const sp = (own0()?.spaceIds) || ['SPACE.COMPANY'];
            try {
                const ids = [];
                for (const f of files) {
                    if (!/^image\//.test(f.type))
                        continue;
                    const fr = await core.files.importBlob(f, f.name, f.type, OWNER, sp, IC, { tags: ['kx:laser-import'] });
                    ids.push(fr.id);
                }
                if (!ids.length) {
                    say(TL('li.onlyImages', 'Only pictures can be imported here.'));
                    return;
                }
                const im = await core.actions.invoke('ACTION.LASER.IMPORT.SAVE', { spaceIds: sp, data: { title: files[0].name.replace(/\.[a-z0-9]+$/i, ''), sourceFormat: 'IMAGE', sourceName: files.map(f => f.name).join(', ').slice(0, 200), targetKind: 'MIXED', status: 'PREVIEW', mappedEntityIds: [], warnings: [], fileIds: ids, layers: [], profileId: profs[0]?.id || '' } }, IC);
                st.liOpen = im.id;
                say(TL('li.created', 'Import created'));
                again();
            }
            catch (err) {
                say(String(err?.message || err));
            }
        };
        function own0() { return all.find((x) => x.type === 'APP.LASER.MACHINE' && !x.archivedAt && x.data.origin !== 'DEMO'); }
        const saveIm = async (im, patch) => core.actions.invoke('ACTION.LASER.IMPORT.SAVE', { id: im.id, expectedRevision: im.revision, spaceIds: im.spaceIds, data: { ...im.data, ...patch } }, IC);
        /* conversion: project with layers / test session with steps; mapping recorded on the import */
        const toProject = async (srcs, title) => {
            const im0 = srcs[0];
            const pf = byId(im0.data.profileId);
            if (!pf)
                throw new Error(TL('li.needProfile', 'Choose the laser / profile first.'));
            const lens = pf.data.defaultLensId || all.find((x) => x.type === 'APP.LASER.LENS' && x.data.machineId === pf.data.machineId)?.id;
            const pj = await core.actions.invoke('ACTION.LASER.PROJECT.SAVE', { spaceIds: im0.spaceIds, data: { title, machineId: pf.data.machineId, sourceModuleId: pf.data.sourceModuleId, profileId: pf.id, lensIds: [lens], defaultLensId: lens, status: 'DRAFT', material: im0.data.material || '', evidence: { fromImport: srcs.map((x) => x.data.recordCode).join(', ') } } }, IC);
            let seq = 0;
            for (const im of srcs)
                for (const l of (im.data.layers || []))
                    await core.actions.invoke('ACTION.LASER.OPERATION.SAVE', { spaceIds: im0.spaceIds, data: { projectId: pj.id, name: l.name || `${TL('lce.layer', 'Layer')} ${seq + 1}`, sequence: seq++, lensId: lens, parameters: structuredClone(l.parameters || {}), operationType: l.parameters?.extras?.mode || 'FILL' } }, IC);
            return pj;
        };
        const toTest = async (srcs, title) => {
            const im0 = srcs[0];
            const pf = byId(im0.data.profileId);
            if (!pf)
                throw new Error(TL('li.needProfile', 'Choose the laser / profile first.'));
            const lens = pf.data.defaultLensId || all.find((x) => x.type === 'APP.LASER.LENS' && x.data.machineId === pf.data.machineId)?.id;
            const t = await core.actions.invoke('ACTION.LASER.TEST.SAVE', { spaceIds: im0.spaceIds, data: { title, kind: 'SESSION', machineId: pf.data.machineId, sourceModuleId: pf.data.sourceModuleId, profileId: pf.id, lensIds: [lens], status: 'RUNNING', material: im0.data.material || '' } }, IC);
            let seq = 0;
            for (const im of srcs)
                for (const l of (im.data.layers || []))
                    await core.actions.invoke('ACTION.LASER.TEST_RUN.SAVE', { spaceIds: im0.spaceIds, data: { testId: t.id, lensId: lens, sequence: seq++, parameters: structuredClone(l.parameters || {}), result: 'PENDING', notes: l.name || '' } }, IC);
            return t;
        };
        const blocked = (srcs) => srcs.some((im) => worst(im) === 'danger');
        body.querySelectorAll('[data-li-merge]').forEach(b => b.onclick = async () => {
            const srcs = imps.filter((x) => st.liSel.has(x.id));
            if (!srcs.length)
                return;
            if (!srcs.every((x) => x.data.profileId === srcs[0].data.profileId)) {
                say(TL('li.mergeSame', 'Merged imports must have the same laser / profile.'));
                return;
            }
            if (blocked(srcs) && !confirm(TL('li.dangerConfirm', 'Some layers are outside the source values (STOP). Convert anyway?')))
                return;
            try {
                const title = `${srcs[0].data.title} (+${srcs.length - 1})`;
                const r = b.dataset.liMerge === 'PROJECT' ? await toProject(srcs, title) : await toTest(srcs, title);
                for (const im of srcs)
                    await saveIm(byId(im.id), { status: 'IMPORTED', targetKind: b.dataset.liMerge, mappedEntityIds: [r.id], consider: false });
                st.liSel.clear();
                say(TL('li.converted', 'Converted') + ': ' + (r.data?.recordCode || ''));
                again();
            }
            catch (e) {
                say(String(e?.message || e));
            }
        });
        if (!cur)
            return;
        /* detail */
        const det = body.querySelector('[data-li-detail]');
        const urls = [];
        for (const fid of (cur.data.fileIds || [])) {
            try {
                const bl = await core.files.getBlob(fid);
                if (bl)
                    urls.push(URL.createObjectURL(bl));
            }
            catch { }
        }
        const L = cur.data.layers || [];
        const ro = cur.data.status !== 'PREVIEW';
        det.innerHTML = `<section class="kx-lcard open" data-li-cur="${esc(cur.id)}"><header class="kx-lcard-h"><b>${esc(cur.data.recordCode || '')} · ${esc(cur.data.title)}</b><small class="muted">${esc(stLab(cur))}</small><button class="icon-btn" data-li-close title="${esc(TL('lts.close', 'Close'))}">×</button></header>
      <div class="kx-li-pics">${urls.map(u => `<img src="${esc(u)}" alt="" data-li-zoom>`).join('') || `<small class="muted">${esc(TL('li.noPics', 'no pictures'))}</small>`}</div>
      <div class="kx-li-meta"><label class="kx-lf"><span>${esc(TL('li.col.title', 'Name'))}</span><input data-li-title value="${esc(cur.data.title)}" ${ro ? 'disabled' : ''}></label><label class="kx-lf"><span>${esc(TL('li.col.profile', 'Laser / profile'))}</span><select data-li-profile ${ro ? 'disabled' : ''}><option value="">—</option>${profs.map((pf) => `<option value="${esc(pf.id)}" ${cur.data.profileId === pf.id ? 'selected' : ''}>${esc((byId(pf.data.machineId)?.data.name || '') + ' · ' + pf.data.name)}</option>`).join('')}</select></label><label class="kx-lf"><span>${esc(TL('lc.material', 'Material'))}</span><input data-li-material value="${esc(cur.data.material || '')}" ${ro ? 'disabled' : ''}></label></div>
      <h5>${esc(TL('li.layers', 'Layers from the picture'))} ${badge(worst(cur))}</h5>
      ${L.length ? `<table class="kx-calc-table"><tr><th>#</th><th>${esc(TL('lc.layerName', 'Layer'))}</th>${['speed', 'power', 'frequency', 'pulseWidth', 'lineInterval', 'mode'].map(k => `<th>${esc(TL('lc.' + k, k))}</th>`).join('')}<th>${esc(TL('lce.col.guard', 'Protection'))}</th><th></th></tr>${L.map((l, i) => { const F = lcsFlat(l.parameters); return `<tr data-li-layer="${i}"><td>${i + 1}</td><td>${esc(l.name || '')}</td>${['speed', 'power', 'frequency', 'pulseWidth', 'lineInterval', 'mode'].map(k => `<td>${esc(lcsVal(k, F[k]))}</td>`).join('')}<td>${badge(layerStatus(cur, l.parameters))}${l.parameters?.extras?.aiProposed ? ` <span class="kx-badge ${Number(l.parameters.extras.aiConfidence) < 0.7 ? 'kx-badge-warn' : ''}" title="${esc(TL('li.aiBadge', 'Proposed by AI – check'))}">🤖${l.parameters.extras.aiConfidence != null ? ' ' + Math.round(Number(l.parameters.extras.aiConfidence) * 100) + ' %' : ''}</span>` : ''}</td><td>${ro ? '' : `<button class="icon-btn" data-li-ledit="${i}" title="${esc(TL('lce.edit', 'Layer settings'))}">⚙</button><button class="icon-btn" data-li-ldel="${i}" title="${esc(TL('li.ldel', 'Remove the layer'))}">🗑</button>`}</td></tr>`; }).join('')}</table>` : `<p class="muted">${esc(TL('li.noLayers', 'No layers yet – type the values from the picture.'))}</p>`}
      ${ro ? `<p class="muted">${esc(TL('li.done', 'The import is closed.'))}${(cur.data.mappedEntityIds || []).length ? ' → ' + (cur.data.mappedEntityIds || []).map((id) => esc(byId(id)?.data.recordCode || id)).join(', ') : ''}</p>` : `<div class="kx-li-acts"><button class="btn" data-li-addl>✎ ${esc(TL('li.addLayer', 'Type values from the picture'))}</button><button class="btn ghost" data-li-ai title="${esc(TL('li.aiHint', 'AI reading of pictures – server phase'))}">🤖 ${esc(TL('li.ai', 'Read parameters (AI)'))}</button><details class="li-aiset"><summary class="btn ghost compact" title="${esc(TL('li.aiSet', 'AI server (server phase)'))}">⚙</summary><label class="kx-lf"><span>${esc(TL('li.aiSet', 'AI server (server phase)'))}</span><input data-li-aiurl placeholder="https://nexus.example.cz" value="${esc(localStorage.getItem('kx.laser.aiUrl') || '')}"></label><small class="muted">${esc(TL('li.aiSetHelp', 'No password here – sign-in via the NEXUS server. Contract: docs/server/LASER_IMPORT_AI_API.md'))}</small></details><span class="kx-li-sep"></span><button class="btn primary" data-li-to="PROJECT">→ ${esc(TL('li.toProject', 'Project'))}</button><button class="btn" data-li-to="TEST">→ ${esc(TL('li.toTest', 'Test'))}</button><button class="btn ghost" data-li-consider>${esc(cur.data.consider ? TL('li.unconsider', 'Not to consider') : TL('li.consider', 'To consider'))}</button><button class="btn ghost" data-li-ref>${esc(TL('li.reference', 'Reference'))}</button><button class="btn ghost danger" data-li-reject>${esc(TL('li.reject', 'Reject'))}</button></div>`}</section>`;
        det.querySelector('[data-li-close]').onclick = () => { st.liOpen = ''; urls.forEach(u => URL.revokeObjectURL(u)); again(); };
        det.querySelectorAll('[data-li-zoom]').forEach(im => im.onclick = () => im.classList.toggle('big'));
        const meta = async () => { try {
            await saveIm(cur, { title: det.querySelector('[data-li-title]').value.trim() || cur.data.title, profileId: det.querySelector('[data-li-profile]').value, material: det.querySelector('[data-li-material]').value.trim() });
            again();
        }
        catch (e) {
            say(String(e?.message || e));
        } };
        det.querySelectorAll('[data-li-title],[data-li-profile],[data-li-material]').forEach(el => el.onchange = meta);
        const pjCtx = { id: cur.id, spaceIds: cur.spaceIds, data: { profileId: cur.data.profileId, title: cur.data.title, defaultLensId: undefined, lensIds: [] } };
        const editLayer = (i) => { if (!cur.data.profileId) {
            say(TL('li.needProfile', 'Choose the laser / profile first.'));
            return;
        } const l = i == null ? null : L[i]; void openLayerEditor(core, opts, { project: pjCtx, op: l ? { data: { name: l.name, parameters: l.parameters } } : undefined, layers: [], onSaved: again, PC: IC, images: urls, title: TL('li.layerTitle', 'Values from the picture'), saveStep: async (pr, name) => { const NL = [...L]; const v = { name: name || l?.name || `${TL('lce.layer', 'Layer')} ${NL.length + (l ? 0 : 1)}`, parameters: pr }; if (i == null)
                NL.push(v);
            else
                NL[i] = v; await saveIm(cur, { layers: NL }); } }); };
        det.querySelector('[data-li-addl]')?.addEventListener('click', () => editLayer(null));
        det.querySelectorAll('[data-li-ledit]').forEach(b => b.onclick = () => editLayer(Number(b.dataset.liLedit)));
        det.querySelectorAll('[data-li-ldel]').forEach(b => b.onclick = async () => { if (!confirm(TL('li.ldelConfirm', 'Remove this layer from the import?')))
            return; const NL = L.filter((_, i) => i !== Number(b.dataset.liLdel)); try {
            await saveIm(cur, { layers: NL });
            again();
        }
        catch (e) {
            say(String(e?.message || e));
        } });
        det.querySelector('[data-li-ai]')?.addEventListener('click', async () => {
            if (!localStorage.getItem('kx.laser.aiUrl')) {
                say(TL('li.aiInfo', 'Reading parameters from pictures needs the AI server (server phase). Until then type the values with “Type values from the picture”.'));
                return;
            }
            if (!cur.data.profileId) {
                say(TL('li.needProfile', 'Choose the laser / profile first.'));
                return;
            }
            say(TL('li.aiReading', 'AI is reading the pictures…'));
            try {
                const r = await lhAiRead(core, cur, byId);
                if (!r.layers.length) {
                    say(TL('li.aiNone', 'AI found no layer parameters in the pictures.'));
                    return;
                }
                const evd = {};
                if (r.evidence?.material && !cur.data.material)
                    evd.material = String(r.evidence.material);
                await saveIm(cur, { layers: [...L, ...r.layers], ...evd, aiWarnings: r.warnings, aiUnmapped: r.unmapped });
                st.liMsg = TL('li.aiDone', 'AI proposed {n} layers – check them (🤖) before converting.').replace('{n}', String(r.layers.length)) + (r.warnings.length ? ' · ' + r.warnings.join(' · ') : '');
                again();
            }
            catch (err) {
                const m = String(err?.message || err);
                say(m === 'NO_IMAGES' ? TL('li.noPics', 'no pictures') : TL('li.aiFail', 'The AI server did not answer') + ': ' + m);
            }
        });
        det.querySelector('[data-li-aiurl]')?.addEventListener('change', (ev2) => { const v = String(ev2.target.value || '').trim(); try {
            if (v)
                localStorage.setItem('kx.laser.aiUrl', v);
            else
                localStorage.removeItem('kx.laser.aiUrl');
        }
        catch { } say(v ? TL('li.aiUrlSaved', 'AI server saved') : TL('li.aiUrlRemoved', 'AI server removed')); });
        det.querySelectorAll('[data-li-to]').forEach(b => b.onclick = async () => {
            if (!L.length) {
                say(TL('li.noLayers', 'No layers yet – type the values from the picture.'));
                return;
            }
            if (blocked([cur]) && !confirm(TL('li.dangerConfirm', 'Some layers are outside the source values (STOP). Convert anyway?')))
                return;
            try {
                const r = b.dataset.liTo === 'PROJECT' ? await toProject([cur], cur.data.title) : await toTest([cur], cur.data.title);
                await saveIm(cur, { status: 'IMPORTED', targetKind: b.dataset.liTo, mappedEntityIds: [r.id], consider: false });
                say(TL('li.converted', 'Converted') + ': ' + (r.data?.recordCode || ''));
                again();
            }
            catch (e) {
                say(String(e?.message || e));
            }
        });
        det.querySelector('[data-li-consider]')?.addEventListener('click', async () => { try {
            await saveIm(cur, { consider: !cur.data.consider });
            again();
        }
        catch (e) {
            say(String(e?.message || e));
        } });
        det.querySelector('[data-li-ref]')?.addEventListener('click', async () => { try {
            await saveIm(cur, { status: 'IMPORTED', targetKind: 'REFERENCE' });
            again();
        }
        catch (e) {
            say(String(e?.message || e));
        } });
        det.querySelector('[data-li-reject]')?.addEventListener('click', async () => { if (!confirm(TL('li.rejectConfirm', 'Reject this import? (it stays in the list as rejected)')))
            return; try {
            await saveIm(cur, { status: 'REJECTED' });
            again();
        }
        catch (e) {
            say(String(e?.message || e));
        } });
    }
    /* ---------- N2.6b+ COMPACT LAYER GRID (user: like LightBurn “Cuts / Layers” + the original hub table – many columns at once, ✓ / ✗, choose columns per laser, quick panel) ---------- */
    const LB_COLORS = ['#000000', '#0000ff', '#ff0000', '#00e000', '#d0d000', '#ff8000', '#00e0e0', '#ff00ff', '#b4b4b4', '#0000a0', '#a00000', '#00a000', '#a0a000', '#c08000', '#00a0ff', '#a000a0', '#808080', '#7d87b9', '#bb7784', '#4a6fe3', '#d33f6a', '#8cd78c', '#f0b98d', '#f6c4e1', '#fa9ed4', '#500a78', '#b45a00', '#004754', '#86fa88', '#ffdb66'];
    const LG_DEFAULT = ['mode', 'speed', 'power', 'frequency', 'pulseWidth', 'lineInterval', 'passes', 'scanAngle', 'bidirectional', 'crossHatch', 'output'];
    const LG_YES = new Set(['ANO', 'ANO_M3_CONSTANT', 'YES', 'TRUE']);
    function lgColorIdx(o, i) { const m = String(o.data.layerName || o.data.parameters?.extras?.layer || '').match(/(\d{1,2})/) || String(o.data.name || '').match(/^\s*[CT](\d{1,2})\b/i); const n = m ? Number(m[1]) : i; return Math.max(0, Math.min(29, n)); }
    async function renderLayerGrid(core, opts, host, cur, layers, again, PC) {
        const RC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.READ'], confirmed: true };
        let caps = null, guardFor = null;
        try {
            caps = (await core.actions.invoke('ACTION.LASER.CAPS.FOR', { profileId: cur.data.profileId }, RC))?.caps;
        }
        catch { }
        try {
            guardFor = await core.actions.invoke('ACTION.LASER.GUARD.FOR', { profileId: cur.data.profileId }, RC);
        }
        catch { }
        const CAPMAP = { qpulse: 'pulse', galvoTimings: 'timings', airAssist: 'air', sliced3d: 'threeD' };
        const capOk = (c) => { if (!c || !caps)
            return true; const k = CAPMAP[c] || c; return k in caps ? caps[k] === true : false; };
        const defs = LCAT.filter((g) => LC_LAYER_GROUPS.includes(g.g) && capOk(g.cap)).flatMap((g) => g.params.filter((q) => capOk(q.cap) && !['layerName', 'layer', 'mode'].includes(q.k) || q.k === 'mode'));
        const all = [...defs.filter((q) => q.k === 'mode'), ...defs.filter((q) => q.k !== 'mode' && q.k !== 'output'), { k: 'output', lb: 'Output', t: 'select', opts: ['ANO', 'NE'], st: 'extras' }];
        const key = 'kx.laser.layercols.' + String(cur.data.machineId || '');
        let cols = [];
        try {
            cols = JSON.parse(localStorage.getItem(key) || 'null') || LG_DEFAULT;
        }
        catch {
            cols = LG_DEFAULT;
        }
        cols = cols.filter(k => all.some((q) => q.k === k));
        const G = globalThis.KXLaserGuard;
        const src = null;
        const guard = guardFor?.guard && G ? guardFor.guard : null;
        const locked = !!cur.data.evidence?.projectLocked;
        const order = [];
        const kids = (pid) => layers.filter((x) => (x.data.parentId || null) === pid).sort((a, b) => (a.data.sequence || 0) - (b.data.sequence || 0));
        const walk = (pid, d) => { for (const o of kids(pid)) {
            order.push({ o, d });
            walk(o.id, d + 1);
        } };
        walk(null, 0);
        const val = (o, q) => { if (q.k === 'output')
            return o.data.parameters?.extras?.output ?? 'ANO'; return lcValue(o, q.k, q.st); };
        const cell = (o, q) => {
            const v = val(o, q);
            if (q.t === 'select' && (q.opts || []).length <= 3 && (q.opts || []).some((c) => LG_YES.has(c) || c === 'NE')) {
                const on = LG_YES.has(String(v));
                return `<td class="lg-b ${on ? 'on' : ''}" data-lg-tog="${q.k}" title="${esc(TL('lc.' + q.k, q.lb))}">${on ? '✓' : '✗'}</td>`;
            }
            if (q.k === 'mode')
                return `<td><select class="lg-mode" data-lg-mode data-keep-select ${locked ? 'disabled' : ''}>${['LINE', 'FILL', 'OFFSET_FILL', 'IMAGE'].map(c => `<option value="${c}" ${String(v || 'FILL') === c ? 'selected' : ''}>${esc(TL('lc.o.mode.' + c, c))}</option>`).join('')}</select></td>`;
            if (q.t === 'number')
                return `<td class="lg-n" data-lg-num="${q.k}">${v == null || v === '' ? '<span class="muted">—</span>' : esc(v)}</td>`;
            return `<td>${esc(v == null || v === '' ? '—' : (typeof v === 'string' && /^[A-Z0-9_]+$/.test(v) ? TL('lc.o.' + q.k + '.' + v, v) : v))}</td>`;
        };
        const status = (o) => { if (!guard || !G)
            return ''; const r = G.evaluate(guard, o.data.parameters || {}); if (o.data.parameters?.extras?.guardOverride && r.status === 'danger')
            return '<span class="kx-badge kx-badge-off">🛡</span>'; return r.status === 'danger' ? '<span class="kx-badge kx-badge-bad">⛔</span>' : r.status === 'warn' ? '<span class="kx-badge kx-badge-warn">⚠</span>' : '<span class="kx-badge kx-badge-ok">✓</span>'; };
        const C = cols.map(k => all.find((q) => q.k === k)).filter(Boolean);
        const sel = host.__lgSel || order[0]?.o.id || '';
        host.innerHTML = `<div class="lg-wrap"><div class="lg-bar"><b>${esc(TL('lg2.title', 'Layers – overview'))}</b><small class="muted">${order.length} · ${esc(TL('lg2.hint', 'click ✓ / ✗ to switch, double-click a number to edit'))}</small><details class="lg-cols"><summary class="btn compact">⚙ ${esc(TL('lg2.cols', 'Columns'))} (${C.length})</summary><div class="lg-colpick"><div class="lg-colbtns"><button type="button" class="btn compact" data-lg-cdef>${esc(TL('lg2.colDefault', 'Default'))}</button><button type="button" class="btn compact" data-lg-call>${esc(TL('lg2.colAll', 'All'))}</button></div>${[...C, ...all.filter((q) => !cols.includes(q.k))].map((q) => `<div class="lg-colrow"><label><input type="checkbox" data-lg-col="${q.k}" ${cols.includes(q.k) ? 'checked' : ''}> ${esc(TL('lc.' + q.k, q.lb))}</label>${cols.includes(q.k) ? `<span><button type="button" class="icon-btn" data-lg-mv="${q.k}" data-dir="-1" title="${esc(TL('lg2.left', 'Move left'))}">◀</button><button type="button" class="icon-btn" data-lg-mv="${q.k}" data-dir="1" title="${esc(TL('lg2.right', 'Move right'))}">▶</button></span>` : ''}</div>`).join('')}</div></details></div>
      ${order.length ? `<div class="lg-scroll"><table class="lg-table"><thead><tr><th>#</th><th>${esc(TL('lc.layerName', 'Layer'))}</th>${C.map((q) => `<th title="${esc(TL('lc.' + q.k + '.d', ''))}">${esc(TL('lg2.h.' + q.k, '') !== 'lg2.h.' + q.k && TL('lg2.h.' + q.k, '') ? TL('lg2.h.' + q.k, '') : TL('lc.' + q.k, q.lb))}</th>`).join('')}<th>${esc(TL('lce.col.guard', 'Protection'))}</th><th></th></tr></thead><tbody>
      ${order.map(({ o, d }, i) => { const ci = lgColorIdx(o, i); return `<tr data-lg-row="${esc(o.id)}" class="${o.id === sel ? 'sel' : ''}"><td><span class="lg-chip" style="background:${LB_COLORS[ci]}">${String(ci).padStart(2, '0')}</span></td><td class="lg-name">${d ? '<span class="muted">' + '↳ '.repeat(d) + '</span>' : ''}${esc(o.data.name || '')}</td>${C.map((q) => cell(o, q)).join('')}<td>${status(o)}</td><td><button type="button" class="icon-btn" data-lg-adv title="${esc(TL('lce.edit', 'Layer settings'))}">⚙</button></td></tr>`; }).join('')}</tbody></table></div>` : `<p class="muted">${esc(TL('li.noLayers', 'No layers yet'))}</p>`}
      <div class="lg-quick" data-lg-quick></div></div>`;
        const rowOf = (el) => layers.find((x) => x.id === el.closest('[data-lg-row]')?.dataset.lgRow);
        const save = async (o, mut, patchData = {}) => {
            if (locked) {
                opts.onToast?.(TL('lce.locked', 'Parameters are locked'));
                return;
            }
            const pr = structuredClone(o.data.parameters || {});
            pr.extras = { ...(pr.extras || {}) };
            mut(pr);
            if (guard && G) {
                const r = G.evaluate(guard, pr);
                if (r.status === 'danger' && !pr.extras.guardOverride) {
                    if (!confirm(TL('lce.saveDanger', 'The guard reports a dangerous combination. Save anyway (marked ⚠)?')))
                        return;
                }
                if (r.status === 'danger' || r.status === 'warn')
                    pr.extras.guardWarning = r.status;
                else
                    delete pr.extras.guardWarning;
            }
            try {
                await core.actions.invoke('ACTION.LASER.OPERATION.SAVE', { id: o.id, expectedRevision: o.revision, spaceIds: o.spaceIds, data: { ...o.data, ...patchData, parameters: pr } }, PC);
                host.__lgSel = o.id;
                again();
            }
            catch (e) {
                opts.onToast?.(String(e?.message || e));
            }
        };
        const setP = (pr, k, v) => { if (LC_CORE[k]) {
            if (v === '' || v == null)
                delete pr[LC_CORE[k]];
            else
                pr[LC_CORE[k]] = v;
        }
        else {
            if (v === '' || v == null)
                delete pr.extras[k];
            else
                pr.extras[k] = v;
        } };
        host.querySelectorAll('[data-lg-row]').forEach(tr => tr.addEventListener('click', (e) => { if (e.target.closest('[data-lg-tog],[data-lg-num],select,button'))
            return; host.__lgSel = tr.dataset.lgRow; host.querySelectorAll('[data-lg-row]').forEach(r => r.classList.toggle('sel', r === tr)); quick(); }));
        host.querySelectorAll('[data-lg-tog]').forEach(td => td.onclick = () => { const o = rowOf(td); if (!o)
            return; const k = String(td.dataset.lgTog); const on = td.classList.contains('on'); void save(o, pr => { if (k === 'output')
            pr.extras.output = on ? 'NE' : 'ANO';
        else
            setP(pr, k, on ? 'NE' : 'ANO'); }); });
        host.querySelectorAll('[data-lg-mode]').forEach(sl => sl.onchange = () => { const o = rowOf(sl); if (o)
            void save(o, pr => { pr.extras.mode = sl.value; }); });
        host.querySelectorAll('[data-lg-num]').forEach(td => td.ondblclick = () => {
            if (locked)
                return;
            const o = rowOf(td);
            if (!o)
                return;
            const k = String(td.dataset.lgNum);
            const q = all.find((x) => x.k === k);
            const v = val(o, q);
            td.innerHTML = `<input type="number" step="any" class="lg-in" value="${esc(v ?? '')}">`;
            const inp = td.querySelector('input');
            inp.focus();
            inp.select();
            const done = (ok) => { if (!ok) {
                again();
                return;
            } const t = inp.value.trim(); const n = t === '' ? '' : Number(t.replace(',', '.')); if (t !== '' && !Number.isFinite(n)) {
                inp.classList.add('bad');
                return;
            } void save(o, pr => setP(pr, k, n)); };
            inp.onkeydown = (e) => { if (e.key === 'Enter')
                done(true); if (e.key === 'Escape')
                done(false); };
            inp.onblur = () => done(true);
        });
        host.querySelectorAll('[data-lg-adv]').forEach(b => b.onclick = () => { const o = rowOf(b); if (o)
            void openLayerEditor(core, opts, { project: cur, op: o, layers, onSaved: again, PC }); });
        const saveCols = (c) => { try {
            localStorage.setItem(key, JSON.stringify(c));
        }
        catch { } host.__lgSel = sel; void renderLayerGrid(core, opts, host, cur, layers, again, PC).then(() => { host.querySelector('.lg-cols').open = true; }); };
        const curCols = () => { try {
            return (JSON.parse(localStorage.getItem(key) || 'null') || cols);
        }
        catch {
            return cols;
        } };
        host.querySelectorAll('[data-lg-col]').forEach(cb => cb.onchange = () => { const k = String(cb.dataset.lgCol); const c0 = curCols().filter(x => x !== k); saveCols(cb.checked ? [...c0, k] : c0); /* new columns at the end, the user order stays */ });
        host.querySelectorAll('[data-lg-mv]').forEach(b => b.onclick = (e) => { e.preventDefault(); const k = String(b.dataset.lgMv); const c0 = curCols(); const i = c0.indexOf(k); const j = i + (b.dataset.dir === '-1' ? -1 : 1); if (i < 0 || j < 0 || j >= c0.length)
            return; [c0[i], c0[j]] = [c0[j], c0[i]]; saveCols(c0); });
        host.querySelector('[data-lg-cdef]')?.addEventListener('click', () => saveCols(LG_DEFAULT));
        host.querySelector('[data-lg-call]')?.addEventListener('click', () => saveCols(all.map((q) => q.k)));
        /* quick panel of the selected layer (LightBurn bottom panel) */
        function quick() {
            const box = host.querySelector('[data-lg-quick]');
            const o = layers.find((x) => x.id === host.__lgSel) || order[0]?.o;
            if (!box || !o) {
                if (box)
                    box.innerHTML = '';
                return;
            }
            const ci = lgColorIdx(o, order.findIndex(x => x.o === o));
            const Q = ['passes', 'speed', 'lineInterval', 'power', 'pulseWidth', 'frequency'].map(k => all.find((q) => q.k === k)).filter(Boolean);
            box.innerHTML = `<div class="lg-qhead"><b>${esc(o.data.name || '')}</b><label>${esc(TL('lg2.color', 'Layer colour'))} <select data-lg-color data-keep-select ${locked ? 'disabled' : ''}>${LB_COLORS.map((c, i) => `<option value="${i}" ${i === ci ? 'selected' : ''} style="background:${c}">C${String(i).padStart(2, '0')}</option>`).join('')}</select></label><span class="lg-chip" style="background:${LB_COLORS[ci]}">${String(ci).padStart(2, '0')}</span><span data-lg-qguard></span></div>
        <div class="lg-qgrid">${Q.map((q) => `<label><span>${esc(TL('lc.' + q.k, q.lb))}${q.u ? ` <small>(${esc(q.u)})</small>` : ''}</span><input type="number" step="any" data-lg-q="${q.k}" value="${esc(val(o, q) ?? '')}" ${locked ? 'disabled' : ''}></label>`).join('')}</div>`;
            const qg = box.querySelector('[data-lg-qguard]');
            const live = () => { if (!guard || !G) {
                qg.innerHTML = '';
                return;
            } const pr = structuredClone(o.data.parameters || {}); pr.extras = { ...(pr.extras || {}) }; box.querySelectorAll('[data-lg-q]').forEach(i => { const t = i.value.trim(); setP(pr, String(i.dataset.lgQ), t === '' ? '' : Number(t.replace(',', '.'))); }); const r = G.evaluate(guard, pr); const f = (r.findings || []).find((x) => x.status !== 'info'); qg.className = 'lg-qg lce-guard-' + r.status; qg.textContent = (r.status === 'danger' ? '⛔ ' : r.status === 'warn' ? '⚠ ' : '✓ ') + (f ? lceMsg(f) : TL('lce.guard.safe', 'OK')); box.querySelectorAll('[data-lg-q]').forEach(i => i.classList.toggle('bad', !!(r.findings || []).some((x) => x.status !== 'info' && LC_GUARD_FIELD[x.field] === i.dataset.lgQ))); };
            box.querySelectorAll('[data-lg-q]').forEach(i => { i.oninput = live; i.onchange = () => { const t = i.value.trim(); void save(o, pr => setP(pr, String(i.dataset.lgQ), t === '' ? '' : Number(t.replace(',', '.')))); }; });
            box.querySelector('[data-lg-color]').onchange = (e) => { const n = String(e.target.value).padStart(2, '0'); void save(o, pr => { pr.extras.layer = 'C' + n; }, { layerName: 'C' + n }); };
            live();
        }
        quick();
    }
    /* ---------- N2.6b+ SOURCE GUARD EDITOR 1:1 (original kx587GuardEditorHTML): ON/OFF, name, mode, reference, notes, ranges, allowed pulses, lookup table (CSV), advanced rules (JSON), copy from another source, JPT template, export / import ---------- */
    async function openGuardEditor(core, opts, sourceId, again) {
        const RC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.READ', 'LASER.CONFIG.EDIT'], confirmed: true };
        const all = await core.laserDomain.list();
        const src = all.find((x) => x.id === sourceId);
        if (!src)
            return;
        const others = all.filter((x) => x.type === 'APP.LASER.SOURCE_MODULE' && !x.archivedAt && x.id !== sourceId);
        const G = globalThis.KXLaserGuard;
        /* existing guard → editor state (old ranges / tables are migrated into rules) */
        const toState = (g) => {
            const st = { enabled: g?.enabled !== false, name: g?.name || '', mode: g?.mode || 'hard-stop', reference: g?.reference || g?.source || '', notes: g?.notes || '', ranges: {}, allowed: '', lookup: [], below: 'warn', above: 'danger', nomatch: 'warn', pulsedOnly: true, adv: [] };
            for (const r of (g?.rules || [])) {
                const m = String(r.id || '').match(/^simple:(\w+):(range|allowed)$/);
                if (m && m[2] === 'range')
                    st.ranges[m[1]] = { min: r.min ?? '', max: r.max ?? '' };
                else if (m && m[2] === 'allowed')
                    st.allowed = (r.allowedValues || []).join(', ');
                else if (r.type === 'lookup-range' && r.parameter === 'frequency' && r.lookupParameter === 'pulseWidth' && !st.lookup.length) {
                    st.lookup = r.rows.map((x) => ({ p: x.lookup, mn: x.min ?? '', mx: x.max ?? '' }));
                    st.below = r.belowSeverity;
                    st.above = r.aboveSeverity;
                    st.nomatch = r.noMatchSeverity;
                    st.pulsedOnly = !!r.condition;
                }
                else
                    st.adv.push(r);
            }
            const R2 = g?.ranges || {};
            if (R2.speedMaxMmS != null)
                st.ranges.speed = { ...(st.ranges.speed || { min: '' }), max: R2.speedMaxMmS };
            if (R2.frequencyMinKHz != null || R2.frequencyMaxKHz != null)
                st.ranges.frequency = { min: R2.frequencyMinKHz ?? '', max: R2.frequencyMaxKHz ?? '' };
            if (R2.pulseMinNs != null || R2.pulseMaxNs != null)
                st.ranges.pulseWidth = { min: R2.pulseMinNs ?? '', max: R2.pulseMaxNs ?? '' };
            if (R2.pulseValues && !st.allowed)
                st.allowed = (R2.pulseValues || []).join(', ');
            const tb = g?.customTable || (g?.tableId ? G?.TABLES?.[g.tableId] : null);
            if (tb && !st.lookup.length) {
                st.lookup = (tb.rows || []).map((x) => ({ p: x.pulse, mn: x.cutoff, mx: x.max ?? '' }));
                if (!st.name)
                    st.name = tb.name || '';
            }
            return st;
        };
        let S = toState(src.data.guard || null);
        let suggestedNote = '';
        if (!src.data.guard) {
            try {
                const gf = await core.actions.invoke('ACTION.LASER.GUARD.FOR', { sourceModuleId: sourceId }, RC);
                if (gf?.guard?.suggested && gf.guard.tableId === 'JPT_M7_60_1_5MJ') {
                    S = toState(await core.actions.invoke('ACTION.LASER.GUARD.TEMPLATE', { template: 'JPT_M7' }, RC));
                    suggestedNote = TL('sg.suggestedNote', 'Suggested by the source name (JPT M7) – check and save to confirm.');
                }
            }
            catch { }
        }
        const w = document.createElement('div');
        w.className = 'lce-wrap';
        w.setAttribute('data-keep-open', '');
        w.setAttribute('data-guard-editor', '');
        document.body.appendChild(w);
        ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(ev => w.addEventListener(ev, (e) => e.stopPropagation()));
        const RG = [['speed', 'Speed (mm/s)'], ['power', 'Power %'], ['frequency', 'Frequency kHz'], ['pulseWidth', 'Q-Pulse ns']];
        const sevSel = (k, v) => `<select data-sg="${k}" data-keep-select>${['info', 'warn', 'danger'].map(x => `<option value="${x}" ${v === x ? 'selected' : ''}>${esc(TL('sg.sev.' + x, x))}</option>`).join('')}</select>`;
        const draw = () => {
            w.innerHTML = `<div class="lce" role="dialog" aria-modal="true"><div class="lce-head"><div><b>🛡 ${esc(TL('sg.title', 'Source protection'))} <span class="kx-badge ${S.enabled ? 'kx-badge-ok' : 'kx-badge-off'}">${S.enabled ? 'ON' : 'OFF'}</span></b><small>${esc(src.data.name)}${src.data.nominalPowerW ? ` · ${src.data.nominalPowerW} W` : ''}${src.data.wavelengthNm ? ` · ${src.data.wavelengthNm} nm` : ''}</small></div><button type="button" class="icon-btn" data-sg-close title="${esc(TL('vault.cancel', 'Cancel'))}">✕</button></div>
      <div class="lce-body"><div class="lce-grid">
        <label class="lce-f"><span class="lce-l">${esc(TL('sg.enabled', 'Protection on'))}</span><input type="checkbox" data-sg="enabled" ${S.enabled ? 'checked' : ''}></label>
        <label class="lce-f"><span class="lce-l">${esc(TL('sg.name', 'Name'))}</span><input data-sg="name" value="${esc(S.name)}" placeholder="JPT M7 Cut-off Guard"></label>
        <label class="lce-f"><span class="lce-l">${esc(TL('sg.mode', 'Mode'))} <i class="lce-i" title="${esc(TL('sg.modeHelp', 'Info – only shows; Warning – shows red, never blocks; Hard STOP – a dangerous combination must be confirmed or switched off'))}">ⓘ</i></span><select data-sg="mode" data-keep-select>${['info', 'warning', 'hard-stop'].map(x => `<option value="${x}" ${S.mode === x ? 'selected' : ''}>${esc(TL('sg.mode.' + x, x))}</option>`).join('')}</select></label>
        <label class="lce-f"><span class="lce-l">${esc(TL('sg.reference', 'Data source (manual, model)'))}</span><input data-sg="reference" value="${esc(S.reference)}"></label>
        <label class="lce-f" style="grid-column:span 2"><span class="lce-l">${esc(TL('sg.notes', 'Notes'))}</span><input data-sg="notes" value="${esc(S.notes)}"></label></div>
        <details class="lce-g" open><summary>${esc(TL('sg.ranges', 'Ranges'))}</summary><table class="kx-calc-table sg-tab"><tr><th></th><th>${esc(TL('sg.min', 'Min'))}</th><th>${esc(TL('sg.max', 'Max'))}</th></tr>${RG.map(([k, l]) => `<tr><td>${esc(TL('sg.p.' + k, l))}</td><td><input type="number" step="any" data-sg-r="${k}:min" value="${esc(S.ranges[k]?.min ?? '')}"></td><td><input type="number" step="any" data-sg-r="${k}:max" value="${esc(S.ranges[k]?.max ?? '')}"></td></tr>`).join('')}</table>
          <label class="lce-f"><span class="lce-l">${esc(TL('sg.allowed', 'Allowed pulse widths (ns)'))}</span><input data-sg="allowed" value="${esc(S.allowed)}" placeholder="2, 4, 6, 9, 13 …"></label></details>
        <details class="lce-g" open><summary>${esc(TL('sg.lookup', 'Table pulse → frequency (cut-off / max)'))} · ${S.lookup.length}</summary>
          <div class="sg-lbar"><label>${esc(TL('sg.below', 'Below min'))} ${sevSel('below', S.below)}</label><label>${esc(TL('sg.above', 'Above max'))} ${sevSel('above', S.above)}</label><label>${esc(TL('sg.nomatch', 'Pulse not in table'))} ${sevSel('nomatch', S.nomatch)}</label><label><input type="checkbox" data-sg="pulsedOnly" ${S.pulsedOnly ? 'checked' : ''}> ${esc(TL('sg.pulsedOnly', 'only when pulse > 0 (0 ns = CW)'))}</label></div>
          <table class="kx-calc-table sg-tab"><tr><th>${esc(TL('sg.p.pulseWidth', 'Q-Pulse ns'))}</th><th>${esc(TL('sg.cutoff', 'Cut-off (min) kHz'))}</th><th>${esc(TL('sg.fmax', 'Max kHz'))}</th><th></th></tr>${S.lookup.map((r, i) => `<tr><td><input type="number" step="any" data-sg-l="${i}:p" value="${esc(r.p)}"></td><td><input type="number" step="any" data-sg-l="${i}:mn" value="${esc(r.mn)}"></td><td><input type="number" step="any" data-sg-l="${i}:mx" value="${esc(r.mx)}"></td><td><button type="button" class="icon-btn" data-sg-ldel="${i}" title="${esc(TL('sg.ldel', 'Remove the row'))}">🗑</button></td></tr>`).join('')}</table>
          <div class="sg-lbar"><button type="button" class="btn compact" data-sg-ladd>＋ ${esc(TL('sg.ladd', 'Row'))}</button><textarea data-sg-csv rows="2" placeholder="${esc(TL('sg.csvPh', 'paste CSV: pulse;cut-off;max per line'))}"></textarea><button type="button" class="btn compact" data-sg-csvgo>${esc(TL('sg.csv', 'Insert CSV'))}</button></div></details>
        <details class="lce-g"><summary>${esc(TL('sg.adv', 'Advanced rules (JSON)'))} · ${S.adv.length}</summary><textarea data-sg-adv rows="7" class="sg-json">${esc(JSON.stringify(S.adv, null, 2))}</textarea><small class="muted">${esc(TL('sg.advHelp', 'Types: range, allowed, forbidden-range, warning-range, lookup-range; condition {all|any:[{parameter,op,value}]}; parameters speed, power, frequency, pulseWidth, passes, lineInterval…'))}</small></details>
        <div class="sg-lbar"><label>${esc(TL('sg.copyFrom', 'Copy from another source'))} <select data-sg-copysrc data-keep-select><option value="">—</option>${others.map((o) => `<option value="${esc(o.id)}">${esc(o.data.name)}</option>`).join('')}</select></label><button type="button" class="btn compact" data-sg-copy>${esc(TL('sg.copy', 'Copy'))}</button><button type="button" class="btn compact" data-sg-jpt>${esc(TL('sg.jpt', 'JPT M7 template'))}</button><button type="button" class="btn compact" data-sg-export>⇩ ${esc(TL('sg.export', 'Export'))}</button><label class="btn compact">⇧ ${esc(TL('sg.import', 'Import'))}<input type="file" accept="application/json,.json" data-sg-import hidden></label></div>
      </div><div class="lce-foot"><small class="muted">kxhub-guard-v1</small><span class="lce-err" data-sg-err></span><button type="button" class="btn ghost danger" data-sg-clear>${esc(TL('sg.clear', 'Remove protection'))}</button><button type="button" class="btn ghost" data-sg-close>${esc(TL('vault.cancel', 'Cancel'))}</button><button type="button" class="btn primary" data-sg-save>✓ ${esc(TL('cv.save', 'Save'))}</button></div></div>`;
            bind();
        };
        const read = () => {
            const q = (k) => w.querySelector(`[data-sg="${k}"]`);
            S.enabled = !!q('enabled')?.checked;
            S.name = q('name').value.trim();
            S.mode = q('mode').value;
            S.reference = q('reference').value.trim();
            S.notes = q('notes').value.trim();
            S.allowed = q('allowed').value.trim();
            S.below = q('below').value;
            S.above = q('above').value;
            S.nomatch = q('nomatch').value;
            S.pulsedOnly = !!q('pulsedOnly').checked;
            w.querySelectorAll('[data-sg-r]').forEach(i => { const [k, part] = String(i.dataset.sgR).split(':'); S.ranges[k] = S.ranges[k] || { min: '', max: '' }; S.ranges[k][part] = i.value.trim(); });
            w.querySelectorAll('[data-sg-l]').forEach(i => { const [ix, part] = String(i.dataset.sgL).split(':'); S.lookup[Number(ix)][part] = i.value.trim(); });
            const t = w.querySelector('[data-sg-adv]').value.trim();
            try {
                S.adv = t ? JSON.parse(t) : [];
                if (!Array.isArray(S.adv))
                    throw new Error('array');
                return true;
            }
            catch {
                w.querySelector('[data-sg-err]').textContent = TL('sg.advBad', 'Advanced rules are not valid JSON (an array of rules).');
                return false;
            }
        };
        const toGuard = () => {
            const rules = [];
            const pulsed = { parameter: 'pulseWidth', op: '>', value: 0 };
            for (const [k] of RG) {
                const r = S.ranges[k];
                if (r && (r.min !== '' || r.max !== ''))
                    rules.push({ id: `simple:${k}:range`, type: 'range', parameter: k, min: r.min === '' ? null : Number(r.min), max: r.max === '' ? null : Number(r.max), severity: 'danger', ...(k === 'pulseWidth' && S.pulsedOnly ? { condition: pulsed } : {}) });
            }
            if (S.allowed)
                rules.push({ id: 'simple:pulseWidth:allowed', type: 'allowed', parameter: 'pulseWidth', allowedValues: S.allowed, severity: 'warning', ...(S.pulsedOnly ? { condition: pulsed } : {}) });
            const rows = S.lookup.filter((r) => String(r.p) !== '').map((r) => ({ lookup: Number(r.p), min: r.mn === '' ? null : Number(r.mn), max: r.mx === '' ? null : Number(r.mx) }));
            if (rows.length)
                rules.push({ id: 'builtin:lookup', type: 'lookup-range', lookupParameter: 'pulseWidth', parameter: 'frequency', rows, belowSeverity: S.below, aboveSeverity: S.above, noMatchSeverity: S.nomatch, ...(S.pulsedOnly ? { condition: pulsed } : {}) });
            return { enabled: S.enabled, name: S.name, mode: S.mode, reference: S.reference, notes: S.notes, rules: [...rules, ...S.adv], ranges: {}, tableId: null, source: S.reference };
        };
        const err = (m) => { const e = w.querySelector('[data-sg-err]'); if (e)
            e.textContent = m; };
        const errText = (e) => { const m = String(e?.message || e); const k = m.split(':')[0]; const t = TL('sg.err.' + k, ''); return t && t !== 'sg.err.' + k ? t + (m.includes(':') ? ` (${m.split(':').slice(1).join(':')})` : '') : m; };
        function bind() {
            w.querySelectorAll('[data-sg-close]').forEach(b => b.onclick = () => w.remove());
            w.addEventListener('keydown', (e) => { if (e.key === 'Escape') {
                e.stopPropagation();
                w.remove();
            } });
            w.querySelector('[data-sg-ladd]').onclick = () => { if (!read())
                return; S.lookup.push({ p: '', mn: '', mx: '' }); draw(); };
            w.querySelectorAll('[data-sg-ldel]').forEach(b => b.onclick = () => { if (!read())
                return; S.lookup.splice(Number(b.dataset.sgLdel), 1); draw(); });
            w.querySelector('[data-sg-csvgo]').onclick = () => { if (!read())
                return; const t = w.querySelector('[data-sg-csv]').value; let n = 0; for (const line of t.split(/\r?\n/)) {
                const c = line.split(/[;,\t]/).map(x => x.trim().replace(',', '.'));
                if (c.length < 2 || !/^\d/.test(c[0]))
                    continue;
                S.lookup.push({ p: c[0], mn: c[1] || '', mx: c[2] || '' });
                n++;
            } draw(); err(n ? `${n} ${TL('sg.csvRows', 'rows inserted')}` : TL('sg.csvNone', 'No rows recognised (pulse;cut-off;max).')); };
            w.querySelector('[data-sg-jpt]').onclick = async () => { try {
                const t = await core.actions.invoke('ACTION.LASER.GUARD.TEMPLATE', { template: 'JPT_M7' }, RC);
                S = toState(t);
                draw();
                err(TL('sg.jptDone', 'JPT M7 template loaded – check and save.'));
            }
            catch (e) {
                err(errText(e));
            } };
            w.querySelector('[data-sg-copy]').onclick = () => { const id = w.querySelector('[data-sg-copysrc]').value; const o = others.find((x) => x.id === id); if (!o) {
                err(TL('sg.copyPick', 'Choose a source.'));
                return;
            } S = toState(o.data.guard || null); draw(); err(TL('sg.copied', 'Copied – check and save.')); };
            w.querySelector('[data-sg-export]').onclick = () => { if (!read())
                return; const blob = new Blob([JSON.stringify({ schema: 'kxhub-guard-v1', source: src.data.name, guard: toGuard() }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `guard-${String(src.data.name).replace(/[^\w.-]+/g, '_')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
            w.querySelector('[data-sg-import]').onchange = async (e) => { const f = e.target.files?.[0]; if (!f)
                return; try {
                const j = JSON.parse(await f.text());
                const g = j.guard || j;
                G.normalize(g);
                S = toState(g);
                draw();
                err(TL('sg.imported', 'Imported – check and save.'));
            }
            catch (er) {
                err(errText(er));
            } };
            w.querySelector('[data-sg-clear]').onclick = async () => { if (!confirm(TL('sg.clearConfirm', 'Remove the protection of this source? (the name suggestion may apply again)')))
                return; try {
                await core.actions.invoke('ACTION.LASER.GUARD.SET', { sourceModuleId: sourceId, guard: null }, RC);
                w.remove();
                opts.onToast?.(TL('sg.saved', 'Protection saved'));
                again();
            }
            catch (e) {
                err(errText(e));
            } };
            w.querySelector('[data-sg-save]').onclick = async () => { if (!read())
                return; try {
                await core.actions.invoke('ACTION.LASER.GUARD.SET', { sourceModuleId: sourceId, guard: toGuard() }, RC);
                w.remove();
                opts.onToast?.(TL('sg.saved', 'Protection saved'));
                again();
            }
            catch (e) {
                err(errText(e));
            } };
            w.querySelectorAll('[data-sg="enabled"]').forEach(i => i.onchange = () => { read(); draw(); });
        }
        draw();
        if (suggestedNote)
            err(suggestedNote);
    }
    /* ---------- N2.6b+ ACTIVE LASER + STATUS CARDS (original hub header: machine selector ◀ ▶, Continue · Last project · Last test · Favourites · Stopwatch) ---------- */
    function lhActiveId(list) { const own = list.filter((m) => m.data.origin !== 'DEMO' && !m.archivedAt); const saved = localStorage.getItem('kx.laser.active') || ''; return (list.find((m) => m.id === saved) || own[0] || list[0])?.id || ''; }
    async function lhTopHtml(core, st, list) {
        try {
            const all = await core.laserDomain.list();
            const act = lhActiveId(list);
            const m = list.find((x) => x.id === act);
            if (!m)
                return '';
            const profs = all.filter((x) => x.type === 'APP.LASER.PROFILE' && !x.archivedAt && x.data.machineId === act).sort((a, b) => String(a.data.name).localeCompare(String(b.data.name), 'cs', { numeric: true }));
            const lastUsed = all.filter((x) => x.type === 'APP.LASER.PROJECT' && !x.archivedAt && x.data.machineId === act).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]?.data.profileId;
            const prof = profs.find((x) => x.id === lastUsed) || profs[0]; /* the profile used last on this laser, else the first by name */
            const src = prof && all.find((x) => x.id === prof.data.sourceModuleId);
            const G = globalThis.KXLaserGuard;
            const g = src && G ? G.effective(src.data) : null;
            const gl = !g ? `<span class="kx-badge kx-badge-off">🛡 ${esc(TL('lh2.noGuard', 'no protection'))}</span>` : g.enabled === false ? `<span class="kx-badge kx-badge-off">🛡 OFF</span>` : `<span class="kx-badge kx-badge-ok">🛡 ${esc(g.name || TL('lh2.guardOn', 'protection'))} · ${esc(TL('sg.mode.' + (g.mode || 'hard-stop'), g.mode || ''))}${g.suggested ? ' · ' + esc(TL('lh2.suggested', 'suggested')) : ''}</span>`;
            const by = (t) => all.filter((x) => x.type === t && !x.archivedAt && x.data.machineId === act).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
            const prj = by('APP.LASER.PROJECT'), tst = by('APP.LASER.TEST').filter((x) => x.data.kind === 'SESSION' || x.data.grid);
            const ops = (id) => all.filter((x) => x.type === 'APP.LASER.OPERATION' && !x.archivedAt && x.data.projectId === id).length;
            const runs = (id) => all.filter((x) => x.type === 'APP.LASER.TEST_RUN' && !x.archivedAt && x.data.testId === id).sort((a, b) => (a.data.sequence || 0) - (b.data.sequence || 0));
            const cont = prj.find((x) => ['DRAFT', 'READY', 'RUNNING'].includes(x.data.status));
            const lastP = prj[0];
            const lastT = tst[0];
            const fav = prj.filter((x) => x.data.evidence?.projectFavorite).length;
            const rec = Object.keys(localStorage).filter(k => k.startsWith('kx.laser.rec.')).map(k => { const v = localStorage.getItem(k) || ''; let at = 0; try {
                at = v.startsWith('{') ? Number(JSON.parse(v).at || 0) : Number(v || 0);
            }
            catch { } return { id: k.slice(13), at }; }).find(x => x.at);
            const recT = rec && all.find((x) => x.id === rec.id);
            const d = (x) => x?.updatedAt ? new Date(x.updatedAt).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }) : '';
            const RS = { PENDING: '⏳', PASS: '✓', FAIL: '✗', MIXED: '≈' };
            const lr = lastT ? runs(lastT.id).slice(-1)[0] : null;
            const card = (k, label, b, sub, id = '') => `<button type="button" class="lh2-card" data-lh2-card="${k}" data-id="${esc(id)}" ${id || k === 'fav' ? '' : 'disabled'}><small>${esc(label)}</small><b>${esc(b)}</b><span>${esc(sub)}</span></button>`;
            return `<div class="lh2-top" data-lh2-top><div class="lh2-bar"><button type="button" class="icon-btn" data-lh2-prev title="${esc(TL('lh2.prev', 'Previous laser'))}">◀</button><select data-lh2-machine data-keep-select title="${esc(TL('lh2.active', 'Active laser – new projects and tests use it'))}">${list.filter((x) => !x.archivedAt).map((x) => `<option value="${esc(x.id)}" ${x.id === act ? 'selected' : ''}>${esc(x.data.name)}${x.data.origin === 'DEMO' ? ' · ' + esc(TL('lh2.demo', 'sample')) : ''}</option>`).join('')}</select><button type="button" class="icon-btn" data-lh2-next title="${esc(TL('lh2.next', 'Next laser'))}">▶</button>
      <button type="button" class="btn compact" data-lh2-wizard title="${esc(TL('lw.open', 'New laser – guide in 5 steps'))}">＋ ${esc(TL('lw.btn', 'Laser (guide)'))}</button><small class="muted">${prof ? esc(prof.data.name) : ''}${prof?.data?.focusMm ? ` · focus ${prof.data.focusMm} mm` : ''}${src?.data?.nominalPowerW ? ` · ${src.data.nominalPowerW} W` : ''}${src?.data?.wavelengthNm ? ` · ${src.data.wavelengthNm} nm` : ''}</small>${gl}</div>
      <div class="lh2-cards">${card('cont', '▶ ' + TL('lh2.continue', 'Continue'), cont?.data.title || TL('lh2.none', 'nothing'), cont ? `${ops(cont.id)} ${TL('lh2.layers', 'layers')} · ${d(cont)}` : '', cont?.id)}${card('proj', TL('lh2.lastProject', 'Last project'), lastP?.data.title || TL('lh2.none', 'nothing'), lastP ? `${lastP.data.evidence?.result ? TL('lc.o.result.' + lastP.data.evidence.result, '') : TL('laser.prjStatus.' + lastP.data.status, lastP.data.status)} · ${d(lastP)}` : '', lastP?.id)}${card('test', TL('lh2.lastTest', 'Last test'), lastT?.data.title || TL('lh2.none', 'nothing'), lastT ? `${runs(lastT.id).length} ${TL('lts.steps', 'steps')}${lr ? ' · ' + RS[lr.data.result || 'PENDING'] : ''} · ${d(lastT)}` : '', lastT?.id)}${card('fav', '★ ' + TL('lh2.fav', 'Favourites'), `${fav} ${TL('lh2.projects', 'projects')}`, TL('lh2.favSub', 'quick access'), '')}${card('rec', '⏱ ' + TL('lh2.rec', 'Stopwatch'), rec ? TL('lh2.recOn', 'running') : TL('lh2.recOff', 'not running'), recT ? String(recT.data.title) : '', rec?.id || '')}</div></div>`;
        }
        catch (e) {
            globalThis.KXBugs?.pushErr?.(e);
            return '';
        }
    }
    function lhTopBind(root, core, opts, st, list) {
        const sel = root.querySelector('[data-lh2-machine]');
        if (!sel)
            return;
        const go = async (id) => { try {
            localStorage.setItem('kx.laser.active', id);
        }
        catch { } const vn = localStorage.getItem('kx.laser.view.' + id); if (vn) {
            try {
                await core.actions.invoke('ACTION.CORE.FIELDS.VIEW_APPLY', { scope: 'LASER.PROJECTS', name: vn }, { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: [], confirmed: true });
            }
            catch { }
        } /* the laser’s own default view of the Projects table */ /* the laser’s own default view of the Projects table */ void KXLaserHub.mountHub(root, core, opts); };
        sel.onchange = () => void go(sel.value);
        const ids = Array.from(sel.options).map(o => o.value);
        const step = (d) => { const i = ids.indexOf(sel.value); void go(ids[(i + d + ids.length) % ids.length]); };
        root.querySelector('[data-lh2-prev]').onclick = () => step(-1);
        root.querySelector('[data-lh2-next]').onclick = () => step(1);
        root.querySelector('[data-lh2-wizard]')?.addEventListener('click', () => void openLaserWizard(core, opts, (id) => { try {
            localStorage.setItem('kx.laser.active', id);
        }
        catch { } st.tab = 'MACHINES'; void KXLaserHub.mountHub(root, core, opts); }));
        root.querySelectorAll('[data-lh2-card]').forEach(b => b.onclick = () => { const k = b.dataset.lh2Card, id = String(b.dataset.id || ''); if (k === 'cont' || k === 'proj') {
            st.tab = 'PROJECTS';
            st.pOpen = id;
        }
        else if (k === 'test' || k === 'rec') {
            st.tab = 'TESTS';
            st.tOpen = id;
        }
        else if (k === 'fav') {
            st.tab = 'PROJECTS';
            st.favOnly = true;
        } void KXLaserHub.mountHub(root, core, opts); });
        /* new project / test forms start with the active laser */ const act = sel.value;
        root.querySelectorAll('select').forEach(s2 => { if (s2 === sel || s2.dataset.lh2Done)
            return; if (Array.from(s2.options).some(o => o.value === act) && s2.closest('[data-pn-form],[data-lt-new],form,details') && !s2.dataset.keepMachine) {
            s2.dataset.lh2Done = '1';
            if (s2.value !== act && !s2.closest('[data-lh-project]')) {
                s2.value = act;
                s2.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } });
    }
    /* ---------- N2.6b+ PHOTO GALLERY (original: take a photo · choose pictures · screen screenshot · main picture · move · delete) – files in NEXUS, ids on the record ---------- */
    async function lhGallery(core, opts, host, ids, spaceIds, save, readOnly = false) {
        const FC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['CORE.FILE.WRITE', 'CORE.ENTITY.CREATE', 'LASER.READ'], confirmed: true };
        const urls = [];
        for (const id of ids) {
            try {
                const b = await core.files.getBlob(id);
                urls.push(b ? URL.createObjectURL(b) : '');
            }
            catch {
                urls.push('');
            }
        }
        host.innerHTML = `<div class="lhg" data-lhg><div class="lhg-bar"><b>📷 ${esc(TL('lhg.title', 'Photos'))} · ${ids.length}</b>${readOnly ? '' : `<label class="btn compact">📷 ${esc(TL('lhg.camera', 'Take a photo'))}<input type="file" accept="image/*" capture="environment" data-lhg-file hidden></label><label class="btn compact">🖼 ${esc(TL('lhg.pick', 'Choose pictures'))}<input type="file" accept="image/*" multiple data-lhg-file hidden></label><button type="button" class="btn compact" data-lhg-screen title="${esc(TL('lhg.screenHelp', 'Captures one window or monitor as a picture'))}">🖥 ${esc(TL('lhg.screen', 'Screenshot'))}</button>`}<small class="muted" data-lhg-msg></small></div>
      <div class="lhg-grid">${ids.map((id, i) => `<figure class="lhg-it ${i === 0 ? 'main' : ''}">${urls[i] ? `<img src="${esc(urls[i])}" alt="" data-lhg-zoom>` : `<div class="lhg-miss">?</div>`}${i === 0 ? `<span class="lhg-main">★ ${esc(TL('lhg.main', 'main'))}</span>` : ''}${readOnly ? '' : `<figcaption>${i ? `<button type="button" class="icon-btn" data-lhg-main="${i}" title="${esc(TL('lhg.setMain', 'Set as the main picture'))}">★</button>` : ''}<button type="button" class="icon-btn" data-lhg-mv="${i}" data-dir="-1" title="${esc(TL('lg2.left', 'Move left'))}" ${i === 0 ? 'disabled' : ''}>◀</button><button type="button" class="icon-btn" data-lhg-mv="${i}" data-dir="1" title="${esc(TL('lg2.right', 'Move right'))}" ${i === ids.length - 1 ? 'disabled' : ''}>▶</button><button type="button" class="icon-btn" data-lhg-del="${i}" title="${esc(TL('lhg.del', 'Remove the picture'))}">🗑</button></figcaption>`}</figure>`).join('') || `<small class="muted">${esc(TL('lhg.empty', 'No photos yet.'))}</small>`}</div></div>`;
        const msg = (m) => { const e = host.querySelector('[data-lhg-msg]'); if (e)
            e.textContent = m; };
        const done = async (n) => { try {
            await save(n);
        }
        catch (e) {
            msg(String(e?.message || e));
        } };
        const add = async (blobs) => { const n = [...ids]; try {
            for (const x of blobs) {
                if (!/^image\//.test(x.b.type))
                    continue;
                const fr = await core.files.importBlob(x.b, x.name, x.b.type, OWNER, spaceIds, FC, { tags: ['kx:laser-photo'] });
                n.push(fr.id);
            }
        }
        catch (e) {
            msg(String(e?.message || e));
            return;
        } if (n.length !== ids.length)
            await done(n); };
        host.querySelectorAll('[data-lhg-file]').forEach(inp => inp.onchange = async (e) => { const fs = Array.from(e.target.files || []); await add(fs.map(f => ({ b: f, name: f.name }))); });
        host.querySelector('[data-lhg-screen]')?.addEventListener('click', async () => { try {
            const md = navigator.mediaDevices;
            if (!md?.getDisplayMedia) {
                msg(TL('lhg.noScreen', 'This browser cannot capture the screen.'));
                return;
            }
            const stream = await md.getDisplayMedia({ video: true, audio: false });
            const v = document.createElement('video');
            v.srcObject = stream;
            v.muted = true;
            await v.play();
            await new Promise(r => setTimeout(r, 250));
            const c = document.createElement('canvas');
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            c.getContext('2d').drawImage(v, 0, 0);
            stream.getTracks().forEach((t) => t.stop());
            const b = await new Promise(r => c.toBlob(x => r(x), 'image/png'));
            await add([{ b, name: `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png` }]);
        }
        catch (e) {
            msg(String(e?.message || e));
        } });
        host.querySelectorAll('[data-lhg-zoom]').forEach(im => im.onclick = () => im.classList.toggle('big'));
        host.querySelectorAll('[data-lhg-main]').forEach(b => b.onclick = () => { const i = Number(b.dataset.lhgMain); const n = [ids[i], ...ids.filter((_, k) => k !== i)]; void done(n); });
        host.querySelectorAll('[data-lhg-mv]').forEach(b => b.onclick = () => { const i = Number(b.dataset.lhgMv), j = i + (b.dataset.dir === '-1' ? -1 : 1); if (j < 0 || j >= ids.length)
            return; const n = [...ids]; [n[i], n[j]] = [n[j], n[i]]; void done(n); });
        host.querySelectorAll('[data-lhg-del]').forEach(b => b.onclick = () => { if (!confirm(TL('lhg.delConfirm', 'Remove this picture from the record? (the file stays in Files)')))
            return; const i = Number(b.dataset.lhgDel); void done(ids.filter((_, k) => k !== i)); });
    }
    /* ---------- N2.6b+ NEW LASER GUIDE in 5 steps (original laserWizardModal + recommended settings per technology KX58_TECHS) ---------- */
    const LW_T = {
        MOPA: { codes: ['FIBER_MOPA', 'GALVO'], ctl: 'galvo', src: [{ tech: 'FIBER_MOPA', nm: 1064, w: 60 }], caps: 'FIBER_MOPA', sw: ['LIGHTBURN', 'EZCAD_2', 'EZCAD_3', 'SEACAD'], unit: 'mm/s', lenses: '110, 210, 300', area: '', focus: '', max: '' },
        FIBER: { codes: ['FIBER', 'GALVO'], ctl: 'galvo', src: [{ tech: 'FIBER', nm: 1064, w: 30 }], caps: 'FIBER', sw: ['LIGHTBURN', 'EZCAD_2', 'EZCAD_3'], unit: 'mm/s', lenses: '110, 210', area: '', focus: '', max: '' },
        UV: { codes: ['UV', 'GALVO'], ctl: 'galvo', src: [{ tech: 'UV', nm: 355, w: 5 }], caps: 'UV', sw: ['LIGHTBURN', 'EZCAD_2', 'EZCAD_3'], unit: 'mm/s', lenses: '110', area: '', focus: '', max: '' },
        CO2: { codes: ['CO2', 'DSP'], ctl: 'dsp', variant: 'ruida', src: [{ tech: 'CO2', nm: 10600, w: 60 }], caps: 'CO2', sw: ['LIGHTBURN', 'RDWORKS'], unit: 'mm/s', lenses: '', area: '600 × 400 mm', focus: '', max: '500' },
        DIODE: { codes: ['DIODE'], ctl: 'gcode', src: [{ tech: 'DIODE', nm: 455, w: 10 }], caps: 'DIODE', sw: ['LIGHTBURN', 'LASERGRBL'], unit: 'mm/min', lenses: '', area: '400 × 400 mm', focus: '', max: '' },
        COMBI: { codes: ['LP4', 'DIODE', 'FIBER'], ctl: 'gcode', src: [{ tech: 'DIODE', nm: 455, w: 10, preset: 'LP4_P566' }, { tech: 'FIBER', nm: 1064, w: 2, preset: 'LP4_P566' }], caps: '', sw: ['LIGHTBURN', 'LASERPECKER_DESIGN_SPACE'], unit: 'Depth %', lenses: '', area: '160 × 120 mm', focus: '150', max: '4000', modes: 'Standard, Slide, Rotary' }
    };
    const LW_SW = [['LIGHTBURN', 'LightBurn'], ['EZCAD_2', 'EZCAD 2'], ['EZCAD_3', 'EZCAD 3'], ['SEACAD', 'SeaCAD'], ['RDWORKS', 'RDWorks'], ['LASERGRBL', 'LaserGRBL'], ['LASERPECKER_DESIGN_SPACE', 'LaserPecker Design Space'], ['XTOOL_CREATIVE_SPACE', 'xTool Creative Space']];
    async function openLaserWizard(core, opts, onDone) {
        const RC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.READ', 'LASER.CONFIG.EDIT', 'CORE.ENTITY.CREATE'], confirmed: true };
        const G = globalThis.KXLaserGuard;
        const capsOfTpl = (t, sx) => ({ ...(sx.preset ? G?.PRESET_CAPS?.[sx.preset] : G?.TECH_CAPS?.[t.caps || sx.tech]) || {} });
        let step = 1;
        const S = { tpl: 'MOPA', name: '', maker: '', model: '', space: 'SPACE.COMPANY', variant: '', sources: [], sw: [], defSw: 'LIGHTBURN', unit: 'mm/s', lenses: '', area: '', focus: '', max: '', modes: 'Standard' };
        const apply = (k) => { const t = LW_T[k]; S.tpl = k; S.ctl = t.ctl; S.variant = t.variant || ''; S.sources = t.src.map((x) => ({ ...x, caps: capsOfTpl(t, x) })); S.sw = [...t.sw]; S.defSw = t.sw[0]; S.unit = t.unit; S.lenses = t.lenses; S.area = t.area; S.focus = t.focus; S.max = t.max; S.modes = t.modes || 'Standard'; };
        apply('MOPA');
        const w = document.createElement('div');
        w.className = 'lce-wrap';
        w.setAttribute('data-keep-open', '');
        w.setAttribute('data-laser-wizard', '');
        document.body.appendChild(w);
        ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(ev => w.addEventListener(ev, (e) => e.stopPropagation()));
        const CAPK = ['frequency', 'pulse', 'wobble', 'timings', 'overscan', 'air', 'threeD', 'rotary', 'autoRotate'];
        const steps = ['base', 'sources', 'programs', 'profiles', 'check'];
        const body = () => {
            if (step === 1)
                return `<p class="muted">${esc(TL('lw.s1help', 'Choose the type – the recommended settings fill in automatically; everything can be changed.'))}</p><div class="lw-tpl">${Object.keys(LW_T).map(k => `<button type="button" class="chip ${S.tpl === k ? 'active' : ''}" data-lw-tpl="${k}">${esc(TL('lw.t.' + k, k))}</button>`).join('')}</div>
        <div class="lce-grid"><label class="lce-f"><span class="lce-l">${esc(TL('lw.name', 'Name'))} *</span><input data-lw="name" value="${esc(S.name)}" placeholder="Haotian 60W MOPA · JPT M7"></label><label class="lce-f"><span class="lce-l">${esc(TL('lw.maker', 'Manufacturer'))}</span><input data-lw="maker" value="${esc(S.maker)}"></label><label class="lce-f"><span class="lce-l">${esc(TL('lw.model', 'Model'))}</span><input data-lw="model" value="${esc(S.model)}"></label>
        <label class="lce-f"><span class="lce-l">${esc(TL('lw.ctl', 'Controller'))}</span><select data-lw="ctl" data-keep-select>${['galvo', 'gcode', 'dsp'].map(x => `<option value="${x}" ${S.ctl === x ? 'selected' : ''}>${esc(TL('lw.ctl.' + x, x))}</option>`).join('')}</select></label>${S.ctl === 'dsp' ? `<label class="lce-f"><span class="lce-l">${esc(TL('lw.variant', 'DSP variant'))}</span><select data-lw="variant" data-keep-select>${['ruida', 'trocen', 'topwisdom', ''].map(x => `<option value="${x}" ${S.variant === x ? 'selected' : ''}>${esc(x || '—')}</option>`).join('')}</select></label>` : ''}
        <label class="lce-f"><span class="lce-l">${esc(TL('lw.space', 'Area'))}</span><select data-lw="space" data-keep-select>${['SPACE.COMPANY', 'SPACE.PERSONAL', 'SPACE.FAMILY'].map(x => `<option value="${x}" ${S.space === x ? 'selected' : ''}>${esc(TL('lw.sp.' + x, x))}</option>`).join('')}</select></label></div>`;
            if (step === 2)
                return `<p class="muted">${esc(TL('lw.s2help', 'Sources of the laser – wavelength, power and what the source can do (fields in projects follow it).'))}</p>${S.sources.map((x, i) => `<div class="lw-src"><div class="lce-grid"><label class="lce-f"><span class="lce-l">${esc(TL('lw.srcTech', 'Technology'))}</span><select data-lw-s="${i}:tech" data-keep-select>${['FIBER_MOPA', 'FIBER', 'UV', 'CO2', 'DIODE'].map(t => `<option value="${t}" ${x.tech === t ? 'selected' : ''}>${esc(TL('lw.tech.' + t, t))}</option>`).join('')}</select></label><label class="lce-f"><span class="lce-l">${esc(TL('lw.nm', 'Wavelength (nm)'))}</span><input type="number" data-lw-s="${i}:nm" value="${esc(x.nm)}"></label><label class="lce-f"><span class="lce-l">${esc(TL('lw.w', 'Power (W)'))} *</span><input type="number" step="any" data-lw-s="${i}:w" value="${esc(x.w)}"></label></div>
        <div class="lw-caps">${CAPK.map(k => `<label><input type="checkbox" data-lw-c="${i}:${k}" ${x.caps?.[k] ? 'checked' : ''}> ${esc(TL('lw.cap.' + k, k))}</label>`).join('')}</div>${S.sources.length > 1 ? `<button type="button" class="btn ghost compact" data-lw-sdel="${i}">🗑 ${esc(TL('lw.srcDel', 'Remove the source'))}</button>` : ''}</div>`).join('')}<button type="button" class="btn compact" data-lw-sadd>＋ ${esc(TL('lw.srcAdd', 'Second source (dual laser)'))}</button>`;
            if (step === 3)
                return `<p class="muted">${esc(TL('lw.s3help', 'Programs you use with this laser and the default one; the speed unit as the program shows it.'))}</p><div class="lw-caps">${LW_SW.map(([k, l]) => `<label><input type="checkbox" data-lw-sw="${k}" ${S.sw.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
        <div class="lce-grid"><label class="lce-f"><span class="lce-l">${esc(TL('lw.defSw', 'Default program'))}</span><select data-lw="defSw" data-keep-select>${LW_SW.filter(([k]) => S.sw.includes(k)).map(([k, l]) => `<option value="${k}" ${S.defSw === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label class="lce-f"><span class="lce-l">${esc(TL('lw.unit', 'Speed unit'))}</span><select data-lw="unit" data-keep-select>${['mm/s', 'mm/min', 'mm/rotation', 'Depth %'].map(x => `<option ${S.unit === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>`;
            if (step === 4)
                return `<p class="muted">${esc(S.ctl === 'galvo' ? TL('lw.s4galvo', 'Galvo: one profile per F-theta lens (focal length in mm). Focus = distance lens → material.') : TL('lw.s4other', 'Portal / LaserPecker: one profile per mode (Standard, Slide, Rotary…) with the working area.'))}</p><div class="lce-grid">${S.ctl === 'galvo' ? `<label class="lce-f"><span class="lce-l">${esc(TL('lw.lenses', 'Lenses (mm, comma)'))} *</span><input data-lw="lenses" value="${esc(S.lenses)}" placeholder="110, 210, 300"></label>` : `<label class="lce-f"><span class="lce-l">${esc(TL('lw.modes', 'Modes (comma)'))} *</span><input data-lw="modes" value="${esc(S.modes)}"></label><label class="lce-f"><span class="lce-l">${esc(TL('lw.area', 'Working area'))}</span><input data-lw="area" value="${esc(S.area)}" placeholder="400 × 400 mm"></label>`}<label class="lce-f"><span class="lce-l">${esc(TL('lw.focus', 'Focus (mm)'))}</span><input type="number" step="any" data-lw="focus" value="${esc(S.focus)}"></label><label class="lce-f"><span class="lce-l">${esc(TL('lw.max', 'Max speed (mm/s)'))}</span><input type="number" step="any" data-lw="max" value="${esc(S.max)}"></label></div>`;
            const profs = lwProfiles();
            return `<p class="muted">${esc(TL('lw.s5help', 'Check and create – everything can be edited later.'))}</p><table class="kx-calc-table"><tr><td>${esc(TL('lw.name', 'Name'))}</td><td><b>${esc(S.name || '—')}</b> · ${esc(TL('lw.t.' + S.tpl, S.tpl))} · ${esc(TL('lw.ctl.' + S.ctl, S.ctl))}${S.variant ? ' (' + esc(S.variant) + ')' : ''}</td></tr><tr><td>${esc(TL('lw.sources', 'Sources'))}</td><td>${S.sources.map((x) => `${x.nm} nm · ${x.w} W · ${CAPK.filter(k => x.caps?.[k]).map(k => TL('lw.cap.' + k, k)).join(', ') || '—'}`).join('<br>')}</td></tr><tr><td>${esc(TL('lw.programs', 'Programs'))}</td><td>${S.sw.map((k) => esc(LW_SW.find(x => x[0] === k)?.[1] || k)).join(', ')} · ${esc(S.unit)}</td></tr><tr><td>${esc(TL('lw.profiles', 'Profiles'))}</td><td>${profs.map(x => esc(x.name)).join(', ') || '—'}</td></tr></table>`;
        };
        function lwProfiles() {
            const out = [];
            const L = String(S.lenses || '').split(/[;,\s]+/).map(Number).filter(n => n > 0);
            const M = String(S.modes || 'Standard').split(/[;,]+/).map(x => x.trim()).filter(Boolean);
            S.sources.forEach((x, si) => { const sn = S.sources.length > 1 ? ` · ${x.nm} nm` : ''; if (S.ctl === 'galvo')
                for (const f of L)
                    out.push({ si, name: `${TL('lw.lens', 'Lens')} ${f} mm${sn}`, lens: f, mode: 'Standard' });
            else
                for (const m of M)
                    out.push({ si, name: `${m}${sn}`, mode: m }); });
            return out;
        }
        const err = (m) => { const e = w.querySelector('[data-lw-err]'); if (e)
            e.textContent = m; };
        const read = () => { w.querySelectorAll('[data-lw]').forEach(el => { S[el.dataset.lw] = String(el.value ?? '').trim(); }); w.querySelectorAll('[data-lw-s]').forEach(el => { const [i, k] = String(el.dataset.lwS).split(':'); S.sources[Number(i)][k] = k === 'tech' ? el.value : Number(String(el.value).replace(',', '.')); }); w.querySelectorAll('[data-lw-c]').forEach(el => { const [i, k] = String(el.dataset.lwC).split(':'); S.sources[Number(i)].caps = { ...(S.sources[Number(i)].caps || {}), [k]: !!el.checked }; }); if (w.querySelector('[data-lw-sw]'))
            S.sw = Array.from(w.querySelectorAll('[data-lw-sw]')).filter(x => x.checked).map(x => String(x.dataset.lwSw)); if (!S.sw.includes(S.defSw))
            S.defSw = S.sw[0] || ''; };
        const valid = () => { if (step === 1 && !S.name) {
            err(TL('lw.err.name', 'Enter the name of the laser.'));
            return false;
        } if (step === 2 && S.sources.some((x) => !(x.w > 0) || !(x.nm > 0))) {
            err(TL('lw.err.src', 'Every source needs a wavelength and power.'));
            return false;
        } if (step === 3 && !S.sw.length) {
            err(TL('lw.err.sw', 'Choose at least one program.'));
            return false;
        } if (step === 4 && !lwProfiles().length) {
            err(TL('lw.err.prof', 'Enter at least one lens / mode.'));
            return false;
        } return true; };
        const draw = () => { w.innerHTML = `<div class="lce" role="dialog" aria-modal="true"><div class="lce-head"><div><b>🧭 ${esc(TL('lw.title', 'New laser'))}</b><small>${steps.map((k, i) => `<span class="lw-step ${i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}">${i + 1} · ${esc(TL('lw.step.' + k, k))}</span>`).join(' ')}</small></div><button type="button" class="icon-btn" data-lw-close title="${esc(TL('vault.cancel', 'Cancel'))}">✕</button></div><div class="lce-body">${body()}</div><div class="lce-foot"><span class="lce-err" data-lw-err></span><button type="button" class="btn ghost" data-lw-back ${step === 1 ? 'disabled' : ''}>◀ ${esc(TL('lw.back', 'Back'))}</button>${step < 5 ? `<button type="button" class="btn primary" data-lw-next>${esc(TL('lw.next', 'Next'))} ▶</button>` : `<button type="button" class="btn primary" data-lw-create>✓ ${esc(TL('lw.create', 'Create the laser'))}</button>`}</div></div>`; bind(); };
        function bind() {
            w.querySelectorAll('[data-lw-close]').forEach(b => b.onclick = () => w.remove());
            w.onkeydown = (e) => { if (e.key === 'Escape') {
                e.stopPropagation();
                w.remove();
            } };
            w.querySelectorAll('[data-lw-tpl]').forEach(b => b.onclick = () => { read(); apply(String(b.dataset.lwTpl)); draw(); });
            w.querySelector('[data-lw="ctl"]')?.addEventListener('change', () => { read(); draw(); });
            w.querySelectorAll('[data-lw-s$=":tech"]').forEach(sl => sl.onchange = () => { read(); const i = Number(String(sl.dataset.lwS).split(':')[0]); const t = sl.value; S.sources[i].caps = { ...(G?.TECH_CAPS?.[t] || {}) }; S.sources[i].nm = t === 'UV' ? 355 : t === 'CO2' ? 10600 : t === 'DIODE' ? 455 : 1064; draw(); });
            w.querySelector('[data-lw-sadd]')?.addEventListener('click', () => { read(); S.sources.push({ tech: 'FIBER', nm: 1064, w: 2, caps: { ...(G?.TECH_CAPS?.FIBER || {}) } }); draw(); });
            w.querySelectorAll('[data-lw-sdel]').forEach(b => b.onclick = () => { read(); S.sources.splice(Number(b.dataset.lwSdel), 1); draw(); });
            w.querySelectorAll('[data-lw-sw]').forEach(cb => cb.onchange = () => { read(); draw(); });
            w.querySelector('[data-lw-back]').onclick = () => { read(); step = Math.max(1, step - 1); draw(); };
            w.querySelector('[data-lw-next]')?.addEventListener('click', () => { read(); if (!valid())
                return; step++; draw(); });
            w.querySelector('[data-lw-create]')?.addEventListener('click', async () => {
                read();
                const btn = w.querySelector('[data-lw-create]');
                btn.disabled = true;
                try {
                    const t = LW_T[S.tpl];
                    const sp = [S.space];
                    const swLabel = S.sw.map((k) => LW_SW.find(x => x[0] === k)?.[1] || k).join(' + ');
                    const m = await core.actions.invoke('ACTION.LASER.MACHINE.SAVE', { spaceIds: sp, data: { name: S.name, manufacturer: S.maker || undefined, model: S.model || undefined, physicalOwned: true, origin: 'USER', technologyCodes: [...new Set([...t.codes, ...S.sources.map((x) => x.tech), ...(S.ctl === 'galvo' ? ['GALVO'] : S.ctl === 'dsp' ? ['DSP'] : [])])], controller: S.ctl, controllerVariant: S.variant || undefined, software: S.sw, defaultSoftware: S.defSw, speedUnit: S.unit, status: 'ACTIVE' } }, RC);
                    const srcIds = [];
                    for (const x of S.sources) {
                        const so = await core.actions.invoke('ACTION.LASER.SOURCE_MODULE.SAVE', { spaceIds: sp, data: { machineId: m.id, name: `${TL('lw.tech.' + x.tech, x.tech)} ${x.nm} nm`, technologyCode: x.tech, wavelengthNm: x.nm, nominalPowerW: x.w, capabilities: Object.fromEntries(CAPK.map(k => [k, !!x.caps?.[k]])) } }, RC);
                        srcIds.push(so.id);
                    }
                    const lensIds = {};
                    let stdLens = '';
                    if (S.ctl !== 'galvo') {
                        const le = await core.actions.invoke('ACTION.LASER.LENS.SAVE', { spaceIds: sp, data: { machineId: m.id, name: TL('lw.stdLens', 'Standard optics'), kind: 'OTHER' } }, RC);
                        stdLens = le.id;
                    } /* projects need a lens – portal / LaserPecker machines get their standard optics */
                    for (const pf of lwProfiles()) {
                        let lensId = stdLens || undefined;
                        if (pf.lens) {
                            if (!lensIds[pf.lens]) {
                                const le = await core.actions.invoke('ACTION.LASER.LENS.SAVE', { spaceIds: sp, data: { machineId: m.id, name: `F${pf.lens}`, focalLengthMm: pf.lens, kind: 'FIELD' } }, RC);
                                lensIds[pf.lens] = le.id;
                            }
                            lensId = lensIds[pf.lens];
                        }
                        await core.actions.invoke('ACTION.LASER.PROFILE.SAVE', { spaceIds: sp, data: { machineId: m.id, sourceModuleId: srcIds[pf.si], name: pf.name, mode: pf.mode, software: swLabel, ...(lensId ? { defaultLensId: lensId } : {}), speedUnit: S.unit, ...(S.area ? { workspace: S.area } : {}), ...(Number(S.focus) > 0 ? { focusMm: Number(S.focus) } : {}), ...(Number(S.max) > 0 ? { maxSpeedMmS: Number(S.max) } : {}) } }, RC);
                    }
                    w.remove();
                    opts.onToast?.(TL('lw.created', 'Laser created') + ': ' + S.name);
                    onDone(m.id);
                }
                catch (e) {
                    btn.disabled = false;
                    err(String(e?.message || e));
                }
            });
        }
        draw();
    }
    /* ---------- N2.6b+ QR IDENTITY of a project / test (original: QR identity, follow, copy id) – the link opens the record: ?kxopen=APP.KX.LASER:PROJECT|TEST:CODE ---------- */
    function lqLink(kind, code) { return `${location.origin}${location.pathname}?kxopen=${encodeURIComponent(`APP.KX.LASER:${kind}:${code}`)}`; }
    function openLaserQr(core, opts, rec, kind) {
        const code = String(rec.data.recordCode || '');
        const url = lqLink(kind, code);
        const svg = globalThis.KXHandoff?.qrSvg?.(url, { utf8: true }) || '';
        const w = document.createElement('div');
        w.className = 'lce-wrap';
        w.setAttribute('data-keep-open', '');
        w.setAttribute('data-laser-qr', '');
        ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(ev => w.addEventListener(ev, (e) => e.stopPropagation()));
        w.innerHTML = `<div class="lce lq" role="dialog" aria-modal="true"><div class="lce-head"><div><b>▦ ${esc(TL('lq.title', 'QR identity'))}</b><small>${esc(code)} · ${esc(rec.data.title || '')}</small></div><button type="button" class="icon-btn" data-lq-close title="${esc(TL('lts.close', 'Close'))}">✕</button></div>
      <div class="lce-body lq-body"><div class="lq-code" data-lq-svg>${svg}</div><div><b class="lq-id">${esc(code)}</b><p class="muted">${esc(TL('lq.help', 'Scan with the phone – NEXUS opens this record directly. Stick the label on the test piece or the job.'))}</p><input class="lq-url" readonly value="${esc(url)}"><div class="sg-lbar"><button type="button" class="btn compact" data-lq-copy>⧉ ${esc(TL('lq.copy', 'Copy the link'))}</button><button type="button" class="btn compact" data-lq-copyid>⧉ ${esc(TL('lq.copyId', 'Copy the code'))}</button><button type="button" class="btn compact" data-lq-print>🖨 ${esc(TL('lq.print', 'Print the label'))}</button><button type="button" class="btn compact" data-lq-save>＋ ${esc(TL('lq.save', 'Save to QR centre'))}</button></div><small class="muted" data-lq-msg></small></div></div></div>`;
        document.body.appendChild(w);
        const msg = (m) => { w.querySelector('[data-lq-msg]').textContent = m; };
        const close = () => w.remove();
        w.querySelector('[data-lq-close]').onclick = close;
        w.addEventListener('keydown', (e) => { if (e.key === 'Escape')
            close(); });
        const cp = async (t) => { try {
            await navigator.clipboard.writeText(t);
            msg(TL('lq.copied', 'Copied'));
        }
        catch {
            msg(t);
        } };
        w.querySelector('[data-lq-copy]').onclick = () => void cp(url);
        w.querySelector('[data-lq-copyid]').onclick = () => void cp(code);
        w.querySelector('[data-lq-print]').onclick = () => { const pw = window.open('', '_blank', 'width=420,height=520'); if (!pw) {
            msg(TL('lq.popup', 'The browser blocked the print window.'));
            return;
        } pw.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(code)}</title><body style="font-family:sans-serif;text-align:center;margin:12px"><div style="width:52mm;margin:auto">${svg}</div><div style="font:700 14pt monospace">${esc(code)}</div><div style="font-size:10pt">${esc(rec.data.title || '')}</div><script>setTimeout(()=>{print();},300)<\/script></body>`); pw.document.close(); };
        w.querySelector('[data-lq-save]').onclick = async () => { try {
            await core.actions.invoke('ACTION.QR.CODE.SAVE', { spaceId: (rec.spaceIds || [])[0], data: { name: `Laser · ${code} · ${String(rec.data.title || '').slice(0, 60)}`, kind: 'WEB', fields: { url } } }, { actorId: opts.actorId, appCode: 'APP.KX.QR', deviceId: opts.deviceId, permissions: [], confirmed: true });
            msg(TL('lq.saved', 'Saved to the QR centre'));
        }
        catch (e) {
            msg(String(e?.message || e));
        } };
    }
    /* the QR link opens the record once the app is ready (no change of the shell needed) */
    try {
        const q = new URLSearchParams(location.search).get('kxopen');
        const m2 = q && q.match(/^APP\.KX\.LASER:(PROJECT|TEST):([A-Z0-9-]+)$/);
        if (m2) {
            let tries = 0;
            const tm = setInterval(() => { tries++; const item = document.querySelector('.sidebar [data-tree-hub="APP.KX.LASER"]:not([data-tree-tab])'); const ready = item && (!document.getElementById('startup') || document.getElementById('startup').classList.contains('hide')); if (ready || tries > 120) {
                clearInterval(tm);
                if (!ready)
                    return;
                globalThis.KXLaserOpen = { kind: m2[1], code: m2[2] };
                try {
                    const u = new URL(location.href);
                    u.searchParams.delete('kxopen');
                    history.replaceState(null, '', u.toString());
                }
                catch { }
                item.click();
            } }, 500);
        }
    }
    catch { }
    /* ---------- N2.6b+ deadlines in the calendar: a core task (shows in Calendar and My day) bound to the laser record; clearing the date completes it ---------- */
    async function lhDeadlineTask(core, opts, rec, kind, due, taskId) {
        const TC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['CORE.TASK.EDIT', 'CORE.ENTITY.CREATE'], confirmed: true };
        const old = taskId ? await core.tasks.get(taskId).catch(() => null) : null;
        const title = `${kind === 'TEST' ? '🧪' : '🔥'} Laser: ${String(rec.data.title || '')} (${rec.data.recordCode || ''})`;
        if (!due) {
            if (old && old.status !== 'DONE') {
                try {
                    await core.actions.invoke('ACTION.CORE.TASK.COMPLETE', { id: old.id }, TC);
                }
                catch { }
            }
            return undefined;
        }
        const dueAt = new Date(due + 'T09:00:00').toISOString();
        const r = await core.actions.invoke('ACTION.CORE.TASK.SAVE', old ? { id: old.id, expectedRevision: old.revision, title, ownerApp: OWNER, spaceIds: rec.spaceIds, dueAt, description: lqLink(kind, String(rec.data.recordCode || '')) } : { title, ownerApp: OWNER, spaceIds: rec.spaceIds, dueAt, description: lqLink(kind, String(rec.data.recordCode || '')) }, TC);
        return String(r?.id || taskId || '');
    }
    /* ---------- N2.6b+ CSV PER LAYER (one row per layer incl. sublayers; project info first; only filled parameters; codes → text; decimal comma; ; separator; UTF-8 BOM) ---------- */
    function lhCsvText(projects, all) {
        const byId = (id) => all.find((x) => x.id === id);
        const P = LCAT.filter((g) => LC_LAYER_GROUPS.includes(g.g)).flatMap((g) => g.params).filter((q) => !['layerName', 'layer'].includes(q.k));
        const rows = [];
        for (const pj of projects) {
            const L = all.filter((x) => x.type === 'APP.LASER.OPERATION' && !x.archivedAt && x.data.projectId === pj.id);
            const order = [];
            const kids = (pid) => L.filter((x) => (x.data.parentId || null) === pid).sort((a, b) => (a.data.sequence || 0) - (b.data.sequence || 0));
            const walk = (pid, d) => { for (const o of kids(pid)) {
                order.push({ o, d });
                walk(o.id, d + 1);
            } };
            walk(null, 0);
            if (!order.length)
                rows.push({ pj, o: null, i: 0, d: 0 });
            order.forEach(({ o, d }, i) => rows.push({ pj, o, i, d }));
        }
        const val = (o, q) => { if (!o)
            return ''; const v = q.k === 'output' ? (o.data.parameters?.extras?.output ?? '') : lcValue(o, q.k, q.st); if (v == null || v === '')
            return ''; if (q.t === 'select') {
            const o2 = q.opts || [];
            if (o2.length <= 3 && o2.some((c) => c === 'ANO' || c === 'NE'))
                return ['ANO', 'ANO_M3_CONSTANT', 'YES', 'TRUE'].includes(String(v)) ? TL('csv.yes', 'yes') : TL('csv.no', 'no');
            const t = TL('lc.o.' + q.k + '.' + v, '');
            return t && t !== 'lc.o.' + q.k + '.' + v ? t : String(v);
        } return typeof v === 'number' ? String(v).replace('.', ',') : String(v); };
        const used = P.filter((q) => rows.some(r => val(r.o, q) !== ''));
        const ev = (pj, k) => { const v = pj.data.evidence?.[k]; if (v == null || v === '')
            return ''; const t = TL('lc.o.' + k + '.' + v, ''); return t && t !== 'lc.o.' + k + '.' + v ? t : String(v); };
        const head = [TL('li.col.code', 'Code'), TL('lc.projectName', 'Project'), TL('lc.machine', 'Laser'), TL('lc.preset', 'Profile'), TL('lc.material', 'Material'), TL('lc.purpose', 'Purpose'), TL('lc.result', 'Result'), '#', TL('lc.layerName', 'Layer'), TL('lg2.color', 'Colour'), ...used.map((q) => TL('lc.' + q.k, q.lb) + (q.u ? ` [${q.u}]` : ''))];
        const q2 = (x) => { const t = String(x ?? ''); return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
        const lines = [head.map(q2).join(';'), ...rows.map(r => [r.pj.data.recordCode || '', r.pj.data.title || '', byId(r.pj.data.machineId)?.data.name || '', byId(r.pj.data.profileId)?.data.name || '', r.pj.data.material || '', ev(r.pj, 'purpose'), ev(r.pj, 'result'), r.o ? String(r.i + 1) : '', r.o ? ('↳ '.repeat(r.d) + (r.o.data.name || '')) : '', r.o ? 'C' + String(lgColorIdx(r.o, r.i)).padStart(2, '0') : '', ...used.map((q) => val(r.o, q))].map(q2).join(';'))];
        return '\ufeff' + lines.join('\r\n');
    }
    function lhDownload(name, text, mime = 'text/csv;charset=utf-8') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.style.display = 'none'; a.addEventListener('click', (e) => e.stopPropagation()); /* the page-level outside-click rule must not close the hub window */ /* the page-level outside-click rule must not close the hub window */ document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
    /* ---------- N2.6b+ PDF PRODUCTION CARD (A4 via print → save as PDF) ---------- */
    function lhPdfHtml(project, all, photo) {
        const byId = (id) => all.find((x) => x.id === id);
        const ev = project.data.evidence || {};
        const m = byId(project.data.machineId), pf = byId(project.data.profileId), src = byId(project.data.sourceModuleId) || (pf && byId(pf.data.sourceModuleId));
        const L = all.filter((x) => x.type === 'APP.LASER.OPERATION' && !x.archivedAt && x.data.projectId === project.id);
        const order = [];
        const kids = (pid) => L.filter((x) => (x.data.parentId || null) === pid).sort((a, b) => (a.data.sequence || 0) - (b.data.sequence || 0));
        const walk = (pid, d) => { for (const o of kids(pid)) {
            order.push({ o, d });
            walk(o.id, d + 1);
        } };
        walk(null, 0);
        const qr = globalThis.KXHandoff?.qrSvg?.(lqLink('PROJECT', String(project.data.recordCode || '')), { utf8: true }) || '';
        const G = globalThis.KXLaserGuard;
        const guard = src && G ? G.effective(src.data) : null;
        const evT = (k) => { const v = ev[k]; if (v == null || v === '' || v === false)
            return ''; const t = TL('lc.o.' + k + '.' + v, ''); return t && t !== 'lc.o.' + k + '.' + v ? t : String(v); };
        const KEY = ['mode', 'speed', 'power', 'frequency', 'pulseWidth', 'lineInterval', 'passes', 'scanAngle', 'bidirectional', 'crossHatch'];
        const P = LCAT.flatMap((g) => g.params);
        const qOf = (k) => P.find((x) => x.k === k);
        const cellV = (o, k) => { const q = qOf(k); if (!q)
            return ''; return String(lcCellText(q, lcValue(o, k, q.st)) ?? ''); };
        const extra = (o) => { const out = []; for (const g of LCAT) {
            if (!LC_LAYER_GROUPS.includes(g.g))
                continue;
            for (const q of g.params) {
                if ([...KEY, 'layerName', 'layer', 'output'].includes(q.k))
                    continue;
                const v = lcValue(o, q.k, q.st);
                if (v == null || v === '' || v === false)
                    continue;
                out.push(`${TL('lc.' + q.k, q.lb)}: ${lcCellText(q, v)}${q.u && q.t === 'number' ? ' ' + q.u : ''}`);
            }
        } return out.join(' · '); };
        const st = (o) => { if (!guard)
            return ''; const r = G.evaluate(guard, o.data.parameters || {}); return o.data.parameters?.extras?.guardOverride && r.status === 'danger' ? '🛡' : r.status === 'danger' ? '⛔' : r.status === 'warn' ? '⚠' : '✓'; };
        const info = [[TL('lc.machine', 'Laser'), m?.data.name || ''], [TL('lc.preset', 'Profile'), pf?.data.name || ''], [TL('lce.ctx.src', 'source'), src ? `${src.data.wavelengthNm || ''} nm · ${src.data.nominalPowerW || ''} W` : ''], ['Focus', pf?.data.focusMm ? pf.data.focusMm + ' mm' : ''], [TL('lc.material', 'Material'), project.data.material || ''], [TL('lc.thickness', 'Thickness'), ev.thickness ? ev.thickness + ' mm' : ''], [TL('lc.surface', 'Surface'), evT('surface')], [TL('lc.purpose', 'Purpose'), evT('purpose')], [TL('lc.result', 'Result'), evT('result')], [TL('lc.projectSoftware', 'Program'), evT('projectSoftware') + (ev.projectSoftwareVersion ? ' ' + ev.projectSoftwareVersion : '')], [TL('lc.quantity', 'Pieces'), ev.quantity ? String(ev.quantity) : ''], [TL('lhd.deadline', 'Deadline'), ev.deadline ? new Date(ev.deadline).toLocaleDateString('cs-CZ') : ''], [TL('sg.title', 'Protection'), guard ? (guard.enabled === false ? 'OFF' : `${guard.name || ''} · ${TL('sg.mode.' + (guard.mode || 'hard-stop'), '')}`) : '—']];
        return `<!doctype html><html lang="cs"><meta charset="utf-8"><title>${esc(project.data.recordCode || '')} · ${esc(project.data.title || '')}</title><style>@page{size:A4;margin:12mm}body{font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:10pt;color:#111}h1{font-size:16pt;margin:0}.top{display:grid;grid-template-columns:1fr 32mm;gap:8mm;align-items:start;border-bottom:2px solid #c9963c;padding-bottom:4mm}.code{font:700 12pt ui-monospace,monospace;color:#7a5a17}.qr svg{width:32mm;height:32mm}.grid{display:grid;grid-template-columns:${photo ? '1fr 55mm' : '1fr'};gap:6mm;margin:4mm 0}dl{display:grid;grid-template-columns:32mm 1fr;gap:1mm 4mm;margin:0}dt{color:#666}dd{margin:0;font-weight:600}img.ph{width:55mm;max-height:60mm;object-fit:cover;border-radius:2mm;border:1px solid #ccc}table{width:100%;border-collapse:collapse;margin-top:3mm}th,td{border:1px solid #bbb;padding:1.2mm 1.6mm;text-align:left;vertical-align:top;font-variant-numeric:tabular-nums}th{background:#f3ead7;font-size:8.5pt}td.ex{font-size:8pt;color:#333}.chip{display:inline-block;min-width:7mm;text-align:center;color:#fff;font-weight:700;border-radius:1mm;font-size:8pt;text-shadow:0 0 1px #000}.notes{margin-top:4mm;display:grid;grid-template-columns:1fr 1fr;gap:6mm}.box{border:1px solid #ddd;border-radius:2mm;padding:2mm;min-height:14mm;white-space:pre-wrap}footer{margin-top:5mm;color:#777;font-size:8pt;display:flex;justify-content:space-between}</style>
      <div class="top"><div><div class="code">${esc(project.data.recordCode || '')}${ev.projectLocked ? ' · 🔒' : ''}${ev.projectFavorite ? ' · ★' : ''}</div><h1>${esc(project.data.title || '')}</h1><div>KalinumX NEXUS · ${esc(TL('lpdf.card', 'Laser production card'))}</div></div><div class="qr">${qr}</div></div>
      <div class="grid"><dl>${info.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${photo ? `<img class="ph" src="${photo}" alt="">` : ''}</div>
      <table data-pdf-layers><thead><tr><th>#</th><th>${esc(TL('lc.layerName', 'Layer'))}</th>${KEY.map(k => { const h = TL('lg2.h.' + k, ''); return `<th>${esc(h && h !== 'lg2.h.' + k ? h : TL('lc.' + k, k))}</th>`; }).join('')}<th>🛡</th></tr></thead><tbody>${order.map(({ o, d }, i) => `<tr><td><span class="chip" style="background:${LB_COLORS[lgColorIdx(o, i)]}">${String(lgColorIdx(o, i)).padStart(2, '0')}</span></td><td>${'↳ '.repeat(d)}${esc(o.data.name || '')}</td>${KEY.map(k => `<td>${esc(cellV(o, k))}</td>`).join('')}<td>${st(o)}</td></tr>${extra(o) ? `<tr><td></td><td class="ex" colspan="${KEY.length + 2}">${esc(extra(o))}</td></tr>` : ''}`).join('') || `<tr><td colspan="${KEY.length + 3}">${esc(TL('li.noLayers', 'No layers'))}</td></tr>`}</tbody></table>
      <div class="notes"><div><b>${esc(TL('lc.preparation', 'Preparation'))}</b><div class="box">${esc(ev.preparation || '')}</div></div><div><b>${esc(TL('lc.notes', 'Notes'))}</b><div class="box">${esc(ev.notes || '')}</div></div></div>
      <footer><span>${esc(TL('lpdf.printed', 'Printed'))} ${new Date().toLocaleString('cs-CZ')}</span><span>${esc(m?.data.name || '')}</span></footer><script>setTimeout(()=>print(),350)<\/script></html>`;
    }
    async function lhPdfCard(core, project, all) {
        let photo = '';
        const ph = (project.data.evidence?.photos || [])[0];
        if (ph) {
            try {
                const b = await core.files.getBlob(ph);
                if (b)
                    photo = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(b); });
            }
            catch { }
        }
        const html = lhPdfHtml(project, all, photo);
        globalThis.__kxLastPdfCard = html;
        const w = window.open('', '_blank', 'width=900,height=1100');
        if (!w)
            return false;
        w.document.write(html);
        w.document.close();
        return true;
    }
    /* ---------- N2.6b+ AI READING OF PICTURES (server phase, docs/server/LASER_IMPORT_AI_API.md) – proposals only ---------- */
    async function lhAiRead(core, imp, byId) {
        const base = String(localStorage.getItem('kx.laser.aiUrl') || '').trim().replace(/\/+$/, '');
        if (!base)
            throw new Error('NO_SERVER');
        const images = [];
        for (const fid of (imp.data.fileIds || [])) {
            const b = await core.files.getBlob(fid).catch(() => null);
            if (!b)
                continue;
            const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(b); });
            images.push({ name: fid, mime: b.type || 'image/png', data });
        }
        if (!images.length)
            throw new Error('NO_IMAGES');
        const pf = byId(imp.data.profileId);
        const body = JSON.stringify({ images, hint: { machine: byId(pf?.data?.machineId)?.data?.name || '', profile: pf?.data?.name || '', lang: 'cs' } });
        const call = async (cred) => fetch(base + '/api/laser/import/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: cred });
        let r = await call('omit');
        if (r.status === 401 || r.status === 403)
            r = await call('include');
        if (!r.ok)
            throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const layers = (Array.isArray(d?.layers) ? d.layers : []).map((l, i) => { const pr = { extras: { aiProposed: true, aiConfidence: l.confidence != null ? Number(l.confidence) : null } }; for (const [k, v] of Object.entries(l.params || {})) {
            if (v == null || v === '')
                continue;
            if (k === 'mode') {
                pr.extras.mode = String(v).toUpperCase().replace(/\s+/g, '_');
                continue;
            }
            if (LC_CORE[k]) {
                const n = Number(String(v).replace(',', '.'));
                if (Number.isFinite(n))
                    pr[LC_CORE[k]] = n;
            }
            else
                pr.extras[k] = typeof v === 'boolean' ? (v ? 'ANO' : 'NE') : v;
        } return { name: String(l.name || `AI ${i + 1}`), parameters: pr }; });
        return { layers, evidence: d?.evidence || {}, warnings: Array.isArray(d?.warnings) ? d.warnings : [], unmapped: Array.isArray(d?.unmapped) ? d.unmapped : [] };
    }
    function lceMsg(f) {
        const T2 = (k, d) => TL('lce.m.' + k, d);
        switch (f.code) {
            case 'BELOW_CUTOFF': return T2('BELOW_CUTOFF', 'Below cut-off').replace('{p}', f.pulse).replace('{c}', f.cutoff) + (f.estimatedW != null ? ` · ≈ ${f.estimatedW} W` : '');
            case 'STOP_OVER_MAX': return T2('STOP_OVER_MAX', 'Over max').replace('{p}', f.pulse).replace('{m}', f.max);
            case 'IN_RANGE': return T2('IN_RANGE', 'In range').replace('{p}', f.pulse).replace('{c}', f.cutoff).replace('{m}', f.max);
            case 'PULSE_NOT_ALLOWED': return T2('PULSE_NOT_ALLOWED', 'Pulse not allowed').replace('{o}', (f.options || []).join(', '));
            case 'PULSE_RANGE':
            case 'FREQ_RANGE': return T2('RANGE', 'Out of range').replace('{a}', f.min ?? '−∞').replace('{b}', f.max ?? '∞');
            case 'SPEED_OVER': return T2('SPEED_OVER', 'Over max speed').replace('{m}', f.max);
            case 'PASSES_OVER': return T2('PASSES_OVER', 'Too many passes').replace('{m}', f.max);
            case 'POWER_INVALID': return T2('POWER_INVALID', 'Power 0–100 %');
            case 'RULE_RANGE': return f.message || T2('RULE_RANGE', 'Outside {a}–{b}').replace('{a}', f.min ?? '−∞').replace('{b}', f.max ?? '∞');
            case 'RULE_ALLOWED': return f.message || T2('RULE_ALLOWED', 'Not an allowed value – nearest: {o}').replace('{o}', (f.options || []).join(', '));
            case 'RULE_FORBIDDEN': return f.message || T2('RULE_FORBIDDEN', 'Forbidden range {a}–{b}').replace('{a}', f.min ?? '−∞').replace('{b}', f.max ?? '∞');
            case 'RULE_WARNING': return f.message || T2('RULE_WARNING', 'Caution range {a}–{b}').replace('{a}', f.min ?? '−∞').replace('{b}', f.max ?? '∞');
            case 'RULE_LOOKUP_BELOW': return f.message || T2('RULE_LOOKUP_BELOW', 'Below the table value {m} (for {l})').replace('{m}', f.min).replace('{l}', f.lookup);
            case 'RULE_LOOKUP_ABOVE': return f.message || T2('RULE_LOOKUP_ABOVE', 'STOP: above the table maximum {m} (for {l})').replace('{m}', f.max).replace('{l}', f.lookup);
            case 'RULE_LOOKUP_MISSING': return f.message || T2('RULE_LOOKUP_MISSING', '{l} is not in the table – unknown; nearest: {o}').replace('{l}', f.lookup).replace('{o}', (f.options || []).join(', '));
            default: return f.code;
        }
    }
    const paramsFor = (d) => { const t = new Set(d?.technologyCodes || []); return PARAMS.filter(p => !p.need || (p.need === 'GALVO' && t.has('GALVO')) || (p.need === 'NOGALVO' && !t.has('GALVO')) || t.has(p.need)); };
    /* N2.5s: section „Source protection“ on the laser card – per source: state (confirmed / suggested / unknown), manufacturer table, ranges */
    function guardSection(srcs) {
        const G = globalThis.KXLaserGuard;
        if (!G || !srcs.length)
            return '';
        const RF = [['speedMaxMmS', 'mm/s'], ['speedMaxMmMin', 'mm/min'], ['frequencyMinKHz', 'kHz'], ['frequencyMaxKHz', 'kHz'], ['pulseMinNs', 'ns'], ['pulseMaxNs', 'ns'], ['pulseValues', 'ns'], ['passesMax', '×']];
        return `<section class="kx-lsec" data-lgs><h4>🛡 ${esc(TL('lg.sec', ''))}</h4><p class="muted">${esc(TL('lg.secHelp', ''))}</p>${srcs.map((x) => {
            const own = x.data.guard ? G.normalize(x.data.guard) : null;
            const eff = G.effective(x.data);
            const st2 = own && (own.tableId || Object.keys(own.ranges).length) ? 'OK' : eff?.suggested ? 'SUGGESTED' : 'NONE';
            const R = own?.ranges || {};
            return `<div class="kx-lgs" data-lgs-box="${esc(x.id)}"><b>${esc(x.data.name)}</b> <button type="button" class="btn compact" data-lgs-edit="${esc(x.id)}" title="${esc(TL('sg.open', 'Edit the source protection (rules)'))}">🛡 ${esc(TL('sg.btn', 'Edit protection'))}</button> <small class="muted">${esc(String(x.data.wavelengthNm || '?'))} nm${x.data.nominalPowerW ? ` · ${x.data.nominalPowerW} W` : ''}</small> <span class="kx-badge ${st2 === 'OK' ? '' : 'kx-badge-warn'}" data-lgs-state="${st2}">${esc(TL('lg.state.' + st2, ''))}</span>
         <div class="kx-lgrid"><label><small>${esc(TL('lg.table', ''))}</small><select data-lgs-table data-keep-select><option value="">—</option>${Object.values(G.TABLES).map((t) => `<option value="${esc(t.id)}" ${(own?.tableId || (st2 === 'SUGGESTED' ? eff.tableId : '')) === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
         ${RF.map(([k, u]) => `<label><small>${esc(TL('lg.r.' + k, ''))} (${u})</small><input data-lgs-r="${k}" value="${esc(Array.isArray(R[k]) ? R[k].join(', ') : (R[k] ?? ''))}" inputmode="decimal"></label>`).join('')}
         <label class="kx-lgs-src"><small>${esc(TL('lg.source', ''))}</small><input data-lgs-source value="${esc(own?.source || '')}" placeholder="${esc(TL('lg.sourcePh', ''))}"></label></div>
         <div class="kx-lgs-acts"><button type="button" class="btn compact" data-lgs-save="${esc(x.id)}">${esc(TL('lg.save', ''))}</button>${st2 === 'SUGGESTED' ? `<button type="button" class="btn ghost compact" data-lgs-confirm="${esc(x.id)}">✓ ${esc(TL('lg.confirm', ''))}</button>` : ''}${own ? `<button type="button" class="btn ghost compact" data-lgs-clear="${esc(x.id)}">${esc(TL('lg.clear', ''))}</button>` : ''}</div></div>`;
        }).join('')}</section>`;
    }
    /* N2.5s: human message of a source-protection finding */
    function lgMsg(f) { const t = (k) => TL('lg.code.' + k, k); const rp = (x) => x.replace('{v}', String(f.value ?? '')).replace('{max}', String(f.max ?? '')).replace('{min}', String(f.min ?? '')).replace('{p}', String(f.pulse ?? '')).replace('{c}', String(f.cutoff ?? '')).replace('{w}', String(f.estimatedW ?? '')); return rp(t(f.code)); }
    function guardParam(k, raw) { const p = PARAMS.find(x => x.k === k); if (!p)
        return null; const v = String(raw).replace(',', '.').trim(); if (v === '')
        return null; const n = Number(v); if (!Number.isFinite(n))
        return { msg: TL('laser.v.nan', 'Enter a number.'), fix: null }; if (n < p.min || n > p.max)
        return { msg: `${TL('laser.v.range', 'Allowed range')} ${p.min}–${p.max} ${p.u}.`, fix: String(Math.min(p.max, Math.max(p.min, n))) }; return null; }
    /* N2.4j: effective parameters of a layer = parent's effective + own (LightBurn set and the Design Space set separately) */
    function layerEffective(o, layers, depth = 0) {
        const par = o.data.parentId && depth < 50 ? layers.find((x) => x.id === o.data.parentId) : null;
        const base = par ? layerEffective(par, layers, depth + 1) : { lb: {}, lds: {} };
        return { lb: { ...base.lb, ...Object.fromEntries(Object.entries(o.data.parameters || {}).filter(([k]) => k !== 'extras')) }, lds: { ...base.lds, ...(o.data.parameters?.extras?.lds || {}) } };
    }
    /* N2.4l: grid test (L3) – one test = matrix X × Y (≤ 10 × 10), each cell = one test run; rating scale from the original program;
       ★ best → verified parameters of the material for that laser + profile (with a link to the test and the cell) */
    const RATINGS = ['NEUTRAL', 'GOOD', 'CANDIDATE', 'BEST', 'FAIL'];
    const RATING_RESULT = { NEUTRAL: 'PENDING', GOOD: 'PASS', CANDIDATE: 'PASS', BEST: 'PASS', FAIL: 'FAIL' };
    function gridAxis(from, to, steps) { if (!(steps >= 1 && steps <= 10))
        throw new Error('LASER_GRID_STEPS'); if (!Number.isFinite(from) || !Number.isFinite(to))
        throw new Error('LASER_GRID_RANGE'); if (steps === 1)
        return [Math.round(from * 1000) / 1000]; const d = (to - from) / (steps - 1); return Array.from({ length: steps }, (_, i) => Math.round((from + d * i) * 1000) / 1000); }
    function gridCells(g) {
        const xs = gridAxis(+g.xFrom, +g.xTo, +g.xSteps), ys = gridAxis(+g.yFrom, +g.yTo, +g.ySteps);
        if (g.xParam === g.yParam)
            throw new Error('LASER_GRID_SAME_AXIS');
        for (const k of [g.xParam, g.yParam])
            if (!PARAMS.some(p => p.k === k))
                throw new Error('LASER_GRID_PARAM');
        for (const [k, vals] of [[g.xParam, xs], [g.yParam, ys]])
            for (const v of vals) {
                const gp = guardParam(k, String(v));
                if (gp)
                    throw new Error(`LASER_GRID_OUT_OF_RANGE:${k}`);
            }
        const cells = [];
        ys.forEach((y, r) => xs.forEach((x, c) => cells.push({ row: r, col: c, sequence: r * xs.length + c + 1, parameters: { ...(g.base || {}), [g.xParam]: x, [g.yParam]: y } })));
        return { xs, ys, cells };
    }
    /* default axes from the material grid guide (per laser technology) */
    function gridDefaults(mat, machine) {
        const t = new Set(machine?.data?.technologyCodes || []);
        const n = String(mat?.data?.name || '').toLowerCase();
        const g = String(mat?.data?.group || '');
        if (t.has('FIBER_MOPA') && g === 'Kovy' && /nerez|titan/.test(n))
            return { xParam: 'frequencyKHz', xFrom: 200, xTo: 1000, xSteps: 5, yParam: 'qPulseNs', yFrom: 2, yTo: 200, ySteps: 5, base: { powerPercent: 40, speedMmPerS: 500, lineIntervalMm: 0.01, passes: 1 } };
        if (t.has('GALVO'))
            return { xParam: 'speedMmPerS', xFrom: 200, xTo: 2000, xSteps: 5, yParam: 'powerPercent', yFrom: 20, yTo: 100, ySteps: 5, base: { frequencyKHz: 50, passes: 1, lineIntervalMm: 0.03 } };
        return { xParam: 'speedMmPerMin', xFrom: 1000, xTo: 6000, xSteps: 5, yParam: 'powerPercent', yFrom: 10, yTo: 100, ySteps: 5, base: { passes: 1 } };
    }
    async function createGridTest(core, opts, input) {
        const C3 = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.TEST.EDIT', 'LASER.CONFIG.EDIT'], confirmed: true };
        const { cells } = gridCells(input.grid);
        const t = await core.actions.invoke('ACTION.LASER.TEST.SAVE', { spaceIds: input.spaceIds, data: { title: input.title, machineId: input.machineId, sourceModuleId: input.sourceModuleId, profileId: input.profileId, lensIds: [input.lensId], status: 'READY', material: input.materialName, materialId: input.materialId, grid: { ...input.grid, cellMm: input.grid.cellMm || 8, gapMm: input.grid.gapMm || 2 } } }, C3);
        /* N2.5s: Q-pulse axis SNAPPED to the allowed pulse widths of the source (table / allowed values) – otherwise the test cannot run on the machine */ let snapped = 0;
        try {
            const gf = core.laserGuard ? await core.laserGuard.guardFor({ machineId: input.machineId, sourceModuleId: input.sourceModuleId, profileId: input.profileId }) : null;
            const G = globalThis.KXLaserGuard;
            const tb = gf?.guard?.tableId && G ? G.TABLES[gf.guard.tableId] : null;
            const allowed = gf?.guard?.ranges?.pulseValues || (tb ? tb.rows.map((x) => x.pulse) : []);
            if (allowed.length)
                for (const c of cells) {
                    const q = c.parameters?.qPulseNs;
                    if (typeof q === 'number' && !allowed.includes(q)) {
                        c.parameters = { ...c.parameters, qPulseNs: [...allowed].sort((a, b) => Math.abs(a - q) - Math.abs(b - q))[0] };
                        snapped++;
                    }
                }
        }
        catch { }
        /* N2.5s: every cell checked by the SOURCE PROTECTION – out-of-source cells marked (not to be run), below cut-off warned */ let blocked = 0, warned = 0;
        for (const c of cells) {
            let gs = null;
            try {
                const r = core.laserGuard ? await core.laserGuard.check({ machineId: input.machineId, sourceModuleId: input.sourceModuleId, profileId: input.profileId, params: c.parameters }) : null;
                if (r && (r.status === 'danger' || r.status === 'warn'))
                    gs = { status: r.status, codes: r.findings.filter((f) => f.status === r.status).map((f) => f.code) };
            }
            catch { }
            if (gs?.status === 'danger')
                blocked++;
            else if (gs?.status === 'warn')
                warned++;
            const params = gs ? { ...c.parameters, extras: { ...(c.parameters.extras || {}), guard: gs } } : c.parameters;
            await core.actions.invoke('ACTION.LASER.TEST_RUN.SAVE', { spaceIds: input.spaceIds, data: { testId: t.id, lensId: input.lensId, sequence: c.sequence, parameters: params, result: 'PENDING', rating: 'NEUTRAL', row: c.row, col: c.col } }, C3);
        }
        t.guardSummary = { blocked, warned, snapped, cells: cells.length };
        return t;
    }
    async function rateCell(core, opts, runId, rating) {
        if (!RATINGS.includes(rating))
            throw new Error('LASER_GRID_RATING'); /* N2.5s: a cell outside the source cannot be rated / become the material parameter */
        {
            const rr = await core.laserDomain.get(runId, 'APP.LASER.TEST_RUN');
            if (rr?.data?.parameters?.extras?.guard?.status === 'danger' && rating !== 'NEUTRAL')
                throw new Error('LASER_GRID_CELL_OUTSIDE_SOURCE');
        }
        const C3 = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.TEST.EDIT'], confirmed: true };
        const r = await core.laserDomain.get(runId, 'APP.LASER.TEST_RUN');
        return core.actions.invoke('ACTION.LASER.TEST_RUN.SAVE', { id: r.id, expectedRevision: r.revision, spaceIds: r.spaceIds, data: { ...r.data, rating, result: RATING_RESULT[rating] } }, C3);
    }
    /* ★ best cell → verified parameters on the material (per laser + profile; replaces the previous entry for the same pair) */
    async function saveBestToMaterial(core, opts, runId) {
        const C3 = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.CONFIG.EDIT'], confirmed: true };
        const run = await core.laserDomain.get(runId, 'APP.LASER.TEST_RUN');
        if (run.data.rating !== 'BEST')
            throw new Error('LASER_GRID_NOT_BEST');
        const test = await core.laserDomain.get(run.data.testId, 'APP.LASER.TEST');
        if (!test.data.materialId)
            throw new Error('LASER_GRID_NO_MATERIAL');
        const m = await core.laserDomain.get(test.data.materialId, 'APP.LASER.MATERIAL');
        const entry = { machineId: test.data.machineId, profileId: test.data.profileId, lensId: run.data.lensId, parameters: run.data.parameters, testId: test.id, runId: run.id, testCode: test.data.recordCode, at: new Date().toISOString() };
        const params = [...(m.data.params || []).filter((p) => !(p.machineId === entry.machineId && p.profileId === entry.profileId)), entry];
        return core.actions.invoke('ACTION.LASER.MATERIAL.SAVE', { id: m.id, expectedRevision: m.revision, spaceIds: m.spaceIds, data: { ...m.data, params, verified: true } }, C3);
    }
    const ROT_KINDS = ['ROLLER', 'CHUCK', 'RING', 'LP_ROTARY'], TABLE_KINDS = ['SLIDE', 'CONVEYOR'];
    const accOn = (a) => a.enabled !== false;
    const accUsable = (a) => accOn(a) && a.state !== 'FAULT';
    /* summary for table / card columns: enabled accessories, ✓ working / ✗ not working; „—“ none (capacity is the laser's) */
    function accSummary(d, kinds) { const on = (d.accessories || []).filter((a) => kinds.includes(a.kind) && accOn(a)); return on.length ? on.map((a) => `${a.state === 'FAULT' ? '✗' : '✓'} ${a.name}`).join(' · ') : '—'; }
    /* orientation view (top): laser field, X → / Y ↓ arrows, the rotary / slide lying along its axis; a missing axis is shown as a warning */
    function orientationSvg(a) {
        const ax = a.axis;
        const W = 220, H = 150;
        const cyl = (a.kind === 'SLIDE' || a.kind === 'CONVEYOR') ? '' : ax === 'Y' ? `<rect x="95" y="30" width="30" height="90" rx="12" fill="none" stroke="currentColor" stroke-width="2"/><line x1="110" y1="20" x2="110" y2="130" stroke-dasharray="4 3" stroke="currentColor"/>` : `<rect x="55" y="60" width="110" height="30" rx="12" fill="none" stroke="currentColor" stroke-width="2"/><line x1="45" y1="75" x2="175" y2="75" stroke-dasharray="4 3" stroke="currentColor"/>`;
        const slide = (a.kind === 'SLIDE' || a.kind === 'CONVEYOR') ? `<rect x="60" y="15" width="100" height="120" fill="none" stroke="currentColor" stroke-dasharray="6 3"/><text x="110" y="145" text-anchor="middle" font-size="9">${esc(a.workAreaMm ? `${a.workAreaMm.w} × ${a.workAreaMm.h} mm` : '')}</text>` : '';
        return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(TL('laser.acc.orientation', 'Orientation – top view'))}" data-lh-orient="${esc(ax || 'NONE')}"><rect x="40" y="10" width="140" height="130" fill="none" stroke="currentColor" opacity=".35"/>
      <circle cx="110" cy="75" r="4" fill="currentColor"/><text x="116" y="72" font-size="8">${esc(TL('laser.acc.head', 'laser'))}</text>
      <line x1="12" y1="140" x2="34" y2="140" stroke="currentColor" marker-end="url(#ax)"/><text x="14" y="134" font-size="9">X</text><line x1="12" y1="118" x2="12" y2="140" stroke="currentColor"/><text x="2" y="120" font-size="9">Y</text>
      <defs><marker id="ax" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="currentColor"/></marker></defs>${cyl}${slide}
      ${!ax && a.kind !== 'SLIDE' && a.kind !== 'CONVEYOR' ? `<text x="110" y="148" text-anchor="middle" font-size="9" fill="#f5a524">${esc(TL('laser.acc.axisMissing', 'axis X / Y not set'))}</text>` : ''}</svg>`;
    }
    const PRJ_SCOPE = 'LASER.PROJECTS';
    /* N2.6b+ (user: as compact as the original hub – many columns, add / remove): every layer parameter (values of the FIRST layer) + evidence fields as optional columns */
    const LP_VISIBLE = new Set(['speed', 'power', 'frequency', 'pulseWidth']);
    const EV_VISIBLE = new Set(['purpose', 'result']);
    function lcPrjExtraFields() {
        const out = [];
        for (const g of LCAT) {
            if (!LC_LAYER_GROUPS.includes(g.g))
                continue;
            for (const q of g.params) {
                if (['layerName', 'layer'].includes(q.k))
                    continue;
                const lb = TL('lg2.h.' + q.k, '');
                out.push({ key: 'lp_' + q.k, type: q.t === 'number' ? 'NUMBER' : 'TEXT', label: (lb && lb !== 'lg2.h.' + q.k ? lb : TL('lc.' + q.k, q.lb)) + (q.u && !(lb && lb !== 'lg2.h.' + q.k) ? ` (${q.u})` : ''), info: TL('lc.' + q.k + '.d', ''), width: q.t === 'number' ? 78 : 84, hidden: !LP_VISIBLE.has(q.k) });
            }
        }
        const ev = LCAT.find((g) => g.g === 'evidence');
        for (const q of (ev?.params || [])) {
            if (['projectName', 'machine', 'preset', 'material', 'projectTags', 'time'].includes(q.k))
                continue;
            out.push({ key: 'ev_' + q.k, type: q.t === 'number' ? 'NUMBER' : 'TEXT', label: TL('lc.' + q.k, q.lb) + (q.u ? ` (${q.u})` : ''), info: TL('lc.' + q.k + '.d', ''), width: q.t === 'number' ? 80 : 130, hidden: !EV_VISIBLE.has(q.k) });
        }
        return out;
    }
    function lcCellText(q, v) { if (v == null || v === '')
        return ''; if (q.t === 'checkbox')
        return v ? '✓' : '✗'; if (q.t === 'select') {
        const o = q.opts || [];
        if (o.length <= 3 && o.some((c) => c === 'ANO' || c === 'NE'))
            return ['ANO', 'ANO_M3_CONSTANT', 'YES', 'TRUE'].includes(String(v)) ? '✓' : '✗';
        const t = TL('lc.o.' + q.k + '.' + v, '');
        return t && t !== 'lc.o.' + q.k + '.' + v ? t : String(v);
    } return v; }
    function lcPrjValue(key, project, layers) {
        if (key.startsWith('ev_')) {
            const k = key.slice(3);
            const q = LCAT.find((g) => g.g === 'evidence' || g.g === 'notes') && LCAT.flatMap((g) => g.params).find((x) => x.k === k);
            return q ? lcCellText(q, project.data.evidence?.[k]) : '';
        }
        if (key.startsWith('lp_')) {
            const k = key.slice(3);
            const q = LCAT.flatMap((g) => g.params).find((x) => x.k === k);
            const first = [...layers].filter((x) => !x.archivedAt && !x.data.parentId).sort((a, b) => (a.data.sequence || 0) - (b.data.sequence || 0))[0];
            if (!q || !first)
                return '';
            const v = k === 'output' ? (first.data.parameters?.extras?.output ?? 'ANO') : lcValue(first, k, q.st);
            return lcCellText(q, v);
        }
        return undefined;
    }
    function registerProjects(core) {
        if (core.__laserPrjTable)
            return;
        core.__laserPrjTable = true;
        try {
            core.lists?.registerList('LASER.PRJSTATUS', { name: T('laser.list.prjStatus', 'Project state'), owner: OWNER, items: ['DRAFT', 'READY', 'RUNNING', 'DONE', 'ARCHIVED'].map(k => ({ key: k, label: T('laser.prjStatus.' + k, k) })) });
            core.fields?.registerDefaults(PRJ_SCOPE, [{ key: 'recordCode', type: 'TEXT', label: T('laser.prj.code', 'Code'), width: 90 }, { key: 'title', type: 'TEXT', label: T('laser.prj.title', 'Title'), width: 240 }, { key: 'machine', type: 'TEXT', label: T('laser.prj.machine', 'Laser'), width: 200 }, { key: 'profile', type: 'TEXT', label: T('laser.prj.profile', 'Profile'), width: 150 }, { key: 'material', type: 'TEXT', label: T('laser.mat.name', 'Material'), width: 180 }, { key: 'status', type: 'SELECT', label: T('laser.prj.status', 'State'), listId: 'LASER.PRJSTATUS', width: 110 }, { key: 'layers', type: 'NUMBER', label: T('laser.prj.layersCol', 'Layers'), width: 70 }, { key: 'guard', type: 'TEXT', label: T('lce.col.guard', 'Protection'), info: T('lce.col.guardHelp', 'Source protection over all layers: STOP / caution / OK / switched off.'), width: 110 }, ...lcPrjExtraFields()]);
        }
        catch (e) {
            globalThis.KXBugs?.pushErr?.(e);
        }
    }
    const MAT_SCOPE = 'LASER.MATERIALS';
    const MAT_FIELDS = () => [{ key: 'name', type: 'TEXT', label: T('laser.mat.name', 'Material'), width: 220 }, { key: 'group', type: 'TEXT', label: T('laser.mat.group', 'Group'), width: 120 },
        { key: 'status', type: 'SELECT', label: T('laser.mat.status', 'State'), listId: 'LASER.MATSTATUS', info: T('laser.mat.statusHelp', 'Suitable / caution / forbidden.'), width: 120 },
        { key: 'hazardTitle', type: 'TEXT', label: T('laser.mat.hazard', 'Hazard'), width: 200 }, ...WL.map(w => ({ key: 'c' + w, type: 'SELECT', label: `${w} nm`, listId: 'LASER.COMPAT', info: T('laser.mat.compatHelp', 'Compatibility for this wavelength.'), width: 80 })),
        { key: 'shopTag', type: 'TEXT', label: T('laser.mat.shopTag', 'E-shop'), width: 110 }, { key: 'source', type: 'SELECT', label: T('laser.mat.source', 'Source'), listId: 'LASER.MATSOURCE', width: 110 },
        { key: 'verified', type: 'BOOL', label: T('laser.mat.verified', 'Verified'), info: T('laser.mat.verifiedHelp', 'You confirm the data.'), width: 80 }, { key: 'why', type: 'TEXT', label: T('laser.mat.why', 'Why'), hidden: true, width: 260 }, { key: 'notes', type: 'TEXT', label: T('laser.mat.notes', 'Notes'), hidden: true, width: 200 }];
    function registerMaterials(core) {
        if (core.__laserMatTable)
            return;
        core.__laserMatTable = true;
        try {
            core.lists?.registerList('LASER.MATSTATUS', { name: T('laser.list.matStatus', 'Material state'), owner: OWNER, items: ['OK', 'CAUTION', 'FORBIDDEN'].map(k => ({ key: k, label: T('laser.matStatus.' + k, k) })) });
            core.lists?.registerList('LASER.COMPAT', { name: T('laser.list.compat', 'Compatibility'), owner: OWNER, items: ['OK', 'PREP', 'NO'].map(k => ({ key: k, label: T('laser.compat.' + k, k) })) });
            core.lists?.registerList('LASER.MATSOURCE', { name: T('laser.list.matSource', 'Material source'), owner: OWNER, items: ['P566', 'ESHOP', 'ADDED', 'USER'].map(k => ({ key: k, label: T('laser.matSource.' + k, k) })) });
            core.fields?.registerDefaults(MAT_SCOPE, MAT_FIELDS());
        }
        catch (e) {
            globalThis.KXBugs?.pushErr?.(e);
        }
    }
    KXLaserHub = { OWNER, SEEDS, TABS, COLS, CARD_TO_REG, WL, RATINGS, gridAxis, gridCells, gridDefaults, createGridTest, rateCell, saveBestToMaterial, layerEffective, PARAMS, paramsFor, guardParam, PROFILE_SEEDS, ensureProfiles, ACC_SEEDS, accOn, accUsable, accSummary, ROT_KINDS, TABLE_KINDS, ensureAccessories, orientationSvg, gridGuide, gridGuideHtml, materials, seedMaterials, checkMaterial, MAT_SCOPE, registerMaterials, migrateCols, labelsOf, TABLE_SCOPE, TABLE_FIELDS, EDITABLE, registerTable, COLS_DEFAULT, COLS_KEY, functionsOf, columnsOf, stripSuffix, seed, duplicate, updatePlanning, machines, availableOn, checkField, RULES,
        install() { return null; },
        async mountHub(root, core, opts) {
            const st = root.__lh || (root.__lh = { open: '', tab: 'MACHINES' });
            {
                const lo = globalThis.KXLaserOpen;
                if (lo) {
                    delete globalThis.KXLaserOpen;
                    try {
                        const all0 = await core.laserDomain.list();
                        const rec = all0.find((x) => !x.archivedAt && x.data.recordCode === lo.code && (x.type === (lo.kind === 'TEST' ? 'APP.LASER.TEST' : 'APP.LASER.PROJECT')));
                        if (rec) {
                            if (lo.kind === 'TEST') {
                                st.tab = 'TESTS';
                                st.tOpen = rec.id;
                            }
                            else {
                                st.tab = 'PROJECTS';
                                st.pOpen = rec.id;
                            }
                            if (rec.data.machineId) {
                                try {
                                    localStorage.setItem('kx.laser.active', rec.data.machineId);
                                }
                                catch { }
                            }
                        }
                        else
                            opts.onToast?.(TL('lq.notFound', 'Record from the QR code not found') + ': ' + lo.code);
                    }
                    catch { }
                }
            }
            const tabReq = globalThis.KXHubTabRequest?.[OWNER];
            if (tabReq && TABS.some(([k]) => k === tabReq)) {
                st.tab = tabReq;
                delete globalThis.KXHubTabRequest[OWNER];
            }
            /* N2.4c: the user's machines and demo machines are created directly on the first opening (idempotent by recordUid) */
            if (!st.seedChecked) {
                st.seedChecked = true;
                try {
                    const sp = opts.defaultSpaceId ? [opts.defaultSpaceId] : [(await core.propagate.spaces(opts.actorId)).find((x) => x.kind === 'PERSONAL').id];
                    const n = await seed(core, opts, sp);
                    if (n.length)
                        st.seededNow = n.length;
                    const nm = await seedMaterials(core, opts, sp);
                    if (nm)
                        st.seededMat = nm;
                    await ensureAccessories(core, opts);
                    await ensureProfiles(core, opts);
                }
                catch (e) {
                    st.seedError = String(e?.message || e);
                }
            }
            let list = await machines(core);
            if (opts.filter)
                list = list.filter(opts.filter);
            const all = await core.laserDomain.list();
            const srcOf = (id) => all.filter((x) => x.type === 'APP.LASER.SOURCE_MODULE' && x.data.machineId === id && !x.archivedAt).sort((a, b) => num0(a.data.wavelengthNm) - num0(b.data.wavelengthNm));
            const lensOf = (id) => all.filter((x) => x.type === 'APP.LASER.LENS' && x.data.machineId === id && !x.archivedAt).sort((a, b) => num0(a.data.focalLengthMm) - num0(b.data.focalLengthMm));
            const missing = SEEDS.filter(s => !list.some((r) => r.data.recordUid === s.uid));
            const cols = await columnsOf(core, opts.actorId);
            let util = null;
            if (cols.includes('util') && core.shopOrders) {
                try {
                    util = await core.shopOrders.laserPlanAll(opts.actorId, new Date().toISOString().slice(0, 10));
                }
                catch { }
            }
            const regLabels = await labelsOf(core, opts.actorId);
            const colLabel = (k) => CARD_TO_REG[k] && CARD_TO_REG[k].length === 1 && regLabels[CARD_TO_REG[k][0]] ? regLabels[CARD_TO_REG[k][0]] : TL('laser.col.' + k, k);
            const lc = (k, v, title = '') => v ? `<span class="kx-lchip" data-lh-col="${esc(k)}" ${title ? `title="${esc(title)}"` : ''}><small>${esc(colLabel(k))}</small><b>${v}</b></span>` : '';
            const chip = (c, r, d) => {
                const srcs = srcOf(r.id), lns = lensOf(r.id);
                if (c === 'tech')
                    return lc(c, esc((d.technologyCodes || []).map(techLabel).join(' · ')));
                if (c === 'sources')
                    return lc(c, esc(srcs.map((x) => `${x.data.wavelengthNm || '?'} nm${x.data.nominalPowerW ? ` · ${x.data.nominalPowerW} W` : ''}`).join(' + ') || '—'));
                if (c === 'functions') {
                    const f = functionsOf(d, srcs, lns);
                    const txt = f.map(k => TL('laser.fn.' + k, k)).join(' · ') || '—';
                    return lc(c, esc(txt), `${txt}\n(${TL('laser.fnDerived', 'Derived from the technology, sources and lenses of the laser')})`);
                }
                if (c === 'status')
                    return lc(c, `<span class="${d.status && d.status !== 'ACTIVE' ? 'kx-off' : ''}">${esc(TL('laser.status.' + (d.status || 'ACTIVE'), d.status || 'ACTIVE'))}</span>`);
                if (c === 'capacity')
                    return lc(c, Number(d.capacityHoursPerDay) > 0 ? `${esc(d.capacityHoursPerDay)} h/${esc(TL('laser.day', 'day'))}` : `<span class="kx-off">${esc(TL('laser.notCounted', 'not counted'))}</span>`);
                if (c === 'util') {
                    const u = util?.utilisation?.find((x) => x.machineId === r.id);
                    if (!u)
                        return lc(c, '—');
                    return lc(c, u.counted ? `${u.pct} %` : '—', `${TL('laser.utilPlanned', 'planned')} ${fmtMin(u.minutes)} ${TL('laser.utilOf', 'of')} ${fmtMin(u.capacityMinutes)} ${TL('laser.utilCap', 'capacity up to the furthest due date')}`);
                }
                if (c === 'prep')
                    return lc(c, `${d.prepMinutesDefault ?? 0} + ${d.finishMinutesDefault ?? 0} min`, TL('laser.prepTitle', 'preparation + finishing (default)'));
                if (c === 'overnight')
                    return lc(c, esc(d.allowOvernight ? TL('laser.yes', 'yes') : TL('laser.no', 'no')));
                if (c === 'lenses')
                    return lc(c, esc(lns.map((l) => `F${l.data.focalLengthMm}`).join(' · ') || '—'));
                if (c === 'outages') {
                    const t = new Date().toISOString().slice(0, 10);
                    const n = (d.outages || []).filter((o) => o.to >= t).sort((a, b) => a.from.localeCompare(b.from))[0];
                    return lc(c, n ? esc(`${n.from} – ${n.to}`) : '—');
                }
                if (c === 'rotary')
                    return lc(c, esc(accSummary(d, ROT_KINDS)));
                if (c === 'slide')
                    return lc(c, esc(accSummary(d, TABLE_KINDS)));
                if (c === 'model')
                    return lc(c, esc([d.manufacturer, d.model].filter(Boolean).join(' ') || '—'));
                return '';
            };
            const colsPanel = `<details class="kx-lcols" data-lh-cols><summary>☰ ${esc(TL('laser.columns', 'Display'))}</summary><div class="kx-olasers-inc">${COLS.map(c => `<label class="kx-chk"><input type="checkbox" data-lh-colchk="${c}" ${cols.includes(c) ? 'checked' : ''}> ${esc(colLabel(c))}</label>`).join('')}</div><button class="btn compact" data-lh-cols-save>${esc(TL('laser.save', 'Save'))}</button> <button class="btn ghost compact" data-lh-cols-reset>↺ ${esc(TL('laser.colsDefault', 'Default'))}</button></details>`;
            const num = (k, v, unit, max) => `<label class="kx-lf" data-lh-field="${k}"><span>${esc(TL('laser.f.' + k, k))}</span><span class="kx-lf-in"><input data-lh-f="${k}" inputmode="decimal" value="${esc(v ?? '')}" data-max="${max}"><em>${esc(unit)}</em></span><span class="kx-lf-help" data-lh-help="${k}" hidden></span></label>`;
            const chk = (k, v) => `<label class="kx-lf kx-lf-chk"><input type="checkbox" data-lh-f="${k}" ${v ? 'checked' : ''}><span>${esc(TL('laser.f.' + k, k))}</span></label>`;
            const card = (r) => {
                const d = r.data, open = st.open === r.id, cap = d.capacityHoursPerDay;
                return `<article class="kx-lcard ${open ? 'open' : ''}" data-lh-machine="${esc(r.id)}" data-lh-origin="${esc(d.origin || 'USER')}">
          <header class="kx-lcard-h" data-lh-toggle="${esc(r.id)}"><span class="kx-lcard-ic">${d.technologyCodes.includes('CO2') ? '🟥' : d.technologyCodes.includes('UV') ? '🟪' : d.technologyCodes.some((t) => t.startsWith('FIBER')) ? '🟧' : '🟦'}</span>
            <b>${esc(d.name)}</b> ${ORIGIN_BADGE[d.origin || 'USER'] ? `<span class="kx-badge" title="${esc(TL('laser.origin.' + d.origin, d.origin))}">${ORIGIN_BADGE[d.origin]} ${esc(TL('laser.origin.' + d.origin, d.origin))}</span>` : ''}
            <span class="kx-lchips" data-lh-chips>${cols.map((c) => chip(c, r, d)).filter(Boolean).join('')}</span>
            ${!(Number(cap) > 0) ? `<span class="kx-badge kx-badge-warn" data-lh-notcounted title="${esc(TL('laser.v.capEmpty', 'Capacity is empty – this laser is not counted in production planning.'))}">${esc(TL('laser.notCounted', 'not counted'))}</span>` : ''}
            <button class="btn ghost compact" data-lh-dup="${esc(r.id)}">⧉ ${esc(TL('laser.duplicate', 'Duplicate'))}</button></header>
          ${open ? `<div class="kx-lcard-b">${guardSection(srcOf(r.id))}
            <section class="kx-lsec"><h4>⚙ ${esc(TL('laser.sec.machine', 'Machine'))}</h4><div class="kx-lgrid"><div><small>${esc(TL('laser.f.manufacturer', 'Manufacturer'))}</small><b>${esc(d.manufacturer || '—')}</b></div><div><small>${esc(TL('laser.f.model', 'Model'))}</small><b>${esc(d.model || '—')}</b></div><div><small>${esc(TL('laser.f.tech', 'Technology'))}</small><b>${esc(d.technologyCodes.join(', '))}</b></div>${d.notes ? `<div><small>${esc(TL('laser.f.notes', 'Notes'))}</small><b>${esc(d.notes)}</b></div>` : ''}</div></section>
            <section class="kx-lsec"><h4>💡 ${esc(TL('laser.sec.sources', 'Sources'))} <small>${srcOf(r.id).length}</small></h4><div class="kx-lgrid">${srcOf(r.id).map((s) => `<div><small>${esc(s.data.technologyCode)}</small><b>${esc(s.data.name)}</b></div>`).join('') || `<i>—</i>`}</div></section>
            <section class="kx-lsec"><h4>🔍 ${esc(TL('laser.sec.lenses', 'Lenses'))} <small>${lensOf(r.id).length}</small></h4><div class="kx-lgrid">${lensOf(r.id).map((l) => `<div><small>${esc(TL('laser.focal', 'focal length'))}</small><b>${esc(l.data.name)}</b></div>`).join('') || `<i>—</i>`}</div></section>
            <section class="kx-lsec" data-lh-accessories="${esc(r.id)}"><h5>🔄 ${esc(TL('laser.sec.accessories', 'Accessories (rotary, slide)'))}</h5>${(d.accessories || []).filter(accOn).length ? (d.accessories || []).filter(accOn).map((a) => `<div class="kx-lacc ${a.state === 'FAULT' ? 'kx-lacc-fault' : ''}" data-lh-acc="${esc(a.id)}"><div><b>${a.state === 'FAULT' ? '✗' : '✓'} ${esc(a.name)}</b> <small class="muted">${esc(TL('laser.acc.kind.' + a.kind, a.kind))}${a.state === 'FAULT' ? ' · ' + esc(TL('laser.acc.state.FAULT', 'not working')) : ''}</small>
              <div class="kx-lchips">${a.chuckDiameterMm ? `<span class="kx-lchip"><small>${esc(TL('laser.acc.chuck', 'Chuck'))}</small><b>D${esc(a.chuckDiameterMm)}</b></span>` : ''}${a.maxObjectMm ? `<span class="kx-lchip"><small>${esc(TL('laser.acc.maxObject', 'Max. object'))}</small><b>${esc(a.maxObjectMm)} mm</b></span>` : ''}${a.workAreaMm ? `<span class="kx-lchip"><small>${esc(TL('laser.acc.area', 'Work area'))}</small><b>${esc(a.workAreaMm.w)} × ${esc(a.workAreaMm.h)} mm</b></span>` : ''}${a.command ? `<span class="kx-lchip"><small>${esc(TL('laser.acc.command', 'Command'))}</small><b>${esc(a.command)}</b></span>` : ''}
                ${a.kind === 'SLIDE' || a.kind === 'CONVEYOR' ? '' : `<span class="kx-lchip"><small>${esc(TL('laser.acc.steps', 'Steps / rotation'))}</small><b>${a.stepsPerRotation ? esc(a.stepsPerRotation) : `<span class="kx-off">${esc(TL('laser.acc.fill', 'fill in'))}</span>`}</b></span>`}<span class="kx-lchip"><small>${esc(TL('laser.acc.axis', 'Axis'))}</small><b>${a.axis ? esc(a.axis) : (a.kind === 'SLIDE' || a.kind === 'CONVEYOR' ? '—' : `<span class="kx-off">${esc(TL('laser.acc.fill', 'fill in'))}</span>`)}</b></span></div>
              ${(a.jaws || []).length ? `<small>${(a.jaws || []).map((j) => `${esc(j.name)} ${esc(j.minMm)}–${esc(j.maxMm)} mm`).join(' · ')}</small>` : ''}<small class="muted"> · ${esc(TL('laser.acc.source.' + (a.source || 'USER'), a.source || 'USER'))}${a.verified ? '' : ' · ' + esc(TL('shop.notVerified', 'not verified'))}</small>
              <details class="kx-acc-edit" data-lh-accedit="${esc(a.id)}"><summary>✎ ${esc(TL('laser.acc.edit', 'Edit'))}</summary><div class="kx-calc-grid">
                ${a.kind === 'SLIDE' || a.kind === 'CONVEYOR' ? '' : `<label class="kx-lf"><span>${esc(TL('laser.acc.steps', 'Steps / rotation'))}</span><input data-acc-f="stepsPerRotation" inputmode="numeric" value="${esc(a.stepsPerRotation ?? '')}" placeholder="9600 / 12800 / 25600"></label>
                <label class="kx-lf"><span>${esc(TL('laser.acc.axis', 'Axis'))}</span><select data-acc-f="axis"><option value="">—</option><option value="X" ${a.axis === 'X' ? 'selected' : ''}>X</option><option value="Y" ${a.axis === 'Y' ? 'selected' : ''}>Y</option></select></label>`}
                ${a.kind === 'CHUCK' || a.kind === 'RING' || a.kind === 'LP_ROTARY' ? `<label class="kx-lf"><span>${esc(TL('laser.acc.chuck', 'Chuck'))} Ø</span><input data-acc-f="chuckDiameterMm" inputmode="decimal" value="${esc(a.chuckDiameterMm ?? '')}"></label>` : ''}
                ${a.kind === 'ROLLER' ? `<label class="kx-lf"><span>${esc(TL('laser.acc.roller', 'Roller'))} Ø</span><input data-acc-f="rollerDiameterMm" inputmode="decimal" value="${esc(a.rollerDiameterMm ?? '')}"></label>` : ''}
                <label class="kx-lf"><span>${esc(TL('laser.acc.maxObject', 'Max. object'))}</span><input data-acc-f="maxObjectMm" inputmode="decimal" value="${esc(a.maxObjectMm ?? '')}"></label>
                <label class="kx-lf"><span>${esc(TL('laser.acc.stateLabel', 'State'))}</span><select data-acc-f="state"><option value="OK" ${a.state !== 'FAULT' ? 'selected' : ''}>${esc(TL('laser.acc.state.OK', 'working'))}</option><option value="FAULT" ${a.state === 'FAULT' ? 'selected' : ''}>${esc(TL('laser.acc.state.FAULT', 'not working'))}</option></select></label>
                <label class="kx-lf kx-lf-chk"><input type="checkbox" data-acc-f="verified" ${a.verified ? 'checked' : ''}> ${esc(TL('laser.mat.verified', 'Verified'))}</label></div>
                <span class="kx-lf-help" data-acc-err></span><button class="btn compact" data-acc-save="${esc(a.id)}">${esc(TL('laser.save', 'Save'))}</button> <button class="btn ghost compact" data-acc-toggle="${esc(a.id)}" data-on="0">⏻ ${esc(TL('laser.acc.disable', 'Turn off'))}</button> <button class="btn ghost compact" data-acc-del="${esc(a.id)}">🗑 ${esc(TL('laser.acc.remove', 'Remove'))}</button></details></div>${orientationSvg(a)}</div>`).join('') : `<p class="muted">${esc(TL('laser.acc.none', 'No accessories.'))}</p>`}
              ${(d.accessories || []).filter((a) => !accOn(a)).length ? `<details class="kx-acc-off" data-lh-accoff><summary>${esc(TL('laser.acc.offList', 'Turned off'))} (${(d.accessories || []).filter((a) => !accOn(a)).length})</summary>${(d.accessories || []).filter((a) => !accOn(a)).map((a) => `<div data-lh-acc-off="${esc(a.id)}">${esc(a.name)} <button class="btn ghost compact" data-acc-toggle="${esc(a.id)}" data-on="1">⏻ ${esc(TL('laser.acc.enable', 'Turn on'))}</button></div>`).join('')}</details>` : ''}
              <div class="kx-acc-add" data-lh-accadd="${esc(r.id)}"><select data-acc-kind>${['ROLLER', 'CHUCK', 'RING', 'LP_ROTARY', 'SLIDE', 'CONVEYOR'].map(k => `<option value="${k}">${esc(TL('laser.acc.kind.' + k, k))}</option>`).join('')}</select><input data-acc-name maxlength="80" placeholder="${esc(TL('laser.acc.namePh', 'name, e.g. Roller rotary'))}"><button class="btn ghost compact" data-acc-add>＋ ${esc(TL('laser.acc.add', 'Add'))}</button></div>
              <p class="muted kx-acc-help">${esc(TL('laser.acc.help', 'Steps per rotation: galvo rotaries commonly 9 600 / 12 800 / 25 600 (see the rotary label). Axis: X if the rotary lies along the horizontal axis of the field, Y along the vertical. Chuck rotary: object diameter = the largest diameter, measured exactly.'))}</p></section>
              <section class="kx-lsec" data-lh-planning="${esc(r.id)}"><h4>🗓 ${esc(TL('laser.sec.planning', 'Capacity and operation'))}</h4><div class="kx-lgrid">
              ${num('capacityHoursPerDay', cap, 'h', 24)}<label class="kx-lf"><span>${esc(TL('laser.f.status', 'State'))}</span><select data-lh-f="status">${['ACTIVE', 'MAINTENANCE', 'FAULT', 'OFF'].map(v => `<option value="${v}" ${(d.status || 'ACTIVE') === v ? 'selected' : ''}>${esc(TL('laser.status.' + v, v))}</option>`).join('')}</select></label>
              ${num('prepMinutesDefault', d.prepMinutesDefault, 'min', 1440)}${num('finishMinutesDefault', d.finishMinutesDefault, 'min', 1440)}${chk('prepBlocksMachine', d.prepBlocksMachine !== false)}${chk('allowOvernight', !!d.allowOvernight)}</div>
              ${d.allowOvernight ? `<p class="kx-tw-safety">⚠ ${esc(TL('laser.overnightWarn', 'Overnight production: fire risk – supervision, extraction, fire extinguisher.'))}</p>` : ''}
              <div class="kx-lout" data-lh-outages="${esc(r.id)}"><small>${esc(TL('laser.outages', 'Unavailable periods (the planner does not allocate jobs)'))}</small>
                ${(d.outages || []).map((o, i) => `<div class="kx-lout-row" data-lh-out="${i}"><input type="date" data-lh-of value="${esc(o.from)}"><span>–</span><input type="date" data-lh-ot value="${esc(o.to)}"><input data-lh-or maxlength="200" placeholder="${esc(TL('laser.outageReason', 'reason'))}" value="${esc(o.reason || '')}"><button class="icon-btn" data-lh-outdel="${i}" title="×">×</button></div>`).join('')}
                <button class="btn ghost compact" data-lh-outadd>＋ ${esc(TL('laser.outageAdd', 'Period'))}</button></div>
              <button class="btn" data-lh-save="${esc(r.id)}">${esc(TL('laser.save', 'Save'))}</button></section></div>` : ''}</article>`;
            };
            const groups = [['PERSONAL', list.filter((r) => r.data.origin === 'PERSONAL')], ['USER', list.filter((r) => !r.data.origin || r.data.origin === 'USER')], ['DEMO', list.filter((r) => r.data.origin === 'DEMO')]];
            const lhTop = await lhTopHtml(core, st, list);
            const tabsHtml = lhTop + `<div class="kx-print3d-tabs">${TABS.map(([k, l]) => `<button class="chip ${st.tab === k ? 'active' : ''}" data-laser-tab="${k}">${esc(l)}</button>`).join('')}<button class="icon-btn" data-kx-manual="HUB:APP.KX.LASER" title="📖">📖</button></div>`;
            const bindTabs = () => {
                root.querySelectorAll('[data-laser-tab]').forEach(b => b.onclick = () => { st.tab = String(b.dataset.laserTab); st.favOnly = false; void KXLaserHub.mountHub(root, core, opts); });
                lhTopBind(root, core, opts, st, list);
                root.querySelector('[data-lh-csvall]')?.addEventListener('click', async () => { const all2 = await core.laserDomain.list(); const pr = all2.filter((x) => x.type === 'APP.LASER.PROJECT' && !x.archivedAt && (!st.favOnly || x.data.evidence?.projectFavorite)); lhDownload(`laser-projekty-vrstvy-${new Date().toISOString().slice(0, 10)}.csv`, lhCsvText(pr, all2)); });
                root.querySelector('[data-lhv-save]')?.addEventListener('click', async () => { const act = localStorage.getItem('kx.laser.active') || ''; const mn = String(list.find((m) => m.id === act)?.data?.name || act); const vn = ('🔧 ' + mn).slice(0, 60); try {
                    await core.actions.invoke('ACTION.CORE.FIELDS.VIEW_SAVE', { scope: 'LASER.PROJECTS', name: vn }, { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: [], confirmed: true });
                    localStorage.setItem('kx.laser.view.' + act, vn);
                    opts.onToast?.(TL('lhv.saved', 'Columns saved for') + ' ' + mn);
                    void KXLaserHub.mountHub(root, core, opts);
                }
                catch (e) {
                    opts.onToast?.(String(e?.message || e));
                } });
                root.querySelector('[data-lhv-apply]')?.addEventListener('click', async () => { const act = localStorage.getItem('kx.laser.active') || ''; const vn = localStorage.getItem('kx.laser.view.' + act); if (!vn)
                    return; try {
                    await core.actions.invoke('ACTION.CORE.FIELDS.VIEW_APPLY', { scope: 'LASER.PROJECTS', name: vn }, { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: [], confirmed: true });
                    void KXLaserHub.mountHub(root, core, opts);
                }
                catch (e) {
                    opts.onToast?.(String(e?.message || e));
                } });
                root.querySelector('[data-lh2-favoff]')?.addEventListener('click', () => { st.favOnly = false; void KXLaserHub.mountHub(root, core, opts); });
            };
            /* N2.4d: utilisation of every laser across all open orders (the same planner as SHOP); „Plánovat v SHOPu“ opens the SHOP orders */
            if (st.tab === 'IMPORTS') {
                const all = await core.laserDomain.list();
                root.innerHTML = `<section class="kx-laser-imports" data-laser-imports>${tabsHtml}<div data-li-body></div></section>`;
                bindTabs();
                await renderImports(core, opts, root.querySelector('[data-li-body]'), all, st, () => void KXLaserHub.mountHub(root, core, opts));
                return;
            }
            if (st.tab === 'TESTS') {
                const all = await core.laserDomain.list();
                const tests = all.filter((x) => x.type === 'APP.LASER.TEST' && !x.archivedAt && (x.data.grid || x.data.kind === 'SESSION')); /* N2.6b+: grid tests AND sessions with steps */
                const own = (await machines(core)).filter((m) => m.data.origin !== 'DEMO');
                const mats = await materials(core);
                const byId = (id) => all.find((x) => x.id === id);
                const cur = st.tOpen ? tests.find((x) => x.id === st.tOpen) : null;
                const PO = PARAMS.map(p => `<option value="${p.k}">${esc(TL('laser.param.' + p.k, p.k))} (${esc(p.u)})</option>`).join('');
                root.innerHTML = `<div data-laser-hub class="kx-laser" data-laser-tests>${tabsHtml}
          <details class="kx-lcols" data-lt-new ${tests.length ? '' : 'open'}><summary>＋ ${esc(TL('laser.grid.new', 'New grid test'))}</summary><div class="kx-calc-grid">
            <label class="kx-lf"><span>${esc(TL('laser.prj.title', 'Title'))}*</span><span class="kx-lf-in"><input data-lt="title" maxlength="160"></span></label>
            <label class="kx-lf"><span>${esc(TL('laser.prj.machine', 'Laser'))}</span><select data-lt="machine">${own.map((m) => `<option value="${esc(m.id)}">${esc(m.data.name)}</option>`).join('')}</select></label>
            <label class="kx-lf"><span>${esc(TL('laser.prj.profile', 'Profile'))}</span><select data-lt="profile"></select></label>
            <label class="kx-lf"><span>${esc(TL('laser.mat.name', 'Material'))}*</span><select data-lt="material">${mats.map((m) => `<option value="${esc(m.id)}">${esc(m.data.name)}</option>`).join('')}</select></label>
            ${['x', 'y'].map(a => `<label class="kx-lf"><span>${a.toUpperCase()} – ${esc(TL('laser.grid.param', 'parameter'))}</span><select data-lt="${a}Param">${PO}</select></label><label class="kx-lf"><span>${a.toUpperCase()} ${esc(TL('laser.grid.from', 'from'))}</span><input data-lt="${a}From" inputmode="decimal"></label><label class="kx-lf"><span>${a.toUpperCase()} ${esc(TL('laser.grid.to', 'to'))}</span><input data-lt="${a}To" inputmode="decimal"></label><label class="kx-lf"><span>${a.toUpperCase()} ${esc(TL('laser.grid.steps', 'steps'))}</span><input data-lt="${a}Steps" inputmode="numeric"></label>`).join('')}
            <label class="kx-lf"><span>${esc(TL('laser.grid.base', 'Fixed parameters (JSON)'))}</span><input data-lt="base"></label></div>
            <small class="muted" data-lt-preview></small> <button class="btn" data-lt-create>${esc(TL('laser.grid.create', 'Create the grid'))}</button> <button class="btn primary" data-lts-create title="${esc(TL('lts.createHelp', 'Test session with steps like the original hub'))}">＋ ${esc(TL('lts.create', 'Create a session with steps'))}</button> <span class="kx-lf-help" data-lt-err></span></details>
          <div data-lt-table></div><div data-lt-detail></div></div>`;
                bindTabs();
                const q = (k) => root.querySelector(`[data-lt="${k}"]`);
                const fillP = () => { const pr = all.filter((x) => x.type === 'APP.LASER.PROFILE' && x.data.machineId === q('machine').value && !x.archivedAt).sort((a, b) => String(a.data.recordUid).localeCompare(String(b.data.recordUid), 'cs', { numeric: true })); q('profile').innerHTML = pr.map((x) => `<option value="${esc(x.id)}">${esc(x.data.name)}</option>`).join(''); };
                const prefill = () => { const g = gridDefaults(mats.find((m) => m.id === q('material').value), own.find((m) => m.id === q('machine').value)); for (const k of ['xParam', 'xFrom', 'xTo', 'xSteps', 'yParam', 'yFrom', 'yTo', 'ySteps'])
                    q(k).value = String(g[k]); q('base').value = JSON.stringify(g.base); preview(); };
                const readG = () => { let base = {}; try {
                    base = JSON.parse(q('base').value || '{}');
                }
                catch {
                    throw new Error('LASER_GRID_BASE_JSON');
                } return { xParam: q('xParam').value, xFrom: +q('xFrom').value, xTo: +q('xTo').value, xSteps: +q('xSteps').value, yParam: q('yParam').value, yFrom: +q('yFrom').value, yTo: +q('yTo').value, ySteps: +q('ySteps').value, base }; };
                const preview = () => { const el = root.querySelector('[data-lt-preview]'); try {
                    const r = gridCells(readG());
                    el.textContent = `${r.xs.length} × ${r.ys.length} = ${r.cells.length} ${TL('laser.grid.cells', 'cells')} · X: ${r.xs.join(', ')} · Y: ${r.ys.join(', ')}`;
                    el.style.color = '';
                }
                catch (e) {
                    el.textContent = TL('laser.grid.err.' + String(e.message).split(':')[0], String(e.message));
                    el.style.color = '#e5484d';
                } };
                q('machine').onchange = () => { fillP(); prefill(); };
                q('material').onchange = prefill;
                root.querySelectorAll('[data-lt]').forEach(x => { if (!['machine', 'material', 'title', 'profile'].includes(String(x.dataset.lt)))
                    x.oninput = preview; });
                fillP();
                prefill();
                root.querySelector('[data-lts-create]').onclick = async () => {
                    const er = root.querySelector('[data-lt-err]');
                    const title = q('title').value.trim();
                    if (!title) {
                        er.textContent = TL('laser.prj.titleReq', 'Title is required.');
                        return;
                    }
                    const prof = byId(q('profile').value);
                    const m = mats.find((x) => x.id === q('material').value);
                    const mc = own.find((x) => x.id === q('machine').value);
                    const lens = prof?.data.defaultLensId || all.find((x) => x.type === 'APP.LASER.LENS' && x.data.machineId === q('machine').value)?.id;
                    try {
                        const t = await core.actions.invoke('ACTION.LASER.TEST.SAVE', { spaceIds: mc.spaceIds, data: { title, kind: 'SESSION', machineId: mc.id, sourceModuleId: prof.data.sourceModuleId, profileId: prof.id, lensIds: [lens], status: 'RUNNING', material: m?.data.name || '', materialId: m?.id } }, { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.TEST.EDIT', 'LASER.CONFIG.EDIT'], confirmed: true });
                        st.tOpen = t.id;
                        void KXLaserHub.mountHub(root, core, opts);
                    }
                    catch (e) {
                        er.textContent = String(e?.message || e);
                    }
                };
                root.querySelector('[data-lt-create]').onclick = async () => {
                    const er = root.querySelector('[data-lt-err]');
                    const title = q('title').value.trim();
                    if (!title) {
                        er.textContent = TL('laser.prj.titleReq', 'Title is required.');
                        return;
                    }
                    const prof = byId(q('profile').value);
                    const m = mats.find((x) => x.id === q('material').value);
                    try {
                        const t = await createGridTest(core, opts, { title, spaceIds: own.find((x) => x.id === q('machine').value).spaceIds, machineId: q('machine').value, sourceModuleId: prof.data.sourceModuleId, profileId: prof.id, lensId: prof.data.defaultLensId || all.find((x) => x.type === 'APP.LASER.LENS' && x.data.machineId === q('machine').value)?.id, materialId: m.id, materialName: m.data.name, grid: readG() });
                        st.tOpen = t.id;
                        const gsm = t.guardSummary;
                        if (gsm && (gsm.blocked || gsm.warned || gsm.snapped))
                            opts.onToast?.(TL('lg.gridSummary', '').replace('{b}', String(gsm.blocked)).replace('{w}', String(gsm.warned)) + (gsm.snapped ? ' ' + TL('lg.gridSnapped', '').replace('{n}', String(gsm.snapped)) : ''));
                        void KXLaserHub.mountHub(root, core, opts);
                    }
                    catch (e) {
                        er.textContent = TL('laser.grid.err.' + String(e?.message || '').split(':')[0], String(e?.message || e));
                    }
                };
                if (cur && cur.data.kind === 'SESSION') {
                    renderSession(core, opts, root, cur, all, byId, () => void KXLaserHub.mountHub(root, core, opts));
                }
                else if (cur) {
                    const runs = all.filter((x) => x.type === 'APP.LASER.TEST_RUN' && x.data.testId === cur.id).sort((a, b) => a.data.sequence - b.data.sequence);
                    const g = cur.data.grid;
                    const xs = gridAxis(+g.xFrom, +g.xTo, +g.xSteps), ys = gridAxis(+g.yFrom, +g.yTo, +g.ySteps);
                    const det = root.querySelector('[data-lt-detail]');
                    const ic = { NEUTRAL: '·', GOOD: '✓', CANDIDATE: '◎', BEST: '★', FAIL: '✗' };
                    det.innerHTML = `<section class="kx-lcard open" data-lt-test="${esc(cur.id)}"><header class="kx-lcard-h"><b>${esc(cur.data.recordCode)} · ${esc(cur.data.title)}</b><small class="muted">${esc(byId(cur.data.machineId)?.data.name || '')} · ${esc(cur.data.material || '')}</small><button class="icon-btn" data-lt-close>×</button></header>
            <table class="kx-calc-table kx-grid" data-lt-grid><tr><th>${esc(TL('laser.param.' + g.yParam, g.yParam))} ↓ / ${esc(TL('laser.param.' + g.xParam, g.xParam))} →</th>${xs.map(x => `<th>${x}</th>`).join('')}</tr>
            ${ys.map((y, ri) => `<tr><th>${y}</th>${xs.map((x, ci) => { const r = runs.find((z) => z.data.row === ri && z.data.col === ci); const rt = r?.data.rating || 'NEUTRAL'; const gs = r?.data.parameters?.extras?.guard; return `<td class="kx-cell kx-cell-${rt.toLowerCase()} ${gs ? 'kx-cell-g-' + esc(gs.status) : ''}" data-lt-cell="${esc(r?.id || '')}" ${gs ? `title="${esc(TL('lg.cell.' + gs.status, ''))}"` : ''}>${gs ? `<small class="kx-cell-g">${gs.status === 'danger' ? '🛑 ' + esc(TL('lg.cell.short.danger', '')) : '⚠ ' + esc(TL('lg.cell.short.warn', ''))}</small>` : ''}<select data-lt-rate="${esc(r?.id || '')}" ${gs?.status === 'danger' ? 'disabled' : ''} title="${esc(TL('laser.grid.rate', 'rating'))}">${RATINGS.map(k => `<option value="${k}" ${k === rt ? 'selected' : ''}>${ic[k]} ${esc(TL('laser.grid.r.' + k, k))}</option>`).join('')}</select>${rt === 'BEST' ? `<button class="btn compact" data-lt-best="${esc(r.id)}" title="${esc(TL('laser.grid.toMaterial', 'save as the verified material parameter'))}">★ ${esc(TL('laser.grid.toMaterialShort', 'to material'))}</button>` : ''}</td>`; }).join('')}</tr>`).join('')}</table>
            <small class="muted">${esc(TL('laser.grid.fixedLabel', 'Keep fixed'))}: ${esc(JSON.stringify(g.base || {}))}</small></section>`;
                    det.querySelector('[data-lt-close]').onclick = () => { st.tOpen = ''; void KXLaserHub.mountHub(root, core, opts); };
                    det.querySelectorAll('[data-lt-rate]').forEach(x => x.onchange = async () => { try {
                        await rateCell(core, opts, String(x.dataset.ltRate), x.value);
                    }
                    catch (e) {
                        opts.onToast?.(String(e?.message || e));
                    } void KXLaserHub.mountHub(root, core, opts); });
                    det.querySelectorAll('[data-lt-best]').forEach(b => b.onclick = async () => { try {
                        await saveBestToMaterial(core, opts, String(b.dataset.ltBest));
                        opts.onToast?.(TL('laser.grid.saved', 'Saved to the material as verified'));
                    }
                    catch (e) {
                        opts.onToast?.(TL('laser.grid.err.' + String(e?.message || ''), String(e?.message || e)));
                    } void KXLaserHub.mountHub(root, core, opts); });
                }
                if (globalThis.KXTable) {
                    const th = root.querySelector('[data-lt-table]');
                    try {
                        core.fields?.registerDefaults('LASER.TESTS', [{ key: 'recordCode', type: 'TEXT', label: T('laser.prj.code', 'Code'), width: 90 }, { key: 'title', type: 'TEXT', label: T('laser.prj.title', 'Title'), width: 220 }, { key: 'machine', type: 'TEXT', label: T('laser.prj.machine', 'Laser'), width: 200 }, { key: 'material', type: 'TEXT', label: T('laser.mat.name', 'Material'), width: 180 }, { key: 'grid', type: 'TEXT', label: T('laser.grid.size', 'Grid'), width: 90 }, { key: 'best', type: 'NUMBER', label: '★', width: 50 }]);
                    }
                    catch { }
                    const tv = (r, f) => { const d = r.data; switch (f.key) {
                        case 'recordCode': return d.recordCode;
                        case 'title': return d.title;
                        case 'machine': return byId(d.machineId)?.data.name || '';
                        case 'material': return d.material || '';
                        case 'grid': return d.kind === 'SESSION' ? `${TL('lts.kind', 'session')} · ${all.filter((x) => x.type === 'APP.LASER.TEST_RUN' && x.data.testId === r.id && !x.archivedAt).length} ${TL('lts.steps', 'steps')}` : (d.grid ? `${d.grid.xSteps} × ${d.grid.ySteps}` : '');
                        case 'best': return all.filter((x) => x.type === 'APP.LASER.TEST_RUN' && x.data.testId === r.id && x.data.rating === 'BEST').length;
                        default: return '';
                    } };
                    st.tsel2 = st.tsel2 || new Set();
                    await globalThis.KXTable(th, { scope: 'LASER.TESTS', rows: tests, rowId: (r) => r.id, value: tv, exportValue: tv, filterState: () => st.tfl || {}, onFilter: (x) => { st.tfl = x; }, density: 'COMPACT', onDensity: () => { }, selection: st.tsel2, sortState: () => st.tso, onSort: (x) => { st.tso = x; }, onOpen: (r) => { st.tOpen = r.id; void KXLaserHub.mountHub(root, core, opts); }, onChange: () => void KXLaserHub.mountHub(root, core, opts), rowMenu: () => [], isStale: () => false });
                }
                return;
            }
            if (st.tab === 'PROJECTS') {
                const all = await core.laserDomain.list();
                const projs = all.filter((x) => x.type === 'APP.LASER.PROJECT' && !x.archivedAt && (!st.favOnly || x.data.evidence?.projectFavorite)); /* N2.6b+: ★ favourites filter (status card) */
                const own = (await machines(core)).filter((m) => m.data.origin !== 'DEMO');
                const mats = await materials(core);
                const byId = (id) => all.find((x) => x.id === id);
                const ops = (pid) => all.filter((x) => x.type === 'APP.LASER.OPERATION' && x.data.projectId === pid && !x.archivedAt).sort((a, b) => a.data.sequence - b.data.sequence);
                const PC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.PROJECT.EDIT', 'LASER.CONFIG.EDIT'], confirmed: true };
                const cur = st.pOpen ? projs.find((x) => x.id === st.pOpen) : null;
                root.innerHTML = `<div data-laser-hub class="kx-laser" data-laser-projects>${tabsHtml}${(() => { const act = localStorage.getItem('kx.laser.active') || ''; const mn = list.find((m) => m.id === act)?.data?.name || ''; const has = !!localStorage.getItem('kx.laser.view.' + act); return act ? `<div class="lh2-filter lh2-view"><small class="muted">▦ ${esc(TL('lhv.label', 'Columns view for'))} <b>${esc(mn)}</b>${has ? ' · ' + esc(TL('lhv.has', 'saved')) : ''}</small><button type="button" class="btn compact" data-lh-csvall title="${esc(TL('lcsv.allHelp', 'CSV of the shown projects – one row per layer'))}">⇩ ${esc(TL('lcsv.all', 'CSV of layers'))}</button><button type="button" class="btn compact" data-lhv-save title="${esc(TL('lhv.saveHelp', 'Remember the visible columns, their order and sorting for this laser; switching the laser applies them'))}">💾 ${esc(TL('lhv.save', 'Save as default for this laser'))}</button>${has ? `<button type="button" class="btn ghost compact" data-lhv-apply title="${esc(TL('lhv.apply', 'Apply the laser view'))}">↺ ${esc(TL('lhv.apply', 'Apply the laser view'))}</button>` : ''}</div>` : ''; })()}${st.favOnly ? `<div class="lh2-filter"><span class="kx-badge">★ ${esc(TL('lh2.favOnly', 'only favourites'))}</span><button type="button" class="btn compact" data-lh2-favoff title="${esc(TL('lh2.favOff', 'Show all projects'))}">✕ ${esc(TL('lh2.favOff', 'Show all projects'))}</button></div>` : ''}
          <details class="kx-lcols" data-lh-pnew ${projs.length ? '' : 'open'}><summary>＋ ${esc(TL('laser.prj.new', 'New project'))}</summary><div class="kx-calc-grid">
            <label class="kx-lf"><span>${esc(TL('laser.prj.title', 'Title'))}*</span><span class="kx-lf-in"><input data-pn="title" maxlength="160"></span></label>
            <label class="kx-lf"><span>${esc(TL('laser.prj.machine', 'Laser'))}</span><select data-pn="machine">${own.map((m) => `<option value="${esc(m.id)}">${esc(m.data.name)}</option>`).join('')}</select></label>
            <label class="kx-lf"><span>${esc(TL('laser.prj.profile', 'Profile'))}</span><select data-pn="profile"></select></label>
            <label class="kx-lf"><span>${esc(TL('laser.mat.name', 'Material'))}</span><select data-pn="material"><option value="">—</option>${mats.map((m) => `<option value="${esc(m.id)}">${m.data.status === 'FORBIDDEN' ? '⛔ ' : m.data.status === 'CAUTION' ? '⚠ ' : ''}${esc(m.data.name)}</option>`).join('')}</select></label></div>
            <div data-pn-matwarn></div><button class="btn" data-pn-save>${esc(TL('laser.save', 'Save'))}</button> <span class="kx-lf-help" data-pn-err></span></details>
          <div data-lh-ptable></div><div data-lh-pdetail></div></div>`;
                bindTabs();
                const selM = root.querySelector('[data-pn="machine"]'), selP = root.querySelector('[data-pn="profile"]'), selMat = root.querySelector('[data-pn="material"]');
                const fillP = () => { const pr = all.filter((x) => x.type === 'APP.LASER.PROFILE' && x.data.machineId === selM.value && !x.archivedAt).sort((a, b) => String(a.data.recordUid).localeCompare(String(b.data.recordUid), 'cs', { numeric: true })); selP.innerHTML = pr.map((x) => `<option value="${esc(x.id)}">${esc(x.data.name)}${x.data.software ? ` – ${esc(x.data.software)}` : ''}</option>`).join(''); };
                const matWarn = () => {
                    const m = mats.find((x) => x.id === selMat.value);
                    const box = root.querySelector('[data-pn-matwarn]');
                    if (!m) {
                        box.innerHTML = '';
                        return;
                    }
                    const mc = own.find((x) => x.id === selM.value);
                    const so = (id) => all.filter((x) => x.type === 'APP.LASER.SOURCE_MODULE' && x.data.machineId === id);
                    const c = checkMaterial(m, mc, so, own);
                    box.innerHTML = `<div class="kx-matwarn kx-matwarn-${c.level === 'err' ? 'err' : c.level === 'warn' ? 'warn' : 'ok'}" data-pn-matlevel="${esc(c.level)}"><b>${esc(TL('laser.matStatus.' + m.data.status, m.data.status))}${c.title ? ` – ${esc(c.title)}` : ''}</b> · ${esc(mc?.data.name || '')}: ${esc(TL('laser.compat.' + c.compat, c.compat === 'UNKNOWN' ? TL('shop.compatUnknown', 'unknown') : c.compat))}${c.others?.length ? ` → ${esc(c.others.map((o) => o.name).join(', '))}` : ''}${c.why ? `<details><summary>▸ ${esc(TL('shop.why', 'Why?'))}</summary><p>${esc(c.why)}</p></details>` : ''}</div>`;
                };
                selM.onchange = () => { fillP(); matWarn(); };
                selMat.onchange = matWarn;
                fillP();
                root.querySelector('[data-pn-save]').onclick = async () => {
                    const title = root.querySelector('[data-pn="title"]').value.trim();
                    const prof = byId(selP.value);
                    const err = root.querySelector('[data-pn-err]');
                    if (!title) {
                        err.textContent = TL('laser.prj.titleReq', 'Title is required.');
                        return;
                    }
                    if (!prof) {
                        err.textContent = TL('laser.prj.profileReq', 'Choose a profile.');
                        return;
                    }
                    const lens = prof.data.defaultLensId || all.find((x) => x.type === 'APP.LASER.LENS' && x.data.machineId === selM.value)?.id;
                    const m = mats.find((x) => x.id === selMat.value);
                    try {
                        const r = await core.actions.invoke('ACTION.LASER.PROJECT.SAVE', { spaceIds: own.find((x) => x.id === selM.value).spaceIds, data: { title, machineId: selM.value, sourceModuleId: prof.data.sourceModuleId, profileId: prof.id, lensIds: [lens], defaultLensId: lens, status: 'DRAFT', material: m ? m.data.name : undefined, materialId: m?.id } }, PC);
                        st.pOpen = r.id;
                        void KXLaserHub.mountHub(root, core, opts);
                    }
                    catch (e) {
                        err.textContent = String(e?.message || e);
                    }
                };
                if (globalThis.KXTable) {
                    registerProjects(core);
                    const ph = root.querySelector('[data-lh-ptable]');
                    st.psel = st.psel || new Set();
                    const pv = (r, f) => { const d = r.data; switch (f.key) {
                        case 'recordCode': return d.recordCode;
                        case 'title': return d.title;
                        case 'machine': return byId(d.machineId)?.data.name || '';
                        case 'profile': return byId(d.profileId)?.data.name || '';
                        case 'material': return d.material || '';
                        case 'status': return d.status;
                        case 'layers': return ops(r.id).length;
                        case 'guard': return lceProjectGuard(r, ops(r.id), byId);
                        default:
                            if (String(f.key).startsWith('lp_') || String(f.key).startsWith('ev_'))
                                return lcPrjValue(String(f.key), r, ops(r.id));
                            return f.custom ? (d.custom?.[f.key] ?? '') : '';
                    } };
                    await globalThis.KXTable(ph, { scope: PRJ_SCOPE, rows: projs, rowId: (r) => r.id, value: pv, exportValue: pv, filterState: () => st.pfilter || {}, onFilter: (x) => { st.pfilter = x; }, density: st.pdensity || 'COMPACT', onDensity: (d) => { st.pdensity = d; }, selection: st.psel, sortState: () => st.psort, onSort: (x) => { st.psort = x; }, compare: true,
                        onOpen: (r) => { st.pOpen = r.id; void KXLaserHub.mountHub(root, core, opts); }, onChange: () => void KXLaserHub.mountHub(root, core, opts), rowMenu: () => [], isStale: () => false });
                }
                if (cur) {
                    const mc = byId(cur.data.machineId);
                    const isLp4 = (mc?.data.technologyCodes || []).includes('LP4');
                    const pf = paramsFor(mc?.data).filter(p => p.k !== 'depthPercent');
                    const det = root.querySelector('[data-lh-pdetail]');
                    const layers = ops(cur.id);
                    /* N2.4j: layer tree (parentId) with inheritance – a sublayer takes the parent's values; own values are highlighted, ↺ returns the inherited one */
                    const kids = (pid) => layers.filter((o) => (o.data.parentId || null) === pid).sort((a, b) => a.data.sequence - b.data.sequence);
                    const eff = (o) => layerEffective(o, layers);
                    const LDS = [{ k: 'powerPercent', u: '%', min: 0, max: 100 }, { k: 'depthPercent', u: '%', min: 0, max: 100 }, { k: 'passes', u: '×', min: 1, max: 100 }, { k: 'resolution', u: '', opts: ['1K', '2K', '4K'] }];
                    const cell = (o, set, k) => {
                        const own = set === 'lb' ? o.data.parameters?.[k] : o.data.parameters?.extras?.lds?.[k];
                        const v = eff(o)[set][k];
                        if (v == null || v === '')
                            return '<td class="muted">—</td>';
                        return `<td class="${own != null ? 'kx-own' : 'kx-inh'}" title="${esc(own != null ? TL('laser.prj.ownValue', 'own value') : TL('laser.prj.inherited', 'inherited from the parent layer'))}">${esc(v)}${own != null && o.data.parentId ? ` <button class="icon-btn" data-lh-reset="${esc(o.id)}" data-set="${set}" data-k="${esc(k)}" title="↺ ${esc(TL('laser.prj.resetInherit', 'return the inherited value'))}">↺</button>` : ''}</td>`;
                    };
                    const row = (o, depth) => `<tr data-lh-layer="${esc(o.id)}" class="${o.data.parentId ? 'kx-sublayer' : ''}"><td style="padding-left:${6 + depth * 16}px">${depth ? '↳ ' : ''}${esc(o.data.name)}${o.data.parameters?.extras?.guardOverride ? ` <span class="kx-badge kx-badge-off" data-lg-override title="${esc(TL('lce.guard.off', 'Protection switched off for this layer'))}">🛡 ${esc(TL('lce.guard.offShort', 'protection off'))}</span>` : ''}${o.data.parameters?.extras?.guardWarning ? ` <span class="kx-badge kx-badge-warn" data-lg-warnrec title="${esc(TL('lg.warnRecHelp', ''))}">⚠ ${esc(TL('lg.warnRec', ''))}</span>` : ''}</td>${pf.map(p => cell(o, 'lb', p.k)).join('')}${isLp4 ? LDS.map(p => cell(o, 'lds', p.k)).join('') : ''}
            <td class="kx-layer-act"><button class="icon-btn" data-lh-adv="${esc(o.id)}" title="${esc(TL('lce.edit', 'Layer settings'))}">⚙</button><button class="icon-btn" data-lh-edit="${esc(o.id)}" title="✎">✎</button><button class="icon-btn" data-lh-sub="${esc(o.id)}" title="${esc(TL('laser.prj.addSub', 'add a sublayer'))}">＋↳</button><button class="icon-btn" data-lh-del="${esc(o.id)}" title="🗑">🗑</button></td></tr>` + kids(o.id).map((k) => row(k, depth + 1)).join('');
                    const form = (prefix) => `<tr data-lh-layer-form="${esc(prefix)}"><td><input data-ln="name" maxlength="80" placeholder="${esc(TL('laser.prj.layerPh', 'e.g. Fill logo'))}"></td>${pf.map(p => `<td><input data-lp="${p.k}" inputmode="decimal" style="width:68px"><span class="kx-lf-help" data-lp-help="${p.k}"></span></td>`).join('')}${isLp4 ? LDS.map(p => `<td>${p.opts ? `<select data-lds="${p.k}"><option value="">—</option>${p.opts.map(x => `<option>${x}</option>`).join('')}</select>` : `<input data-lds="${p.k}" inputmode="decimal" style="width:60px">`}</td>`).join('') : ''}<td><button class="btn compact" data-ln-add>✓</button></td></tr>`;
                    det.innerHTML = `<section class="kx-lcard open" data-lh-project="${esc(cur.id)}"><header class="kx-lcard-h"><b>${esc(cur.data.recordCode)} · ${esc(cur.data.title)}</b><small class="muted">${esc(mc?.data.name || '')} · ${esc(byId(cur.data.profileId)?.data.name || '')}${cur.data.material ? ` · ${esc(cur.data.material)}` : ''}</small><button class="btn compact" data-lh-csv title="${esc(TL('lcsv.help', 'CSV – one row per layer'))}">⇩ CSV</button><button class="btn compact" data-lh-pdf title="${esc(TL('lpdf.help', 'Production card A4 – print or save as PDF'))}">🖨 PDF</button><button class="btn compact" data-lh-qr title="${esc(TL('lq.title', 'QR identity'))}">▦ QR</button><button class="btn compact" data-lh-evid title="${esc(TL('lce.ev.title', 'Project evidence'))}">✎ ${esc(TL('lce.ev.btn', 'Evidence'))}</button>${cur.data.evidence?.projectFavorite ? '<span class="kx-badge">★</span>' : ''}${cur.data.evidence?.projectLocked ? `<span class="kx-badge" title="${esc(TL('lce.locked', 'Parameters are locked'))}">🔒</span>` : ''}<button class="icon-btn" data-lh-pclose>×</button></header>
            <div class="kx-lh-layerbar"><h5>${esc(TL('laser.prj.layers', 'Layers (LightBurn order)'))}</h5><button type="button" class="btn compact" data-lh-advnew="" title="${esc(TL('lce.new', 'New layer'))}">＋ ⚙ ${esc(TL('lce.new', 'New layer'))}</button></div><div data-lg-grid></div><div data-lh-gal></div>${isLp4 ? `<p class="muted kx-acc-help">${esc(TL('laser.prj.lp4dual', 'LaserPecker LP4: LightBurn and Design Space side by side – values are NOT converted (Design Space uses Depth, LightBurn speed).'))}</p>` : ''}
            <table class="kx-calc-table" data-lh-layers><tr><th>${esc(TL('laser.prj.layerName', 'Name'))}</th>${pf.map(p => `<th title="${esc(TL('laser.param.help.' + p.k, ''))}">${isLp4 ? 'LB · ' : ''}${esc(TL('laser.param.' + p.k, p.k))} <small>${esc(p.u)}</small></th>`).join('')}${isLp4 ? LDS.map(p => `<th class="kx-lds" title="${esc(TL('laser.param.help.lds.' + p.k, ''))}">DS · ${esc(TL('laser.param.lds.' + p.k, p.k))} <small>${esc(p.u)}</small></th>`).join('') : ''}<th></th></tr>
            ${kids(null).map((o) => row(o, 0)).join('')}${form(st.pForm || '')}</table>
            <small class="muted" data-lh-form-ctx>${esc(st.pEdit ? TL('laser.prj.editing', 'Editing') + ': ' + (layers.find((x) => x.id === st.pEdit)?.data.name || '') : st.pForm ? TL('laser.prj.newSub', 'New sublayer of') + ': ' + (layers.find((x) => x.id === st.pForm)?.data.name || '') : TL('laser.prj.newTop', 'New layer'))}</small> <span class="kx-lf-help" data-ln-err></span><div class="kx-lguard" data-ln-guard></div><label class="kx-lguard-ack" data-ln-ack hidden><input type="checkbox" data-ln-guard-ack> ${esc(TL('lg.ack', ''))}</label></section>`;
                    const again2 = () => void KXLaserHub.mountHub(root, core, opts);
                    det.querySelector('[data-lh-pclose]').onclick = () => { st.pOpen = ''; st.pEdit = ''; st.pForm = ''; again2(); };
                    const fRow = det.querySelector('[data-lh-layer-form]');
                    if (st.pEdit) {
                        const o = layers.find((x) => x.id === st.pEdit);
                        if (o) {
                            fRow.querySelector('[data-ln="name"]').value = o.data.name;
                            fRow.querySelectorAll('[data-lp]').forEach(x => { x.value = o.data.parameters?.[String(x.dataset.lp)] ?? ''; });
                            fRow.querySelectorAll('[data-lds]').forEach(x => { x.value = o.data.parameters?.extras?.lds?.[String(x.dataset.lds)] ?? ''; });
                        }
                    }
                    /* N2.5s: SOURCE PROTECTION – whole parameter set against the source of the project's laser (table of the manufacturer + ranges) */
                    const lgParams = () => { const o = {}; fRow.querySelectorAll('[data-lp]').forEach(x => { const v = x.value.trim(); if (v)
                        o[String(x.dataset.lp)] = Number(v.replace(',', '.')); }); return o; };
                    let lgLast = null;
                    const lgRun = async () => {
                        const box = det.querySelector('[data-ln-guard]');
                        if (!box)
                            return;
                        let r = null;
                        try {
                            r = await core.actions.invoke('ACTION.LASER.GUARD.CHECK', { machineId: cur.data.machineId, profileId: cur.data.profileId, params: lgParams() }, PC);
                        }
                        catch {
                            r = null;
                        }
                        lgLast = r;
                        const ack = det.querySelector('[data-ln-ack]');
                        if (ack)
                            ack.hidden = !(r && r.status === 'danger');
                        if (!r || r.status === 'na') {
                            box.innerHTML = '';
                            return;
                        }
                        const shown = r.findings.filter((f) => f.status !== 'info' || r.status === 'safe');
                        box.innerHTML = `<div class="kx-matwarn kx-matwarn-${r.status === 'danger' ? 'err' : r.status === 'warn' ? 'warn' : 'ok'}" data-lg-status="${esc(r.status)}"><b>${r.status === 'danger' ? '🛑' : r.status === 'warn' ? '⚠' : '✓'} ${esc(TL('lg.title.' + r.status, ''))}</b>${r.source ? ` · ${esc(r.source.name)}` : ''}${r.table ? ` · ${esc(r.table.name)}` : ''}
               <ul class="kx-lguard-list">${shown.map((f) => `<li>${esc(lgMsg(f))}${f.options?.length ? ` ${f.options.map((o) => `<button type="button" class="btn ghost compact" data-lg-fix="${esc(f.field)}|${o}">${o} ns</button>`).join('')}` : f.fix && f.fix.value != null ? ` <button type="button" class="btn ghost compact" data-lg-fix="${esc(f.fix.field)}|${f.fix.value}">${esc(TL('lg.fixTo', ''))} ${esc(String(f.fix.value))}</button>` : ''}</li>`).join('')}</ul>
               ${r.suggested ? `<small class="muted">${esc(TL('lg.suggested', ''))}</small>` : ''}${r.table ? `<small class="muted"> ${esc(r.table.origin)}</small>` : ''}</div>`;
                        box.querySelectorAll('[data-lg-fix]').forEach(b => b.onclick = () => { const [k, v] = String(b.dataset.lgFix).split('|'); const inp = fRow.querySelector(`[data-lp="${k}"]`); if (inp) {
                            inp.value = v;
                            inp.dispatchEvent(new Event('input'));
                        } });
                    };
                    let lgT = null;
                    fRow.querySelectorAll('[data-lp]').forEach(x => x.oninput = () => { const g = guardParam(String(x.dataset.lp), x.value); const c = x.closest('td'); c.style.boxShadow = g ? '0 0 0 2px #e5484d inset' : ''; c.querySelector('[data-lp-help]').textContent = g ? g.msg : ''; clearTimeout(lgT); lgT = setTimeout(() => void lgRun(), 250); });
                    void lgRun();
                    det.querySelectorAll('[data-lh-edit]').forEach(b => b.onclick = () => { st.pEdit = b.dataset.lhEdit; st.pForm = ''; again2(); });
                    det.querySelector('[data-lh-qr]')?.addEventListener('click', () => openLaserQr(core, opts, cur, 'PROJECT'));
                    det.querySelector('[data-lh-csv]')?.addEventListener('click', async () => { const all2 = await core.laserDomain.list(); lhDownload(`laser-${cur.data.recordCode || 'projekt'}-vrstvy.csv`, lhCsvText([cur], all2)); });
                    det.querySelector('[data-lh-pdf]')?.addEventListener('click', async () => { const all2 = await core.laserDomain.list(); if (!(await lhPdfCard(core, cur, all2)))
                        opts.onToast?.(TL('lq.popup', 'The browser blocked the print window.')); });
                    det.querySelector('[data-lh-evid]')?.addEventListener('click', () => void openProjectEvidence(core, opts, { project: cur, onSaved: again2, PC }));
                    {
                        const gh = det.querySelector('[data-lg-grid]');
                        if (gh)
                            void renderLayerGrid(core, opts, gh, cur, layers, again2, PC);
                    }
                    {
                        const gal = det.querySelector('[data-lh-gal]');
                        if (gal)
                            void lhGallery(core, opts, gal, (cur.data.evidence?.photos || []), cur.spaceIds, async (ids) => { await core.actions.invoke('ACTION.LASER.PROJECT.SAVE', { id: cur.id, expectedRevision: cur.revision, spaceIds: cur.spaceIds, data: { ...cur.data, evidence: { ...(cur.data.evidence || {}), photos: ids } } }, PC); again2(); }, !!cur.data.evidence?.projectLocked && false);
                    }
                    det.querySelectorAll('[data-lh-adv]').forEach(b => b.onclick = () => { const o = layers.find((x) => x.id === b.dataset.lhAdv); if (o)
                        void openLayerEditor(core, opts, { project: cur, op: o, layers, onSaved: again2, PC }); });
                    det.querySelectorAll('[data-lh-advnew]').forEach(b => b.onclick = () => void openLayerEditor(core, opts, { project: cur, layers, onSaved: again2, PC, parentId: b.dataset.lhAdvnew || null }));
                    det.querySelectorAll('[data-lh-sub]').forEach(b => b.onclick = () => { st.pForm = b.dataset.lhSub; st.pEdit = ''; again2(); });
                    det.querySelectorAll('[data-lh-del]').forEach(b => b.onclick = async () => {
                        const o = layers.find((x) => x.id === b.dataset.lhDel);
                        if (!o)
                            return;
                        const sub = layers.filter((x) => x.data.parentId === o.id);
                        if (!confirm(TL('laser.prj.delConfirm', 'Remove the layer? It stays in the revision history.') + (sub.length ? ` (${sub.length} ${TL('laser.prj.subsToo', 'sublayers too')})` : '')))
                            return;
                        for (const x of [...sub, o])
                            await core.actions.invoke('ACTION.LASER.OPERATION.SAVE', { id: x.id, expectedRevision: x.revision, spaceIds: x.spaceIds, archivedAt: new Date().toISOString(), data: x.data }, PC);
                        again2();
                    });
                    det.querySelectorAll('[data-lh-reset]').forEach(b => b.onclick = async () => {
                        const o = layers.find((x) => x.id === b.dataset.lhReset);
                        if (!o)
                            return;
                        const pr = JSON.parse(JSON.stringify(o.data.parameters || {}));
                        if (b.dataset.set === 'lds') {
                            if (pr.extras?.lds)
                                delete pr.extras.lds[String(b.dataset.k)];
                        }
                        else
                            delete pr[String(b.dataset.k)];
                        await core.actions.invoke('ACTION.LASER.OPERATION.SAVE', { id: o.id, expectedRevision: o.revision, spaceIds: o.spaceIds, data: { ...o.data, parameters: pr } }, PC);
                        again2();
                    });
                    det.querySelector('[data-ln-add]').onclick = async () => {
                        const name = fRow.querySelector('[data-ln="name"]').value.trim() || TL('laser.prj.layer', 'Layer');
                        const params = {};
                        let bad = '';
                        fRow.querySelectorAll('[data-lp]').forEach(x => { const v = x.value.trim(); if (!v)
                            return; const g = guardParam(String(x.dataset.lp), v); if (g)
                            bad = `${TL('laser.param.' + x.dataset.lp, String(x.dataset.lp))}: ${g.msg}`; params[String(x.dataset.lp)] = Number(v.replace(',', '.')); });
                        const lds = {};
                        fRow.querySelectorAll('[data-lds]').forEach(x => { const v = String(x.value).trim(); if (!v)
                            return; const p = LDS.find(z => z.k === x.dataset.lds); if (p.opts) {
                            lds[p.k] = v;
                            return;
                        } const n = Number(v.replace(',', '.')); if (!Number.isFinite(n) || n < p.min || n > p.max)
                            bad = `DS ${TL('laser.param.lds.' + p.k, p.k)}: ${TL('laser.v.range', 'Allowed range')} ${p.min}–${p.max} ${p.u}.`; lds[p.k] = n; });
                        if (Object.keys(lds).length)
                            params.extras = { lds };
                        const er = det.querySelector('[data-ln-err]');
                        if (bad) {
                            er.textContent = bad;
                            return;
                        }
                        /* N2.5s: dangerous (STOP) only as a warning record, after an explicit tick */ await lgRun();
                        if (lgLast?.status === 'danger') {
                            const ok2 = det.querySelector('[data-ln-guard-ack]')?.checked;
                            if (!ok2) {
                                er.textContent = TL('lg.blocked', '');
                                return;
                            }
                            params.extras = { ...(params.extras || {}), guardWarning: { status: 'danger', codes: lgLast.findings.filter((f) => f.status === 'danger').map((f) => f.code), at: new Date().toISOString() } };
                        }
                        const old = st.pEdit ? layers.find((x) => x.id === st.pEdit) : null;
                        const parentId = old ? old.data.parentId : (st.pForm || undefined);
                        const seq = old ? old.data.sequence : (layers.filter((x) => (x.data.parentId || null) === (parentId || null)).length + 1);
                        try {
                            await core.actions.invoke('ACTION.LASER.OPERATION.SAVE', { id: old?.id, expectedRevision: old?.revision, spaceIds: cur.spaceIds, data: { ...(old?.data || {}), projectId: cur.id, name, sequence: seq, lensId: old?.data.lensId || cur.data.defaultLensId || cur.data.lensIds[0], parentId, parameters: params } }, PC);
                            st.pEdit = '';
                            st.pForm = '';
                            again2();
                        }
                        catch (e) {
                            er.textContent = TL('laser.prj.err.' + String(e?.message || '').replace(/[^A-Za-z]+/g, '_'), String(e?.message || e));
                        }
                    };
                }
                return;
            }
            if (st.tab === 'MATERIALS') {
                registerMaterials(core);
                const mats = await materials(core);
                st.msel = st.msel || new Set();
                root.innerHTML = `<div data-laser-hub class="kx-laser" data-laser-mats>${tabsHtml}<div class="kx-tw-safety">⚠ ${esc(TL('laser.mat.banner', 'States and compatibility come from the original program and the e-shop.'))}</div><div data-lh-mtable></div></div>`;
                bindTabs();
                const mh = root.querySelector('[data-lh-mtable]');
                const mval = (r, f) => { const d = r.data; if (f.key.startsWith('c') && WL.includes(f.key.slice(1)))
                    return d.compat?.[f.key.slice(1)] || ''; if (f.key === 'verified')
                    return d.verified === true; return f.custom ? (d.custom?.[f.key] ?? '') : (d[f.key] ?? ''); };
                if (globalThis.KXTable)
                    await globalThis.KXTable(mh, { scope: MAT_SCOPE, rows: mats, rowId: (r) => r.id, value: mval, exportValue: (r, f) => { const v = mval(r, f); return v === true ? 1 : v === false ? 0 : v; },
                        editable: (f) => f.key === 'verified', onEdit: async (r, f, v) => { await core.actions.invoke('ACTION.LASER.MATERIAL.SAVE', { id: r.id, expectedRevision: r.revision, spaceIds: r.spaceIds, data: { ...r.data, verified: v === true } }, { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.CONFIG.EDIT'], confirmed: true }); },
                        filterState: () => st.mfilter || {}, onFilter: (x) => { st.mfilter = x; }, density: st.mdensity || 'COMPACT', onDensity: (d) => { st.mdensity = d; }, selection: st.msel, sortState: () => st.msort, onSort: (x) => { st.msort = x; }, compare: true,
                        onOpen: (r) => { st.mgrid = r.id; void KXLaserHub.mountHub(root, core, opts); }, onChange: () => void KXLaserHub.mountHub(root, core, opts), rowMenu: (r) => [{ label: `▦ ${TL('laser.grid.title', 'Grid test')}`, run: () => { st.mgrid = r.id; void KXLaserHub.mountHub(root, core, opts); } }], isStale: () => false });
                if (st.mgrid) {
                    const m = mats.find((x) => x.id === st.mgrid);
                    const allS = await core.laserDomain.list('APP.LASER.SOURCE_MODULE');
                    const so = (id) => allS.filter((x) => x.data.machineId === id && !x.archivedAt);
                    const own = (await machines(core)).filter((x) => x.data.origin !== 'DEMO');
                    if (m) {
                        const box = document.createElement('section');
                        box.dataset.lhGrid = m.id;
                        box.className = 'kx-lcard open';
                        box.innerHTML = `<header class="kx-lcard-h"><b>▦ ${esc(m.data.name)}</b><button class="icon-btn" data-lh-grid-close>×</button></header>${own.map((mc) => `<h4>${esc(mc.data.name)}</h4>${gridGuideHtml(gridGuide(m, mc, so))}`).join('')}`;
                        root.querySelector('[data-laser-mats]').appendChild(box);
                        box.querySelector('[data-lh-grid-close]').onclick = () => { st.mgrid = ''; void KXLaserHub.mountHub(root, core, opts); };
                    }
                }
                return;
            }
            if (st.tab === 'UTIL') {
                const today = new Date().toISOString().slice(0, 10);
                let plan = null;
                try {
                    plan = core.shopOrders ? await core.shopOrders.laserPlanAll(opts.actorId, today) : null;
                }
                catch { }
                const fmt = (m) => m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
                const byM = {};
                if (plan)
                    for (const [oid, rows] of Object.entries(plan.assignments))
                        for (const r of rows)
                            if (r.machineId)
                                (byM[r.machineId] = byM[r.machineId] || []).push({ ...r, orderId: oid });
                root.innerHTML = `<div data-laser-hub class="kx-laser" data-laser-util>${tabsHtml}<div class="kx-issue-actions"><button class="btn" data-laser-plan-shop>🗓 ${esc(TL('laser.planInShop', 'Plan in SHOP'))}</button></div>
          ${plan ? plan.utilisation.map((u) => `<article class="kx-lcard" data-laser-util-row="${esc(u.machineId)}"><header class="kx-lcard-h"><b>${esc(u.name)}</b><span class="kx-load-row ${u.pct > 100 ? 'over' : ''}"><span class="kx-load-bar"><i style="width:${Math.min(100, u.pct || 0)}%"></i></span><b>${u.counted ? `${u.pct} %` : esc(TL('laser.notCounted', 'not counted'))}</b><small>${esc(TL('laser.utilPlanned', 'planned'))} ${fmt(u.minutes)} ${esc(TL('laser.utilOf', 'of'))} ${fmt(u.capacityMinutes)} ${esc(TL('laser.utilCap', 'capacity up to the furthest due date'))}</small></span></header>
            ${(byM[u.machineId] || []).length ? `<table class="kx-calc-table">${(byM[u.machineId] || []).map((r) => `<tr><td>${esc(r.name)}</td><td>${fmt(r.minutes)}${r.prep ? ` + ${fmt(r.prep)}` : ''}${r.night ? ' 🌙' : ''}</td></tr>`).join('')}</table>` : ''}</article>`).join('') : `<p class="muted">${esc(TL('laser.noPlan', 'No orders planned yet.'))}</p>`}</div>`;
                bindTabs();
                root.querySelector('[data-laser-plan-shop]').onclick = () => document.dispatchEvent(new CustomEvent('kx-open-hub', { detail: { hub: 'APP.KX.SHOP', tab: 'ORDERS' } }));
                return;
            }
            root.innerHTML = `<div data-laser-hub class="kx-laser">
        <div class="kx-tw-safety" data-laser-safety>⚠ ${esc(TL('laser.safety', 'Laser safety: goggles for the wavelength (450 nm ≠ 1064 nm ≠ 10 600 nm), extraction, never cut PVC (chlorine), never leave a running job unattended.'))}</div>
        ${tabsHtml}
        ${st.seededNow ? `<div class="kx-lseed" data-lh-seeded>✓ ${esc(TL('laser.seededInfo', 'Created machines from the original program and demo machines'))}: ${st.seededNow}</div>` : ''}${st.seedError ? `<div class="kx-tw-safety" data-lh-seed-error>⚠ ${esc(st.seedError)}</div>` : ''}
        ${missing.length && !st.seededNow ? `<div class="kx-lseed" data-lh-seedbar>${esc(TL('laser.seedInfo', 'Some machines are missing'))} (${missing.length}). <button class="btn" data-lh-seed>${esc(TL('laser.seed', 'Create machines'))}</button></div>` : ''}
        <div class="kx-print3d-tabs" data-lh-viewsw><button class="chip ${st.view !== 'TABLE' ? 'active' : ''}" data-lh-view="CARDS">▦ ${esc(TL('laser.viewCards', 'Cards'))}</button><button class="chip ${st.view === 'TABLE' ? 'active' : ''}" data-lh-view="TABLE">☰ ${esc(TL('laser.viewTable', 'Table'))}</button></div>
        ${st.view === 'TABLE' ? '<div data-lh-table></div>' : colsPanel}
        ${st.view === 'TABLE' ? '' : (groups.filter(([, g]) => g.length).map(([k, g]) => `<h3 class="kx-lgroup">${esc(TL('laser.group.' + k, k))} <small>${g.length}</small></h3>${g.map(card).join('')}`).join('') || `<p class="muted">${esc(TL('laser.noMachines', 'No laser yet.'))}</p>`)}</div>`;
            bindTabs();
            const again = () => void KXLaserHub.mountHub(root, core, opts);
            /* N2.4i: edit / add / remove accessories – the core validates, the error is shown at the accessory */
            const accOf = async (mid) => (await core.laserDomain.get(mid, 'APP.LASER.MACHINE'));
            root.querySelectorAll('[data-acc-save]').forEach(b => b.onclick = async () => {
                const sec = b.closest('[data-lh-accessories]');
                const mid = String(sec.dataset.lhAccessories);
                const ed = b.closest('[data-lh-accedit]');
                const m = await accOf(mid);
                const list = (m.data.accessories || []).map((a) => { if (a.id !== b.dataset.accSave)
                    return a; const n = { ...a }; ed.querySelectorAll('[data-acc-f]').forEach((x) => { const k = x.dataset.accF; if (x.type === 'checkbox') {
                    n[k] = x.checked;
                    return;
                } const v = String(x.value).trim(); if (k === 'axis') {
                    if (v)
                        n.axis = v;
                    else
                        delete n.axis;
                    return;
                } if (k === 'state') {
                    n.state = v || 'OK';
                    return;
                } if (v === '')
                    delete n[k];
                else
                    n[k] = Number(v.replace(',', '.')); }); return n; });
                try {
                    await updatePlanning(core, opts, mid, { accessories: list });
                    opts.onToast?.(TL('laser.saved', 'Saved'));
                    again();
                }
                catch (e) {
                    const er = ed.querySelector('[data-acc-err]');
                    er.textContent = TL('laser.acc.err.' + String(e?.message || ''), String(e?.message || e));
                }
            });
            root.querySelectorAll('[data-acc-toggle]').forEach(b => b.onclick = async () => {
                const sec = b.closest('[data-lh-accessories]');
                const mid = String(sec.dataset.lhAccessories);
                const m = await accOf(mid);
                const on = b.dataset.on === '1';
                try {
                    await updatePlanning(core, opts, mid, { accessories: (m.data.accessories || []).map((a) => a.id === b.dataset.accToggle ? { ...a, enabled: on } : a) });
                    again();
                }
                catch (e) {
                    opts.onToast?.(String(e?.message || e));
                }
            });
            root.querySelectorAll('[data-acc-del]').forEach(b => b.onclick = async () => {
                if (!confirm(TL('laser.acc.removeConfirm', 'Remove the accessory? It stays in the revision history.')))
                    return;
                const sec = b.closest('[data-lh-accessories]');
                const mid = String(sec.dataset.lhAccessories);
                const m = await accOf(mid);
                try {
                    await updatePlanning(core, opts, mid, { accessories: (m.data.accessories || []).filter((a) => a.id !== b.dataset.accDel) });
                    again();
                }
                catch (e) {
                    opts.onToast?.(String(e?.message || e));
                }
            });
            root.querySelectorAll('[data-acc-add]').forEach(b => b.onclick = async () => {
                const box = b.closest('[data-lh-accadd]');
                const mid = String(box.dataset.lhAccadd);
                const kind = box.querySelector('[data-acc-kind]').value;
                const name = box.querySelector('[data-acc-name]').value.trim() || TL('laser.acc.kind.' + kind, kind);
                const m = await accOf(mid);
                const id = kind + '_' + Date.now().toString(36).toUpperCase();
                try {
                    await updatePlanning(core, opts, mid, { accessories: [...(m.data.accessories || []), { id, kind, name, source: 'USER', verified: false }] });
                    again();
                }
                catch (e) {
                    opts.onToast?.(String(e?.message || e));
                }
            });
            root.querySelectorAll('[data-lh-view]').forEach(b => b.onclick = () => { st.view = String(b.dataset.lhView); again(); });
            const tHost = root.querySelector('[data-lh-table]');
            if (tHost && globalThis.KXTable) {
                registerTable(core);
                st.tsel = st.tsel || new Set();
                st.terr = st.terr || {};
                const val = (r, f) => {
                    const d = r.data;
                    switch (f.key) {
                        case 'name': return d.name;
                        case 'origin': return d.origin || 'USER';
                        case 'tech': return (d.technologyCodes || []).map(techLabel).join(' · ');
                        case 'sources': return srcOf(r.id).map((x) => `${x.data.wavelengthNm || '?'} nm${x.data.nominalPowerW ? ` · ${x.data.nominalPowerW} W` : ''}`).join(' + ');
                        case 'functions': return functionsOf(d, srcOf(r.id), lensOf(r.id)).map(k => TL('laser.fn.' + k, k)).join(' · ');
                        case 'status': return d.status || 'ACTIVE';
                        case 'capacityHoursPerDay': return d.capacityHoursPerDay ?? '';
                        case 'util': {
                            const u = util?.utilisation?.find((x) => x.machineId === r.id);
                            return u?.counted ? u.pct : '';
                        }
                        case 'prepMinutesDefault': return d.prepMinutesDefault ?? '';
                        case 'finishMinutesDefault': return d.finishMinutesDefault ?? '';
                        case 'allowOvernight': return d.allowOvernight === true;
                        case 'lenses': return lensOf(r.id).map((l) => `F${l.data.focalLengthMm}`).join(' · ');
                        case 'outages': {
                            const t = new Date().toISOString().slice(0, 10);
                            const n = (d.outages || []).filter((o) => o.to >= t).sort((a, b) => a.from.localeCompare(b.from))[0];
                            return n ? `${n.from} – ${n.to}` : '';
                        }
                        case 'manufacturer': return d.manufacturer || '';
                        case 'model': return d.model || '';
                        case 'rotary': return accSummary(d, ROT_KINDS);
                        case 'slide': return accSummary(d, TABLE_KINDS);
                        default: return f.custom ? (d.custom?.[f.key] ?? '') : '';
                    }
                };
                const lbl = { capacityHoursPerDay: 'capacity', prepMinutesDefault: 'prepOnly', finishMinutesDefault: 'finish', allowOvernight: 'overnight', status: 'status' };
                await globalThis.KXTable(tHost, { scope: TABLE_SCOPE, rows: list, rowId: (r) => r.id, value: val, exportValue: (r, f) => { const v = val(r, f); return v === true ? 1 : v === false ? 0 : v; },
                    editable: (f) => EDITABLE.has(f.key), cellError: (id, k) => st.terr[id + '|' + k] || '', onCellError: (id, k, m) => { st.terr[id + '|' + k] = m; },
                    errors: () => Object.entries(st.terr).map(([k, m]) => `${(list.find((x) => x.id === k.split('|')[0])?.data.name) || ''} · ${TL('laser.col.' + lbl[k.split('|')[1]], k.split('|')[1])}: ${m}`),
                    onEdit: async (r, f, v) => {
                        const key = f.key;
                        delete st.terr[r.id + '|' + key];
                        if (key === 'status' || key === 'allowOvernight') {
                            await updatePlanning(core, opts, r.id, { [key]: key === 'allowOvernight' ? v === true : String(v) });
                            return;
                        }
                        const res = checkField(key, String(v));
                        if (res && res.level === 'err')
                            throw new Error(`${res.msg}${res.fix != null ? ` → ${TL('laser.v.useFix', 'Use')} ${res.fix}` : ''}`);
                        const n = String(v).trim() === '' ? undefined : Number(String(v).replace(',', '.'));
                        await updatePlanning(core, opts, r.id, { [key]: n });
                    },
                    filterState: () => st.tfilter || {}, onFilter: (x) => { st.tfilter = x; }, density: st.tdensity || 'COMPACT', onDensity: (d) => { st.tdensity = d; }, selection: st.tsel, sortState: () => st.tsort, onSort: (x) => { st.tsort = x; }, compare: true,
                    onOpen: (r) => { st.view = 'CARDS'; st.open = r.id; again(); }, onChange: () => again(), rowMenu: (r) => [{ label: `⧉ ${TL('laser.duplicate', 'Duplicate')}`, run: async () => { try {
                                await duplicate(core, opts, r.id, r.spaceIds);
                            }
                            catch (e) {
                                opts.onToast?.(String(e?.message || e));
                            } again(); } }], isStale: () => false });
            }
            const saveCols = async (v) => { try {
                if (v === '') {
                    await core.actions.invoke('ACTION.CORE.FIELDS.RESET', { scope: TABLE_SCOPE }, fCtx(opts.actorId));
                }
                else {
                    const on = v.split(',');
                    for (const c of COLS)
                        for (const k of CARD_TO_REG[c])
                            await core.actions.invoke('ACTION.CORE.FIELDS.SET', { scope: TABLE_SCOPE, key: k, patch: { hidden: !on.includes(c) } }, fCtx(opts.actorId));
                }
            }
            catch (e) {
                opts.onToast?.(String(e?.message || e));
            } again(); };
            root.querySelector('[data-lh-cols-save]')?.addEventListener('click', () => { const v = Array.from(root.querySelectorAll('[data-lh-colchk]')).filter(x => x.checked).map(x => String(x.dataset.lhColchk)); void saveCols(v.join(',')); });
            root.querySelector('[data-lh-cols-reset]')?.addEventListener('click', () => void saveCols(''));
            const space = async () => opts.defaultSpaceId ? [opts.defaultSpaceId] : [(await core.propagate.spaces(opts.actorId)).find((s) => s.kind === 'PERSONAL').id];
            root.querySelectorAll('[data-lh-toggle]').forEach(h => h.onclick = (e) => { if (e.target.closest('[data-lh-dup]'))
                return; st.open = st.open === h.dataset.lhToggle ? '' : h.dataset.lhToggle; again(); });
            root.querySelector('[data-lh-seed]')?.addEventListener('click', async () => { try {
                const n = await seed(core, opts, await space());
                opts.onToast?.(`${TL('laser.seeded', 'Created')}: ${n.length}`);
            }
            catch (e) {
                opts.onToast?.(String(e?.message || e));
            } again(); });
            /* N2.5s: SOURCE PROTECTION per source – save ranges + table, confirm the suggested table, clear */
            const lgsCtx = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.CONFIG.EDIT', 'LASER.READ'], confirmed: true };
            const lgsRead = (id) => {
                const box = root.querySelector(`[data-lgs-box="${id}"]`);
                const ranges = {};
                box.querySelectorAll('[data-lgs-r]').forEach(i => { if (i.value.trim() !== '')
                    ranges[String(i.dataset.lgsR)] = i.dataset.lgsR === 'pulseValues' ? i.value : i.value.replace(',', '.'); });
                return { tableId: box.querySelector('[data-lgs-table]').value || null, ranges, source: box.querySelector('[data-lgs-source]').value };
            };
            root.querySelectorAll('[data-lgs-edit]').forEach(bt => bt.onclick = (e) => { e.preventDefault(); e.stopPropagation(); void openGuardEditor(core, opts, String(bt.dataset.lgsEdit), again); });
            const lgsDo = async (id, guard) => { try {
                await core.actions.invoke('ACTION.LASER.GUARD.SET', { sourceModuleId: id, guard }, lgsCtx);
                opts.onToast?.(TL('lg.saved', ''));
            }
            catch (e) {
                opts.onToast?.(TL('lg.err.' + String(e?.message || '').split(':')[0], String(e?.message || e)));
            } again(); };
            root.querySelectorAll('[data-lgs-save]').forEach(b => b.onclick = () => void lgsDo(String(b.dataset.lgsSave), lgsRead(String(b.dataset.lgsSave))));
            root.querySelectorAll('[data-lgs-confirm]').forEach(b => b.onclick = () => { const id = String(b.dataset.lgsConfirm); const g = lgsRead(id); void lgsDo(id, { ...g, tableId: g.tableId || 'JPT_M7_60_1_5MJ', source: g.source || TL('lg.confirmedNote', '') }); });
            root.querySelectorAll('[data-lgs-clear]').forEach(b => b.onclick = () => void lgsDo(String(b.dataset.lgsClear), null));
            root.querySelectorAll('[data-lh-dup]').forEach(b => b.onclick = async (e) => { e.stopPropagation(); try {
                const n = await duplicate(core, opts, String(b.dataset.lhDup), await space());
                st.open = n.id;
                opts.onToast?.(TL('laser.duplicated', 'Copied as your own machine'));
            }
            catch (err) {
                opts.onToast?.(String(err?.message || err));
            } again(); });
            /* inline validation: red / orange frame, help with range, „Použít návrh“, 📖 where to find it; invalid values are not saved */
            const validate = (sec) => {
                let bad = false;
                sec.querySelectorAll('input[data-lh-f]').forEach(inp => {
                    const k = String(inp.dataset.lhF);
                    const res = checkField(k, inp.value);
                    const lab = inp.closest('[data-lh-field]');
                    const help = sec.querySelector(`[data-lh-help="${k}"]`);
                    if (!lab || !help)
                        return;
                    lab.classList.toggle('kx-err', res?.level === 'err');
                    lab.classList.toggle('kx-warn', res?.level === 'warn');
                    if (res?.level === 'err')
                        bad = true;
                    help.hidden = !res;
                    help.innerHTML = res ? `${esc(res.msg)} ${res.fix != null ? `<button class="btn ghost compact" data-lh-fix="${esc(k)}" data-fix="${esc(res.fix)}">${esc(TL('laser.v.useFix', 'Use'))} ${esc(res.fix)}</button>` : ''} <a href="#" data-kx-manual="HUB:APP.KX.LASER">📖</a>` : '';
                    help.querySelector('[data-lh-fix]')?.addEventListener('click', (e) => { e.preventDefault(); inp.value = String(e.currentTarget.dataset.fix); validate(sec); });
                });
                return !bad;
            };
            root.querySelectorAll('[data-lh-planning]').forEach(sec => {
                sec.querySelectorAll('input[data-lh-f]').forEach(x => x.addEventListener('input', () => validate(sec)));
                validate(sec);
                const outs = () => Array.from(sec.querySelectorAll('[data-lh-out]')).map(rw => ({ from: rw.querySelector('[data-lh-of]').value, to: rw.querySelector('[data-lh-ot]').value, reason: rw.querySelector('[data-lh-or]').value.trim() || undefined }));
                sec.__outs = outs;
                sec.querySelector('[data-lh-outadd]')?.addEventListener('click', async () => { const id = String(sec.dataset.lhPlanning); const m = await core.laserDomain.get(id, 'APP.LASER.MACHINE'); const t = new Date().toISOString().slice(0, 10); try {
                    await updatePlanning(core, opts, id, { outages: [...(m?.data?.outages || []), { from: t, to: t }] });
                }
                catch (e) {
                    opts.onToast?.(String(e?.message || e));
                } again(); });
                sec.querySelectorAll('[data-lh-outdel]').forEach(b => b.addEventListener('click', async () => { const id = String(sec.dataset.lhPlanning); const m = await core.laserDomain.get(id, 'APP.LASER.MACHINE'); const o = [...(m?.data?.outages || [])]; o.splice(Number(b.dataset.lhOutdel), 1); try {
                    await updatePlanning(core, opts, id, { outages: o });
                }
                catch (e) {
                    opts.onToast?.(String(e?.message || e));
                } again(); }));
            });
            root.querySelectorAll('[data-lh-save]').forEach(b => b.onclick = async () => {
                const sec = root.querySelector(`[data-lh-planning="${CSS.escape(String(b.dataset.lhSave))}"]`);
                const g = (k) => sec.querySelector(`[data-lh-f="${k}"]`);
                const n = (k) => { const v = String(g(k).value).replace(',', '.').trim(); return v === '' ? undefined : Number(v); };
                if (!validate(sec)) {
                    opts.onToast?.(TL('laser.v.fixFirst', 'Fix the fields marked red first.'));
                    return;
                }
                try {
                    await updatePlanning(core, opts, String(b.dataset.lhSave), { outages: sec.__outs?.() || undefined, capacityHoursPerDay: n('capacityHoursPerDay'), status: g('status').value, prepMinutesDefault: n('prepMinutesDefault'), finishMinutesDefault: n('finishMinutesDefault'), prepBlocksMachine: g('prepBlocksMachine').checked, allowOvernight: g('allowOvernight').checked });
                    opts.onToast?.(TL('laser.saved', 'Saved'));
                }
                catch (e) {
                    opts.onToast?.(TL('err.' + String(e?.message || e), String(e?.message || e)));
                }
                again();
            });
        } };
})();
