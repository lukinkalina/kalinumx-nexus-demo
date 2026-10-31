var KXLaserHub;
(function () {
    const OWNER = 'APP.KX.LASER';
    const TL = (k, fb) => globalThis.KXI18n?.UI?.[k]?.cs || fb;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    /* machine definitions: user's machines from the original Laser Parameter Hub P566 + demo machines. Lens field sizes are NOT invented (only focal lengths from P566). */
    const SEEDS = [
        { uid: 'KX.LASER.PERSONAL.HAOTIAN_MOPA_60W_JPT_M7', origin: 'PERSONAL', name: 'Haotian Galvo fiber MOPA 60W JPT M7', manufacturer: 'Haotian', model: 'Galvo fiber MOPA 60W (JPT M7)', tech: ['FIBER_MOPA', 'GALVO'],
            sources: [{ key: 'IR', name: 'JPT M7 MOPA 1064 nm', tech: 'FIBER_MOPA', nm: 1064, w: 60 }], lenses: [110, 210, 310], capacity: 8 },
        { uid: 'KX.LASER.PERSONAL.LASERPECKER_LP4', origin: 'PERSONAL', name: 'LaserPecker LP4', manufacturer: 'LaserPecker', model: 'LP4', tech: ['LP4', 'DIODE', 'FIBER'],
            sources: [{ key: 'BLUE', name: TL('laser.src.blue450', 'Blue 450 nm'), tech: 'DIODE', nm: 450 }, { key: 'IR', name: 'IR 1064 nm', tech: 'FIBER', nm: 1064 }], lenses: [], modes: ['STANDARD', 'SLIDE', 'ROTARY'], capacity: 6 },
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
    const TABS = [['MACHINES', TL('laser.tab.MACHINES', 'Lasers')], ['PROJECTS', TL('laser.tab.PROJECTS', 'Projects')], ['TESTS', TL('laser.tab.TESTS', 'Tests')], ['MATERIALS', TL('laser.tab.MATERIALS', 'Materials')], ['UTIL', TL('laser.tab.UTIL', 'Utilisation')]];
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
        'KX.LASER.PERSONAL.HAOTIAN_MOPA_60W_JPT_M7': [110, 210, 310].map(f => ({ id: 'hao' + f, name: TL('laser.prof.lens', '{f} mm lens').replace('{f}', String(f)), nm: 1064, mode: 'Standard', software: 'LightBurn', lens: f, notes: f === 110 ? TL('laser.prof.focus174', 'focus 174 mm (original program)') : '' })),
        'KX.LASER.PERSONAL.LASERPECKER_LP4': [['450', 'std', 'Standard', '160 × 120 mm', 'M3010', 'M3030'], ['ir', 'std', 'Standard', '160 × 120 mm', 'M3011', 'M3030'], ['450', 'slide', 'Slide Extension', '160 × 300 mm', 'M3010', 'M3031'], ['ir', 'slide', 'Slide Extension', '160 × 300 mm', 'M3011', 'M3031'], ['450', 'rot', 'Rotary', '160 × 628 mm', 'M3010', 'M3032'], ['ir', 'rot', 'Rotary', '160 × 628 mm', 'M3011', 'M3032']].map(([w, m, mode, area, lc, mc]) => ({ id: `lp4_${w}_${m}`, name: `${w === '450' ? '450' : '1064'} nm · ${mode === 'Slide Extension' ? 'Slide' : mode}`, nm: w === '450' ? 450 : 1064, mode, software: 'LightBurn + LaserPecker Design Space', lens: 'INTEGRATED', notes: `${TL('laser.prof.area', 'work area')} ${area} · ${TL('laser.prof.distance', 'working distance 150 mm')} · ${lc} / ${mc} (P566)` }))
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
            const have = new Set(all.filter((x) => x.type === 'APP.LASER.PROFILE').map((x) => x.data.recordUid));
            for (const w of want) {
                const uidP = 'KX.LASER.PROFILE.' + w.id;
                if (have.has(uidP))
                    continue;
                const src = srcs.find((x) => Number(x.data.wavelengthNm) === w.nm);
                if (!src)
                    continue;
                const lens = w.lens === 'INTEGRATED' ? lenses.find((l) => String(l.data.recordUid || '').endsWith('_INTEGRATED')) : lenses.find((l) => Number(l.data.focalLengthMm) === w.lens);
                await core.actions.invoke('ACTION.LASER.PROFILE.SAVE', { spaceIds: m.spaceIds, data: { recordUid: uidP, machineId: m.id, sourceModuleId: src.id, name: w.name, mode: w.mode, software: w.software, defaultLensId: lens?.id, notes: w.notes } }, C2);
                n++;
            }
        }
        return n;
    }
    /* N2.4j: layer parameters in the LightBurn 2.1 order; only fields the machine can do; guard ranges from P566 (JPT M7: 1–4000 kHz, 2–500 ns) */
    const PARAMS = [{ k: 'speedMmPerS', u: 'mm/s', min: 0.1, max: 20000, need: 'GALVO' }, { k: 'speedMmPerMin', u: 'mm/min', min: 1, max: 240000, need: 'NOGALVO' }, { k: 'powerPercent', u: '%', min: 0, max: 100 }, { k: 'frequencyKHz', u: 'kHz', min: 1, max: 4000, need: 'GALVO' }, { k: 'qPulseNs', u: 'ns', min: 2, max: 500, need: 'FIBER_MOPA' },
        { k: 'lineIntervalMm', u: 'mm', min: 0.001, max: 5 }, { k: 'dpi', u: 'DPI', min: 10, max: 5000, need: 'NOGALVO' }, { k: 'passes', u: '×', min: 1, max: 100 }, { k: 'hatchAngleDeg', u: '°', min: 0, max: 360, need: 'GALVO' }, { k: 'wobbleMm', u: 'mm', min: 0, max: 10, need: 'GALVO' }, { k: 'depthPercent', u: '%', min: 0, max: 100, need: 'LP4' }];
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
            return `<div class="kx-lgs" data-lgs-box="${esc(x.id)}"><b>${esc(x.data.name)}</b> <small class="muted">${esc(String(x.data.wavelengthNm || '?'))} nm${x.data.nominalPowerW ? ` · ${x.data.nominalPowerW} W` : ''}</small> <span class="kx-badge ${st2 === 'OK' ? '' : 'kx-badge-warn'}" data-lgs-state="${st2}">${esc(TL('lg.state.' + st2, ''))}</span>
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
    function registerProjects(core) {
        if (core.__laserPrjTable)
            return;
        core.__laserPrjTable = true;
        try {
            core.lists?.registerList('LASER.PRJSTATUS', { name: T('laser.list.prjStatus', 'Project state'), owner: OWNER, items: ['DRAFT', 'READY', 'RUNNING', 'DONE', 'ARCHIVED'].map(k => ({ key: k, label: T('laser.prjStatus.' + k, k) })) });
            core.fields?.registerDefaults(PRJ_SCOPE, [{ key: 'recordCode', type: 'TEXT', label: T('laser.prj.code', 'Code'), width: 90 }, { key: 'title', type: 'TEXT', label: T('laser.prj.title', 'Title'), width: 240 }, { key: 'machine', type: 'TEXT', label: T('laser.prj.machine', 'Laser'), width: 200 }, { key: 'profile', type: 'TEXT', label: T('laser.prj.profile', 'Profile'), width: 150 }, { key: 'material', type: 'TEXT', label: T('laser.mat.name', 'Material'), width: 180 }, { key: 'status', type: 'SELECT', label: T('laser.prj.status', 'State'), listId: 'LASER.PRJSTATUS', width: 110 }, { key: 'layers', type: 'NUMBER', label: T('laser.prj.layersCol', 'Layers'), width: 70 }]);
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
            const tabsHtml = `<div class="kx-print3d-tabs">${TABS.map(([k, l]) => `<button class="chip ${st.tab === k ? 'active' : ''}" data-laser-tab="${k}">${esc(l)}</button>`).join('')}<button class="icon-btn" data-kx-manual="HUB:APP.KX.LASER" title="📖">📖</button></div>`;
            const bindTabs = () => root.querySelectorAll('[data-laser-tab]').forEach(b => b.onclick = () => { st.tab = String(b.dataset.laserTab); void KXLaserHub.mountHub(root, core, opts); });
            /* N2.4d: utilisation of every laser across all open orders (the same planner as SHOP); „Plánovat v SHOPu“ opens the SHOP orders */
            if (st.tab === 'TESTS') {
                const all = await core.laserDomain.list();
                const tests = all.filter((x) => x.type === 'APP.LASER.TEST' && !x.archivedAt && x.data.grid);
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
            <small class="muted" data-lt-preview></small> <button class="btn" data-lt-create>${esc(TL('laser.grid.create', 'Create the grid'))}</button> <span class="kx-lf-help" data-lt-err></span></details>
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
                if (cur) {
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
                        case 'grid': return `${d.grid.xSteps} × ${d.grid.ySteps}`;
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
                const projs = all.filter((x) => x.type === 'APP.LASER.PROJECT' && !x.archivedAt);
                const own = (await machines(core)).filter((m) => m.data.origin !== 'DEMO');
                const mats = await materials(core);
                const byId = (id) => all.find((x) => x.id === id);
                const ops = (pid) => all.filter((x) => x.type === 'APP.LASER.OPERATION' && x.data.projectId === pid && !x.archivedAt).sort((a, b) => a.data.sequence - b.data.sequence);
                const PC = { actorId: opts.actorId, appCode: OWNER, deviceId: opts.deviceId, permissions: ['LASER.PROJECT.EDIT', 'LASER.CONFIG.EDIT'], confirmed: true };
                const cur = st.pOpen ? projs.find((x) => x.id === st.pOpen) : null;
                root.innerHTML = `<div data-laser-hub class="kx-laser" data-laser-projects>${tabsHtml}
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
                        default: return f.custom ? (d.custom?.[f.key] ?? '') : '';
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
                    const row = (o, depth) => `<tr data-lh-layer="${esc(o.id)}" class="${o.data.parentId ? 'kx-sublayer' : ''}"><td style="padding-left:${6 + depth * 16}px">${depth ? '↳ ' : ''}${esc(o.data.name)}${o.data.parameters?.extras?.guardWarning ? ` <span class="kx-badge kx-badge-warn" data-lg-warnrec title="${esc(TL('lg.warnRecHelp', ''))}">⚠ ${esc(TL('lg.warnRec', ''))}</span>` : ''}</td>${pf.map(p => cell(o, 'lb', p.k)).join('')}${isLp4 ? LDS.map(p => cell(o, 'lds', p.k)).join('') : ''}
            <td class="kx-layer-act"><button class="icon-btn" data-lh-edit="${esc(o.id)}" title="✎">✎</button><button class="icon-btn" data-lh-sub="${esc(o.id)}" title="${esc(TL('laser.prj.addSub', 'add a sublayer'))}">＋↳</button><button class="icon-btn" data-lh-del="${esc(o.id)}" title="🗑">🗑</button></td></tr>` + kids(o.id).map((k) => row(k, depth + 1)).join('');
                    const form = (prefix) => `<tr data-lh-layer-form="${esc(prefix)}"><td><input data-ln="name" maxlength="80" placeholder="${esc(TL('laser.prj.layerPh', 'e.g. Fill logo'))}"></td>${pf.map(p => `<td><input data-lp="${p.k}" inputmode="decimal" style="width:68px"><span class="kx-lf-help" data-lp-help="${p.k}"></span></td>`).join('')}${isLp4 ? LDS.map(p => `<td>${p.opts ? `<select data-lds="${p.k}"><option value="">—</option>${p.opts.map(x => `<option>${x}</option>`).join('')}</select>` : `<input data-lds="${p.k}" inputmode="decimal" style="width:60px">`}</td>`).join('') : ''}<td><button class="btn compact" data-ln-add>✓</button></td></tr>`;
                    det.innerHTML = `<section class="kx-lcard open" data-lh-project="${esc(cur.id)}"><header class="kx-lcard-h"><b>${esc(cur.data.recordCode)} · ${esc(cur.data.title)}</b><small class="muted">${esc(mc?.data.name || '')} · ${esc(byId(cur.data.profileId)?.data.name || '')}${cur.data.material ? ` · ${esc(cur.data.material)}` : ''}</small><button class="icon-btn" data-lh-pclose>×</button></header>
            <h5>${esc(TL('laser.prj.layers', 'Layers (LightBurn order)'))}</h5>${isLp4 ? `<p class="muted kx-acc-help">${esc(TL('laser.prj.lp4dual', 'LaserPecker LP4: LightBurn and Design Space side by side – values are NOT converted (Design Space uses Depth, LightBurn speed).'))}</p>` : ''}
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
