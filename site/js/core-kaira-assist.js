// N2.5n (user 2026-10-25): KAIRA 2.0 – a full helper of the NEXUS data-collection system, built ON the existing Kaira (providers, profile,
// feedback, briefing, persona). Adds: (1) COMPLETENESS – important fields missing in hub records (serial, maker, price / kg, remaining …)
// with the most frequent values from similar records as CHOICES and always WHY; (2) ATTENTION – unusual values (spool price far above the
// median) and coming dates (warranty, licence, service from the identification); (3) ASK without AI – Kaira knows the hubs, windows /
// tools, guides and settings of NEXUS (from the registries) and answers WHERE it is, with a place to open; (4) LEARNING from corrections
// (a prefilled value overwritten by the person) – per user, never shared. Only readable records; suggestions never write by themselves.
var KXKairaAssist;
(function () {
    const OWNER = 'APP.KX.NEXUS', LEARN = 'CORE.KAIRA.LEARN2';
    const TX = (k, v) => String(globalThis.KXI18n?.UI?.[k]?.cs || k).replace(/\{(\w+)\}/g, (_m, n) => String(v?.[n] ?? ''));
    /* fields worth completing when a hub has them (data collection) */
    const KEY = new Set(['serial', 'manufacturer', 'pricePerKg', 'material']);
    const IMPORTANT = ['serial', 'manufacturer', 'brand', 'model', 'material', 'pricePerKg', 'remainingG', 'diameter', 'purchased', 'purchasePrice', 'phone', 'email', 'location', 'supplier', 'warrantyUntil'];
    /* N2.5y: Kaira knows the new windows (calculator, calendar import, package import, link bars, event types) */ const TOOLS = ['IMPORT', 'CAMERA', 'CONTACTS', 'LISTS', 'KAIRA', 'WORKLOAD', 'INBOX', 'GUIDES', 'CALC3D', 'RESTORE', 'DESIGNKIT', 'POKE', 'NOTES', 'TIMER', 'DICTAPHONE', 'BUGS', 'FILES', 'CALENDAR', 'SETTINGS', 'IDENT', 'CALC', 'ICS', 'DATAPACK', 'LINKBARS', 'EVTYPES'];
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const empty = (v) => v === undefined || v === null || String(v).trim() === '';
    function install(core) {
        if (core.kairaAssist)
            return core.kairaAssist;
        const readable = async (r, actor) => { try {
            if (!await core.ownerReadGate.allows(r.ownerApp, actor))
                return false;
            return await core.access.can({ kind: 'ENTITY', id: r.id, ownerApp: r.ownerApp, spaceIds: r.spaceIds || [] }, actor, 'READ') === true;
        }
        catch {
            return false;
        } };
        const domains = () => (globalThis.KXHubKit?.domains || []);
        const label = (d, f) => String(d?.subjectFields?.[f]?.label || f);
        async function learned(u) { const r = await core.entities.get(`${LEARN}.${String(u).replace(/[^A-Z0-9_.]/gi, '_')}`).catch(() => null); return { row: r, data: r?.data || { corrections: {} } }; }
        async function rows(u, type) { const out = []; for (const r of await core.entities.list()) {
            if (r.archivedAt)
                continue;
            if (type && r.type !== type)
                continue;
            if (!type && !domains().some((d) => d.type === r.type))
                continue;
            if (!await readable(r, u))
                continue;
            out.push(r);
        } return out; }
        const svc = { IMPORTANT, TOOLS,
            /* the most frequent values of a field among readable records of the same kind; the person's corrections rank first */
            async values(p, ctx) {
                const type = String(p?.type || ''), field = String(p?.field || '');
                const cnt = new Map();
                for (const r of await rows(ctx.actorId, type)) {
                    const v = r.data?.[field];
                    if (empty(v))
                        continue;
                    cnt.set(String(v), (cnt.get(String(v)) || 0) + 1);
                }
                const { data } = await learned(ctx.actorId);
                for (const [v, n] of Object.entries(data.corrections?.[type + '.' + field] || {}))
                    cnt.set(v, (cnt.get(v) || 0) + 1000 * n);
                return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.max(1, Math.min(10, p?.limit || 3))).map(([value, n]) => ({ value, count: n % 1000 || n, learned: n >= 1000 }));
            },
            /* the person corrected a prefilled value – remember the CHOSEN one (per user, personal space, never shared) */
            async correction(p, ctx) {
                const type = String(p?.type || '').slice(0, 80), field = String(p?.field || '').slice(0, 60), chosen = String(p?.chosen ?? '').slice(0, 200);
                if (!type || !field || empty(chosen))
                    throw new Error('KAIRA_CORRECTION_INVALID');
                const u = ctx.actorId;
                const { row, data } = await learned(u);
                const k = type + '.' + field;
                const c = { ...(data.corrections || {}) };
                c[k] = { ...(c[k] || {}) };
                c[k][chosen] = (c[k][chosen] || 0) + 1;
                const sp = ((await core.propagate.spaces(u)).find((s) => s.kind === 'PERSONAL') || {}).id;
                const rec = { id: `${LEARN}.${String(u).replace(/[^A-Z0-9_.]/gi, '_')}`, type: LEARN, ownerApp: OWNER, schema: 'KX.KAIRA_LEARN2/1', spaceIds: [sp], data: { corrections: c } };
                await core.entities.save(row ? { ...row, expectedRevision: row.revision, data: { corrections: c } } : rec, { ...ctx, appCode: OWNER });
                return { learned: k };
            },
            /* completeness suggestions: missing important fields of hub records, with choices and WHY */
            async completeness(u) {
                const out = [];
                for (const d of domains()) {
                    const fields = IMPORTANT.filter(f => d.subjectFields && f in d.subjectFields);
                    if (!fields.length)
                        continue;
                    const list = await rows(u, d.type);
                    if (!list.length)
                        continue;
                    for (const r of list) {
                        for (const f of fields) {
                            if (!empty(r.data?.[f]))
                                continue;
                            const filled = list.filter((x) => !empty(x.data?.[f])).length;
                            /* a field NOBODY fills is suggested only when it is key (serial, maker, price, material) – no nagging about unused fields */ if (!filled && !KEY.has(f))
                                continue;
                            const vals = await svc.values({ type: d.type, field: f }, { actorId: u });
                            out.push({ id: `COMPLETE:${r.id}:${f}`, type: 'COMPLETE', recordType: d.type, title: `${String(r.data?.name || r.data?.[d.nameKey || 'name'] || d.label)} – ${label(d, f)}`, why: filled ? TX('ka2.why.completeOthers', { f: label(d, f), n: filled, m: list.length }) : TX('ka2.why.complete', { f: label(d, f) }),
                                action: { kind: 'OPEN_RECORD', ref: core.deepLinks.build({ kind: 'ENTITY', type: r.type, id: r.id }), field: f, hub: d.owner }, options: vals.map((x) => x.value), score: 1 + filled / Math.max(1, list.length) });
                            if (out.length >= 40)
                                break;
                        }
                    }
                }
                return out.sort((a, b) => b.score - a.score).slice(0, 8);
            },
            /* attention: unusual values and coming dates */
            async attention(u, now) {
                const out = [];
                const day = 86400000;
                /* N2.5s: laser sources without SOURCE PROTECTION (no ranges / table) – suggest filling them in from the manual; suggested table → confirm */
                try {
                    if (core.laserDomain && globalThis.KXLaserGuard) {
                        const G = globalThis.KXLaserGuard;
                        const all = await core.laserDomain.list();
                        for (const m of all) {
                            if (m.type !== 'APP.LASER.MACHINE' || m.archivedAt || m.data?.physicalOwned !== true)
                                continue;
                            for (const sr of all.filter((x) => x.type === 'APP.LASER.SOURCE_MODULE' && !x.archivedAt && x.data.machineId === m.id)) {
                                const own = sr.data.guard ? G.normalize(sr.data.guard) : null;
                                if (own && (own.tableId || Object.keys(own.ranges).length))
                                    continue;
                                const sug = G.suggest(sr.data);
                                out.push({ id: `ATTN:LASER_GUARD:${sr.id}`, type: 'ATTENTION', title: TX(sug ? 'ka2.lg.confirm' : 'ka2.lg.fill', { s: String(sr.data.name || ''), m: String(m.data?.name || '') }), why: TX(sug ? 'ka2.why.lgConfirm' : 'ka2.why.lgFill', {}), action: { kind: 'OPEN_RECORD', ref: core.deepLinks.build({ kind: 'ENTITY', type: m.type, id: m.id }) }, score: sug ? 2 : 1 });
                            }
                        }
                    }
                }
                catch { }
                const spools = await rows(u, 'PRINT3D_FILAMENT.SPOOL');
                const prices = spools.map((r) => Number(String(r.data?.pricePerKg || '').replace(',', '.'))).filter((x) => x > 0).sort((a, b) => a - b);
                if (prices.length >= 3) {
                    const med = prices[Math.floor(prices.length / 2)];
                    for (const r of spools) {
                        const p = Number(String(r.data?.pricePerKg || '').replace(',', '.'));
                        if (p > 0 && p >= 2.5 * med)
                            out.push({ id: `ATTN:PRICE:${r.id}`, type: 'ATTENTION', title: `${String(r.data?.name || '')} – ${TX('ka2.perKg', { p })}`, why: TX('ka2.why.price', { p, m: med, x: (p / med).toFixed(1) }), action: { kind: 'OPEN_RECORD', ref: core.deepLinks.build({ kind: 'ENTITY', type: r.type, id: r.id }), field: 'pricePerKg' }, score: 3 });
                    }
                }
                for (const r of await core.entities.list()) {
                    if (r.type !== 'CORE.ASSET.IDENT' || r.archivedAt)
                        continue;
                    const v = r.data?.values || {};
                    let ok = false;
                    try {
                        await core.inspector.inspect(core.deepLinks.parse(r.data.ref), u);
                        ok = true;
                    }
                    catch { }
                    if (!ok)
                        continue;
                    for (const [f, lim, key] of [['warrantyUntil', 30, 'ka2.why.warranty'], ['licenseValidUntil', 30, 'ka2.why.licence'], ['serviceNext', 14, 'ka2.why.service']]) {
                        if (!v[f])
                            continue;
                        const dd = Math.ceil((new Date(v[f] + 'T00:00:00Z').getTime() - now.getTime()) / day);
                        if (dd <= lim && dd >= -7)
                            out.push({ id: `ATTN:${f}:${r.id}`, type: 'ATTENTION', title: `${String(v.name || v.model || v.manufacturer || '')}`, why: TX(key, { d: dd, date: v[f] }), action: { kind: 'OPEN_RECORD', ref: r.data.ref }, score: dd <= 7 ? 4 : 2.5 });
                    }
                }
                return out;
            },
            /* ASK without AI – where is it in NEXUS? (hubs, windows / tools, guides, settings) */
            async ask(p, ctx) {
                const q = norm(p?.q).trim();
                if (q.length < 2)
                    return []; /* filler words (where, is, how, what …) would match anything */
                const STOP = new Set(['kde', 'je', 'jak', 'co', 'mi', 'to', 'na', 'v', 've', 'se', 'a', 'i', 'k', 'ke', 'do', 'z', 'ze', 'pro', 'najdu', 'najit', 'mam', 'muzu', 'chci', 'prosim', 'where', 'is', 'how', 'what', 'the']);
                const words = q.split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
                if (!words.length)
                    return [];
                const out = [];
                /* N2.5y (user): tolerant search – exact part (2 / 1), start of a word (1.5), small typo (1.2; Levenshtein ≤1 for 4–6 letters, ≤2 for 7+); fuzzy-only hits are marked UNSURE → Kaira offers options */
                const lev = (a, b) => { if (Math.abs(a.length - b.length) > 2)
                    return 9; const d = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) {
                    let prev = d[0];
                    d[0] = i;
                    for (let j = 1; j <= b.length; j++) {
                        const tmp = d[j];
                        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
                        prev = tmp;
                    }
                } return d[b.length]; };
                let fuzzyOnly = true;
                const score = (text) => {
                    const t = norm(text);
                    const toks = t.split(/[^a-z0-9]+/).filter(Boolean);
                    let s = 0, exact = false;
                    for (const w of words) {
                        if (t.includes(w)) {
                            s += w.length > 3 ? 2 : 1;
                            exact = true;
                            continue;
                        }
                        if (w.length >= 3 && toks.some(x => x.startsWith(w) || (x.length >= 4 && w.startsWith(x)))) {
                            s += 1.5;
                            continue;
                        }
                        const lim = w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0;
                        if (lim && toks.some(x => lev(w, x) <= lim)) {
                            s += 1.2;
                        }
                    }
                    if (exact && s)
                        fuzzyOnly = false;
                    return s;
                };
                const EN = globalThis.KXI18n?.HUBS || {};
                const TOOL_EN = { CALC: 'calculator calc percent currency exchange crypto unit price', ICS: 'calendar import ics ical events appointments', DATAPACK: 'package import bulk data json', LINKBARS: 'links bar social networks favourites bookmarks', EVTYPES: 'event types categories calendar', IMPORT: 'import data table csv excel', CAMERA: 'camera photo scan', CONTACTS: 'contacts people address book', LISTS: 'lists shopping todo', NOTES: 'notes notebook onenote', TIMER: 'timer stopwatch countdown', FILES: 'files documents', CALENDAR: 'calendar planner agenda', SETTINGS: 'settings preferences options', RESTORE: 'restore backup recovery undo', GUIDES: 'guides help howto manual', INBOX: 'inbox mail messages', BUGS: 'bugs issues errors report', DICTAPHONE: 'dictaphone voice recording audio', KAIRA: 'kaira assistant ai' };
                const nav = globalThis.KXNavigation?.contract?.() || { items: [] };
                for (const it of nav.items || []) {
                    if (it.kind !== 'HUB')
                        continue;
                    try {
                        if (!await core.ownerReadGate.allows(it.itemCode, ctx.actorId))
                            continue;
                    }
                    catch {
                        continue;
                    }
                    const hn = EN[it.itemCode];
                    const s = score(`${it.label} ${it.subtitle || ''} ${(hn?.cs || []).join(' ')} ${(hn?.en || []).join(' ')}`);
                    if (s)
                        out.push({ kind: 'HUB', title: it.label, detail: it.subtitle || '', place: { kind: 'HUB', hub: it.itemCode }, score: s + 3 });
                }
                for (const t of TOOLS) {
                    const txt = TX('ka2.tool.' + t);
                    if (txt === 'ka2.tool.' + t)
                        continue;
                    const [title, keys, how] = txt.split('|');
                    const s = score(`${title} ${keys} ${TOOL_EN[t] || ''}`) + (norm(title).trim() === q ? 3 : 0) /* exact title first */;
                    if (s)
                        out.push({ kind: 'WINDOW', title, detail: how || '', place: { kind: 'WINDOW', window: t }, score: s + 1.5 });
                }
                for (const g of (globalThis.KXGuides?.GUIDES || [])) {
                    const ok = await Promise.all((g.hubs || []).map((h) => core.ownerReadGate.allows(h, ctx.actorId).catch(() => false)));
                    if ((g.hubs || []).length && !ok.every(Boolean))
                        continue;
                    const s = score(`${g.title} ${g.summary || ''}`);
                    if (s)
                        out.push({ kind: 'GUIDE', title: g.title, detail: String(g.summary || '').slice(0, 120), place: { kind: 'GUIDE', guide: g.id }, score: s });
                }
                for (const st of (globalThis.KXUI?.SETTINGS_DEFAULTS || [])) {
                    const s = score(`${st.label || ''} ${st.description || ''}`);
                    if (s >= 2)
                        out.push({ kind: 'SETTING', title: String(st.label || st.key), detail: String(st.description || '').slice(0, 120), place: { kind: 'SETTING', setting: st.key }, score: s - 0.5 });
                }
                /* unsure (only approximate hits) → mark and offer up to 5 options */ const sorted = out.sort((a, b) => b.score - a.score);
                if (fuzzyOnly && sorted.length)
                    return sorted.slice(0, 5).map(x => ({ ...x, uncertain: true }));
                return sorted.slice(0, 8);
            } };
        /* providers into the existing Kaira (suggestions with WHY; feedback / rest handled there) */
        try {
            core.kaira?.registerProvider?.('KAIRA.COMPLETENESS', (u) => svc.completeness(u));
        }
        catch { }
        try {
            core.kaira?.registerProvider?.('KAIRA.ATTENTION', (u, now) => svc.attention(u, now || new Date()));
        }
        catch { }
        const reg = (code, risk, fn) => { try {
            core.actions.register({ code, ownerApp: OWNER, risk, handler: fn });
        }
        catch { } };
        reg('ACTION.CORE.KAIRA.ASK', 'READ', (p, c) => svc.ask(p, c));
        reg('ACTION.CORE.KAIRA.VALUES', 'READ', (p, c) => svc.values(p, c));
        reg('ACTION.CORE.KAIRA.CORRECTION', 'SAFE_WRITE', (p, c) => svc.correction(p, c));
        reg('ACTION.CORE.KAIRA.COMPLETENESS', 'READ', (_p, c) => svc.completeness(c.actorId));
        reg('ACTION.CORE.KAIRA.ATTENTION', 'READ', (p, c) => svc.attention(c.actorId, p?.now ? new Date(p.now) : new Date()));
        core.kairaAssist = svc;
        return svc;
    }
    KXKairaAssist = { install, IMPORTANT };
    globalThis.KXKairaAssist = KXKairaAssist;
})();
